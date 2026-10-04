import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { getHeartGeometry } from './heartShape';

/*
 * The room someone lives in: the furniture and belongings that make the birthday room
 * a real person's room, prepared for someone they love.
 *
 *   • under the window: a window seat with a linen cushion, two throw cushions (one
 *     knocked a little askew), a knitted blanket folded over its end, an open book left
 *     face-down, and a potted plant on the floor beside it; linen curtains either side
 *   • against the wall on the right: a walnut console with a warm table lamp (the room's
 *     second light), a stack of books not quite square, a notebook with a pen, a cup of
 *     tea gone cold, two small framed photographs, a little memory box with its lid ajar
 *     and a bud vase of flowers
 *
 * Everything (but the photographs and curtains) is ONE merged mesh with a small shader
 * that fakes the room's light on it — the lamp, the candles, the heart, the moon — with
 * per-material response (walnut grain, soft fabric sheen, glazed ceramic, paper, muted
 * champagne metal) and contact darkening where things meet. Nothing here adds a light or
 * a shadow map: it stays cheap, and it is compiled with the rest of the set.
 */

export type Kind = 0 | 1 | 2 | 3 | 4 | 5; // wood, fabric, ceramic, paper, metal, lampshade

/** Where the furniture stands (wall angle, measured like the window: atan(x, -z)). */
export const CONSOLE_ANGLE = 0.74;
const CONSOLE_R = 8.6;
const SEAT_R = 8.55;

/** A frame on the wall at angle `a` and radius `r`, facing the middle of the room. */
function wallFrame(a: number, r: number, floorY: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(-a);
  m.setPosition(Math.sin(a) * r, floorY, -Math.cos(a) * r);
  return m;
}

/** The lamp's bulb, in the world (the warm light the room's shaders add). */
export function lampPosition(floorY: number): THREE.Vector3 {
  return new THREE.Vector3(-0.6, 1.36, 0.0).applyMatrix4(wallFrame(CONSOLE_ANGLE, CONSOLE_R, floorY));
}

/** The candle in the lantern on the window seat (a small, flickering second light). */
export function lanternPosition(floorY: number, windowAngle: number): THREE.Vector3 {
  return new THREE.Vector3(-0.98, 0.6, 0.06).applyMatrix4(wallFrame(windowAngle, SEAT_R, floorY));
}

/** Contact shadows the floor draws under the furniture: [x, z, along-wall angle, half length]. */
export function furnitureBlobs(windowAngle: number): THREE.Vector4[] {
  const at = (a: number, r: number, half: number) => new THREE.Vector4(Math.sin(a) * r, -Math.cos(a) * r, a, half);
  return [at(CONSOLE_ANGLE, CONSOLE_R + 0.05, 0.95), at(windowAngle, SEAT_R + 0.05, 1.05)];
}

class Builder {
  parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation, kind: Kind) {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    if (geo.index) geo.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'aColor', 'aKind'].includes(name)) g.deleteAttribute(name);
    this.parts.push(g);
  }
  merge(): THREE.BufferGeometry {
    const names = ['position', 'normal', 'aColor', 'aKind'];
    const total = this.parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const size = this.parts[0].attributes[name].itemSize;
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const g of this.parts) {
        arr.set(g.attributes[name].array as Float32Array, o);
        o += g.attributes[name].count * size;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.parts.forEach((g) => g.dispose());
    return out;
  }
}

