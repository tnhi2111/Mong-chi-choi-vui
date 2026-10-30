import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { motion } from '../../config/motion';

/**
 * The room is built out of the light she has just flown through (storyboard B, 2.0–3.6 s).
 *
 * When the room has compiled, every mesh in it is sampled for points on its real surfaces.
 * Those points start gathered at the middle (where the heart became the orb) and fly out to
 * the places they belong, **in the order a builder would use**: the floor and the rug first,
 * then the wall and the window, then what stands on them, then what hangs. The room itself
 * is held invisible until the light has drawn it; then it takes over and the light fades.
 *
 * Only two draws: one points cloud, one program. The sampling reads the vertex buffers that
 * are already in memory — no extra geometry is built.
 */

export interface BuildPoints {
  /** Where each mote lands (world space). */
  target: Float32Array;
  /** 0..1 — the order it lands in (floor first). */
  delay: Float32Array;
  seed: Float32Array;
  /** Storyboard D: the light lands where the light sprite's tour passes, not floor-first. */
  sweep?: boolean;
}

/** The tour's clock (s): when the sprite's sweep passes angle `a` (atan(x, -z)) at radius r. */
function sweepTime(a: number, r: number) {
  const R = motion.sprite.room;
  if (r < 2.2) return R.tour + R.rise * 0.55; // the stage, last, as it rises into the orb
  // (the tour sweeps from the front-left round the back to the front-right, ≈ 2.4 rad)
  if (a <= 2.4) return ((a + Math.PI) / (Math.PI + 2.4)) * R.tour;
  return R.tour + ((a - 2.4) / (Math.PI - 2.4)) * R.rise * 0.8;
}
/** How long one mote takes to fly onto its surface in the sweep (s). */
const SWEEP_FLY = 1.0;

/**
 * Samples the room's own meshes. `limit` keeps it cheap: the biggest meshes give the most
 * points, and every mesh gives at least a few, so nothing in the room is missing from the
 * drawing.
 */
export function sampleRoom(root: THREE.Object3D, limit = 15000, sweep = false): BuildPoints | null {
  const parts: { mesh: THREE.Mesh; tris: number; weight: number }[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const attr = m.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!m.isMesh || !attr) return;
    const tris = (m.geometry.index ? m.geometry.index.count : attr.count) / 3;
    if (tris < 1) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const size = Math.max(0.25, m.geometry.boundingSphere?.radius ?? 1);
    // Light should fall on a whole surface, not on whatever is finely tessellated: weight
    // a mesh by how BIG it is as much as by how detailed (a wall has four corners and a
    // puppy has twenty thousand).
    parts.push({ mesh: m, tris, weight: Math.sqrt(tris) * size });
  });
  if (!parts.length) return null;
  const sum = parts.reduce((n, p) => n + p.weight, 0);

  const pos: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const { mesh, tris, weight } of parts) {
    const share = THREE.MathUtils.clamp(Math.round((weight / sum) * limit), 8, 700);
    const attr = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const index = mesh.geometry.index;
    for (let i = 0; i < share; i++) {
      // a random triangle, and a random point ON it (barycentric) — so a big flat surface
      // is covered as evenly as a detailed one
      const t = (Math.random() * tris) | 0;
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      let u = Math.random();
      let v = Math.random();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      a.fromBufferAttribute(attr, i0);
      b.fromBufferAttribute(attr, i1).sub(a);
      c.fromBufferAttribute(attr, i2).sub(a);
      a.addScaledVector(b, u).addScaledVector(c, v).applyMatrix4(mesh.matrixWorld);
      // the room is a dolls' house: nothing far outside it belongs in the drawing
      if (!Number.isFinite(a.x) || a.lengthSq() > 400) continue;
      pos.push(a.x, a.y, a.z);
    }
  }
  const n = pos.length / 3;
  if (n < 32) return null;

  const target = new Float32Array(pos);
  const delay = new Float32Array(n);
  const seed = new Float32Array(n);
  // the order: low things first (floor, rug, stage), then upright things, then what hangs —
  // with a little noise so it is a scatter of light settling, not a sweep
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = target[i * 3 + 1];
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(0.001, hi - lo);
  const total = motion.sprite.room.tour + motion.sprite.room.rise;
  const fly = SWEEP_FLY / total;
  for (let i = 0; i < n; i++) {
    const y = (target[i * 3 + 1] - lo) / span;
    const r = Math.hypot(target[i * 3], target[i * 3 + 2]);
    seed[i] = Math.random();
    if (sweep) {
      // it lands a little after the leader has gone by (the shader's flight is `fly` long)
      const at = sweepTime(Math.atan2(target[i * 3], -target[i * 3 + 2]), r) - SWEEP_FLY * 0.55 + Math.random() * 0.25;
      delay[i] = THREE.MathUtils.clamp(at / total / (1 - fly), 0, 1);
    } else delay[i] = THREE.MathUtils.clamp(y * 0.46 + Math.min(1, r / 9) * 0.18 + Math.random() * 0.14, 0, 1);
  }
  return { target, delay, seed, sweep };
}

