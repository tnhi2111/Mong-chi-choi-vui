import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { EAR_ROOT_Y, JAW_HINGE, occluders, SHOULDER, TAIL_BASE, TONGUE_ROOT, type V3 } from './dogModel';
import { emptyLightDogGeometry, lightDogGeometry, loadLightDog } from './lightDogData';
import { BONE_COUNT, GALLOP, HEAD, HEAD_OFFSET, poseRun, RUN_SPEED, runOccluders } from './dogRun';
import type { OrbitInput } from '../../hooks/usePointerOrbit';
import { sound } from '../../lib/audio';

/** The waving arm, put down: turned about the shoulder, then slid in and down. */
/*
 * Putting the waving paw down to stand on, like the other front leg:
 *  1. the arm swings down about the shoulder until it hangs straight (ARM_DOWN_ANGLE),
 *  2. the paw folds at the wrist — turned over (Y, π) and tipped forward (X, −π/2) — so
 *     its pads face the floor and its toes point forward (a raised paw shows its pads),
 *  3. the leg settles so the paw rests on the floor beside the other (ARM_DOWN_SHIFT).
 * Points past WRIST_ALONG along the raised arm belong to the paw.
 */
const ARM_DOWN_ANGLE = 2.595;
const ARM_DOWN_SHIFT = [-0.055, -0.215];
const WRIST_ALONG = 0.3;

/*
 * The trick (seconds after she touches the puppy): it gets up on all fours (the light
 * flows from the sitting pose into a standing one) and turns to run; gallops one lap
 * round the heart — speeding up, full gallop, slowing down — back to where it sat; sits
 * down again facing her, gives one happy "woof", and stays with its tongue out,
 * panting, tail wagging. Its paw stays down afterwards (no more waving).
 */
const STAND = 0.6;
const SIT = 0.7;
const ACCEL = 0.7;
const DECEL = 0.9;
/**
 * The lap round the heart is an oval, wide across the screen and shallow in depth, so
 * as it runs past in front it doesn't fill her screen. World units.
 */
const LAP_DEPTH = { wide: 1.7, tall: 1.05 };
const MIN_LAP_WIDTH = { wide: 1.1, tall: 0.7 };
const TAU = Math.PI * 2;
const ease = (x: number) => {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
const m = new THREE.Matrix4();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Lap {
  /** the oval (world, x–z): centre, radii, where it starts, which way round */
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  theta0: number;
  dir: number;
  /** cumulative length along the oval at N+1 even steps of the angle (a full turn) */
  arc: Float32Array;
  length: number;
  /** full-gallop speed in world units */
  speed: number;
  cruise: number;
  /** from the touch: back on its spot and sitting, the bark, the end of it all */
  runEnd: number;
  barkAt: number;
  end: number;
}
const ARC_STEPS = 256;

/** The lap: an oval round the heart (on the world's vertical axis) through where the puppy sits. */
function planLap(position: [number, number, number], scale: number, portrait: boolean, run: boolean): Lap {
  const [px, , pz] = position;
  const rz = portrait ? LAP_DEPTH.tall : LAP_DEPTH.wide;
  const s0 = THREE.MathUtils.clamp(pz / rz, -0.95, 0.95);
  let theta0 = Math.asin(s0);
  if (px < 0) theta0 = Math.PI - theta0;
  const rx = Math.max(Math.abs(px / Math.cos(theta0)), portrait ? MIN_LAP_WIDTH.tall : MIN_LAP_WIDTH.wide);
  const cx = px - rx * Math.cos(theta0);
  const cz = pz - rz * Math.sin(theta0);
  // run off toward her (the camera looks down -z) first
  const dir = rz * Math.cos(theta0) >= 0 ? 1 : -1;
  const arc = new Float32Array(ARC_STEPS + 1);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const a0 = theta0 + (dir * TAU * (i - 1)) / ARC_STEPS;
    const a1 = theta0 + (dir * TAU * i) / ARC_STEPS;
    arc[i] = arc[i - 1] + Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), rz * (Math.sin(a1) - Math.sin(a0)));
  }
  const length = arc[ARC_STEPS];
  const speed = RUN_SPEED * scale;
  const cruise = Math.max(0, length / speed - (ACCEL + DECEL) / 2);
  const runEnd = run ? STAND + ACCEL + cruise + DECEL + SIT : 0;
  const barkAt = runEnd + (run ? 0.25 : 0.3);
  return { cx, cz, rx, rz, theta0, dir, arc, length, speed, cruise, runEnd, barkAt, end: barkAt + 0.7 };
}