/** local placement inside a furniture frame */
function at(frame: THREE.Matrix4, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(...s));
  return frame.clone().multiply(m);
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** a soft, rounded block (cushions, the seat pad): a squashed sphere-ish box */
function pillow(w: number, h: number, d: number) {
  const g = new THREE.SphereGeometry(1, 20, 12);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // superellipsoid-like: flatter faces, soft edges
    const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
    p.setXYZ(i, f(x) * w * 0.5, f(y) * h * 0.5, f(z) * d * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

function buildProps(floorY: number, windowAngle: number, wallR: number) {
  const b = new Builder();
  const walnut = '#4a2c1c';
  const walnutLight = '#5c3826';
  const champagne = '#c9a46e';

  // ── the console with its belongings ─────────────────────────────────────
  const C = wallFrame(CONSOLE_ANGLE, CONSOLE_R, floorY);
  for (const [x, z] of [
    [-0.88, -0.17],
    [0.88, -0.17],
    [-0.88, 0.17],
    [0.88, 0.17],
  ])
    b.add(box(0.05, 0.12, 0.05), at(C, x, 0.06, z), walnut, 0);
  b.add(box(1.86, 0.74, 0.42), at(C, 0, 0.49, 0), walnut, 0);
  b.add(box(1.96, 0.035, 0.5), at(C, 0, 0.88, 0.01), walnutLight, 0);
  for (const x of [-0.46, 0.46]) {
    b.add(box(0.86, 0.6, 0.012), at(C, x, 0.49, 0.215), walnutLight, 0); // drawer fronts
    b.add(new THREE.SphereGeometry(0.018, 10, 8), at(C, x, 0.52, 0.235), champagne, 4); // knobs
  }
  const top = 0.9;
  // the lamp: a glazed ceramic belly, a slim neck, a pleated linen shade lit from within
  b.add(new THREE.SphereGeometry(0.115, 20, 14), at(C, -0.6, top + 0.12, -0.02, 0, 0, 0, [1, 1.05, 1]), '#d8b9a4', 2);
  b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 20), at(C, -0.6, top + 0.02, -0.02), '#d8b9a4', 2);
  b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), at(C, -0.6, top + 0.3, -0.02), champagne, 4);
  b.add(new THREE.CylinderGeometry(0.13, 0.22, 0.24, 28, 1, true), at(C, -0.6, top + 0.48, -0.02), '#f1dcc0', 5);
  // books: not quite square, the top one turned
  const books: [number, string, number][] = [
    [0.045, '#3f4a40', 0.04],
    [0.05, '#6a2633', -0.07],
    [0.038, '#cdbba0', 0.16],
  ];
  let by = top;
  books.forEach(([h, col, ry]) => {
    b.add(box(0.31, h, 0.22), at(C, -0.16, by + h / 2, -0.04, ry), col, 3);
    // the pages' edge, lighter
    b.add(box(0.29, h * 0.78, 0.004), at(C, -0.16, by + h / 2, -0.04, ry).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.11)), '#e9dcc4', 3);
    by += h;
  });
  // a notebook with a pen, half under the first book
  b.add(box(0.2, 0.012, 0.26), at(C, 0.06, top + 0.006, 0.05, 0.42), '#8a5a52', 3);
  b.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.15, 8), at(C, 0.1, top + 0.019, 0.08, 0.9, 0, Math.PI / 2), champagne, 4);
  // a cup of tea gone cold, its handle turned away a little
  b.add(new THREE.CylinderGeometry(0.042, 0.036, 0.085, 24, 1, true), at(C, 0.24, top + 0.043, 0.13), '#efe4d6', 2);
  b.add(new THREE.CircleGeometry(0.04, 20), at(C, 0.24, top + 0.07, 0.13, 0, -Math.PI / 2), '#7a4a2c', 2); // the tea
  b.add(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 20), at(C, 0.24, top + 0.002, 0.13), '#efe4d6', 2);
  b.add(new THREE.TorusGeometry(0.022, 0.006, 6, 14), at(C, 0.285, top + 0.045, 0.13, 0.5), '#efe4d6', 2);
  // the photo frames' wooden and gilt borders (the pictures themselves are drawn apart)
  for (const f of PHOTOS) {
    const m = at(C, f.x, top + f.h / 2 + 0.005, f.z, f.ry, -0.12);
    const t = 0.022;
    const col = f.gilt ? champagne : walnutLight;
    const kind: Kind = f.gilt ? 4 : 0;
    b.add(box(f.w + t * 2, t, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, f.h / 2 + t / 2, 0)), col, kind);
    b.add(box(f.w + t * 2, t, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -f.h / 2 - t / 2, 0)), col, kind);
    b.add(box(t, f.h, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(f.w / 2 + t / 2, 0, 0)), col, kind);
    b.add(box(t, f.h, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(-f.w / 2 - t / 2, 0, 0)), col, kind);
    b.add(box(f.w, f.h, 0.008), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.008)), '#3a2418', 0); // backing
  }
  // a little memory box in blush velvet, its lid left ajar
  b.add(box(0.15, 0.07, 0.11), at(C, 0.62, top + 0.035, 0.12, -0.3), '#b97a80', 1);
  b.add(box(0.155, 0.02, 0.115), at(C, 0.62, top + 0.08, 0.08, -0.3, -0.35), '#b97a80', 1);
  b.add(getHeartGeometry('low').clone(), at(C, 0.62, top + 0.093, 0.105, -0.3, -0.35 - Math.PI / 2, 0, [0.022, 0.022, 0.006]), champagne, 4);
  // a bud vase with three stems
  b.add(new THREE.CylinderGeometry(0.028, 0.045, 0.16, 18), at(C, 0.86, top + 0.08, -0.06), '#c9b4c0', 2);
  [
    [-0.03, 0.3, 0.15, '#f0e2d4'],
    [0.025, 0.26, -0.2, '#d99aa0'],
    [0.0, 0.34, 0.05, '#b4505f'],
  ].forEach(([dx, h, lean, col]) => {
    const x = 0.86 + (dx as number);
    b.add(new THREE.CylinderGeometry(0.004, 0.004, h as number, 5), at(C, x, top + 0.08 + (h as number) / 2, -0.06, 0, 0, lean as number), '#5d6b4a', 1);
    const tip = new THREE.Vector3(Math.sin(-(lean as number)) * (h as number), top + 0.08 + Math.cos(lean as number) * (h as number), -0.06);
    b.add(new THREE.IcosahedronGeometry(0.03, 1), at(C, x + tip.x, tip.y, tip.z, 0, 0, 0, [1, 0.8, 1]), col as string, 1);
  });

  // ── the window seat ─────────────────────────────────────────────────────
  const S = wallFrame(windowAngle, SEAT_R, floorY);
  b.add(box(2.1, 0.38, 0.52), at(S, 0, 0.19, 0), walnut, 0);
  b.add(box(2.14, 0.012, 0.012), at(S, 0, 0.37, 0.265), champagne, 4); // a fine edge trim
  b.add(pillow(2.04, 0.11, 0.5), at(S, 0, 0.43, 0.01), '#e3d2bf', 1); // linen seat pad
  b.add(pillow(0.46, 0.4, 0.13), at(S, -0.62, 0.66, -0.12, 0.22, -0.2, 0.12), '#8e4a58', 1); // velvet, dusty rose
  b.add(pillow(0.4, 0.36, 0.12), at(S, -0.22, 0.63, -0.14, -0.15, -0.22, -0.18), '#d9c4b0', 1); // cream, knocked askew
  // the knitted blanket folded over the right end, hanging down the front
  b.add(pillow(0.62, 0.07, 0.5), at(S, 0.7, 0.51, 0.02, 0.06), '#b98c86', 1);
  b.add(box(0.6, 0.34, 0.035), at(S, 0.72, 0.33, 0.285, 0.06, 0.08), '#b98c86', 1);
  // an open book left face-down on the cushion
  b.add(box(0.14, 0.008, 0.2), at(S, 0.18, 0.5, 0.06, 0.4, 0, 0.22), '#efe4d2', 3);
  b.add(box(0.14, 0.008, 0.2), at(S, 0.31, 0.5, 0.06, 0.4, 0, -0.22), '#efe4d2', 3);
  b.add(box(0.27, 0.006, 0.205), at(S, 0.245, 0.528, 0.06, 0.4), '#6a2633', 3);
  // a lantern at the left end of the seat, a candle burning inside
  const lx = -0.98;
  for (const [dx, dz] of [
    [-0.07, -0.07],
    [0.07, -0.07],
    [-0.07, 0.07],
    [0.07, 0.07],
  ])
    b.add(box(0.012, 0.24, 0.012), at(S, lx + dx, 0.6, 0.06 + dz), champagne, 4);
  b.add(box(0.17, 0.02, 0.17), at(S, lx, 0.49, 0.06), champagne, 4);
  b.add(box(0.17, 0.02, 0.17), at(S, lx, 0.72, 0.06), champagne, 4);
  b.add(new THREE.ConeGeometry(0.1, 0.07, 4), at(S, lx, 0.765, 0.06, Math.PI / 4), champagne, 4);
  b.add(new THREE.TorusGeometry(0.025, 0.004, 6, 14), at(S, lx, 0.81, 0.06), champagne, 4);
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14), at(S, lx, 0.535, 0.06), '#efe2cf', 5);
  b.add(new THREE.SphereGeometry(0.014, 8, 6), at(S, lx, 0.59, 0.06, 0, 0, 0, [0.8, 1.6, 0.8]), '#ffd08a', 5);
  // a plant in a glazed pot on the floor beside the seat
  b.add(new THREE.CylinderGeometry(0.17, 0.13, 0.34, 24), at(S, 1.36, 0.17, 0.08), '#cbb9a3', 2);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4;
    const lean = 0.35 + (i % 3) * 0.18;
    const len = 0.32 + (i % 4) * 0.07;
    b.add(new THREE.SphereGeometry(1, 8, 6), at(S, 1.36 + Math.cos(a) * 0.08, 0.36 + len * 0.45, 0.08 + Math.sin(a) * 0.08, a, 0, lean, [0.05, len * 0.5, 0.012]), i % 2 ? '#4f6b45' : '#5f7d4f', 1);
  }
  // the curtain rod, following the curve of the wall above the window
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = windowAngle + ((i / 24 - 0.5) * 3.0) / (wallR - 0.3);
    pts.push(new THREE.Vector3(Math.sin(a) * (wallR - 0.3), floorY + 4.82, -Math.cos(a) * (wallR - 0.3)));
  }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6, false), new THREE.Matrix4(), champagne, 4);
  return b.merge();
}

