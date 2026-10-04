import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { EAR_PIVOT, FACE, HEAD_PIVOT, HEAD_REST, JAW_PIVOT, MOUTH, TAIL_PIVOT, type V3 } from './letterDogModel';
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
    // the eye: a deep brown ball, an iris drawn on a disc, a clear glossy cornea over it
    eye: surface({ color: '#140904', roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1, bumpScale: 0.001 }),
    cornea: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    iris: new THREE.MeshBasicMaterial({ map: getIrisTexture(), color: '#a89282' }),
    lid: surface({ color: '#cf8f48', roughness: 0.72, sheen: 0.8, sheenRoughness: 0.45, sheenColor: '#ffd6a0', bumpScale: 0.4 }),
    // the mouth: dark pigmented lips, small white teeth, pink gums
    lip: surface({ color: '#2a1511', roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, bumpScale: 0.05 }),
    tooth: surface({ color: '#f3ebdf', roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2, bumpScale: 0.001 }),
    gum: surface({ color: '#bf5a6c', roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3, bumpScale: 0.05 }),
    nose: surface({ color: '#3a1c13', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25, bumpScale: 0.3 }),
    ribbon: surface({ color: '#a91f3c', roughness: 0.42, sheen: 1, sheenRoughness: 0.3, sheenColor: '#ff9fb4', clearcoat: 0.05, bumpScale: 0.2 }),
    bell: surface({ color: '#d9b25a', roughness: 0.28, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.2, bumpScale: 0.001 }),
    mouth: surface({ color: '#4a1218', roughness: 0.6, bumpScale: 0.001 }),
    tongue: surface({ color: '#e0607e', roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.3, bumpScale: 0.1 }),
  };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A dog's iris: a soft black pupil, warm brown fibres, a darker rim. */