/** Distance run (world) and speed (0…1 of a full gallop) at time `t` into the lap. */
function lapAt(lap: Lap, t: number): [number, number] {
  const v = lap.speed;
  if (t <= 0) return [0, 0];
  if (t < ACCEL) return [(0.5 * v * t * t) / ACCEL, t / ACCEL];
  if (t < ACCEL + lap.cruise) return [v * (ACCEL / 2 + t - ACCEL), 1];
  const s = Math.min(t - ACCEL - lap.cruise, DECEL);
  return [Math.min(lap.length, v * (ACCEL / 2 + lap.cruise + s - (s * s) / (2 * DECEL))), 1 - s / DECEL];
}

/** The angle on the oval after running `dist` along it. */
function thetaAt(lap: Lap, dist: number): number {
  const { arc } = lap;
  let lo = 0;
  let hi = ARC_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] < dist) lo = mid;
    else hi = mid;
  }
  const f = THREE.MathUtils.clamp((dist - arc[lo]) / Math.max(arc[hi] - arc[lo], 1e-6), 0, 1);
  return lap.theta0 + (lap.dir * TAU * (lo + f)) / ARC_STEPS;
}

/*
 * A little golden retriever puppy made of light, sitting beside the heart and
 * waving one paw — a real 3D figure, so it turns with the world as she drags.
 * Its shape lives in dogModel.ts; this file brings it to life.
 *
 * Before the heart forms its points are faint dust across the sky; when the
 * heart gathers they light up and fly in, and a few more background points
 * light up where they are. Once formed: the paw waves, the tail wags, it breathes.
 */

