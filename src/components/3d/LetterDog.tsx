import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { FACE, HEAD_PIVOT, HEAD_REST, JAW_PIVOT, TAIL_PIVOT, type V3 } from './letterDogModel';
import { loadLetterDog, letterDogReady, type LetterDogGeometry } from './letterDogGeometry';
import { getHeartGeometry } from './heartShape';
import { getPaperTexture, getShadowTexture } from './glowTexture';
import { surface, type GiftMaterials } from './Gift3D';

/*
 * The letter gift, delivered: a golden puppy standing on the floor of the gift room
 * with the love letter held in its mouth, lit by the room's own lights.
 *
 * It is a character, not a prop. Touched, it performs where it stands while the camera
 * walks up to it (RoomWorld frames it like the other memories):
 *
 *   NOTICE   (0 – 0.35 s)  lifts its head, a little crouch of anticipation, the tail picks up
 *   HAPPY    (0.3 – 0.8)   eyes narrow into a smile, the head tilts, a rhythmic happy wag
 *   PRESENT  (0.8 – 1.3)   chin up, head forward: it holds the letter out to her
 *   MOUTH    (1.3 – 1.65)  the jaw opens — the letter, still held, sinks with it
 *   RELEASE  (1.65)        it lets go: the letter keeps the mouth's motion…
 *   FALL                   …drops under gravity, turning flat, and lands in front of its paws
 *   SETTLE   (+0.3 s)      the letter rests; the flap lifts — only then does the letter open
 *   AFTER                  a pleased, open-mouthed look and a gentle wag, easing back to idle
 *
 * When the letter is closed again, the puppy dips its head and picks the letter back up.
 * Every channel (head, jaw, eyes, tail, body) has ONE place where its target is decided
 * from the state, then a single smoothing step — idle, hover and the performance never
 * stack on the same transform.
 */

/** Its fur (with per-vertex colour) and its face — shared, and pre-compiled by Prewarm. */
export function createLetterDogMaterials() {
  const fur = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.74,
    sheen: 0.85,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ffd6a0'),
    clearcoat: 0.02,
    clearcoatRoughness: 0.6,
    // the finest grain of the coat
    bumpMap: getPaperTexture(),
    bumpScale: 0.5,
    emissive: new THREE.Color('#000000'),
    emissiveIntensity: 0,
  });
  return {
    fur,
    eye: surface({ color: '#1a0c07', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, bumpScale: 0.001 }),
    nose: surface({ color: '#3a1c13', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25, bumpScale: 0.3 }),
    ribbon: surface({ color: '#a91f3c', roughness: 0.42, sheen: 1, sheenRoughness: 0.3, sheenColor: '#ff9fb4', clearcoat: 0.05, bumpScale: 0.2 }),
    bell: surface({ color: '#d9b25a', roughness: 0.28, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.2, bumpScale: 0.001 }),
    mouth: surface({ color: '#4a1218', roughness: 0.6, bumpScale: 0.001 }),
    tongue: surface({ color: '#e0607e', roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.3, bumpScale: 0.1 }),
  };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 over [a, b] */
const bump = (x: number, a: number, b: number) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));

