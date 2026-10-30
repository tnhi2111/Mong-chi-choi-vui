import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { finaleLights, hoverLight, roomLights } from './sceneStore';

export type Mood = 'intro' | 'room' | 'final';

/**
 * Each scene has its own light, and the rig glides between them:
 *  intro — dark and mysterious: one warm key, a strong rose rim, almost no fill
 *  room  — warmer and cosier: more fill and environment, a soft top light
 *  final — the brightest: open, glowing, celebratory
 */
const MOODS: Record<Mood, { ambient: number; key: number; fill: number; rimA: number; rimB: number; env: number; top: number }> = {
  intro: { ambient: 0.05, key: 2.1, fill: 0.12, rimA: 26, rimB: 14, env: 0.55, top: 0 },
  // (in the room, rimB becomes the heart's own pink light and the top spot the puppy's key)
  room: { ambient: 0.13, key: 1.35, fill: 0.38, rimA: 12, rimB: 9, env: 0.7, top: 22 },
  final: { ambient: 0.22, key: 2.2, fill: 0.55, rimA: 22, rimB: 18, env: 1.0, top: 10 },
};

const RIM_B_HOME = new THREE.Vector3(3.4, 1.1, -3.6);
const RIM_B_COLOR = new THREE.Color('#ffb08f');
const HEART_PINK = new THREE.Color('#ff4f86');
const TOP_HOME = new THREE.Vector3(0, 7, 1.5);
const TOP_TARGET_HOME = new THREE.Vector3(0, -1, 0);
const TOP_COLOR = new THREE.Color('#ffe2d6');
/** the puppy's key: from above, a little in front and to the left, like a lamp */
const KEY_OFFSET = new THREE.Vector3(-1.2, 4.2, 1.6);
const KEY_GOLD = new THREE.Color('#ffd49a');
const tmpV = new THREE.Vector3();

/**
 * Studio-like reflections without downloading an HDR: a few soft light panels
 * rendered once into an environment map, plus real key / fill / rim lights.
 */
export function Lights({ mood = 'intro', cursorLight = false }: { mood?: Mood; cursorLight?: boolean }) {
  const scene = useThree((s) => s.scene);
  const ambient = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rimA = useRef<THREE.PointLight>(null);
  const rimB = useRef<THREE.PointLight>(null);
  const top = useRef<THREE.SpotLight>(null);
  const topTarget = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const m = MOODS[mood];
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 1.6);
    const ease = (o: { intensity: number } | null, v: number) => {
      if (o) o.intensity += (v - o.intensity) * k;
    };
    // the finale's surprise: the world grows quiet around the last gift, which gets a warm key
    const hush = mood === 'final' ? finaleLights.hush : 0;
    const gift = mood === 'final' ? finaleLights.gift : null;
    ease(ambient.current, m.ambient * (1 - hush * 0.35));
    ease(key.current, m.key * (1 - hush * 0.45));
    ease(fill.current, m.fill * (1 - hush * 0.3));
    ease(rimA.current, m.rimA * (1 - hush * 0.6));
    ease(rimB.current, m.rimB * (1 - hush * 0.4));
    ease(top.current, gift ? 17 : m.top);
    scene.environmentIntensity += (m.env * (1 - hush * 0.3) - scene.environmentIntensity) * k;

    // the room re-aims two of the lights at its story (no lights are added or removed)
    const kp = 1 - Math.exp(-Math.min(dt, 0.05) * 2);
    if (rimB.current) {
      const heart = mood === 'room' ? roomLights.heart : null;
      rimB.current.position.lerp(heart ?? RIM_B_HOME, kp);
      rimB.current.color.lerp(heart ? HEART_PINK : RIM_B_COLOR, kp);
      rimB.current.distance += ((heart ? 7 : 14) - rimB.current.distance) * kp;
    }
    if (top.current) {
      const ch = mood === 'room' ? roomLights.character : gift;
      if (ch) {
        top.current.position.lerp(tmpV.copy(ch).add(KEY_OFFSET), kp);
        topTarget.position.lerp(ch, kp);
      } else {
        top.current.position.lerp(TOP_HOME, kp);
        topTarget.position.lerp(TOP_TARGET_HOME, kp);
      }
      top.current.angle += ((ch ? 0.32 : 0.75) - top.current.angle) * kp;
      top.current.color.lerp(ch ? KEY_GOLD : TOP_COLOR, kp);
      topTarget.updateMatrixWorld();
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.05} color="#ffe6ea" />
      {/* key: warm, from above-left-front, like a lamp beside her */}
      <directionalLight ref={key} position={[-3, 4.5, 5]} intensity={2} color="#fff0e6" />
      {/* fill: cool and faint from the other side, keeps shadows from going dead */}
      <directionalLight ref={fill} position={[4, -1, 3]} intensity={0.1} color="#e9d9ff" />
      {/* rims: rose light from behind that draws the silhouette */}
      <pointLight ref={rimA} position={[-3.2, 1.6, -3]} intensity={24} distance={14} decay={2} color="#ff5f86" />
      <pointLight ref={rimB} position={[3.4, 1.1, -3.6]} intensity={12} distance={14} decay={2} color="#ffb08f" />
      <primitive object={topTarget} position={[0, -1, 0]} />
      <spotLight ref={top} position={[0, 7, 1.5]} angle={0.75} penumbra={1} intensity={0} distance={18} decay={1.6} color="#ffe2d6" target={topTarget} />
      {cursorLight && <CursorLight />}
      <HoverLight />
      <RoomEnvironment active={mood === 'room'} />
      <Environment resolution={128} frames={1}>
        {/* a big soft window up-left and a crisp vertical strip on the right: product-shot reflections */}
        <Lightformer form="rect" intensity={1.4} color="#fff1ea" position={[-2.5, 3, 4]} scale={[6, 2.4, 1]} />
        <Lightformer form="rect" intensity={1.8} color="#fff6f2" position={[3.2, 0.5, 3.5]} rotation-y={-0.6} scale={[0.5, 5, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#ff9fb6" position={[-5, 0, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#f4d0b8" position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={1.1} color="#ffffff" position={[1.5, 2.5, 5]} scale={0.8} />
        <Lightformer form="rect" intensity={0.35} color="#ff6f8c" position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[8, 8, 1]} />
      </Environment>
    </>
  );
}

