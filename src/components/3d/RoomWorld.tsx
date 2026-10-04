import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { resetReady, signalReady } from '../../lib/ready';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { Heart3D } from './Heart3D';
import { Gift3D } from './Gift3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { getFloorTexture, getShadowTexture } from './glowTexture';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { hoverLight, roomLights } from './sceneStore';
import { RoomSet, SIGN_PLACEMENT, STAGE_STEP, WALL_R } from './RoomSet';
import { safeDrop } from './BirthdaySign';
import { cakePosition } from './RoomProps';
import { Html } from '@react-three/drei';
import { birthdayConfig } from '../../config/birthday';

interface Props {
  gifts: Gift[];
  opened: string[];
  openingId: string | null;
  focusId: string | null;
  allOpened: boolean;
  pulseKey: number;
  paused: boolean;
  onSelect: (id: string) => void;
  onOpened: (id: string) => void;
  onHeartTap: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
  hoverFx: boolean;
  heartPoints: number;
}

const FLOOR_Y = -0.95;

/**
 * The hidden moments (touch the cake, or the HAPPY BIRTHDAY sign): how the camera leans in.
 * Offsets are un-rotated (toward +z); the orbit swings them round to face the subject.
 * [landscape, portrait].
 */
const MOMENT = {
  // the cake's thought sits beside it (to the right as she looks; above it on a phone)
  // (on a wide screen the camera looks a little to the cake's right: the cake sits left of
  // centre and its thought has the right third)
  cake: { back: [1.95, 2.9], lift: [0.5, 0.95], lookH: 1.0, lookSide: [0.3, 0], text: { side: [0.82, 0], h: [1.1, 1.95] } },
  // (on a phone the camera must stand back to fit the sign — so it rises, and looks over
  // the heart instead of through it)
  sign: { back: [4.5, 7.4], lift: [0.25, 1.95], lookOffset: -0.05, text: { h: 0.55, inward: 0.45 } },
  /** how quickly the camera leans in (CameraRig speed: ~1 s to settle) */
  speed: 1.35,
  /** the first beat: turn toward it from where she stands, then (after this) lean in —
   *  so the camera never cuts through the heart on the way */
  turnFirst: 0.55,
  far: { back: [5.2, 6.4], lift: [2.2, 3.2] },
} as const;
type Moment = 'cake' | 'sign';

/**
 * The gifts stand on a ring around the heart, on a real floor. From the default
 * view it reads like the familiar ellipse; drag and it turns out to be a place
 * you can walk around.
 */
function layout(n: number, rx: number, rz: number) {
  return Array.from({ length: n }, (_, i) => {
    // turned half a step: the first gift (the box) stands front-right and the last (the
    // letter-carrying puppy) front-left — with the heart above, a stable triangle
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const y = 0.05 + Math.sin(i * 2.3) * 0.12;
    return { pos: [Math.sin(a) * rx, y, Math.cos(a) * rz] as [number, number, number], angle: a };
  });
}

/** Shared with the shader pre-warm, so the room's first frame never stalls. */
export function createFloorMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: '#2a0f17',
    roughness: 0.5,
    metalness: 0.1,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
    alphaMap: getFloorTexture(),
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.6,
  });
}