/** The photographs (in the console's frame): size, place, turn, and which picture. */
const PHOTOS = [
  { x: 0.4, z: -0.06, w: 0.2, h: 0.26, ry: -0.24, gilt: true, pic: 0 },
  { x: 0.72, z: -0.13, w: 0.15, h: 0.19, ry: 0.18, gilt: false, pic: 1 },
];

/** Small, non-identifying pictures: two silhouettes at sunset; two cups on a table. */
function drawPhotos(): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H;
  const g = c.getContext('2d')!;
  // 1 — the sea at sunset, two small figures close together
  let grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#3b3352');
  grd.addColorStop(0.45, '#d98a7a');
  grd.addColorStop(0.62, '#f3c48e');
  grd.addColorStop(0.63, '#7d6070');
  grd.addColorStop(1, '#3b2a33');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255, 226, 170, 0.9)';
  g.beginPath();
  g.arc(W * 0.62, H * 0.6, 26, Math.PI, 0);
  g.fill();
  g.fillStyle = '#2a1c22';
  for (const [x, s] of [
    [0.4, 1],
    [0.47, 0.92],
  ]) {
    g.beginPath();
    g.arc(W * x, H * 0.7, 9 * s, 0, Math.PI * 2);
    g.fill();
    g.fillRect(W * x - 8 * s, H * 0.72, 16 * s, 58 * s);
  }
  // 2 — two cups side by side, from above, on a warm wooden table
  g.fillStyle = '#6b4632';
  g.fillRect(W, 0, W, H);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(40, 20, 10, ${0.08 + (i % 3) * 0.04})`;
    g.fillRect(W, i * 24, W, 2);
  }
  for (const [x, y] of [
    [0.36, 0.45],
    [0.64, 0.55],
  ]) {
    g.fillStyle = '#f2e6d8';
    g.beginPath();
    g.arc(W + W * x, H * y, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a5a3c';
    g.beginPath();
    g.arc(W + W * x, H * y, 32, 0, Math.PI * 2);
    g.fill();
  }
  // a little heart drawn in the foam of one
  g.fillStyle = '#f2e6d8';
  g.beginPath();
  const hx = W + W * 0.64;
  const hy = H * 0.55;
  g.moveTo(hx, hy + 12);
  g.bezierCurveTo(hx - 20, hy - 2, hx - 10, hy - 18, hx, hy - 6);
  g.bezierCurveTo(hx + 10, hy - 18, hx + 20, hy - 2, hx, hy + 12);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const propVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aKind;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = aColor;
    vKind = aKind;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
/** The room's light on a surface (shared by the props, the photos and the curtains). */
export const ROOM_LIGHT = /* glsl */ `
  uniform vec3 uLamp;
  uniform vec3 uLantern;
  uniform vec4 uCandles[12];
  uniform int uCount;
  uniform float uFloorY;
  uniform float uHeart;
  uniform vec3 uMoonDir;
  float flickP(float t, float s) {
    return 0.78 + 0.12 * sin(t * 7.3 + s * 13.0) + 0.07 * sin(t * 13.1 + s * 7.0);
  }
  vec3 roomLight(vec3 P, vec3 n, float t) {
    vec3 light = vec3(0.1, 0.075, 0.085);   // the room's warm ambient
    light += vec3(0.05, 0.035, 0.03) * (0.5 + 0.5 * n.y);
    // the table lamp: a warm, close falloff
    vec3 L = uLamp - P;
    float d2 = dot(L, L);
    light += vec3(1.0, 0.7, 0.42) * (0.25 + 0.75 * max(dot(n, normalize(L)), 0.0)) * 1.15 / (1.0 + d2 * 1.6);
    // the lantern on the window seat
    vec3 Ln = uLantern - P;
    light += vec3(1.0, 0.64, 0.36) * flickP(t + 9.0, 3.7) * (0.3 + 0.7 * max(dot(n, normalize(Ln)), 0.0)) * 0.7 / (1.0 + dot(Ln, Ln) * 3.0);
    // candles
    for (int i = 0; i < 12; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      vec3 f = vec3(c.x, uFloorY + c.w + 0.08, c.y) - P;
      float dd = dot(f, f);
      light += vec3(1.0, 0.62, 0.36) * flickP(t + 20.0, c.z) * max(dot(n, normalize(f)), 0.0) * 0.5 / (1.0 + dd * 2.5);
    }
    // the heart's rose light from the middle of the room
    vec3 H = vec3(0.0, uFloorY + 1.3, 0.0) - P;
    light += vec3(1.0, 0.32, 0.5) * uHeart * max(dot(n, normalize(H)), 0.0) * 0.35 / (1.0 + dot(H, H) * 0.08);
    // the moon through the window: cool, from behind
    light += vec3(0.28, 0.38, 0.75) * max(dot(n, uMoonDir), 0.0) * 0.16;
    // contact: things darken where they meet the floor
    light *= mix(0.55, 1.0, smoothstep(0.0, 0.14, P.y - uFloorY));
    return light;
  }