/** The head tips back about this point for the bark (shader and hidden body alike). */
const HEAD_PIVOT: V3 = [0, 0.38, -0.02];
/** Hidden shapes of the muzzle/cheeks (in front of the face), which the open jaw passes through. */
const isFace = (o: { position: V3 }) => o.position[2] > 0.1 && o.position[1] < 0.6;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAwake;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform float uShown;
  // the trick she can ask for with a touch (see the timeline in useFrame)
  uniform float uArmDown;   // 0 waving, 1 paw put down
  uniform float uBark;      // the head thrown up for the "woof"
  uniform float uTongue;    // tongue out, panting
  uniform float uRun;       // 0 sitting … 1 on its feet (dogRun.ts)
  uniform mat4 uBones[${BONE_COUNT}];
  uniform mat4 uPath;       // where it has run to, and which way it faces
  uniform float uEarFlap;   // ears thrown back by the gallop …
  uniform float uEarLift;   // … and lifted out to the sides
  uniform float uTongueBack; // tongue blown back by the wind of running
  uniform float uTongueSide; // … and flopping side to side
  uniform float uTailSway;  // the tail swaying behind it as it runs
  uniform float uJaw;       // how far the lower jaw hangs open (radians)
  attribute vec3 aRun;      // this point on the standing puppy …
  attribute float aBoneA;   // … carried by this bone
  attribute float aBoneB;   // (or blended toward this one)
  attribute float aBoneW;
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aAnim;  // 0 still, 1 tail, 2 waving arm, 4 background point
  attribute vec4 aRest;   // waving arm only: its place on the mirrored front leg (w: fades)
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

  vec3 rotZ(vec3 p, vec3 o, float a) {
    vec3 q = p - o;
    return o + vec3(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a), q.z);
  }
  vec3 rotY(vec3 p, vec3 o, float a) {
    vec3 q = p - o;
    return o + vec3(q.x * cos(a) + q.z * sin(a), q.y, -q.x * sin(a) + q.z * cos(a));
  }
  vec3 rotX(vec3 p, vec3 o, float a) {
    vec3 q = p - o;
    return o + vec3(q.x, q.y * cos(a) - q.z * sin(a), q.y * sin(a) + q.z * cos(a));
  }

  void main() {
    float t = uTime;
    vec3 local = position;
    // ── movements shared by both poses (worked out on the sitting puppy, then carried
    //    over as an offset — the head, ears and tail are the same points in both) ──
    vec3 d = vec3(0.0);
    // the tongue (a solid one, rooted deep in the mouth): drawn in, or out and panting;
    // running, the wind blows it back under the chin and it flops from side to side
    if (aAnim > 0.15 && aAnim < 0.25) {
      vec3 root = vec3(${TONGUE_ROOT.map((v) => v.toFixed(4)).join(', ')});
      float along = clamp(distance(local, root) / 0.19, 0.0, 1.0);
      vec3 q = mix(root + (local - root) * 0.3 + vec3(0.0, 0.004, -0.012), local, uTongue);
      float pant = (0.5 + 0.5 * sin(t * 9.0)) * 0.13 * uMotion * uTongue;
      q = rotX(q, root, (pant + uTongueBack) * along);
      q = rotZ(q, root, uTongueSide * along);
      // it rests in the middle of the open mouth: it follows the lower jaw only half-way,
      // so it stays up between the jaws instead of dropping onto the chin
      q = rotX(q, vec3(${JAW_HINGE.join(', ')}), uJaw * 0.5);
      d += q - local;
    }
    // the lower jaw: hinged at the corners of the mouth, open while it pants, barks or runs
    if (aAnim > 0.05 && aAnim < 0.15) d += rotX(local, vec3(${JAW_HINGE.join(', ')}), uJaw) - local;
    // the ears: thrown back and lifted out by the wind as it gallops, flapping with each bound
    if (aAnim > 0.25 && aAnim < 0.35) {
      float hang = clamp((${EAR_ROOT_Y.toFixed(3)} - local.y) / 0.6, 0.0, 1.0);
      float side = local.x < 0.0 ? -1.0 : 1.0;
      vec3 q = rotX(local, vec3(0.0, ${EAR_ROOT_Y.toFixed(3)}, -0.03), uEarFlap * hang);
      q = rotZ(q, vec3(side * 0.2, ${EAR_ROOT_Y.toFixed(3)}, 0.0), side * uEarLift * hang);
      d += q - local;
    }
    // a happy wag: the whole tail sweeps side to side from its root; further along it lags
    // behind and swings wider, so it bends like a whip; bursts of wagging, then easier
    if (aAnim > 0.5 && aAnim < 1.5) {
      float along = (aAnim - 1.0) / 0.49;
      float mood = 0.65 + 0.35 * sin(t * 0.45);
      float ph = t * 9.5 - along * 1.7;
      vec3 q = rotY(local, vec3(${TAIL_BASE.join(', ')}), sin(ph) * (0.3 + 0.45 * along) * mood * uMotion + uTailSway * along);
      q.y += sin(ph + 1.3) * 0.02 * along * uMotion;
      d += q - local;
    }

    // ── sitting ──
    vec3 sit = local + d;
    float armFade = 0.0;
    // waving: the raised paw swings back and forth from the shoulder, a little pause between waves;
    // once she has played with it, the paw comes down to the ground beside the other
    if (aAnim > 1.5 && aAnim < 2.5) {
      float wave = sin(t * 5.5) * smoothstep(-0.2, 0.4, sin(t * 0.9)) * (1.0 - uArmDown);
      vec3 S = vec3(${SHOULDER.join(', ')});
      vec3 D = normalize(vec3(0.17, 0.28, 0.07));   // the raised arm's direction
      float along = dot(local - S, D);
      float pawW = smoothstep(${(WRIST_ALONG - 0.02).toFixed(3)}, ${(WRIST_ALONG + 0.02).toFixed(3)}, along);
      float ang = wave * 0.32 * uMotion - uArmDown * ${ARM_DOWN_ANGLE};
      sit = rotZ(sit, S, ang);
      // fold the paw at the wrist so it lands flat, pads down, toes forward
      vec3 W = rotZ(S + D * ${WRIST_ALONG.toFixed(3)}, S, ang);
      float f = uArmDown * pawW;
      sit = rotY(sit, W, 3.14159 * f);
      sit = rotX(sit, W, -1.5708 * f);
      sit.xy += vec2(${ARM_DOWN_SHIFT.join(', ')}) * uArmDown;
      // …and over the last part of coming down, its light settles onto the mirror image of
      // the other front leg: two front legs alike, standing, nothing left of the wave
      float settle = smoothstep(0.3, 1.0, uArmDown);
      settle = settle * settle * (3.0 - 2.0 * settle);
      sit = mix(sit, aRest.xyz, settle);
      armFade = aRest.w * smoothstep(0.2, 0.8, uArmDown);
    }
    // the head thrown up for the bark
    if (aAnim < 0.5) sit = rotX(sit, vec3(${HEAD_PIVOT.join(', ')}), -uBark * 0.28 * smoothstep(0.3, 0.46, sit.y));
    // breathing
    sit.y += sin(t * 1.7) * 0.006 * uMotion * (sit.y + 0.42);

    // ── running: skinned onto the skeleton, then carried round its lap ──
    vec3 target = sit;
    if (uRun > 0.0) {
      vec4 r = vec4(aRun + d, 1.0);
      vec3 run = mix((uBones[int(aBoneA)] * r).xyz, (uBones[int(aBoneB)] * r).xyz, aBoneW);
      run = (uPath * vec4(run, 1.0)).xyz;
      target = mix(sit, run, uRun);
      // getting up / sitting down: the light lifts a little as it flows
      target.y += sin(3.14159 * uRun) * 0.05;
    }
    target += vec3(sin(t * 0.9 + aSeed * 30.0), cos(t * 0.8 + aSeed * 17.0), sin(t * 0.7 + aSeed * 11.0)) * 0.003 * uMotion;

    float e = clamp((uAwake - aDelay * 0.5) / 0.5, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 drift = aStart + vec3(sin(t * 0.2 + aSeed * 9.0), cos(t * 0.17 + aSeed * 5.0), 0.0) * 0.15 * uMotion;
    vec3 p = aAnim > 3.5 ? drift : mix(drift, target, e);
    p.z += sin(e * 3.14159) * 0.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (12.0 / -mv.z) * mix(0.7, 1.0, e);
    // on its feet the same light covers a much bigger stretch of back, flank and rump than
    // when it sits (tucked up behind its chest and legs): fuller points keep the coat closed
    if (aAnim < 0.05) gl_PointSize *= 1.0 + uRun * (aBoneA < 1.5 ? 0.75 : aBoneA > 3.5 ? 0.3 : 0.0);

    float twinkle = 0.8 + 0.2 * sin(t * (1.1 + aSeed * 2.0) + aSeed * 40.0);
    float lit = aAnim > 3.5 ? 0.55 : 1.0;
    // faint dust while asleep, bright once awake
    vAlpha = twinkle * mix(0.1, lit, smoothstep(0.0, 0.3, uAwake)) * uShown * mix(0.6, 1.0, e) * (1.0 - armFade * (1.0 - uRun));
    vColor = aAnim > 3.5 ? vec3(1.0, 0.9, 0.85) : aColor;
    // pads face the ground once the paw is down: they fade, leaving the cream fur of the paw
    if (aAnim > 2.15 && aAnim < 2.25) vAlpha *= 1.0 - 0.97 * max(uArmDown, uRun);
    // the tongue out: fuller and a brighter pink, so it shows over the white bib
    if (aAnim > 0.15 && aAnim < 0.25) {
      gl_PointSize *= 1.0 + 0.25 * uTongue;
      vAlpha = min(1.0, vAlpha * (1.0 + 0.3 * uTongue));
    }
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.5;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.3), (core + halo) * vAlpha);
  }