/** A dark, faintly glossy floor that fades into the dark — and the soft ring the gifts stand on. */
function Floor({ rx, rz }: { rx: number; rz: number }) {
  // a unit ring, stretched to the (possibly oval) path the gifts stand on
  const ring = useMemo(() => new THREE.RingGeometry(1 - 0.012 / rx, 1 + 0.012 / rx, 160), [rx]);
  useEffect(() => () => ring.dispose(), [ring]);
  // (the floor itself — wood, rug, candlelight — is drawn by RoomSet)
  return (
    <group position={[0, FLOOR_Y, 0]}>
      <mesh geometry={ring} rotation-x={-Math.PI / 2} position-y={0.004} scale={[rx, rz, 1]}>
        <meshBasicMaterial color="#f1c9d2" transparent opacity={0.065} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the heart's own shadow */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} renderOrder={-1}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial map={getShadowTexture()} color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Stage 4: the little room — a heart in the middle, memories standing around it. */
export function RoomWorld({
  gifts,
  opened,
  openingId,
  focusId,
  allOpened,
  pulseKey,
  paused,
  onSelect,
  onOpened,
  onHeartTap,
  reducedMotion,
  glass,
  particleFactor,
  portrait,
  hoverFx,
  heartPoints,
}: Props) {
  // on a tall phone screen the ring stretches in depth, which the raised camera turns into height
  const rx = portrait ? 1.45 : 3.1;
  const rz = portrait ? 2.5 : 3.1;
  const ring = useMemo(() => layout(gifts.length, rx, rz), [gifts.length, rx, rz]);
  const opening = openingId !== null;
  const openIndex = gifts.findIndex((g) => g.id === openingId);

  // a hidden moment in progress (the cake or the sign) — see below
  const [moment, setMoment] = useState<Moment | null>(null);
  const [momentNear, setMomentNear] = useState(false);
  const orbit = usePointerOrbit({
    enabled: !opening && !paused && !moment,
    sensitivity: 0.005,
    pitch: portrait ? [-0.45, 0.25] : [-0.25, 0.6],
    zoom: [0.78, 1.3],
    friction: 2.2,
  });

  // ── hidden moments ──────────────────────────────────────────────────────────
  const before = useRef<{ yaw: number; pitch: number; zoom: number } | null>(null);
  const momentHit = useRef(false);
  const ground = FLOOR_Y - STAGE_STEP;
  const cakeAt = useMemo(() => cakePosition(ground, WALL_R), [ground]);
  const sign = SIGN_PLACEMENT[portrait ? 'portrait' : 'landscape'];
  const cakeTextAt = useMemo((): [number, number, number] => {
    const d = Math.hypot(cakeAt[0], cakeAt[2]);
    // looking out at the cake from the room, "right" is (−out.z, out.x)
    const rx = -cakeAt[2] / d;
    const rz = cakeAt[0] / d;
    const k = MOMENT.cake.text.side[portrait ? 1 : 0];
    return [cakeAt[0] + rx * k, ground + MOMENT.cake.text.h[portrait ? 1 : 0], cakeAt[2] + rz * k];
  }, [cakeAt, ground, portrait]);
  const leaveMoment = useCallback(() => {
    // back exactly to where she was looking from
    const b = before.current;
    if (b) {
      orbit.tYaw = b.yaw;
      orbit.tPitch = b.pitch;
      orbit.tZoom = b.zoom;
    }
    before.current = null;
    setMoment(null);
  }, [orbit]);
  const onMoment = useCallback(
    (target: Moment, wish?: boolean) => {
      momentHit.current = true;
      if (opening || paused) return;
      if (wish) {
        // a wish made, the candles out: a breath later, back to the room
        window.setTimeout(leaveMoment, 2300);
        return;
      }
      if (moment === target) return leaveMoment();
      if (!before.current) before.current = { yaw: orbit.tYaw, pitch: orbit.tPitch, zoom: orbit.tZoom };
      setMoment(target);
    },
    [opening, paused, moment, orbit, leaveMoment],
  );
  useEffect(() => {
    setMomentNear(false);
    if (!moment) return;
    const id = window.setTimeout(() => setMomentNear(true), MOMENT.turnFirst * 1000);
    return () => window.clearTimeout(id);
  }, [moment]);
  useEffect(() => {
    if (!moment) return;
    // turn to face it from inside the room
    const a = moment === 'cake' ? Math.atan2(cakeAt[0], cakeAt[2]) : Math.PI;
    orbit.steerYaw(-(a + Math.PI));
    orbit.tPitch = 0;
    orbit.tZoom = 1;
  }, [moment, cakeAt, orbit]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('room-moment', { detail: !!moment }));
    if (!moment) return;
    // Escape, or a touch anywhere else, brings her back
    const key = (e: KeyboardEvent) => e.key === 'Escape' && leaveMoment();
    const click = () => {
      if (momentHit.current) return void (momentHit.current = false);
      leaveMoment();
    };
    momentHit.current = false;
    window.addEventListener('keydown', key);
    const id = window.setTimeout(() => window.addEventListener('click', click), 60);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', key);
      window.removeEventListener('click', click);
    };
  }, [moment, leaveMoment]);
  useEffect(() => () => void window.dispatchEvent(new CustomEvent('room-moment', { detail: false })), []);
  // QA hook (?debug): open a hidden moment without having to aim at it
  const momentRef = useRef(onMoment);
  momentRef.current = onMoment;
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return;
    Object.assign(window, { __moment: (t: Moment | null) => (t ? momentRef.current(t) : leaveMoment()) });
  }, [leaveMoment]);
  // a gift being opened (or the memory overlay) always wins
  useEffect(() => {
    if ((opening || paused) && moment) leaveMoment();
  }, [opening, paused, moment, leaveMoment]);

  // opening a gift: swing round to face it and push in; closing: pull back out
  useEffect(() => {
    if (openIndex < 0) return;
    orbit.steerYaw(-ring[openIndex].angle);
    orbit.tPitch = 0;
    orbit.tZoom = 1;
  }, [openIndex, orbit, ring]);

  // the room slowly steadies itself after being turned, but keeps the angle she chose
  useFrame((_, dt) => {
    orbit.step(Math.min(dt, 0.05));
    if (!orbit.dragging && orbit.idle() > 5) {
      orbit.tPitch += (0 - orbit.tPitch) * (1 - Math.exp(-dt * 0.4));
      // left alone, the room keeps turning slowly — but holds still while a gift opens or is read
      if (!opening && !paused && !reducedMotion && !hoverId && !moment) orbit.tYaw += Math.min(dt, 0.05) * 0.05;
    }
  });

  const [hoverId, setHoverId] = useState<string | null>(null);
  const onHover = useCallback((id: string, on: boolean) => {
    setHoverId((cur) => (on ? id : cur === id ? null : cur));
  }, []);
  const hoverIndex = gifts.findIndex((g) => g.id === hoverId);
  const hoverTarget = useMemo(() => {
    if (hoverIndex < 0 || opening) return null;
    const { pos, angle } = ring[hoverIndex];
    // just above and in front of the gift, on the camera side
    return new THREE.Vector3(pos[0] + Math.sin(angle) * 0.7, pos[1] + 0.8, pos[2] + Math.cos(angle) * 0.7);
  }, [hoverIndex, ring, opening]);

  useEffect(() => {
    hoverLight.target = hoverTarget;
  }, [hoverTarget]);
  // the heart lights the room pink; a golden key falls on the puppy
  useEffect(() => {
    const dogIdx = gifts.findIndex((g) => g.shape === 'envelope');
    roomLights.heart = new THREE.Vector3(0, 0.35, 0.15);
    roomLights.character = dogIdx >= 0 ? new THREE.Vector3(ring[dogIdx].pos[0], FLOOR_Y + 0.6, ring[dogIdx].pos[2]) : null;
    return () => {
      roomLights.heart = null;
      roomLights.character = null;
    };
  }, [gifts, ring]);
  // the puppy and the box each get their own spot on the stage
  const spots = useMemo(() => {
    const at = (shape: string) => {
      const i = gifts.findIndex((g) => g.shape === shape);
      return i < 0 ? null : { x: ring[i].pos[0], z: ring[i].pos[2], angle: ring[i].angle };
    };
    return { dog: at('envelope'), gift: at('box') };
  }, [gifts, ring]);
  useEffect(
    () => () => {
      hoverLight.target = null;
    },
    [],
  );

  // Everything in the room compiles its shaders in parallel (KHR_parallel_shader_compile)
  // before it is shown — the page holds its veil until then — so stepping in never stalls
  // on a dozen synchronous shader links in the first frame.
  const root = useRef<THREE.Group>(null);
  const gl = useThree((st) => st.gl);
  const cam = useThree((st) => st.camera);
  const scn = useThree((st) => st.scene);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    let alive = true;
    resetReady('room-ready');
    const show = () => {
      if (!alive) return;
      setReady(true);
      // draw a few frames while still veiled: the first one uploads every texture and
      // buffer of the room — let that happen out of sight
      let n = 0;
      const tick = () => (++n >= 4 ? signalReady('room-ready') : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    };
    // two frames later: the previous stage's objects (and its lights) are gone by then, so
    // the programs are built for the room's real light set — not one that is about to change
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (!alive) return;
        // (the whole scene, not just this group: compiling a group that holds a light
        // against its own scene counts that light twice — programs for the wrong light count)
        g.visible = true;
        gl.compileAsync(scn, cam).then(show, show);
        g.visible = false;
      });
    });
    const fallback = setTimeout(show, 3500);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [gl, cam, scn]);

  const showcase = useMemo(
    () =>
      ring.map(({ pos, angle }, i) => {
        const out = portrait ? 0.9 : 1.1;
        // the letter-carrying puppy walks up to her on the floor; the gifts rise into the air
        const y = gifts[i]?.shape === 'envelope' ? FLOOR_Y : 0.45;
        return [pos[0] + Math.sin(angle) * out, y, pos[2] + Math.cos(angle) * out] as [number, number, number];
      }),
    [ring, portrait, gifts],
  );

  // Framing: a raised three-quarter view that shows the floor and the whole ring.
  const base = portrait
    ? { pos: [0, 6.9, 7.4] as [number, number, number], look: [0, -0.45, 0.35] as [number, number, number], fov: 50 }
    : { pos: [0, 3.0, 8.4] as [number, number, number], look: [0, -0.4, 0] as [number, number, number], fov: 40 };
  let camPos = base.pos;
  let camLook = base.look;
  const pi = portrait ? 1 : 0;
  if (moment === 'cake') {
    // leaning in to the cake, from the room's side of it
    const d = Math.hypot(cakeAt[0], cakeAt[2]);
    const ls = MOMENT.cake.lookSide[pi];
    camLook = [cakeAt[0] - (cakeAt[2] / d) * ls, ground + MOMENT.cake.lookH, cakeAt[2] + (cakeAt[0] / d) * ls];
    camPos = momentNear
      ? [camLook[0], camLook[1] + MOMENT.cake.lift[pi], camLook[2] + MOMENT.cake.back[pi]]
      : [camLook[0], camLook[1] + MOMENT.far.lift[pi], camLook[2] + MOMENT.far.back[pi]];
  } else if (moment === 'sign') {
    camLook = [0, ground + 2.0 - safeDrop(sign.scale, sign.drop) + MOMENT.sign.lookOffset, -sign.radius];
    camPos = momentNear
      ? [0, camLook[1] + MOMENT.sign.lift[pi], camLook[2] + MOMENT.sign.back[pi]]
      : [0, camLook[1] + Math.max(MOMENT.far.lift[pi], MOMENT.sign.lift[pi]), camLook[2] + Math.max(MOMENT.far.back[pi], MOMENT.sign.back[pi])];
  } else if (opening && openIndex >= 0 && gifts[openIndex]?.shape === 'envelope') {
    // the puppy is a memory too: the camera walks up to it (same rig, same swing round to
    // face it) and settles a little low, the puppy's face and the letter it gives framed
    // together — the puppy stays where it stands and performs
    const [px, , pz] = ring[openIndex].pos;
    const a = ring[openIndex].angle;
    const near = portrait ? 0.55 : 0.35; // look a little in front of it: where the letter lands
    camLook = [px + Math.sin(a) * near, FLOOR_Y + (portrait ? 0.42 : 0.55), pz + Math.cos(a) * near];
    const back = Math.min(portrait ? 4.6 : 3.7, 8.1 - Math.hypot(px, pz));
    camPos = [camLook[0], camLook[1] + (portrait ? 1.55 : 0.95), camLook[2] + back];
  } else if (opening && openIndex >= 0) {
    // frame the rising gift from straight in front, closer. The offset is given
    // un-rotated: the orbit yaw (steered to the gift's angle) swings it round.
    const [sx, sy, sz] = showcase[openIndex];
    camLook = [sx, sy, sz];
    // step back to frame it — but never through the wall of the room behind her
    const back = Math.min(portrait ? 5.2 : 4.5, 8.1 - Math.hypot(sx, sz));
    camPos = [sx, sy + 1.0, sz + back];
  }

  return (
    <group ref={root} visible={ready}>
      <CameraRig
        position={camPos}
        lookAt={camLook}
        parallax={reducedMotion || opening || moment ? 0 : 0.25}
        speed={moment ? MOMENT.speed : opening ? (gifts[openIndex]?.shape === 'envelope' ? 1.25 : 2.0) : 1.1}
        fov={base.fov}
        orbit={orbit}
        orbitCamera
        fit={portrait ? (yaw) => 1 + 0.42 * Math.sin(yaw) ** 2 : undefined}
      />
      <RoomSet
        floorY={FLOOR_Y}
        rx={rx}
        rz={rz}
        heart={allOpened ? 1 : 0.35 + (opened.length / gifts.length) * 0.5}
        reducedMotion={reducedMotion}
        hoverFx={hoverFx}
        portrait={portrait}
        dogSpot={spots.dog}
        giftSpot={spots.gift}
        focus={moment}
        onMoment={onMoment}
      />
      <Floor rx={rx} rz={rz} />
      <group position={[0, 0.3, 0]}>
        <Heart3D
          pulseKey={pulseKey}
          charge={allOpened ? 1 : 0.25 + (opened.length / gifts.length) * 0.5}
          interactive={allOpened && !opening && !paused}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={portrait ? 0.62 : 0.78}
          halo={allOpened ? 1.4 : 1}
          particles={heartPoints}
          crystal
        />
      </group>
      {gifts.map((g, i) => (
        <Gift3D
          key={g.id}
          gift={g}
          index={i}
          home={ring[i].pos}
          facing={ring[i].angle}
          showcase={showcase[i]}
          floorY={FLOOR_Y}
          // the puppy reads a touch larger, the box a touch smaller: heart > puppy > gift
          size={(portrait ? 0.95 : 1) * (g.shape === 'envelope' ? 1.12 : g.shape === 'box' ? 0.84 : 1)}
          opened={opened.includes(g.id)}
          opening={openingId === g.id}
          disabled={opening || paused || !!moment}
          focused={focusId === g.id}
          quiet={allOpened}
          glass={glass}
          reducedMotion={reducedMotion}
          hoverFx={hoverFx}
          onSelect={onSelect}
          onOpened={onOpened}
          onHover={onHover}
        />
      ))}
      {moment === 'cake' && (
        <Html
          position={cakeTextAt}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[8, 0]}
        >
          <Whisper lines={birthdayConfig.room.moments.cake} />
        </Html>
      )}
      {moment === 'sign' && (
        <Html position={[0, ground + MOMENT.sign.text.h, -sign.radius + MOMENT.sign.text.inward]} center style={{ pointerEvents: 'none' }} zIndexRange={[8, 0]}>
          <Whisper lines={birthdayConfig.room.moments.sign} />
        </Html>
      )}
      <ParticleField
        count={Math.round(600 * particleFactor)}
        radius={11}
        innerRadius={2.5}
        burstKey={pulseKey}
        intensity={0.45 + (opened.length / gifts.length) * 0.3}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

/** The room's whispered message: lines that arrive one after another, like a thought. */
function Whisper({ lines }: { lines: readonly string[] }) {
  return (
    <div className="room-whisper" role="status">
      {lines.map((l, i) => (
        <span key={i} style={{ animationDelay: `${0.9 + i * 0.55}s` }}>
          {l}
        </span>
      ))}
    </div>
  );
}
