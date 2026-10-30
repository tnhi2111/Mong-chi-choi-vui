import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { resetReady, signalReady } from '../../lib/ready';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { MemoryCelestial } from './MemoryCelestial';
import { Gift3D } from './Gift3D';
import { ParticleField } from './ParticleField';
import { CameraRig, rebaseCamera } from './CameraRig';
import { handUniforms, sprite } from './spriteFlight';
import { story } from '../../lib/story';
import { roomTourScript, windowScript } from './spriteScripts';
import { getFloorTexture, getShadowTexture } from './glowTexture';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { useDive } from '../../hooks/useDive';
import { RoomBuild, sampleRoom, type BuildPoints } from './RoomBuild';
import { BuildGate } from './BuildGate';
import { motion as MOTION } from '../../config/motion';
import { giftRing, hoverLight, roomHand, roomLights } from './sceneStore';
import { RoomSet, SIGN_PLACEMENT, STAGE_STEP, WALL_R, WINDOW_ANGLE } from './RoomSet';
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
  /** Leaving for the finale: the camera dives into the orb. */
  leaving?: boolean;
  /**
   * She has just flown in through the light (storyboard B): draw the room in light before
   * it is there. False when the page simply resumed in the room — then it is already home.
   */
  drawIn?: boolean;
}

/** The room's floor (the stage stands a step above it). Prewarm needs it too. */
export const FLOOR_Y = -0.95;
/** The centerpiece orb — every arrival pulls back out of it, every departure dives into it. */
const ORB_Y = 0.3;
/** Where the camera stands, in front of the orb, at the cut (un-rotated; the orbit swings it). */
const ORB_CLOSE = { pos: [0, ORB_Y + 0.3, 2.5] as [number, number, number], fov: 52 };

/**
 * The hidden moments (touch the cake, or the HAPPY BIRTHDAY sign): how the camera leans in.
 * Offsets are un-rotated (toward +z); the orbit swings them round to face the subject.
 * [landscape, portrait].
 */
const MOMENT = {
  // (the near framing is not a set of distances any more: `frameBox` fits the subject's
  //  real bounds into its own part of THIS screen — motion.moment holds those areas)
  cake: { lookH: 1.0 },
  sign: { lookOffset: -0.05 },
  /** how quickly the camera leans in (CameraRig speed: ~1 s to settle) */
  speed: 1.35,
  /** the first beat: turn toward it from where she stands, then (after this) lean in —
   *  so the camera never cuts through the heart on the way */
  turnFirst: 0.55,
  far: { back: [5.2, 6.4], lift: [2.2, 3.2] },
} as const;
type Moment = 'cake' | 'sign';

/**
 * J2/J3 — where the camera must stand so that `box` fills `area` (NDC, y up) of a screen of
 * this `aspect` and lens, looking along `dir` (horizontal, toward the subject) from `elev`
 * radians above it. Returns the look point (world) and the camera's un-rotated offset from it
 * (toward +z — the orbit, steered to face the subject, swings it round, as for every framing).
 */
function frameBox(
  box: THREE.Box3,
  dir: THREE.Vector3,
  fovDeg: number,
  aspect: number,
  elev: number,
  area: { x: readonly number[]; y: readonly number[] },
  fill: number,
) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const tanH = tanV * aspect;
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const ce = Math.cos(elev);
  const se = Math.sin(elev);
  // the camera's forward (looking down a little) and up
  const fwd = dir.clone().multiplyScalar(ce).add(new THREE.Vector3(0, -se, 0));
  const up = new THREE.Vector3(0, ce, 0).addScaledVector(dir, se);
  const c = box.getCenter(new THREE.Vector3());
  let w = 0;
  let h = 0;
  let near = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    w = Math.max(w, Math.abs(v.dot(right)));
    h = Math.max(h, Math.abs(v.dot(up)));
    near = Math.max(near, -v.dot(fwd));
  }
  const ox = (area.x[0] + area.x[1]) / 2;
  const oy = (area.y[0] + area.y[1]) / 2;
  const ax = (area.x[1] - area.x[0]) / 2;
  const ay = (area.y[1] - area.y[0]) / 2;
  // far enough that its nearest face still fits (perspective grows the near side)
  const D = near + Math.max(w / (tanH * ax), h / (tanV * ay)) / fill;
  // the camera slides so the subject's centre lands on the area's centre
  const cam = c
    .clone()
    .addScaledVector(fwd, -D)
    .addScaledVector(right, -ox * D * tanH)
    .addScaledVector(up, -oy * D * tanV);
  const look = cam.clone().addScaledVector(fwd, D);
  return {
    look: [look.x, look.y, look.z] as [number, number, number],
    offset: [0, D * se, D * ce] as [number, number, number],
    /** where a point at NDC (x, y) of the subject's plane is, in the world (for its words) */
    at: (x: number, y: number) => {
      const p = look.clone().addScaledVector(right, x * D * tanH).addScaledVector(up, y * D * tanV);
      return [p.x, p.y, p.z] as [number, number, number];
    },
  };
}

