import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { hoverLight, roomLights } from './sceneStore';

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
    ease(ambient.current, m.ambient);
    ease(key.current, m.key);
    ease(fill.current, m.fill);
    ease(rimA.current, m.rimA);
    ease(rimB.current, m.rimB);
    ease(top.current, m.top);
    scene.environmentIntensity += (m.env - scene.environmentIntensity) * k;

    // the room re-aims two of the lights at its story (no lights are added or removed)
    const kp = 1 - Math.exp(-Math.min(dt, 0.05) * 2);
    if (rimB.current) {
      const heart = mood === 'room' ? roomLights.heart : null;
      rimB.current.position.lerp(heart ?? RIM_B_HOME, kp);
      rimB.current.color.lerp(heart ? HEART_PINK : RIM_B_COLOR, kp);
      rimB.current.distance += ((heart ? 7 : 14) - rimB.current.distance) * kp;
    }
    if (top.current) {
      const ch = mood === 'room' ? roomLights.character : null;
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