/** One warm light that glides to whatever she is hovering — a real rim light, not a scale-up. */
function HoverLight() {
  const light = useRef<THREE.PointLight>(null);
  const pos = useRef(new THREE.Vector3(0, 2, 0));
  useFrame((_, rawDt) => {
    const l = light.current;
    if (!l) return;
    const dt = Math.min(rawDt, 0.05);
    const target = hoverLight.target;
    if (target) pos.current.lerp(target, 1 - Math.exp(-dt * 7));
    l.position.copy(pos.current);
    l.intensity += ((target ? 7 : 0) - l.intensity) * (1 - Math.exp(-dt * 5));
  });
  return <pointLight ref={light} intensity={0} distance={3.2} decay={2} color="#ffd6c9" />;
}

const ndc = new THREE.Vector3();
const dir = new THREE.Vector3();

/**
 * A small warm light that follows the pointer a little in front of the scene —
 * highlights really slide across glossy surfaces as she moves the mouse.
 * Smoothed with inertia; fades out when the pointer leaves or goes still for long.
 */
function CursorLight() {
  const light = useRef<THREE.PointLight>(null);
  const camera = useThree((s) => s.camera);
  const pos = useRef(new THREE.Vector3(0, 0, 3));
  const last = useRef({ x: 0, y: 0, moved: -10 });

  useFrame((state, rawDt) => {
    const l = light.current;
    if (!l) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const p = state.pointer;
    if (p.x !== last.current.x || p.y !== last.current.y) {
      last.current = { x: p.x, y: p.y, moved: t };
    }
    // a point on the ray under the pointer, ~4.5 units in front of the camera
    ndc.set(p.x, p.y, 0.5).unproject(camera);
    dir.copy(ndc).sub(camera.position).normalize();
    const target = dir.multiplyScalar(4.5).add(camera.position);
    pos.current.lerp(target, 1 - Math.exp(-dt * 5));
    l.position.copy(pos.current);
    const awake = t - last.current.moved < 6 ? 1 : 0.35;
    l.intensity += (5 * awake - l.intensity) * (1 - Math.exp(-dt * 2));
  });

  return <pointLight ref={light} intensity={0} distance={7} decay={2} color="#ffd9df" />;
}

/**
 * What the room's lacquer, brass and glass reflect (storyboard E3): not a studio far away but
 * the room itself — a dark box with small bright "cards" exactly where its lights are: the
 * table and floor lamps and the sconces (warm discs), a ring of candle points low down, the
 * arched window (a cool panel with its glazing cross), the sign's champagne band, and the
 * floor's wine. Built once, a few seconds after the page starts (no hitch on the way in),
 * at the same resolution as the default environment so swapping it in recompiles nothing.
 */
function buildRoomEnv(gl: THREE.WebGLRenderer): THREE.Texture {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#0b0608');
  const card = (color: string, k: number, w: number, h: number, at: THREE.Vector3, round = false) => {
    const m = new THREE.Mesh(round ? new THREE.CircleGeometry(w, 20) : new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(at);
    m.lookAt(0, at.y * 0.4, 0);
    sc.add(m);
  };
  const R = 6.6;
  const on = (a: number, r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r);
  // lamps round the walls (angles as in RoomProps' LAYOUT), warm, at shade height
  for (const [a, y, k] of [[-0.93, 0.0, 2.6], [1.43, 0.8, 2.4], [0.445, 1.2, 1.6], [-0.445, 1.2, 1.6], [2.05, 0.1, 1.8], [2.7, 0.2, 1.5], [-2.02, 0.2, 1.4]] as const)
    card('#ffc98e', k, 0.35, 0.35, on(a, R - 0.8, y), true);
  // candle clusters: a low ring of tiny points
  for (let i = 0; i < 10; i++) card('#ffb067', 2.2, 0.06, 0.06, on((i / 10) * Math.PI * 2 + 0.3, 3.7, -0.75), true);
  // the window: a cool tall panel, darker cross
  card('#5a6bb8', 1.1, 1.9, 2.0, on(-0.78, R, 0.9));
  card('#0b0608', 1, 0.05, 2.0, on(-0.78, R - 0.02, 0.9));
  // the sign's band of light, at the back
  card('#f3d3a2', 1.3, 3.2, 0.5, on(0, R - 0.3, 1.3));
  // the floor: wine, faint
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3b1420').multiplyScalar(0.8) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  sc.add(floor);
  const pmrem = new THREE.PMREMGenerator(gl);
  const rt = pmrem.fromScene(sc, 0.02, 0.1, 40, { size: 128 });
  pmrem.dispose();
  sc.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}

function RoomEnvironment({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const env = useRef<THREE.Texture | null>(null);
  const saved = useRef<THREE.Texture | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        env.current = buildRoomEnv(gl);
      } catch {
        /* the default studio stays — nothing lost */
      }
    }, 2500);
    return () => clearTimeout(id);
  }, [gl]);
  useFrame(() => {
    const e = env.current;
    if (!e) return;
    if (active && scene.environment !== e && scene.environment) {
      saved.current = scene.environment;
      scene.environment = e;
    } else if (!active && scene.environment === e && saved.current) {
      scene.environment = saved.current;
    }
  });
  return null;
}