let irisTex: THREE.CanvasTexture | null = null;
function getIrisTexture(): THREE.CanvasTexture {
  if (irisTex) return irisTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grd.addColorStop(0, '#000000');
  grd.addColorStop(0.36, '#050201');
  grd.addColorStop(0.42, '#4a240f');
  grd.addColorStop(0.7, '#7a4a24');
  grd.addColorStop(0.9, '#3a1c0c');
  grd.addColorStop(1, '#120804');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // fibres radiating from the pupil
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.1) * 0.03;
    g.strokeStyle = `rgba(${150 + (i % 5) * 12}, ${90 + (i % 3) * 10}, 40, 0.18)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26);
    g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
    g.stroke();
  }
  irisTex = new THREE.CanvasTexture(c);
  irisTex.colorSpace = THREE.SRGBColorSpace;
  return irisTex;
}

/** A tongue: soft and flat, a groove down its middle, a rounded tip. */
function tongueGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    if (y > 0) y *= 0.55 - 0.35 * Math.exp(-x * x * 18); // the groove
    p.setXYZ(i, x * (0.9 + 0.1 * z), y, z);
  }
  g.computeVertexNormals();
  return g;
}
/** The iris: a disc pressed onto the eyeball's curve (its planar uv keeps the radial texture). */
function irisGeometry(R: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(R * 0.74, 32, 0, Math.PI * 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, Math.sqrt(Math.max(0, R * R - x * x - y * y)) * 1.004);
  }
  g.computeVertexNormals();
  return g;
}
/** A line of pigment on the face: a fine tube that thins away to nothing at both ends. */
function tube(pts: V3[], r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const segs = pts.length * 4;
  const radial = 6;
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const taper = Math.sin(Math.PI * t) ** 0.6;
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(taper).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
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
  // the mouth: lips found on the sculpted surface, teeth, gums, a real tongue
  const mouthGeo = useMemo(
    () => ({
      // (the middle of the lip line only: its ends melt into the fur of the cheeks)
      upper: tube(MOUTH.upper.slice(3, -3), 0.0019),
      philtrum: tube(MOUTH.philtrum, 0.0013),
      iris: irisGeometry(FACE.eyeR),
      lower: tube(MOUTH.lower, 0.0022),
      tongue: tongueGeometry(),
    }),
    [],
  );
  useEffect(() => () => Object.values(mouthGeo).forEach((g) => g.dispose()), [mouthGeo]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const anchor = useRef<THREE.Object3D>(null);
  const letter = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const eyeLids = useRef<THREE.Group[]>([]);
  const ears = useRef<THREE.Group[]>([]);
  const tongueRef = useRef<THREE.Mesh>(null);
  // ears are pendulums: they swing after the head and settle (state per ear: angle, velocity)
  const earState = useRef([
    { ax: 0, vx: 0, az: 0, vz: 0 },
    { ax: 0, vx: 0, az: 0, vz: 0 },
  ]);
  const prevHead = useRef({ look: HEAD_REST[0], turn: HEAD_REST[1], tilt: HEAD_REST[2] });
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
    // eyes: they follow her hand a little; the upper lids do the expressions — wide when it
    // notices her, lowered into a smile when it's happy, a quick close for each blink
    eyes.current.forEach((e) => {
      if (!e) return;
      e.rotation.y += (THREE.MathUtils.clamp(aim.current.x, -1, 1) * 0.28 * h - e.rotation.y) * k;
      e.rotation.x += (-THREE.MathUtils.clamp(aim.current.y, -1, 1) * 0.16 * h - e.rotation.x) * k;
    });
    // (open, the lid sits high; happy, it comes down only a little — smiling eyes, not sleepy)
    const eyeLidT = shut ? 1.35 : -0.85 - notice * (1 - happy) * 0.15 + c.smile * 0.42;
    eyeLids.current.forEach((l) => {
      if (!l) return;
      l.rotation.x += (eyeLidT - l.rotation.x) * (1 - Math.exp(-dt * (shut ? 40 : 9)));
    });
    // ears: driven by how fast the head turns / nods / tilts, plus a little hop when happy
    {
      const ph = prevHead.current;
      const vTurn = (c.turn - ph.turn) / Math.max(dt, 1e-3);
      const vLook = (c.look - ph.look) / Math.max(dt, 1e-3);
      const vTilt = (c.tilt - ph.tilt) / Math.max(dt, 1e-3);
      ph.turn = c.turn;
      ph.look = c.look;
      ph.tilt = c.tilt;
      const hop = bump(T, 0.3, 0.75) * 0.35 + Math.sin(now * 1.1) * 0.015 * motion;
      earState.current.forEach((st, i) => {
        const side = i === 0 ? -1 : 1;
        const tx = -vLook * 0.12 + hop * 0.6;
        const tz = side * (-vTurn * 0.1 - vTilt * 0.25) - side * hop * 0.35;
        // a damped spring: the ear trails, overshoots a touch, settles
        st.vx += ((tx - st.ax) * 90 - st.vx * 9) * dt;
        st.ax += st.vx * dt;
        st.vz += ((tz - st.az) * 90 - st.vz * 9) * dt;
        st.az += st.vz * dt;
        const g = ears.current[i];
        if (g) g.rotation.set(THREE.MathUtils.clamp(st.ax, -0.35, 0.45), 0, THREE.MathUtils.clamp(st.az, -0.4, 0.4));
      });
    }
    // the tongue comes forward when the mouth opens
    if (tongueRef.current) {
      const out = THREE.MathUtils.smoothstep(c.jaw, 0.05, 0.3);
      tongueRef.current.position.z = FACE.tongue.c[2] - JAW_PIVOT[2] + out * 0.032;
      tongueRef.current.position.y = FACE.tongue.c[1] - JAW_PIVOT[1] - out * 0.004;
      tongueRef.current.scale.set(FACE.tongue.r[0] * 1.05, FACE.tongue.r[1] * 1.2, FACE.tongue.r[2] * (1 + out * 0.35));
    }
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
            {/* the ears hang from hinges at their roots and swing after the head */}
            {[-1, 1].map((sd, i) => {
              const E = EAR_PIVOT(sd);
              return (
                <group key={sd} ref={(g) => void (g && (ears.current[i] = g))} position={sub(E, P)}>
                  <mesh geometry={sd < 0 ? geo.earL : geo.earR} position={sub([0, 0, 0], E)} material={m.fur} />
                </group>
              );
            })}
            {/* the upper lip and philtrum: dark pigment on the muzzle, a soft smile at the corners */}
            <mesh geometry={mouthGeo.upper} position={sub([0, 0, 0], P)} material={m.lip} />
            <mesh geometry={mouthGeo.philtrum} position={sub([0, 0, 0], P)} material={m.lip} />
            {/* a few small upper teeth, tucked just inside the lip (seen only when the mouth
                opens — a puppy's smile, never a snarl) */}
            {[-0.018, -0.006, 0.006, 0.018].map((x) => (
              <mesh key={x} position={sub([x, 0.7715, 0.542 - x * x * 5], P)} scale={[0.0046, 0.0052, 0.003]} material={m.tooth}>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
            ))}
            {/* the inside of the mouth, seen only when the jaw opens */}
            <mesh position={sub(FACE.mouth.c, P)} scale={FACE.mouth.r} material={m.mouth}>
              <sphereGeometry args={[1, 18, 12]} />
            </mesh>
            <group ref={jaw} position={sub(J, P)}>
              <mesh geometry={geo.jaw} position={sub([0, 0, 0], J)} material={m.fur} />
              <mesh geometry={mouthGeo.lower} position={sub([0, 0, 0], J)} material={m.lip} />
              {/* small lower teeth and the pink gum they sit in */}
              {[-0.02, -0.007, 0.007, 0.02].map((x) => (
                <mesh key={x} position={sub([x, 0.7915, 0.533 - x * x * 5], J)} scale={[0.0042, 0.005, 0.0028]} material={m.tooth}>
                  <sphereGeometry args={[1, 8, 6]} />
                </mesh>
              ))}
              <mesh position={sub([0, 0.789, 0.524], J)} scale={[0.04, 0.004, 0.016]} material={m.gum}>
                <sphereGeometry args={[1, 14, 8]} />
              </mesh>
              <mesh ref={tongueRef} geometry={mouthGeo.tongue} position={sub(FACE.tongue.c, J)} scale={FACE.tongue.r} material={m.tongue} />
              {/* where the letter is held (it follows the jaw until she lets go) */}
              <object3D ref={anchor} position={sub(L.c, J)} rotation={L.rot} />
            </group>
            {FACE.eyes.map((e, i) => (
              <group key={i} position={sub(e, P)}>
                <group ref={(g) => void (g && (eyes.current[i] = g))}>
                  <mesh material={m.eye}>
                    <sphereGeometry args={[FACE.eyeR, 22, 16]} />
                  </mesh>
                  {/* the iris and pupil, under the clear cornea */}
                  <mesh geometry={mouthGeo.iris} material={m.iris} />
                  <mesh material={m.cornea} renderOrder={1}>
                    <sphereGeometry args={[FACE.eyeR * 1.05, 22, 16]} />
                  </mesh>
                  {/* a small warm catch-light, on the cornea */}
                  <mesh position={new THREE.Vector3(0.32 + (i ? -0.1 : 0.1), 0.4, 0.86).normalize().multiplyScalar(FACE.eyeR * 1.045)}>
                    <sphereGeometry args={[0.0034, 8, 6]} />
                    <meshBasicMaterial color="#fff4e6" />
                  </mesh>
                </group>
                {/* the upper lid: it lowers into a smile, closes for a blink */}
                <group ref={(g) => void (g && (eyeLids.current[i] = g))} rotation-x={-0.85}>
                  <mesh material={m.lid}>
                    <sphereGeometry args={[FACE.eyeR * 1.07, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                  </mesh>
                </group>
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