/** The envelope's flap: a soft triangle with a little thickness. */
function flapGeometry(w: number, h: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.quadraticCurveTo(w * 0.06, -h * 0.55, 0, -h * 0.62);
  s.quadraticCurveTo(-w * 0.06, -h * 0.55, -w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
}

// timing of the performance (seconds since the touch)
const T_PRESENT = 0.8;
const T_MOUTH = 1.3;
const T_RELEASE = 1.65;
const SETTLE = 0.6;
/** gentle "paper" gravity: a letter drops, but air slows it */
const GRAVITY = 3.4;

interface Props {
  /** true from the touch until the letter is closed again */
  opening: boolean;
  /** 0 → 1 while her hand is on it */
  hover: { current: number };
  /** where on it the pointer rests (-1…1) */
  aim: { current: { x: number; y: number } };
  mats: GiftMaterials;
  reducedMotion: boolean;
  /** the letter has been delivered — open it now */
  onDelivered: () => void;
}

type Letter = {
  mode: 'held' | 'falling' | 'resting' | 'returning';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  landedAt: number;
  /** when it left the mouth: its glide sways on this clock */
  releasedAt: number;
  returnFrom: { pos: THREE.Vector3; quat: THREE.Quaternion; at: number } | null;
};

export function LetterDog({ opening, hover, aim, mats, reducedMotion, onDelivered }: Props) {
  const [geo, setGeo] = useState<LetterDogGeometry | null>(letterDogReady);
  useEffect(() => {
    if (geo) return;
    let alive = true;
    void loadLetterDog().then((g) => alive && setGeo(g));
    return () => {
      alive = false;
    };
  }, [geo]);

  const m = useMemo(createLetterDogMaterials, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  const flap = useMemo(() => flapGeometry(FACE.letter.w * 0.98, FACE.letter.h), []);
  useEffect(() => () => flap.dispose(), [flap]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const anchor = useRef<THREE.Object3D>(null);
  const letter = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);

  // the performance clock, and smoothed channels
  const perf = useRef({ startedAt: -1, deliveredAt: -1, happyAfter: 0 });
  const ch = useRef({ look: HEAD_REST[0], turn: HEAD_REST[1], tilt: HEAD_REST[2], jaw: 0, smile: 0, crouch: 0, present: 0, wagAmp: 0.07, wagFreq: 2.2, wagPhase: 0, lid: 0 });
  const blink = useRef(2 + Math.random() * 3);
  const L0 = useRef<Letter>({
    mode: 'held',
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    landedAt: 0,
    releasedAt: 0,
    returnFrom: null,
  });
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      inv: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      one: new THREE.Vector3(1, 1, 1),
      pos: new THREE.Vector3(),
      rot: new THREE.Quaternion(),
      prev: new THREE.Vector3(),
      flat: new THREE.Quaternion(),
    }),
    [],
  );
  // lying on the floor, face up, turned a little toward her
  tmp.flat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.18));

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = state.clock.elapsedTime;
    const motion = reducedMotion ? 0.25 : 1;
    const pace = reducedMotion ? 2 : 1;
    const p = perf.current;
    const c = ch.current;
    const h = hover.current;
    const Lt = L0.current;

    // ── state ──────────────────────────────────────────────────────────────
    if (opening && p.startedAt < 0) {
      p.startedAt = now;
      p.deliveredAt = -1;
    }
    if (!opening && p.startedAt >= 0) {
      // the letter was closed: pick it back up
      p.startedAt = -1;
      if (Lt.mode !== 'held') Lt.returnFrom = { pos: Lt.pos.clone(), quat: Lt.quat.clone(), at: now };
      Lt.mode = Lt.mode === 'held' ? 'held' : 'returning';
      p.happyAfter = 1;
    }
    const T = p.startedAt >= 0 ? (now - p.startedAt) * pace : -1;
    const notice = T >= 0 ? ease(T / 0.35) : 0;
    const happy = T >= 0 ? ease((T - 0.3) / 0.5) : 0;
    const mouth = T >= 0 ? ease((T - T_MOUTH) / (T_RELEASE - T_MOUTH)) : 0;
    p.happyAfter = Math.max(0, p.happyAfter - dt * 0.6);
    const pleased = Math.max(happy, p.happyAfter);
    const returning = Lt.mode === 'returning' && Lt.returnFrom ? ease((now - Lt.returnFrom.at) / 0.9) : 0;
    const pickDip = Lt.mode === 'returning' ? bump((now - (Lt.returnFrom?.at ?? now)) / 0.9, 0, 1) : 0;

    // ── targets per channel (decided once each), then one smoothing step ──
    const lookT =
      HEAD_REST[0] +
      Math.sin(now * 0.53 + 1) * 0.022 * motion -
      aim.current.y * 0.06 * h -
      notice * 0.1 + // noticed you: chin up
      bump(T, T_PRESENT, T_MOUTH + 0.15) * 0.1 + // …and a little higher: here, this is for you
      bump(T, T_MOUTH - 0.1, T_RELEASE + 0.45) * 0.2 + // nods down to set the letter before you
      bump(T, T_RELEASE + 0.2, T_RELEASE + 1.8) * 0.12 + // …and watches it go
      pickDip * 0.32; // dips to pick it back up
    const turnT = HEAD_REST[1] + Math.sin(now * 0.29) * 0.06 * motion * (1 - notice) + THREE.MathUtils.clamp(aim.current.x, -1, 1) * 0.22 * h;
    const tiltT = HEAD_REST[2] + Math.sin(now * 0.41) * 0.025 * motion + h * 0.06 + pleased * 0.12;
    const jawT = mouth * 0.34 + (T > T_RELEASE ? 0.12 * pleased : 0) + p.happyAfter * 0.08 - pickDip * 0.05;
    const crouchT = bump(T, 0, 0.32) * 1; // a little anticipation, then up
    const presentT = bump(T, T_PRESENT, T_RELEASE + 0.1);
    // tail: slow and soft at rest; a little more when she's near; rhythmic when happy
    const ampT = (0.07 + 0.05 * h + 0.1 * notice * (1 - happy) + 0.15 * pleased) * motion;
    const freqT = 2.1 + 0.4 * h + 1.2 * pleased;

    const k = 1 - Math.exp(-dt * 6);
    const kSlow = 1 - Math.exp(-dt * 2.5);
    c.look += (lookT - c.look) * k;
    c.turn += (turnT - c.turn) * k;
    c.tilt += (tiltT - c.tilt) * kSlow;
    c.jaw += (jawT - c.jaw) * (1 - Math.exp(-dt * 10));
    c.smile += (pleased - c.smile) * k;
    c.crouch += (crouchT - c.crouch) * (1 - Math.exp(-dt * 14));
    c.present += (presentT - c.present) * k;
    c.wagAmp += (ampT - c.wagAmp) * kSlow;
    c.wagFreq += (freqT - c.wagFreq) * kSlow;
    c.wagPhase += c.wagFreq * dt; // phase accumulates: changing speed never jerks the tail

    // ── apply ──────────────────────────────────────────────────────────────
    const breath = Math.sin(now * 1.55) * motion;
    if (body.current) body.current.scale.set(1 + breath * 0.006, 1 + breath * 0.009 - c.crouch * 0.03, 1 + breath * 0.008);
    if (root.current) root.current.rotation.z = Math.sin(now * 0.37) * 0.012 * motion;
    if (head.current) {
      head.current.rotation.set(c.look, c.turn, c.tilt, 'YXZ');
      head.current.position.y = HEAD_PIVOT[1] - c.crouch * 0.02;
      head.current.position.z = HEAD_PIVOT[2] + c.present * 0.035;
    }
    if (jaw.current) jaw.current.rotation.x = c.jaw;
    // eyes: irregular blinks; a smile narrows them into soft crescents
    const since = now - blink.current;
    const shut = since > 0 && since < 0.14;
    if (since > 0.14) blink.current = now + 2.4 + Math.random() * 4.5;
    eyes.current.forEach((e) => {
      if (!e) return;
      e.scale.y = shut ? 0.12 : 1 - c.smile * 0.55;
      e.position.y = FACE.eyes[0][1] - HEAD_PIVOT[1] + c.smile * 0.006;
    });
    if (tail.current) {
      const a = c.wagAmp;
      // a soft, slightly lopsided wag (never a vibration)
      tail.current.rotation.set(-0.08 + Math.sin(c.wagPhase + 1.3) * a * 0.18, Math.sin(c.wagPhase) * a + Math.sin(c.wagPhase * 2 + 0.7) * a * 0.15, 0);
    }

    // ── the letter: held in the jaw, released, falling, resting, picked back up ──
    const lg = letter.current;
    const an = anchor.current;
    if (!lg || !an || !root.current) return;
    root.current.updateWorldMatrix(true, true);
    tmp.inv.copy(root.current.matrixWorld).invert();
    tmp.m.multiplyMatrices(tmp.inv, an.matrixWorld); // anchor pose in the puppy's space
    tmp.m.decompose(tmp.p, tmp.q, tmp.s);

    if (Lt.mode === 'held' && T >= T_RELEASE) {
      // let go: it keeps the motion the mouth gave it, a little forward
      Lt.mode = 'falling';
      Lt.pos.copy(tmp.p);
      Lt.quat.copy(tmp.q);
      Lt.vel.copy(tmp.p).sub(tmp.prev).divideScalar(Math.max(dt, 1e-3)).multiplyScalar(0.5);
      // …and glides toward her: forward, with a slight drift to the side
      Lt.vel.z += 0.46;
      Lt.vel.x += 0.08;
      Lt.vel.y = Math.min(Lt.vel.y, 0);
      Lt.releasedAt = now;
    }
    if (Lt.mode === 'held') {
      tmp.prev.copy(tmp.p);
      lg.matrix.copy(tmp.m);
    } else if (Lt.mode === 'falling') {
      const fallDt = dt * pace;
      Lt.vel.y -= GRAVITY * fallDt;
      Lt.vel.multiplyScalar(Math.exp(-fallDt * 1.2)); // air
      Lt.pos.addScaledVector(Lt.vel, fallDt);
      // paper rides the air: a soft side-to-side sway along its curved path
      const air = (now - Lt.releasedAt) * pace;
      Lt.pos.x += Math.cos(air * 7) * 0.05 * fallDt * 6 * Math.exp(-air * 1.5);
      // turning flat as it drops, so it lands lying face up
      Lt.quat.slerp(tmp.flat, 1 - Math.exp(-fallDt * 5.5));
      const floor = FACE.letter.t / 2 + 0.004;
      if (Lt.pos.y <= floor) {
        Lt.pos.y = floor;
        Lt.mode = 'resting';
        Lt.landedAt = now;
      }
      lg.matrix.compose(Lt.pos, Lt.quat, tmp.one);
    } else if (Lt.mode === 'resting') {
      // a last little settle as the paper lies down flat
      Lt.quat.slerp(tmp.flat, 1 - Math.exp(-dt * 10));
      lg.matrix.compose(Lt.pos, Lt.quat, tmp.one);
      if (p.deliveredAt < 0 && now - Lt.landedAt > SETTLE / pace) {
        p.deliveredAt = now;
        onDelivered();
      }
    } else if (Lt.mode === 'returning' && Lt.returnFrom) {
      const r = returning;
      tmp.pos.copy(Lt.returnFrom.pos).lerp(tmp.p, r);
      tmp.pos.y += Math.sin(r * Math.PI) * 0.06;
      tmp.rot.slerpQuaternions(Lt.returnFrom.quat, tmp.q, r);
      lg.matrix.compose(tmp.pos, tmp.rot, tmp.one);
      if (r >= 1) {
        Lt.mode = 'held';
        Lt.returnFrom = null;
      }
    }
    lg.matrixWorldNeedsUpdate = true;

    // its soft shadow on the floor: tight and dark when close, wide and faint while high
    const sh = shadow.current;
    if (sh) {
      lg.matrix.decompose(tmp.pos, tmp.rot, tmp.s);
      const hgt = Math.max(0, tmp.pos.y);
      sh.visible = Lt.mode !== 'held';
      sh.position.set(tmp.pos.x, 0.003, tmp.pos.z);
      sh.scale.setScalar(0.34 + hgt * 0.5);
      (sh.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.exp(-hgt * 2.2);
    }

    // the flap lifts once it lies before her
    const lidT = Lt.mode === 'resting' ? 1 : 0;
    c.lid += (lidT - c.lid) * (1 - Math.exp(-dt * 4));
    if (lid.current) lid.current.rotation.x = -c.lid * 2.4;
  });

  const L = FACE.letter;
  const P = HEAD_PIVOT;
  const J = JAW_PIVOT;
  return (
    <group ref={root}>
      {geo && (
        <>
          <group ref={body}>
            <mesh geometry={geo.body} material={m.fur} />
            {/* a red satin bow at the collar, and a little gold bell */}
            <mesh position={FACE.collar.c} rotation-x={Math.PI / 2 - 0.42} material={m.ribbon}>
              <torusGeometry args={[FACE.collar.r, 0.016, 10, 36]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.05, 0.6, 0.33]} rotation={[0.3, s * 0.4, s * 0.6]} scale={[1, 0.62, 0.42]} material={m.ribbon}>
                <torusGeometry args={[0.042, 0.016, 10, 24]} />
              </mesh>
            ))}
            {[-1, 1].map((s) => (
              <mesh key={`t${s}`} position={[s * 0.028, 0.545, 0.335]} rotation={[0.25, 0, s * 0.35]} material={m.ribbon}>
                <boxGeometry args={[0.022, 0.075, 0.008]} />
              </mesh>
            ))}
            <mesh position={[0, 0.6, 0.335]} material={m.ribbon}>
              <sphereGeometry args={[0.02, 12, 10]} />
            </mesh>
            <mesh position={[0, 0.565, 0.34]} material={m.bell}>
              <sphereGeometry args={[0.022, 16, 12]} />
            </mesh>
          </group>
          <group ref={head} position={P}>
            <mesh geometry={geo.head} position={sub([0, 0, 0], P)} material={m.fur} />
            {/* the inside of the mouth, seen only when the jaw opens */}
            <mesh position={sub(FACE.mouth.c, P)} scale={FACE.mouth.r} material={m.mouth}>
              <sphereGeometry args={[1, 18, 12]} />
            </mesh>
            <group ref={jaw} position={sub(J, P)}>
              <mesh geometry={geo.jaw} position={sub([0, 0, 0], J)} material={m.fur} />
              <mesh position={sub(FACE.tongue.c, J)} scale={FACE.tongue.r} material={m.tongue}>
                <sphereGeometry args={[1, 18, 12]} />
              </mesh>
              {/* where the letter is held (it follows the jaw until she lets go) */}
              <object3D ref={anchor} position={sub(L.c, J)} rotation={L.rot} />
            </group>
            {FACE.eyes.map((e, i) => (
              <group key={i} ref={(g) => void (g && (eyes.current[i] = g))} position={sub(e, P)}>
                <mesh material={m.eye}>
                  <sphereGeometry args={[FACE.eyeR, 20, 16]} />
                </mesh>
                {/* a warm catch-light */}
                <mesh position={[0.008, 0.01, FACE.eyeR * 0.92]}>
                  <sphereGeometry args={[0.0055, 8, 6]} />
                  <meshBasicMaterial color="#fff4e6" />
                </mesh>
              </group>
            ))}
            <mesh position={sub(FACE.nose, P)} scale={[1.25, 0.82, 0.9]} material={m.nose}>
              <sphereGeometry args={[0.03, 20, 14]} />
            </mesh>
          </group>
          <group ref={tail} position={TAIL_PIVOT}>
            <mesh geometry={geo.tail} position={sub([0, 0, 0], TAIL_PIVOT)} material={m.fur} />
          </group>
          <mesh ref={shadow} rotation-x={-Math.PI / 2} visible={false} renderOrder={-1}>
            <planeGeometry args={[1, 0.75]} />
            <meshBasicMaterial map={getShadowTexture()} color="#000000" transparent opacity={0} depthWrite={false} />
          </mesh>
          {/* the letter lives in the puppy's own space; its pose is set each frame */}
          <group ref={letter} matrixAutoUpdate={false}>
            <RoundedBox args={[L.w, L.h, L.t]} radius={0.004} smoothness={2} material={mats.main} />
            <group ref={lid} position={[0, L.h / 2 - 0.004, L.t / 2 + 0.001]}>
              <mesh geometry={flap} material={mats.flap ?? mats.main} />
              <mesh geometry={getHeartGeometry('low')} position={[0, -L.h * 0.5, 0.008]} scale={[0.026, 0.026, 0.014]} material={mats.seal ?? mats.main} />
            </group>
          </group>
        </>
      )}
    </group>
  );
}