const vertex = /* glsl */ `
  uniform float uT;
  uniform float uFly;
  uniform float uSweep;
  uniform float uFade;
  uniform float uPixelRatio;
  uniform vec3 uFrom;
  attribute float aDelay;
  attribute float aSeed;
  varying float vAlpha;
  varying float vHot;

  void main() {
    // each mote waits its turn, then flies out and slows into its place
    float e = clamp((uT - aDelay * (1.0 - uFly)) / uFly, 0.0, 1.0);
    e = 1.0 - pow(1.0 - e, 3.0);
    // it starts gathered at the middle, a little off the axis so the swarm has body — or, in
    // the sprite's sweep, out of the path the leader flew (inside the room, at its height)
    vec3 from = uFrom + normalize(position - uFrom + 1e-4) * (0.25 + aSeed * 0.5);
    from = mix(from, vec3(position.x * 0.74, 1.1 + aSeed * 0.4, position.z * 0.74), uSweep);
    vec3 p = mix(from, position, e);
    // a breath of drift while it travels, gone by the time it lands
    p += vec3(sin(uT * 3.1 + aSeed * 30.0), cos(uT * 2.7 + aSeed * 18.0), sin(uT * 2.3 + aSeed * 11.0)) * 0.09 * (1.0 - e);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (1.35 + 1.8 * (1.0 - e)) * (1.0 + aSeed * 0.7);
    gl_PointSize = clamp(size * uPixelRatio * (5.6 / -mv.z), 1.0, 14.0 * uPixelRatio);

    // bright while it flies, quiet once it has landed — then the room's own light takes over
    float arrive = smoothstep(0.0, 0.25, e) * (1.0 - 0.45 * smoothstep(0.75, 1.0, e));
    // and never a blast in her face: motes close to the lens fade out
    float camNear = smoothstep(0.7, 2.4, -mv.z);
    vAlpha = arrive * (1.0 - uFade) * camNear * 0.9;
    vHot = (1.0 - e) * 0.7 + 0.3;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.42, 0.0, d);
    float halo = smoothstep(0.5, 0.15, d) * 0.5;
    vec3 warm = mix(vec3(0.96, 0.78, 0.62), vec3(1.0, 0.94, 0.88), vHot);
    gl_FragColor = vec4(warm * (0.75 + 0.5 * vHot), (core + halo) * vAlpha);
  }
`;

interface Props {
  points: BuildPoints | null;
  /** Where the light gathers before it flies out (the orb). */
  from: [number, number, number];
  /** The room's surfaces have been drawn: the room itself can take over now. */
  onDrawn: () => void;
  reducedMotion?: boolean;
}

export function RoomBuild({ points, from, onDrawn, reducedMotion = false }: Props) {
  const geometry = useMemo(() => {
    if (!points) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points.target, 3));
    g.setAttribute('aDelay', new THREE.BufferAttribute(points.delay, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(points.seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 30);
    return g;
  }, [points]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uT: { value: 0 },
      uFly: { value: 0.48 },
      uSweep: { value: 0 },
      uFade: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uFrom: { value: new THREE.Vector3(...from) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const material = useShader(vertex, fragment, uniforms);
  const told = useRef(false);
  const t = useRef(0);
  // the camera starts inside the orb and needs a moment to pull back far enough to SEE
  // the room; the light lands as it retreats, not before
  const wait = useRef(reducedMotion ? 0 : 0.3);

  useEffect(() => {
    uniforms.uFrom.value.set(...from);
  }, [from, uniforms]);

  // new points = a new drawing: start the clock again (otherwise a second arming would
  // never hand the room over, and the room would never be shown)
  useEffect(() => {
    told.current = false;
    t.current = 0;
    wait.current = reducedMotion || points?.sweep ? 0 : 0.3;
    uniforms.uFade.value = 0;
    uniforms.uT.value = 0;
  }, [points, reducedMotion, uniforms]);

  useFrame((_, rawDt) => {
    if (!geometry) return;
    const dt = Math.min(rawDt, 0.05);
    const L = motion.enterRoom;
    // a short wait first: the dark is still opening right after the flight, and the light
    // should land where she can see it
    wait.current = Math.max(0, wait.current - dt);
    if (wait.current > 0) return;
    const sweep = !!points?.sweep;
    const total = motion.sprite.room.tour + motion.sprite.room.rise;
    uniforms.uSweep.value = sweep ? 1 : 0;
    uniforms.uFly.value = sweep ? SWEEP_FLY / total : 0.48;
    t.current += dt / (reducedMotion ? 0.3 : sweep ? total : L.land);
    uniforms.uT.value = t.current;
    if (sweep) {
      // the room is already there (dim where the leader has not been); the light only lands
      // on it, and lets go once the tour is home
      if (t.current > 1.02) uniforms.uFade.value = Math.min(1, uniforms.uFade.value + dt / 0.8);
      return;
    }
    // the room takes over while the light that drew it is still at full strength (no gap
    // between the two: the motes hide the moment the surfaces arrive)…
    if (!told.current && t.current > (reducedMotion ? 0.5 : 0.34)) {
      told.current = true;
      onDrawn();
    }
    // …and only then does that light fade off the surfaces it drew
    // the last motes go on landing over the room that has just arrived, then let go
    if (told.current) uniforms.uFade.value = Math.min(1, uniforms.uFade.value + dt / 0.95);
  });

  if (!geometry) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={40} />;
}