/** How tall the whispered words will be on this screen (px) — mirrors `.room-whisper`. */
function whisperHeight(lines: readonly string[], width: number, maxW: number) {
  const fs = THREE.MathUtils.clamp(width * 0.021, 18, 26);
  const n = lines.reduce((k, l) => k + Math.max(1, Math.ceil((l.length * fs * 0.44) / maxW)), 0);
  return n * fs * 1.35 + 6 * (lines.length - 1);
}

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
  leaving = false,
  drawIn = false,
}: Props) {
  // on a tall phone screen the ring stretches in depth, which the raised camera turns into height
  const rx = portrait ? 1.45 : 3.1;
  const rz = portrait ? 2.5 : 3.1;
  const ring = useMemo(() => layout(gifts.length, rx, rz), [gifts.length, rx, rz]);
  const opening = openingId !== null;
  // leaving for the finale is told in two beats (step back, then dive) — see useDive
  const divePhase = useDive(leaving);
  // Storyboard D3.3: on to the finale, the light sprite leaves the orb and flies out through
  // the arched window; the camera runs after it, into the glass (App swaps the finale in
  // when it gets there). Reduced motion keeps the plain dive into the orb.
  const windowFlight = leaving && !reducedMotion && divePhase === 'dive';
  useEffect(() => {
    if (!windowFlight) return;
    const glass = new THREE.Vector3(Math.sin(WINDOW_ANGLE) * WALL_R, FLOOR_Y + 1.45, -Math.cos(WINDOW_ANGLE) * WALL_R);
    // out through the left-hand lower pane (the glazing bars cross at the middle)
    const along = new THREE.Vector3(Math.cos(WINDOW_ANGLE), 0, Math.sin(WINDOW_ANGLE));
    glass.addScaledVector(along, -0.42);
    const outward = new THREE.Vector3(Math.sin(WINDOW_ANGLE), 0, -Math.cos(WINDOW_ANGLE));
    const orb = new THREE.Vector3(0, ORB_Y, 0);
    sprite.play(windowScript(orb, glass, outward), orb);
  }, [windowFlight]);
  // …and when the camera, running after it, reaches the glass (the night fills the frame),
  // the finale can take over
  const atGlass = useRef(false);
  useEffect(() => void (atGlass.current = false), [windowFlight]);
  useFrame(({ camera }) => {
    if (!windowFlight || atGlass.current) return;
    if (Math.hypot(camera.position.x, camera.position.z) > WALL_R - MOTION.sprite.window.swapAt) {
      atGlass.current = true;
      story.signal('window');
    }
  });
  const openIndex = gifts.findIndex((g) => g.id === openingId);
  /**
   * Storyboard D3.2: she is led in by the light sprite. Its corridor is still flying when the
   * room mounts; once the room is ready the flight carries on INSIDE it (a change of
   * coordinates under the moving camera), past the window, the sign, the balloons and the
   * cake — each wakes as it passes — and up into the orb. Her hand waits until it is home.
   */
  const ledIn = drawIn && !reducedMotion;
  const [touring, setTouring] = useState(ledIn);
  // the room is about to be built by the light: nothing of it is drawn until then.
  // (once, before the first frame — not on every render, or the end of the tour would
  // arm it again and the finished room would disappear)
  const expected = useRef(false);
  if (ledIn && !expected.current) {
    expected.current = true;
    sprite.expectBuild();
  }

  // a hidden moment in progress (the cake or the sign) — see below
  const [moment, setMoment] = useState<Moment | null>(null);
  const [momentNear, setMomentNear] = useState(false);
  const orbit = usePointerOrbit({
    enabled: !opening && !paused && !moment && !touring,
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
  // J2/J3: the close framing of a moment, fitted to the subject's real bounds on this screen,
  // and where its words go (screen px) — measured when the moment starts, and on a resize
  const size = useThree((st) => st.size);
  const [frame, setFrame] = useState<{ look: [number, number, number]; offset: [number, number, number]; text: [number, number]; maxW: number } | null>(null);
  const [whisper, setWhisper] = useState(false);
  useEffect(() => {
    setFrame(null);
    const g = root.current;
    if (!moment || !g) return;
    const box = new THREE.Box3();
    g.updateWorldMatrix(true, true);
    g.traverse((o) => {
      if (o.userData.frame === moment) box.expandByObject(o);
    });
    if (box.isEmpty()) return;
    const M = MOTION.moment;
    const aspect = size.width / Math.max(1, size.height);
    const fov = portrait ? 50 : 40;
    const dir =
      moment === 'cake' ? new THREE.Vector3(cakeAt[0], 0, cakeAt[2]).normalize() : new THREE.Vector3(0, 0, -1);
    if (moment === 'cake') {
      const pi = portrait ? 1 : 0;
      const f = frameBox(box, dir, fov, aspect, M.elev.cake[pi], M.cake.area[pi], M.fill);
      const [tx, ty] = M.cake.text[pi];
      // beside the cake its words have the right third; above it, the whole width
      const maxW = portrait ? Math.min(size.width * 0.84, 560) : Math.min(size.width * 0.34, 520);
      setFrame({ look: f.look, offset: f.offset, text: [((tx + 1) / 2) * size.width, ((1 - ty) / 2) * size.height], maxW });
      if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __frame: { box: box.clone(), ...f } });
    } else {
      // the words go under the sign, in a band as tall as they will really be
      const maxW = Math.min(size.width * 0.84, 560);
      const th = whisperHeight(birthdayConfig.room.moments.sign, size.width, maxW);
      const half = size.height / 2;
      const bottom = -1 + (M.sign.bottomPx + th + M.sign.gapPx) / half;
      const f = frameBox(box, dir, fov, aspect, M.elev.sign[portrait ? 1 : 0], { x: [-M.sign.sides, M.sign.sides], y: [bottom, M.sign.top] }, M.fill);
      setFrame({ look: f.look, offset: f.offset, text: [size.width / 2, size.height - M.sign.bottomPx - th / 2], maxW });
    }
  }, [moment, size.width, size.height, portrait, cakeAt]);
  useEffect(() => {
    setWhisper(false);
    if (!moment) return;
    const id = window.setTimeout(() => setWhisper(true), MOTION.moment.textAfter * 1000);
    return () => window.clearTimeout(id);
  }, [moment]);
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
    (target: Moment, wish?: boolean | 'play') => {
      momentHit.current = true;
      if (opening || paused || touring || wish === 'play') return;
      if (wish) {
        // a wish made, the candles out: a breath later, back to the room
        window.setTimeout(leaveMoment, 2300);
        return;
      }
      if (moment === target) return leaveMoment();
      if (!before.current) before.current = { yaw: orbit.tYaw, pitch: orbit.tPitch, zoom: orbit.tZoom };
      setMoment(target);
    },
    [opening, paused, moment, orbit, leaveMoment, touring],
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

  // The tour is a gift, not a gate: a touch or a key during it HURRIES it (the whole flight
  // speeds up toward its end — App's lib/pace listener; never a cut), and choosing a gift
  // brings the light home at once (`skip-tour`).
  useEffect(() => {
    if (!touring) return;
    void story.wait('skip-tour').then(() => sprite.skip());
  }, [touring]);

  // a sweep of her hand across three or more gifts turns the whole ring a little, on its
  // own inertia, and it springs back where it was (storyboard F2)
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const R = giftRing;
    R.count = gifts.length;
    R.touched = R.touched.filter((x) => t - x.t < 0.7);
    if (new Set(R.touched.map((x) => x.i)).size >= 3 && !opening && !moment && !touring) {
      R.spinVel += Math.sign(roomHand.wind || 1) * 0.9;
      R.touched = [];
    }
    R.spinVel += (-R.spin * 5.5 - R.spinVel * 2.4) * dt;
    R.spin = THREE.MathUtils.clamp(R.spin + R.spinVel * dt, -0.4, 0.4);
  });
  useEffect(
    () => () => {
      giftRing.spin = 0;
      giftRing.spinVel = 0;
      giftRing.waves = [];
    },
    [],
  );

  // Focus follows her hand (storyboard F4): zoomed in (wheel / pinch), the camera's eyes
  // slide toward what the pointer is over — on a spring, so it has inertia — and back to the
  // middle as she zooms out. Only the look moves: the camera never goes through anything.
  const focusNudge = useMemo(() => new THREE.Vector3(), []);
  const focusTmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const zin = THREE.MathUtils.clamp((1 - orbit.zoom) / 0.22, 0, 1);
    const hf = handUniforms.uHandFloor.value;
    const free = !opening && !moment && !touring && !leaving && zin > 0.01 && hf.y > -50 && !reducedMotion;
    if (free) focusTmp.set(hf.x * 0.55, 0.15, hf.z * 0.55).multiplyScalar(zin);
    else focusTmp.set(0, 0, 0);
    focusNudge.lerp(focusTmp, 1 - Math.exp(-dt * 1.6));
  });

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
  /**
   * Her hand resting on a thing is interest, not yet a decision (storyboard C): after a
   * quarter of a second the camera leans in a tenth of the way toward it — the way a person
   * moves their head before they reach out. Moving on cancels it at once.
   */
  const [near, setNear] = useState<number>(-1);
  useEffect(() => {
    if (hoverIndex < 0 || opening || moment) {
      setNear(-1);
      return;
    }
    const id = setTimeout(() => setNear(hoverIndex), MOTION.hand.dwellMs);
    return () => clearTimeout(id);
  }, [hoverIndex, opening, moment]);
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
  /**
   * The room is drawn in light before it is there (storyboard B): once it has compiled, its
   * own meshes are sampled and the motes fly out to those places; `drawn` then lets the real
   * room take over. Nothing to draw (reduced motion) → the room is simply there.
   */
  const [build, setBuild] = useState<BuildPoints | null>(null);
  const [drawn, setDrawn] = useState(true);

  // the first pull-back out of the orb is slower than any later glide: it is the reveal
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    if (!ready || touring) return;
    // (after a led-in tour, the pull-back to the room's framing starts when the tour ends)
    setArriving(true);
    const id = setTimeout(() => setArriving(false), 2600);
    return () => clearTimeout(id);
  }, [ready, touring]);
  useEffect(() => {
    if (!leaving) return;
    orbit.tPitch = 0;
    orbit.tZoom = 1;
  }, [leaving, orbit]);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    let alive = true;
    resetReady('room-ready');
    // ONCE. It used to be called twice — by the compile and again by the fallback below —
    // and the second call armed the light that draws the room a second time, after the
    // room had already been handed over: the room then stayed invisible for good.
    let shown = false;
    let fallback = 0;
    let safety = 0;
    const show = () => {
      if (!alive || shown) return;
      shown = true;
      clearTimeout(fallback);
      const c = cam as THREE.PerspectiveCamera;
      if (ledIn && sprite.playing) {
        // the flight carries on in here: move the leader, the camera and its springs into
        // the room's coordinates (they are all inside the corridor of light, so nothing in
        // view jumps), then fly the tour
        const lay = SIGN_PLACEMENT[portrait ? 'portrait' : 'landscape'];
        const { entry, legs } = roomTourScript(
          {
            orb: new THREE.Vector3(0, ORB_Y, 0),
            window: new THREE.Vector3(Math.sin(WINDOW_ANGLE) * (WALL_R - 0.6), FLOOR_Y + 1.6, -Math.cos(WINDOW_ANGLE) * (WALL_R - 0.6)),
            sign: new THREE.Vector3(0, FLOOR_Y + 2.2, -lay.radius + 0.4),
            balloons: new THREE.Vector3(1.9, FLOOR_Y + 2.3, -lay.radius + 0.5),
            cake: new THREE.Vector3(cakeAt[0], ground + 0.6, cakeAt[2]),
          },
          () => setTouring(false),
        );
        const offset = entry.clone().sub(sprite.leader);
        sprite.rebase(offset);
        // the camera lands where a follower would be — right behind the leader — even if it
        // had fallen back in the corridor (otherwise it could land outside the room's wall)
        rebaseCamera(c, sprite.cam.pos.clone().sub(c.position));
        sprite.continueWith(legs);
        setReady(true);
        const pts = sampleRoom(g, 15000, true);
        if (pts) setBuild(pts);
        let n = 0;
        const tick = () => (++n >= 4 ? signalReady('room-ready') : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
        return;
      }
      // not led in (or the flight is not there to lead): nothing waits for the light
      sprite.cancelBuild();
      // the room opens out of its orb: the camera starts right in front of it (where the
      // last world's camera dove into its own light) and the rig pulls back from there
      delete c.userData.rig;
      c.position.set(...ORB_CLOSE.pos);
      (c.userData.look ??= new THREE.Vector3()).set(0, ORB_Y, 0);
      c.lookAt(0, ORB_Y, 0);
      c.fov = ORB_CLOSE.fov;
      c.updateProjectionMatrix();
      setReady(true);
      setTouring(false);
      // sample the room's real surfaces for the light to land on (cheap: it reads vertex
      // buffers that are already here)
      if (drawIn && !reducedMotion) {
        const pts = sampleRoom(g);
        if (pts) {
          setBuild(pts);
          setDrawn(false);
          // whatever happens to that light, the room is hers a few seconds later
          safety = window.setTimeout(() => alive && setDrawn(true), 4000);
        }
      }
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
        // everything in the room, even what starts hidden (glows, the pedestal, the title
        // card, a set piece behind the dolls'-house cut): three compiles only what is visible,
        // and whatever it skips would compile on the frame it first appears — all at once,
        // when she is led in and the room is shown whole
        const hidden: THREE.Object3D[] = [];
        g.traverse((o) => {
          if (!o.visible) {
            hidden.push(o);
            o.visible = true;
          }
        });
        gl.compileAsync(scn, cam).then(show, show);
        hidden.forEach((o) => (o.visible = false));
        g.visible = false;
      });
    });
    fallback = window.setTimeout(show, 3500);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      clearTimeout(safety);
    };
  }, [gl, cam, scn, reducedMotion, drawIn]); // eslint-disable-line react-hooks/exhaustive-deps

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
  let camFov = base.fov;
  const pi = portrait ? 1 : 0;
  if (moment === 'cake') {
    // leaning in to the cake, from the room's side of it
    const d = Math.hypot(cakeAt[0], cakeAt[2]);
    camLook = frame && momentNear ? frame.look : [cakeAt[0] - (cakeAt[2] / d) * 0, ground + MOMENT.cake.lookH, cakeAt[2]];
    camPos = frame && momentNear
      ? [camLook[0] + frame.offset[0], camLook[1] + frame.offset[1], camLook[2] + frame.offset[2]]
      : [camLook[0], camLook[1] + MOMENT.far.lift[pi], camLook[2] + MOMENT.far.back[pi]];
  } else if (moment === 'sign') {
    camLook = frame && momentNear ? frame.look : [0, ground + 2.0 - safeDrop(sign.scale, sign.drop) + MOMENT.sign.lookOffset, -sign.radius];
    camPos = frame && momentNear
      ? [camLook[0] + frame.offset[0], camLook[1] + frame.offset[1], camLook[2] + frame.offset[2]]
      : [0, camLook[1] + MOMENT.far.lift[pi], camLook[2] + MOMENT.far.back[pi] + 1.2];
  } else if (leaving) {
    if (divePhase === 'pull') {
      // the breath in: the room steps back a little and the lens narrows, before the dive
      camPos = [base.pos[0], base.pos[1] * 1.02, base.pos[2] * 1.045];
      camFov = base.fov - 3;
    } else {
      // on to the finale: dive into the orb from wherever she stands
      camPos = ORB_CLOSE.pos;
      camLook = [0, ORB_Y, 0];
      camFov = ORB_CLOSE.fov;
    }
  } else if (near >= 0 && !opening && ring[near]) {
    // a lean toward the thing under her hand: a little closer, looking a little at it
    const [gx, , gz] = ring[near].pos;
    const k = MOTION.hand.approach;
    camPos = [base.pos[0] + (gx - base.pos[0]) * k, base.pos[1] * (1 - k * 0.5), base.pos[2] + (gz - base.pos[2]) * k];
    camLook = [base.look[0] + gx * k * 1.6, base.look[1] + 0.25 * k * 1.6, base.look[2] + gz * k * 1.6];
  } else if (opening && openIndex >= 0 && gifts[openIndex]?.shape === 'envelope') {
    // the puppy is a memory too: the camera walks up to it (same rig, same swing round to
    // face it) and settles a little low, the puppy's face and the letter it gives framed
    // together — the puppy stays where it stands and performs
    const [px, , pz] = ring[openIndex].pos;
    const a = ring[openIndex].angle;
    const near = portrait ? 0.55 : 0.35; // look a little in front of it: where the letter lands
    camLook = [px + Math.sin(a) * near, FLOOR_Y + (portrait ? 0.62 : 0.55), pz + Math.cos(a) * near];
    const back = Math.min(portrait ? 4.6 : 3.7, 8.1 - Math.hypot(px, pz));
    camPos = [camLook[0], camLook[1] + (portrait ? 1.15 : 0.95), camLook[2] + back];
    // a portrait lens (≈ 60 mm): the head, chest and ribbon, the paws and the letter —
    // flatter, calmer perspective than the room's wide view
    camFov = portrait ? 20 : 26;
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
    <>
      <group ref={root} visible={ready && drawn} userData={{ roomRoot: true }}>
        {(ready || ledIn) && (
          // mounted once the room is ready, so it starts from the orb (see `show`)
          <CameraRig
            position={camPos}
            lookAt={camLook}
            parallax={reducedMotion || opening || moment || leaving ? 0 : 0.25}
            speed={
            leaving
              ? divePhase === 'pull'
                ? 2.2
                : 1.35
              : moment
                ? MOMENT.speed
                : opening
                  ? gifts[openIndex]?.shape === 'envelope'
                    ? 1.25
                    : 2.0
                  : arriving
                    ? 0.75
                    : near >= 0
                      ? 0.55
                      : 1.1
          }
            fov={camFov}
            orbit={orbit}
            orbitCamera
            nudge={focusNudge}
            fit={portrait && !leaving && !moment ? (yaw) => 1 + 0.42 * Math.sin(yaw) ** 2 : undefined}
          />
        )}
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
        <group position={[0, ORB_Y, 0]}>
          {/* …and the orb last of all: the leader rises into the middle of the room and
              becomes it (BuildGate `last`), so the flight ends ON the thing it made */}
          <BuildGate at={[0, 0]} last grow={1.1}>
          {/* the centerpiece: a little universe of their memories, kept in glass. Touch
              plays its constellation reveal; once every memory is open, the touch also
              leads on to the finale (as the heart did), while the orb opens */}
          <MemoryCelestial
            count={heartPoints}
            charge={allOpened ? 1 : 0.25 + (opened.length / gifts.length) * 0.5}
            interactive={!opening && !paused && !moment && !touring}
            onTap={allOpened ? onHeartTap : undefined}
            tapAfter={1100}
            hush={opening}
            reducedMotion={reducedMotion}
            scale={portrait ? 0.7 : 0.86}
          />
          </BuildGate>
        </group>
        {gifts.map((g, i) => (
          <BuildGate key={g.id} at={[ring[i].pos[0], ring[i].pos[2]]} pivot={[ring[i].pos[0], FLOOR_Y, ring[i].pos[2]]} mode="drop" grow={1.1}>
          <Gift3D
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
            disabled={opening || paused || !!moment || touring}
            focused={focusId === g.id}
            quiet={allOpened}
            // the names step away while the camera dives into the orb
            hideLabel={leaving}
            glass={glass}
            reducedMotion={reducedMotion}
            hoverFx={hoverFx}
            onSelect={onSelect}
            onOpened={onOpened}
            onHover={onHover}
          />
          </BuildGate>
        ))}
        {/* the words sit in their own part of the SCREEN (never on the thing they speak of),
            and only once the camera has arrived (J2/J3) */}
        {moment && whisper && frame && (
          <Html
            key={moment}
            // (anchored on the subject, which is in front of the camera — drei hides an Html
            //  whose anchor is behind it — but drawn where `calculatePosition` puts it)
            position={frame.look}
            center
            calculatePosition={() => frame.text}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[8, 0]}
          >
            <Whisper lines={birthdayConfig.room.moments[moment]} maxW={frame.maxW} />
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
      {/* the light that draws the room: outside the room's own group, so it is seen while
          the room itself is still held back (storyboard B, 2.0-3.6 s) */}
      {build && <RoomBuild points={build} from={[0, ORB_Y, 0]} reducedMotion={reducedMotion} onDrawn={() => setDrawn(true)} />}
    </>
  );
}

/** The room's whispered message: lines that arrive one after another, like a thought. */
function Whisper({ lines, maxW }: { lines: readonly string[]; maxW?: number }) {
  return (
    <div className="room-whisper" role="status" style={maxW ? { maxWidth: maxW } : undefined}>
      {lines.map((l, i) => (
        <span key={i} style={{ animationDelay: `${0.9 + i * 0.55}s` }}>
          {l}
        </span>
      ))}
    </div>
  );
}
