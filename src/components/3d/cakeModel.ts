import * as THREE from 'three';
import { getHeartGeometry } from './heartShape';

/*
 * The birthday cake, made like a real one (cake-local units; its table top is at y = 0):
 *
 *   • two blush buttercream tiers turned on a lathe — soft rounded edges, a gently domed
 *     top, the sides not quite round (smoothed by hand, a palette knife's faint lines)
 *   • a piped shell border at the foot of each tier, a string of sugar pearls round the
 *     top edge of the lower tier, a raspberry glaze dripping from the upper tier
 *   • rosettes of cream on the lower tier's shoulder, strawberries (not in a perfect
 *     ring), two sugar flowers and a couple of tiny hearts placed by hand
 *   • four slender wax candles of different heights, each with a drip and a wick
 *
 * Everything is ONE merged mesh (one draw call) with a small shader lit by the candles'
 * own flames — they warm the frosting near them — plus the room's soft light, a little
 * rose bounce, per-material highlights and baked contact darkening where things meet.
 */

export type CakeKind = 0 | 1 | 2 | 3 | 4 | 5 | 6; // frosting, berry, pearl, leaf, wax, glaze, wick

export const CAKE = {
  low: { r: 0.35, h: 0.26 },
  up: { r: 0.23, h: 0.2 },
};
const UP_BASE = CAKE.low.h;
const TOP = CAKE.low.h + CAKE.up.h;

class Parts {
  list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, kind: CakeKind, ao = 1) {
    const f = g.index ? g.toNonIndexed() : g;
    if (g.index) g.dispose();
    if (!f.attributes.normal) f.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = f.attributes.position.count;
    const col = new Float32Array(n * 3);
    const k = new Float32Array(n).fill(kind);
    const occ = new Float32Array(n).fill(ao);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    f.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    f.setAttribute('aKind', new THREE.BufferAttribute(k, 1));
    f.setAttribute('aAO', new THREE.BufferAttribute(occ, 1));
    for (const name of Object.keys(f.attributes)) if (!['position', 'normal', 'aColor', 'aKind', 'aAO'].includes(name)) f.deleteAttribute(name);
    this.list.push(f);
  }
  merge(): THREE.BufferGeometry {
    const names = ['position', 'normal', 'aColor', 'aKind', 'aAO'];
    const total = this.list.reduce((a, g) => a + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const size = this.list[0].attributes[name].itemSize;
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const g of this.list) {
        arr.set(g.attributes[name].array as Float32Array, o);
        o += g.attributes[name].count * size;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.list.forEach((g) => g.dispose());
    return out;
  }
}

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A tier: a lathe with soft edges and a domed top, its sides gently uneven. */
function tier(r: number, h: number, base: number): THREE.BufferGeometry {
  const e = 0.03; // the rounded edge
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(r - 0.008, 0)];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - 0.008 + Math.cos(a) * 0.008, 0.008 + Math.sin(a) * 0.008));
  }
  pts.push(new THREE.Vector2(r, h - e));
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h - e + Math.sin(a) * e));
  }
  for (let i = 1; i <= 5; i++) {
    const u = i / 5;
    pts.push(new THREE.Vector2((r - e) * (1 - u) + 0.0001, h + Math.sin(u * Math.PI * 0.5) * 0.008));
  }
  const g = new THREE.LatheGeometry(pts, 72);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    // smoothed by hand: never a perfect cylinder
    const wob = 1 + 0.008 * Math.sin(a * 3 + base * 10) + 0.004 * Math.sin(a * 7 + 1.3) + 0.003 * Math.sin(y * 40 + a * 2);
    p.setXYZ(i, x * wob, y + base, z * wob);
  }
  g.computeVertexNormals();
  return g;
}

/** A ring of piped shells (squashed, slightly tilted beads) round a tier's foot. */
function shells(P: Parts, r: number, y: number, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.02;
    const g = new THREE.SphereGeometry(1, 10, 7);
    const s = 0.024 + rnd() * 0.004;
    g.scale(s * 1.25, s * 0.85, s);
    g.rotateZ(0.4);
    g.rotateY(-a);
    g.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    P.add(g, color, 0, 0.85);
  }
}