`;
const propFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  ${ROOM_LIGHT}
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 base = vColor;
    float k = vKind;
    vec3 light = roomLight(vWorld, n, uTime);
    vec3 col;
    if (k > 4.5) {
      // the lampshade: linen glowing from the bulb inside, brighter toward the rims
      float rim = pow(1.0 - abs(dot(n, V)), 2.0);
      // (the lantern's candle and flame share this: small, so they simply glow)
      float up = smoothstep(-0.12, 0.12, vWorld.y - uLamp.y);
      col = base * (0.62 + 0.3 * rim) * mix(1.0, 0.72, up) + vec3(1.0, 0.66, 0.36) * 0.18;
    } else {
      vec3 L = normalize(uLamp - vWorld);
      vec3 Hh = normalize(L + V);
      float spec = 0.0;
      if (k < 0.5) {
        // walnut: grain running along the piece, semi-matte
        float grain = 0.5 + 0.5 * sin((vWorld.x + vWorld.z) * 60.0 + sin(vWorld.y * 30.0) * 2.0);
        base *= 0.86 + 0.18 * grain;
        spec = pow(max(dot(n, Hh), 0.0), 24.0) * 0.18;
      } else if (k < 1.5) {
        // fabric: soft, a fine weave, a velvet-like sheen at grazing angles
        base *= 0.92 + 0.08 * h3(floor(vWorld * 220.0));
        float sheen = pow(1.0 - max(dot(n, V), 0.0), 2.5);
        col = base * light + base * sheen * light * 0.6;
      } else if (k < 2.5) {
        // glazed ceramic: a gentle, slightly broad highlight
        spec = pow(max(dot(n, Hh), 0.0), 40.0) * 0.45;
      } else if (k < 3.5) {
        // paper and book cloth: rough, a hint of fibre
        base *= 0.94 + 0.06 * h3(floor(vWorld * 300.0));
      } else {
        // muted champagne metal, never chrome
        spec = pow(max(dot(n, Hh), 0.0), 30.0) * 0.7;
        base *= 0.7 + 0.3 * pow(1.0 - max(dot(n, V), 0.0), 2.0);
      }
      if (!(k > 0.5 && k < 1.5)) col = base * light + vec3(1.0, 0.78, 0.55) * spec * length(light);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const photoVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const photoFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  ${ROOM_LIGHT}
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 pic = texture2D(uMap, vUv).rgb;
    vec3 col = pic * roomLight(vWorld, n, uTime) * 1.3;
    // the glass: a faint reflection, a soft diagonal sheen
    float f = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    float streak = smoothstep(0.06, 0.0, abs(vUv.x * 0.6 + vUv.y * 0.8 - 0.75 - mod(vUv.x, 0.5) * 0.0)) * 0.12;
    col += vec3(1.0, 0.85, 0.7) * (f * 0.25 + streak);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const curtainVertex = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  attribute float aFree;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vFold;
  void main() {
    vec3 p = position;
    // the curtain breathes in a slow draught from the window, more toward its hem
    float t = uTime * uMotion;
    p.z += sin(t * 0.6 + p.x * 3.0) * 0.02 * aFree + sin(t * 0.23 + p.x * 1.3) * 0.015 * aFree;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vFold = uv.x;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const curtainFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFolds;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vFold;
  ${ROOM_LIGHT}
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    // linen: the folds catch light and fall into shade, moonlight glows through from behind
    float fold = 0.5 + 0.5 * cos(vFold * uFolds * 6.28318);
    vec3 base = vec3(0.72, 0.6, 0.55) * (0.94 + 0.06 * fract(sin(dot(floor(vWorld.xy * 200.0), vec2(12.9, 78.2))) * 43758.5));
    vec3 col = base * roomLight(vWorld, n, uTime) * (0.6 + 0.55 * fold);
    col += vec3(0.25, 0.32, 0.6) * 0.06 * fold;  // moonlight through the cloth
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A linen curtain panel: gathered folds, hanging from a rod, its hem free to move. */
function curtainGeometry(width: number, height: number, folds: number) {
  const g = new THREE.PlaneGeometry(width, height, folds * 8, 16);
  const p = g.attributes.position as THREE.BufferAttribute;
  const free = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = x / width + 0.5;
    const down = 0.5 - y / height; // 0 at the rod, 1 at the hem
    p.setZ(i, Math.sin(u * folds * Math.PI * 2) * (0.045 + down * 0.02));
    free[i] = down * down;
  }
  g.computeVertexNormals();
  g.setAttribute('aFree', new THREE.BufferAttribute(free, 1));
  return g;
}

interface Props {
  floorY: number;
  windowAngle: number;
  wallR: number;
  candleVec: THREE.Vector4[];
  candleCount: number;
  heart: number;
  motion: number;
}

export function RoomProps({ floorY, windowAngle, wallR, candleVec, candleCount, heart, motion }: Props) {
  const geo = useMemo(() => buildProps(floorY, windowAngle, wallR), [floorY, windowAngle, wallR]);
  useEffect(() => () => geo.dispose(), [geo]);

  const light = useMemo(
    () => ({
      uLamp: { value: lampPosition(floorY) },
      uLantern: { value: lanternPosition(floorY, windowAngle) },
      uCandles: { value: candleVec },
      uCount: { value: candleCount },
      uFloorY: { value: floorY },
      uHeart: { value: heart },
      uMoonDir: { value: new THREE.Vector3(Math.sin(windowAngle), 0.35, -Math.cos(windowAngle)).normalize() },
      uTime: { value: 0 },
    }),
    [floorY, windowAngle, candleVec, candleCount], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const propMat = useShader(propVertex, propFragment, light, { opaque: true });

  // photographs
  const photoTex = useMemo(drawPhotos, []);
  useEffect(() => () => photoTex.dispose(), [photoTex]);
  const photoU = useMemo(() => ({ ...light, uMap: { value: photoTex } }), [light, photoTex]);
  const photoMat = useShader(photoVertex, photoFragment, photoU, { opaque: true });
  const photos = useMemo(() => {
    const C = wallFrame(CONSOLE_ANGLE, CONSOLE_R, floorY);
    const parts = PHOTOS.map((f) => {
      const g = new THREE.PlaneGeometry(f.w, f.h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (f.pic + uv.getX(i)) / 2);
      g.applyMatrix4(at(C, f.x, 0.9 + f.h / 2 + 0.005, f.z, f.ry, -0.12).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004)));
      return g;
    });
    const out = mergeSimple(parts);
    return out;
  }, [floorY]);
  useEffect(() => () => photos.dispose(), [photos]);

  // curtains either side of the window, and their rod
  const curtainU = useMemo(() => ({ ...light, uMotion: { value: motion }, uFolds: { value: 6 } }), [light]); // eslint-disable-line react-hooks/exhaustive-deps
  const curtainMat = useShader(curtainVertex, curtainFragment, curtainU, { opaque: true, side: THREE.DoubleSide });
  const curtain = useMemo(() => curtainGeometry(0.75, 4.75, 6), []);
  useEffect(() => () => curtain.dispose(), [curtain]);
  useFrame((state) => {
    light.uTime.value = state.clock.elapsedTime;
    light.uHeart.value += (heart - light.uHeart.value) * 0.05;
    curtainU.uMotion.value = motion;
  });

  const curtainAt = (side: number) => {
    const a = windowAngle + (side * 1.32) / (wallR - 0.25);
    return {
      position: [Math.sin(a) * (wallR - 0.25), floorY + 4.8 - 4.75 / 2, -Math.cos(a) * (wallR - 0.25)] as [number, number, number],
      rotation: [0, -a, 0] as [number, number, number],
    };
  };
  return (
    <group>
      <mesh geometry={geo} material={propMat} />
      <mesh geometry={photos} material={photoMat} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={curtain} material={curtainMat} {...curtainAt(s)} />
      ))}
    </group>
  );
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    if (g.index) g.dispose();
    return f;
  });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = flat[0].attributes[name].itemSize;
    const total = flat.reduce((a, g) => a + g.attributes.position.count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of flat) {
      arr.set(g.attributes[name].array as Float32Array, o);
      o += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  flat.forEach((g) => g.dispose());
  return out;
}