`;

interface Props {
  /** Starts the gathering (and keeps it lit). */
  awake: boolean;
  /** Fades the whole puppy out (e.g. when the story moves on). */
  visible: boolean;
  position: [number, number, number];
  /** Turn toward the heart (radians around Y). */
  facing?: number;
  scale: number;
  density: number;
  reducedMotion: boolean;
  /** Phone-shaped screen: the lap round the heart is tighter. */
  portrait?: boolean;
  /** Touching the puppy makes it do its trick. */
  interactive?: boolean;
  orbit?: OrbitInput;
}

export function LightDog({ awake, visible, position, facing = 0, scale, density, reducedMotion, portrait = false, interactive = false, orbit }: Props) {
  const group = useRef<THREE.Group>(null);
  const awakeP = useRef(0);
  const shown = useRef(visible ? 1 : 0);

  // the points are sampled in a worker (seconds of SDF work); until they arrive, an empty
  // stand-in keeps the shader compiled and nothing is drawn
  const [points, setPoints] = useState<THREE.BufferGeometry>(emptyLightDogGeometry);
  useEffect(() => {
    let alive = true;
    void loadLightDog(density).then((a) => alive && setPoints(lightDogGeometry(a)));
    return () => {
      alive = false;
    };
  }, [density]);
  useEffect(() => () => points.dispose(), [points]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAwake: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: 1 },
      uShown: { value: 1 },
      uArmDown: { value: 0 },
      uBark: { value: 0 },
      uTongue: { value: 0 },
      uRun: { value: 0 },
      uBones: { value: Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4()) },
      uPath: { value: new THREE.Matrix4() },
      uEarFlap: { value: 0 },
      uEarLift: { value: 0 },
      uTongueBack: { value: 0 },
      uTongueSide: { value: 0 },
      uTailSway: { value: 0 },
      uJaw: { value: 0 },
    }),
    [],
  );
  const material = useShader(vertex, fragment, uniforms);

  // An invisible body just beneath the fur: it writes depth only, so light on the far
  // side of the puppy is hidden — and the dark eyes, nose and pads read as dark.
  const occluder = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 24, 16), []);
  const flesh = useMemo(occluders, []);
  // the standing body's flesh rides its bones (the head is the sitting head's, moved)
  const runFlesh = useMemo(
    () => [
      ...runOccluders(),
      ...flesh
        // (not the ears: they fly in the wind while it runs, and a hidden ear left behind
        //  would show as a dark, stiff ear-shaped hole)
        //  …and only the head itself, not the muzzle and cheeks: the mouth hangs open
        //  while it runs, and the hidden muzzle would show through it as a black hole)
        .filter((o) => o.part === 'head' && !o.ear && o.scale[0] > 0.2)
        // (and smaller: raised on its neck, the underside of the head has no fur on it —
        //  a full-size hidden head would show there as a dark hole)
        .map((o) => ({
          ...o,
          bone: HEAD,
          position: [o.position[0] + HEAD_OFFSET[0], o.position[1] + HEAD_OFFSET[1], o.position[2] + HEAD_OFFSET[2]] as V3,
          scale: o.scale.map((v) => v * 0.62) as V3,
        })),
    ],
    [flesh],
  );
  const runBody = useRef<THREE.Group>(null);
  const headFlesh = useRef<THREE.Group>(null);
  const faceFlesh = useRef<THREE.Group>(null);
  const boneGroups = useRef<(THREE.Group | null)[]>([]);
  useEffect(
    () => () => {
      occluder.dispose();
      sphere.dispose();
    },
    [occluder, sphere],
  );
  const body = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const trick = useRef<THREE.Group>(null);
  /** When the trick began (clock seconds), whether it has barked yet, and whether it ever played. */
  const trickAt = useRef<number | null>(null);
  const wind = useRef(0);
  const lap = useRef<Lap | null>(null);
  const barked = useRef(false);
  const played = useRef(false);
  const now = useRef(0);
  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), []);
  useEffect(() => () => hitMaterial.dispose(), [hitMaterial]);
  const [hovered, setHovered] = useState(false);
  const canTap = interactive && awake;
  useEffect(() => {
    if (!canTap || !hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, canTap]);

  const play = (e: ThreeEvent<MouseEvent>) => {
    if (!canTap || awakeP.current < 1) return;
    e.stopPropagation();
    if (e.delta > 8 || (orbit && orbit.travel > 10)) return; // that was a drag
    if (trickAt.current !== null && lap.current && now.current - trickAt.current < lap.current.end) return; // still busy
    trickAt.current = now.current;
    lap.current = planLap(position, scale, portrait, !reducedMotion);
    barked.current = false;
    played.current = true;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (awake) awakeP.current = Math.min(1, awakeP.current + Math.min(rawDt, 0.25) / (reducedMotion ? 1.2 : 4.2));
    shown.current += ((visible ? 1 : 0) - shown.current) * (1 - Math.exp(-dt * 1.5));
    uniforms.uTime.value = state.clock.elapsedTime;
    now.current = state.clock.elapsedTime;
    // (QA scripts can hold the trick at a moment: window.__dogT = seconds since the touch)
    const held = (window as { __dogT?: number }).__dogT;
    const T = trickAt.current === null ? Infinity : typeof held === 'number' ? held : now.current - trickAt.current;
    const L = lap.current;
    const k = 1 - Math.exp(-dt * 6);
    // the paw comes down as soon as she plays, and stays down; the tongue comes out as it
    // sets off (panting) and stays out
    uniforms.uArmDown.value += ((played.current ? 1 : 0) - uniforms.uArmDown.value) * k;
    uniforms.uTongue.value += ((played.current && T > 0.3 ? 1 : 0) - uniforms.uTongue.value) * k;
    let runW = 0;
    let speed = 0;
    /** where it is in its stride (for the loose parts' flapping) */
    let gust = 0;
    if (L && T < L.runEnd) {
      const lapT = T - STAND;
      const lapEnd = ACCEL + L.cruise + DECEL;
      const [dist, v] = lapAt(L, Math.min(lapT, lapEnd));
      speed = lapT > 0 && lapT < lapEnd ? v : 0;
      // up onto its feet, turning to run; at the end, down again, turning back to her
      runW = T < STAND ? ease(T / STAND) : lapT < lapEnd ? 1 : 1 - ease((lapT - lapEnd) / SIT);
      const turn = T < STAND ? ease(T / STAND) : lapT < lapEnd ? 1 : 1 - ease((lapT - lapEnd) / SIT);
      // where it is on the oval and which way it's going — in the world, then in its own space
      const theta = thetaAt(L, dist);
      const wx = L.cx + L.rx * Math.cos(theta) - position[0];
      const wz = L.cz + L.rz * Math.sin(theta) - position[2];
      const px = (wx * Math.cos(facing) - wz * Math.sin(facing)) / scale;
      const pz = (wx * Math.sin(facing) + wz * Math.cos(facing)) / scale;
      const tangent = (th: number) => Math.atan2(-L.rx * Math.sin(th) * L.dir, L.rz * Math.cos(th) * L.dir) - facing;
      const heading = wrap(tangent(lapT > 0 && lapT < lapEnd ? theta : L.theta0));
      const yaw = heading * turn;
      // leaning into the curve, pivoting at its feet
      const roll = 0.12 * speed * -L.dir;
      const path = uniforms.uPath.value;
      path.makeTranslation(0, 0.38, 0);
      path.premultiply(m.makeRotationZ(roll));
      path.premultiply(m.makeTranslation(0, -0.38, 0));
      path.premultiply(m.makeRotationY(yaw));
      path.premultiply(m.makeTranslation(px, 0, pz));
      const phase = Math.max(0, lapT) * GALLOP.freq;
      poseRun(uniforms.uBones.value, phase, speed);
      gust = phase;
    }
    // (QA: window.__dogPose = { phase, speed, yaw } shows the running pose on the spot,
    // turned to `yaw` in the world — for filmstrips of the gait)
    const pose = (window as { __dogPose?: { phase: number; speed: number; yaw: number } }).__dogPose;
    if (pose) {
      runW = 1;
      uniforms.uPath.value.makeRotationY(pose.yaw - facing);
      poseRun(uniforms.uBones.value, pose.phase, pose.speed);
      gust = pose.phase;
      speed = pose.speed;
      wind.current = speed;
    }
    uniforms.uRun.value = runW;
    // the wind of running on the loose parts, a beat behind the body (they have weight)
    wind.current += (speed - wind.current) * (1 - Math.exp(-dt * 3));
    const w = wind.current * (reducedMotion ? 0 : 1);
    const t = state.clock.elapsedTime;
    uniforms.uEarFlap.value = w * (0.55 + 0.28 * Math.sin(TAU * (gust - 0.15)) + 0.06 * Math.sin(t * 17));
    uniforms.uEarLift.value = w * (0.22 + 0.14 * Math.sin(TAU * (gust - 0.1)) + 0.04 * Math.sin(t * 13 + 1));
    uniforms.uTongueBack.value = w * (0.75 + 0.2 * Math.sin(TAU * (gust - 0.2)));
    uniforms.uTongueSide.value = w * 0.4 * Math.sin(Math.PI * gust + 0.6);
    uniforms.uTailSway.value = w * 0.35 * Math.sin(TAU * (gust - 0.25));
    // the mouth opens for the tongue (panting: a little in and out with each breath),
    // wider as it runs, and wide for the bark
    const pantJaw = 0.2 + 0.04 * Math.sin(t * 9) * (reducedMotion ? 0 : 1);
    uniforms.uJaw.value = uniforms.uTongue.value * (pantJaw + 0.1 * w) + uniforms.uBark.value * 0.18;
    const barkT = L ? (T - L.barkAt) / 0.38 : -1;
    uniforms.uBark.value = barkT > 0 && barkT < 1 ? Math.sin(barkT * Math.PI) : 0;
    if (L && T >= L.barkAt && !barked.current) {
      barked.current = true;
      sound.bark();
    }
    if (trick.current) trick.current.position.z = uniforms.uBark.value * 0.03 * (reducedMotion ? 0 : 1);
    if (headFlesh.current) headFlesh.current.rotation.x = -uniforms.uBark.value * 0.28;
    if (faceFlesh.current) faceFlesh.current.visible = uniforms.uJaw.value < 0.02;
    uniforms.uAwake.value = awakeP.current;
    uniforms.uMotion.value = reducedMotion ? 0.15 : 1;
    uniforms.uShown.value = shown.current;
    if (group.current) group.current.visible = shown.current > 0.01;
    // the body only exists once the light has gathered into it
    // (and only while it sits: running, it is light alone)
    if (body.current) body.current.visible = awakeP.current > 0.85 && shown.current > 0.5 && runW < 0.01;
    // on its feet, the flesh follows the skeleton and the path
    const standing = runW > 0.97 && shown.current > 0.5;
    if (runBody.current) runBody.current.visible = standing;
    if (standing)
      boneGroups.current.forEach((g, b) => {
        if (!g) return;
        g.matrix.multiplyMatrices(uniforms.uPath.value, uniforms.uBones.value[b]);
        g.matrixWorldNeedsUpdate = true;
      });
    // the waving arm's hidden body follows the same wave as its light (see the shader)
    if (arm.current) {
      const t = state.clock.elapsedTime;
      const wave = Math.sin(t * 5.5) * THREE.MathUtils.smoothstep(Math.sin(t * 0.9), -0.2, 0.4);
      const down = uniforms.uArmDown.value;
      arm.current.rotation.z = wave * 0.32 * uniforms.uMotion.value * (1 - down) - down * ARM_DOWN_ANGLE;
      arm.current.position.set(SHOULDER[0] + ARM_DOWN_SHIFT[0] * down, SHOULDER[1] + ARM_DOWN_SHIFT[1] * down, SHOULDER[2]);
      // (its hidden body doesn't fold at the wrist — once the paw is down it steps aside)
      arm.current.visible = down < 0.3;
    }
  });

  const mesh = (o: { position: V3; scale: V3; rot?: [number, number] }, i: number, origin: V3 = [0, 0, 0]) => (
    <mesh
      key={i}
      geometry={sphere}
      material={occluder}
      position={[o.position[0] - origin[0], o.position[1] - origin[1], o.position[2] - origin[2]]}
      scale={o.scale}
      rotation={o.rot ? new THREE.Euler(0, o.rot[0], o.rot[1], 'YZX') : undefined}
      renderOrder={-2}
    />
  );

  return (
    <group ref={group} position={position} rotation-y={facing} scale={scale}>
      <group ref={trick}>
        <group ref={body} visible={false}>
          {flesh.filter((o) => o.group === 0 && o.part !== 'head').map((o, i) => mesh(o, i))}
          {/* the head's hidden body turns with the head when it throws it up to bark (same
              pivot and angle as the shader) — left behind, it swallowed the face into black */}
          <group ref={headFlesh} position={HEAD_PIVOT}>
            {flesh.filter((o) => o.group === 0 && o.part === 'head' && !isFace(o)).map((o, i) => mesh(o, i, HEAD_PIVOT))}
            {/* muzzle and cheeks: the lower jaw swings through them when the mouth opens */}
            <group ref={faceFlesh}>{flesh.filter((o) => o.group === 0 && o.part === 'head' && isFace(o)).map((o, i) => mesh(o, i, HEAD_PIVOT))}</group>
          </group>
          <group ref={arm} position={SHOULDER}>
            {flesh.filter((o) => o.group === 2).map((o, i) => mesh(o, i, SHOULDER))}
          </group>
        </group>
        <group ref={runBody} visible={false}>
          {Array.from({ length: BONE_COUNT }, (_, b) => (
            <group
              key={b}
              ref={(g) => {
                boneGroups.current[b] = g;
              }}
              matrixAutoUpdate={false}
            >
              {runFlesh.filter((o) => o.bone === b).map((o, i) => mesh(o, i))}
            </group>
          ))}
        </group>
        <points geometry={points} material={material} frustumCulled={false} renderOrder={-1} />
        {/* an invisible shape round the whole puppy, so a touch anywhere on it counts */}
        <mesh
          position={[0, 0.25, 0]}
          scale={[0.5, 0.72, 0.45]}
          material={hitMaterial}
          visible={canTap}
          userData={{ dogHit: true }}
          onClick={play}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      </group>
    </group>
  );
}