/** A rosette: a swirl of cream — three shrinking rings and a peak. */
function rosette(P: Parts, x: number, y: number, z: number, s: number, color: string) {
  for (let k = 0; k < 3; k++) {
    const t = new THREE.TorusGeometry(0.024 * s * (1 - k * 0.28), 0.012 * s * (1 - k * 0.2), 6, 14);
    t.rotateX(Math.PI / 2);
    t.translate(x, y + 0.008 * s + k * 0.012 * s, z);
    P.add(t, color, 0, 0.9);
  }
  const peak = new THREE.ConeGeometry(0.011 * s, 0.03 * s, 8);
  peak.translate(x, y + 0.05 * s, z);
  P.add(peak, color, 0);
}

/** A strawberry: a heart-ish berry, a little calyx of leaves on top. */
function strawberry(P: Parts, x: number, y: number, z: number, s: number, ry: number, tilt: number) {
  const g = new THREE.SphereGeometry(1, 12, 10);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    const taper = py < 0 ? 1 + py * 0.45 : 1;
    p.setXYZ(i, p.getX(i) * taper, py * 1.15, p.getZ(i) * taper);
  }
  g.computeVertexNormals();
  g.scale(0.03 * s, 0.03 * s, 0.03 * s);
  g.rotateX(Math.PI + tilt);
  g.rotateY(ry);
  g.translate(x, y + 0.028 * s, z);
  P.add(g, '#c01632', 1);
  const leaf = new THREE.ConeGeometry(0.022 * s, 0.012 * s, 6);
  leaf.rotateX(tilt);
  leaf.translate(x, y + 0.058 * s, z);
  P.add(leaf, '#5c7a3a', 3);
}

export interface CakeData {
  geometry: THREE.BufferGeometry;
  /** where each candle's flame sits (cake-local) */
  flames: [number, number, number][];
}

export function buildCake(): CakeData {
  seed = 11;
  const P = new Parts();
  const blush = '#f9d0d6';
  const blushLow = '#f6c2ca';
  const cream = '#fbe8e6';
  // the tiers
  P.add(tier(CAKE.low.r, CAKE.low.h, 0), blushLow, 0);
  P.add(tier(CAKE.up.r, CAKE.up.h, UP_BASE), blush, 0);
  // a raspberry glaze dripping from the upper tier's edge
  {
    const g = new THREE.CylinderGeometry(CAKE.up.r + 0.004, CAKE.up.r + 0.004, 0.036, 72, 6, true);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      // drips of different lengths: only the lower edge is pulled down
      // a thin rim of glaze, with drips of different lengths running down the side
      const drip = Math.pow(Math.max(0, Math.sin(a * 9 + Math.sin(a * 4) * 1.5)), 3) * 0.055 + Math.pow(Math.max(0, Math.sin(a * 23 + 1)), 6) * 0.022;
      const down = y < 0 ? drip : 0;
      p.setXYZ(i, x, y - down + TOP - 0.018 + 0.004, z);
    }
    g.computeVertexNormals();
    P.add(g, '#8e1a3a', 5);
    // the glaze reaches just over the top edge: a ring, the top itself stays cream
    const cap = new THREE.RingGeometry(CAKE.up.r - 0.03, CAKE.up.r + 0.004, 72, 1);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, TOP + 0.0085, 0);
    P.add(cap, '#9c1f42', 5);
  }
  // piped shell borders at the foot of each tier
  shells(P, CAKE.low.r + 0.004, 0.018, 40, cream);
  shells(P, CAKE.up.r + 0.004, UP_BASE + 0.016, 28, cream);
  // a string of sugar pearls round the lower tier's top edge
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const g = new THREE.SphereGeometry(0.0085, 8, 6);
    g.translate(Math.cos(a) * (CAKE.low.r - 0.012), UP_BASE + 0.004, Math.sin(a) * (CAKE.low.r - 0.012));
    P.add(g, '#fff6ee', 2);
  }
  // rosettes on the lower tier's shoulder, placed by hand (not a perfect ring)
  [0.2, 1.15, 2.05, 2.9, 3.85, 4.75, 5.6].forEach((a, i) => {
    const r = 0.29 + (i % 2) * 0.012;
    rosette(P, Math.cos(a) * r, UP_BASE + 0.005, Math.sin(a) * r, 0.9 + (i % 3) * 0.12, i % 3 === 1 ? '#f7d3d6' : cream);
  });
  // strawberries: some on the shoulder between rosettes, a few on top
  (
    [
      [0.68, 0.3, 1.0, 0.0],
      [1.6, 0.285, 0.85, 0.3],
      [3.4, 0.3, 1.1, -0.2],
      [5.15, 0.29, 0.9, 0.25],
    ] as const
  ).forEach(([a, r, s, t]) => strawberry(P, Math.cos(a) * r, UP_BASE + 0.006, Math.sin(a) * r, s, a * 2, t));
  strawberry(P, 0.1, TOP + 0.01, -0.09, 1.15, 0.4, 0.35);
  strawberry(P, 0.15, TOP + 0.01, -0.04, 0.9, 1.6, -0.3);
  strawberry(P, -0.13, TOP + 0.01, -0.1, 1.0, 2.6, 0.2);
  // two sugar flowers on the upper tier's side, and two tiny hearts beside them
  const flower = (a: number, y: number, s: number, col: string) => {
    const r = CAKE.up.r + 0.008;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    for (let k = 0; k < 5; k++) {
      const g = new THREE.SphereGeometry(1, 8, 6);
      g.scale(0.014 * s, 0.024 * s, 0.006 * s);
      g.translate(0, 0.02 * s, 0);
      g.rotateZ((k / 5) * Math.PI * 2);
      g.rotateY(-a + Math.PI / 2);
      g.translate(cx, y, cz);
      P.add(g, col, 2);
    }
    const c = new THREE.SphereGeometry(0.008 * s, 8, 6);
    c.translate(cx * 1.03, y, cz * 1.03);
    P.add(c, '#e9b35f', 2);
  };
  flower(1.2, UP_BASE + 0.11, 1.1, '#fff1ea');
  flower(1.55, UP_BASE + 0.07, 0.8, '#f2c4cc');
  for (const [a, y, s] of [
    [0.9, UP_BASE + 0.06, 1],
    [1.85, UP_BASE + 0.12, 0.8],
  ] as const) {
    const h = getHeartGeometry('low').clone();
    h.scale(0.012 * s, 0.012 * s, 0.005);
    h.rotateY(-a + Math.PI / 2);
    h.translate(Math.cos(a) * (CAKE.up.r + 0.006), y, Math.sin(a) * (CAKE.up.r + 0.006));
    P.add(h, '#b3223c', 1);
  }
  // candles: slender wax, different heights, a drip each, a wick
  const flames: [number, number, number][] = [];
  (
    [
      [-0.12, -0.02, 0.15, '#f7efe4'],
      [-0.04, 0.06, 0.12, '#f4d6d8'],
      [0.05, 0.03, 0.135, '#f7efe4'],
      [0.13, 0.07, 0.11, '#f4d6d8'],
    ] as const
  ).forEach(([x, z, h, col], i) => {
    const base = TOP + 0.006;
    const c = new THREE.CylinderGeometry(0.0105, 0.0115, h, 14, 4);
    c.translate(x, base + h / 2, z);
    P.add(c, col, 4);
    const drip = new THREE.SphereGeometry(1, 8, 6);
    drip.scale(0.006, 0.022, 0.005);
    const da = i * 1.7;
    drip.translate(x + Math.cos(da) * 0.0105, base + h - 0.03 - (i % 2) * 0.02, z + Math.sin(da) * 0.0105);
    P.add(drip, col, 4);
    const wick = new THREE.CylinderGeometry(0.0018, 0.0018, 0.016, 5);
    wick.translate(x, base + h + 0.008, z);
    P.add(wick, '#1d140f', 6);
    flames.push([x, base + h + 0.03, z]);
  });
  return { geometry: P.merge(), flames };
}

export const cakeVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aKind;
  attribute float aAO;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  varying float vAO;
  varying float vY;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = aColor;
    vKind = aKind;
    vAO = aAO;
    vY = position.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const cakeFragment = /* glsl */ `
  uniform vec3 uFlames[4];     // the candle flames, in the world
  uniform float uLit;          // 0 when they're blown out
  uniform float uTime;
  uniform float uWarm;         // her hand near / leaning in: a touch warmer
  uniform vec3 uRoomDir;       // toward the middle of the room (rose bounce from the heart)
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  varying float vAO;
  varying float vY;
  float flick(float t, float s) { return 0.82 + 0.1 * sin(t * 7.3 + s * 13.0) + 0.06 * sin(t * 13.1 + s * 7.0); }
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float k = vKind;
    vec3 base = vColor;
    // the room's soft light, from above; a rose bounce from the heart's side
    vec3 light = vec3(0.56, 0.46, 0.45) + vec3(0.26, 0.22, 0.2) * max(n.y, 0.0);
    light += vec3(0.5, 0.2, 0.3) * 0.18 * max(dot(n, uRoomDir), 0.0);
    // the flames warm what's near them (the top, the candles, the upper tier most)
    vec3 spec = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec3 L = uFlames[i] - vWorld;
      float d2 = dot(L, L);
      vec3 Ld = normalize(L);
      float f = flick(uTime, float(i) * 1.7) * uLit;
      // (~0.5 at 12 cm, ~0.1 at 30 cm: a candle's small, intimate pool)
      light += vec3(1.0, 0.66, 0.38) * f * (0.25 + 0.75 * max(dot(n, Ld), 0.0)) * 0.012 * (1.0 + 0.5 * uWarm) / (0.01 + d2);
      spec += vec3(1.0, 0.8, 0.55) * f * pow(max(dot(reflect(-Ld, n), V), 0.0), k > 0.5 && k < 2.5 ? 50.0 : 14.0) * 0.15 / (0.05 + d2 * 6.0);
    }
    // contact darkening where things meet (baked per part, and at each tier's foot)
    float ao = vAO;
    ao *= mix(0.62, 1.0, smoothstep(0.0, 0.045, vY));
    ao *= mix(0.75, 1.0, smoothstep(0.26, 0.29, vY) + step(vY, 0.255) * 1.0);
    // buttercream: soft palette-knife lines round the sides
    if (k < 0.5) base *= 0.96 + 0.04 * sin(vY * 380.0 + sin(atan(vWorld.z, vWorld.x) * 9.0) * 2.0);
    vec3 col = base * light * clamp(ao, 0.0, 1.0);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    if (k < 0.5) col += spec * 0.06 + base * rim * 0.12;                                  // buttercream: a satin sheen
    else if (k < 1.5) col += spec * 0.5 + vec3(1.0, 0.85, 0.8) * pow(max(dot(reflect(-V, n), normalize(vec3(-0.3, 0.8, 0.4))), 0.0), 40.0) * 0.25; // berries: glossy
    else if (k < 2.5) col += spec * 0.35 + vec3(1.0) * rim * 0.25;                          // sugar pearls
    else if (k < 4.5 && k > 3.5) {
      // wax: lit from within near the flame
      col += vec3(1.0, 0.62, 0.32) * uLit * smoothstep(0.55, 0.62, vY) * 0.35;
    } else if (k < 5.5 && k > 4.5) col += spec * 0.6 + vec3(0.9, 0.5, 0.55) * rim * 0.15; // glaze: glossy
    else if (k > 5.5) col = vec3(0.06, 0.04, 0.03) + vec3(1.0, 0.45, 0.15) * 0.3 * uLit; // the wick, glowing at its tip
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A few tiny sparkles that rise round the cake while her hand is near / she leans in. */
export const sparkleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uOn;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    float life = fract(uTime * (0.18 + aSeed * 0.15) + aSeed * 7.0);
    vec3 p = position;
    p.y += life * 0.35;
    p.x += sin(uTime * 0.7 + aSeed * 30.0) * 0.03;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.4 + aSeed * 2.2) * uPixelRatio * (5.0 / -mv.z);
    vA = uOn * sin(3.14159 * life);
  }
`;
export const sparkleFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * smoothstep(0.5, 0.0, d) * vA, 1.0);
  }
`;
export function sparkleGeometry(count: number): THREE.BufferGeometry {
  seed = 29;
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.12 + rnd() * 0.3;
    pos.set([Math.cos(a) * r, TOP * (0.5 + rnd() * 0.8), Math.sin(a) * r], i * 3);
    sd[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  return g;
}
