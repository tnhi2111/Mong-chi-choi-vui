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

// frosting, berry, pearl, leaf, wax, ganache, wick, sponge (crumb), gold leaf, marble, porcelain
export type CakeKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const CAKE = {
  low: { r: 0.35, h: 0.26 },
  up: { r: 0.23, h: 0.2 },
};
const UP_BASE = CAKE.low.h;
const TOP = CAKE.low.h + CAKE.up.h;
/**
 * M — the cake stands on a marble cake stand: everything of the cake is this much above the
 * table top (the stand is part of the cake's mesh; RoomSet lifts the topper by it too).
 */
export const CAKE_LIFT = 0.085;

class Parts {
  list: THREE.BufferGeometry[] = [];
  /** which part of the exploded view what's added next belongs to (0 lower tier … 3 candles) */
  layer = 0;
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, kind: CakeKind, ao = 1) {
    const f = g.index ? g.toNonIndexed() : g;
    if (g.index) g.dispose();
    if (!f.attributes.normal) f.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = f.attributes.position.count;
    const col = new Float32Array(n * 3);
    const k = new Float32Array(n).fill(kind);
    const occ = new Float32Array(n).fill(ao);
    f.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n).fill(this.layer), 1));
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    f.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    f.setAttribute('aKind', new THREE.BufferAttribute(k, 1));
    f.setAttribute('aAO', new THREE.BufferAttribute(occ, 1));
    for (const name of Object.keys(f.attributes)) if (!['position', 'normal', 'aColor', 'aKind', 'aAO', 'aLayer'].includes(name)) f.deleteAttribute(name);
    this.list.push(f);
  }
  merge(): THREE.BufferGeometry {
    const names = ['position', 'normal', 'aColor', 'aKind', 'aAO', 'aLayer'];
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

/**
 * A piped buttercream rose: one ribbon of cream wound from the heart outward (a petal tip's
 * spiral), rising in the middle — the way a star nozzle draws it — instead of stacked rings.
 */
function rosette(P: Parts, x: number, y: number, z: number, s: number, color: string) {
  const pts: THREE.Vector3[] = [];
  const turns = 2.4;
  const n = 46;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * turns * Math.PI * 2 + rnd() * 0.05;
    const r = (0.004 + 0.026 * Math.pow(u, 0.8)) * s;
    pts.push(new THREE.Vector3(x + Math.cos(a) * r, y + (0.034 - 0.026 * u) * s + Math.sin(a * 3) * 0.001 * s, z + Math.sin(a) * r));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.0085 * s, 7, false);
  // a ribbon, not a rope: taller than it is thick, the way the nozzle leaves it
  const p = g.attributes.position as THREE.BufferAttribute;
  const cy = y + 0.02 * s;
  for (let i = 0; i < p.count; i++) p.setY(i, cy + (p.getY(i) - cy) * 1.25);
  g.computeVertexNormals();
  P.add(g, color, 0, 0.9);
}

/** A raspberry: drupelets on a little dome. */
function raspberry(P: Parts, x: number, y: number, z: number, s: number) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const v = (i + 0.5) / n;
    const phi = Math.acos(1 - v * 1.6);
    const th = i * 2.399;
    const g = new THREE.SphereGeometry(0.0065 * s, 6, 5);
    g.translate(x + Math.sin(phi) * Math.cos(th) * 0.016 * s, y + 0.012 * s + Math.cos(phi) * 0.018 * s, z + Math.sin(phi) * Math.sin(th) * 0.016 * s);
    P.add(g, i % 3 ? '#a3122f' : '#b81838', 1);
  }
}

/** A blueberry, with its bloom and a little star of a crown. */
function blueberry(P: Parts, x: number, y: number, z: number, s: number) {
  const g = new THREE.SphereGeometry(0.012 * s, 12, 9);
  g.scale(1, 0.86, 1);
  g.translate(x, y + 0.011 * s, z);
  P.add(g, '#3a3f66', 1);
  const c = new THREE.CylinderGeometry(0.003 * s, 0.0045 * s, 0.003 * s, 5);
  c.translate(x, y + 0.021 * s, z);
  P.add(c, '#20203a', 3);
}

/** A flake of gold leaf: a torn little polygon, tilted where it was laid. */
function goldLeaf(P: Parts, x: number, y: number, z: number, s: number, tilt: number) {
  const shape = new THREE.Shape();
  const k = 7;
  for (let i = 0; i <= k; i++) {
    const a = (i / k) * Math.PI * 2;
    const r = s * (0.6 + rnd() * 0.5);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2 + tilt);
  g.rotateY(rnd() * 6);
  g.translate(x, y, z);
  P.add(g, '#e8c46a', 8);
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

let cakeCache: CakeData | null = null;
/** The cake is always the same cake: build it once (Prewarm does it during the welcome). */
export function getCake(): CakeData {
  return (cakeCache ??= buildCake());
}

export function buildCake(): CakeData {
  seed = 11;
  const P = new Parts();
  const blush = '#f9d0d6';
  const blushLow = '#f6c2ca';
  const cream = '#fbe8e6';
  // the tiers
  P.add(tier(CAKE.low.r, CAKE.low.h, 0), blushLow, 0);
  P.layer = 1;
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
    // M: a glossy dark-chocolate ganache (a hint of cherry in it), running down in streams
    P.add(g, '#3c1512', 5);
    // each stream ends in a round drop, as poured ganache does
    for (let i = 0; i < 144; i++) {
      const a = (i / 144) * Math.PI * 2;
      const d = (q: number) => Math.pow(Math.max(0, Math.sin(q * 9 + Math.sin(q * 4) * 1.5)), 3) * 0.055 + Math.pow(Math.max(0, Math.sin(q * 23 + 1)), 6) * 0.022;
      const here = d(a);
      // (only the main streams: the small ones are too fine for the mesh to reach their drop)
      if (here < 0.03 || here < d(a - 0.02) || here < d(a + 0.02)) continue;
      const b = new THREE.SphereGeometry(0.0075 + here * 0.05, 10, 8);
      b.scale(1, 1.25, 0.8);
      b.translate(Math.cos(a) * (CAKE.up.r + 0.006), TOP - 0.018 + 0.004 - 0.018 - here * 0.92 + 0.004, Math.sin(a) * (CAKE.up.r + 0.006));
      P.add(b, '#3c1512', 5);
    }
    // the ganache reaches just over the top edge: a ring, the top itself stays cream
    const cap = new THREE.RingGeometry(CAKE.up.r - 0.03, CAKE.up.r + 0.004, 72, 1);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, TOP + 0.0085, 0);
    P.add(cap, '#45191a', 5);
  }
  // piped shell borders at the foot of each tier
  shells(P, CAKE.up.r + 0.004, UP_BASE + 0.016, 28, cream);
  P.layer = 0;
  shells(P, CAKE.low.r + 0.004, 0.018, 40, cream);
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
  P.layer = 2;
  strawberry(P, 0.1, TOP + 0.01, -0.09, 1.15, 0.4, 0.35);
  strawberry(P, 0.15, TOP + 0.01, -0.04, 0.9, 1.6, -0.3);
  strawberry(P, -0.13, TOP + 0.01, -0.1, 1.0, 2.6, 0.2);
  raspberry(P, 0.03, TOP + 0.01, -0.12, 1.1);
  raspberry(P, -0.07, TOP + 0.01, -0.13, 0.9);
  blueberry(P, 0.06, TOP + 0.01, -0.07, 1);
  blueberry(P, -0.03, TOP + 0.01, -0.06, 0.9);
  blueberry(P, 0.17, TOP + 0.01, -0.0, 1.1);
  // a few flakes of gold leaf, laid by hand on the ganache rim and on the cream
  (
    [
      [0.2, TOP + 0.011, 0.07, 0.012, 0.2],
      [-0.18, TOP + 0.011, 0.11, 0.009, -0.3],
      [-0.05, TOP + 0.011, 0.16, 0.01, 0.4],
      [0.1, TOP + 0.011, -0.17, 0.008, -0.2],
    ] as const
  ).forEach(([x, y, z, s, t]) => goldLeaf(P, x, y, z, s, t));
  P.layer = 0;
  // berries on the lower tier's shoulder too, between the roses
  raspberry(P, Math.cos(2.5) * 0.3, UP_BASE + 0.006, Math.sin(2.5) * 0.3, 1);
  blueberry(P, Math.cos(4.3) * 0.31, UP_BASE + 0.006, Math.sin(4.3) * 0.31, 1);
  blueberry(P, Math.cos(0.15) * 0.3, UP_BASE + 0.006, Math.sin(0.15) * 0.3, 0.9);
  goldLeaf(P, Math.cos(3.1) * 0.33, UP_BASE + 0.012, Math.sin(3.1) * 0.33, 0.01, 0.6);
  P.layer = 2;
  // two sugar flowers on the upper tier's side, and two tiny hearts beside them
  P.layer = 1;
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
  P.layer = 3;
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
  // M: a marble cake stand under it all (it stays put in the exploded view: layer 0)
  P.layer = 0;
  {
    const L = CAKE_LIFT;
    const prof = [
      [0.0001, -L],
      [0.17, -L],
      [0.175, -L + 0.006],
      [0.165, -L + 0.016],
      [0.07, -L + 0.026],
      [0.045, -L + 0.034],
      [0.042, -0.03],
      [0.06, -0.022],
      [0.39, -0.018],
      [0.405, -0.012],
      [0.405, -0.004],
      [0.39, 0.0],
      [0.0001, 0.0],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const stand = new THREE.LatheGeometry(prof, 72);
    stand.computeVertexNormals();
    P.add(stand, '#efeae4', 9, 1);
  }
  const geometry = P.merge();
  geometry.translate(0, CAKE_LIFT, 0);
  return { geometry, flames: flames.map(([x, y, z]) => [x, y + CAKE_LIFT, z] as [number, number, number]) };
}

/**
 * M — a slice already cut and served on a little porcelain plate beside the cake: the only
 * way to see what a cake is made of. Three layers of sponge (crumb, not a flat colour), cream
 * and raspberry between them, buttercream outside, ganache on its back edge, crumbs on the
 * plate. Plate-local units (its foot at y = 0); drawn with the cake's own material.
 */
export function buildSlice(): THREE.BufferGeometry {
  seed = 29;
  const P = new Parts();
  const R = 0.13;
  const A = 0.55;
  const sector = (r0: number) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r0, -A / 2, A / 2, false);
    s.lineTo(0, 0);
    return s;
  };
  const layer = (y0: number, h: number, color: string, kind: CakeKind, r = R) => {
    const g = new THREE.ExtrudeGeometry(sector(r), { depth: h, bevelEnabled: false, curveSegments: 16 });
    g.rotateX(-Math.PI / 2);
    // (centred on the plate: the slice's middle, not its point, over the plate's middle)
    g.translate(-0.065, y0, 0);
    P.add(g, color, kind);
  };
  // a porcelain dessert plate
  const plate = new THREE.LatheGeometry(
    [
      [0.0001, 0],
      [0.06, 0],
      [0.064, 0.004],
      [0.085, 0.006],
      [0.11, 0.014],
      [0.115, 0.018],
      [0.112, 0.02],
      [0.085, 0.011],
      [0.0001, 0.009],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    56,
  );
  P.add(plate, '#f3eee8', 10);
  // the slice stands as it was cut
  const base = 0.01;
  const sp = '#e9c48c';
  layer(base, 0.042, sp, 7);
  layer(base + 0.042, 0.006, '#fbe6e2', 0);
  layer(base + 0.048, 0.004, '#a51c36', 5);
  layer(base + 0.052, 0.04, sp, 7);
  layer(base + 0.092, 0.006, '#fbe6e2', 0);
  layer(base + 0.098, 0.004, '#a51c36', 5);
  layer(base + 0.102, 0.036, sp, 7);
  // the buttercream outside it: a skin on the curved back and on the top
  layer(base + 0.138, 0.012, '#f6c2ca', 0, R + 0.004);
  {
    const skin = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.15, 20, 1, true, Math.PI / 2 - A / 2, A);
    skin.translate(-0.065, base + 0.075, 0);
    P.add(skin, '#f6c2ca', 0);
  }
  // a few crumbs on the plate
  for (let i = 0; i < 14; i++) {
    const g = new THREE.DodecahedronGeometry(0.0025 + rnd() * 0.003, 0);
    g.scale(1, 0.7, 1);
    const a = rnd() * Math.PI * 2;
    const r = 0.03 + rnd() * 0.06;
    g.translate(Math.cos(a) * r + 0.02, 0.012, Math.sin(a) * r);
    P.add(g, sp, 7);
  }
  // a fork resting on the plate
  {
    const f = new THREE.BoxGeometry(0.11, 0.0025, 0.009);
    f.rotateY(0.9);
    f.translate(-0.03, 0.016, 0.05);
    P.add(f, '#d9d4cc', 8);
  }
  return P.merge();
}

/** Crumbs on the stand's plate, round the cake's foot (cake-local, above CAKE_LIFT). */
export function buildCrumbs(): THREE.BufferGeometry {
  seed = 41;
  const P = new Parts();
  for (let i = 0; i < 18; i++) {
    const g = new THREE.DodecahedronGeometry(0.002 + rnd() * 0.0025, 0);
    g.scale(1, 0.6, 1);
    const a = rnd() * Math.PI * 2;
    const r = CAKE.low.r + 0.015 + rnd() * 0.02;
    g.translate(Math.cos(a) * r, CAKE_LIFT + 0.002, Math.sin(a) * r);
    P.add(g, '#e9c48c', 7);
  }
  return P.merge();
}

/**
 * The exploded view (a hidden flourish): how far each part of the cake lifts and turns.
 * The lower tier stays; the upper tier (and what sits on it) lifts and turns one way; the
 * berries on top lift a little more; the candles most, turning the other way.
 * Shared by the vertex shader and the JS that moves the flames and the topper with them.
 */
export const EXPLODE = { upper: 0.17, top: 0.25, candles: 0.33, turnUpper: 0.55, turnCandles: -0.45 };

export const cakeVertex = /* glsl */ `
  uniform float uExplode;
  attribute float aLayer;
  attribute vec3 aColor;
  attribute float aKind;
  attribute float aAO;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  varying float vAO;
  varying float vY;
  vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  void main() {
    vec3 p = position;
    vec3 nn = normal;
    float candle = step(2.5, aLayer);
    float upper = step(0.5, aLayer) * (1.0 - candle);
    float lift = candle > 0.5 ? ${EXPLODE.candles.toFixed(3)} : aLayer > 1.5 ? ${EXPLODE.top.toFixed(3)} : upper * ${EXPLODE.upper.toFixed(3)};
    float ang = uExplode * (candle > 0.5 ? ${EXPLODE.turnCandles.toFixed(3)} : upper * ${EXPLODE.turnUpper.toFixed(3)});
    p.xz = turn(p.xz, ang);
    nn.xz = turn(nn.xz, ang);
    p.y += lift * uExplode;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * nn);
    vColor = aColor;
    vKind = aKind;
    vAO = aAO;
    vY = position.y - ${CAKE_LIFT.toFixed(3)};  // (rest height above the stand: the baked shading keeps to the part)
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const cakeFragment = /* glsl */ `
  uniform vec3 uFlames[4];     // the candle flames, in the world
  uniform float uLit;          // 0 when they're blown out
  uniform float uTime;
  uniform float uWarm;         // her hand near / leaning in: a touch warmer
  uniform float uKey;          // the moment: a soft warm key from where she stands
  uniform vec3 uRoomDir;       // toward the middle of the room (rose bounce from the heart)
  uniform vec3 uCenter;        // the cake's axis, in the world (the tops' spiral turns round it)
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  varying float vAO;
  varying float vY;
  float flick(float t, float s) { return 0.82 + 0.1 * sin(t * 7.3 + s * 13.0) + 0.06 * sin(t * 13.1 + s * 7.0); }
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + 1.0), f.x), f.y), f.z);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float k = vKind;
    vec3 base = vColor;
    // fine detail only when she is close (it would shimmer from across the room)
    float near = smoothstep(3.6, 1.1, length(cameraPosition - vWorld));
    // the room's soft light from above, WRAPPED round the cream (light goes a little way into
    // buttercream, so its turned-away side is soft, never dead)
    vec3 light = vec3(0.56, 0.46, 0.45) + vec3(0.26, 0.22, 0.2) * clamp(n.y * 0.6 + 0.4, 0.0, 1.0);
    light += vec3(0.5, 0.2, 0.3) * 0.18 * max(dot(n, uRoomDir), 0.0);
    // (wrapped, so the buttercream's turned-away side still glows a little)
    light += vec3(1.0, 0.78, 0.6) * uKey * (0.35 + 0.65 * max(dot(n, V) * 0.6 + 0.4, 0.0));
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
    // (the stand and the plate: no tier-foot darkening — only a soft shade right at the cake's foot)
    if (k > 8.5) ao = vAO * mix(0.72, 1.0, smoothstep(0.34, 0.4, length(vWorld.xz - uCenter.xz) / 0.82));
    // buttercream: the palette knife's marks — swept bands round the sides, a slow spiral on
    // the tops where it was turned on the stand; a faint warmth where light passes through
    if (k < 0.5) {
      float side = 1.0 - smoothstep(0.55, 0.9, abs(n.y));
      vec2 q = vWorld.xz - uCenter.xz;
      float sweep = sin(vY * 380.0 + sin(atan(q.y, q.x) * 9.0) * 2.0);
      float spiral = sin(length(q) * 260.0 + atan(q.y, q.x) * 2.0);
      base *= 1.0 + mix(0.04 * spiral * smoothstep(0.85, 1.0, n.y), 0.045 * sweep, side) * (0.4 + 0.6 * near);
    }
    // sponge: open crumb — small dark pores, golden crust-ish warmth
    if (k > 6.5 && k < 7.5) {
      // (round pores of different sizes: two scales of smooth noise, cut into holes)
      float fine = n3(vWorld * 520.0);
      float coarse = n3(vWorld * 190.0 + 7.0);
      float pores = max(smoothstep(0.74, 0.86, fine), smoothstep(0.8, 0.9, coarse));
      base *= mix(1.0, 0.6, pores * near) * (0.95 + 0.07 * n3(vWorld * 60.0));
    }
    // strawberries: their little seeds
    if (k > 0.5 && k < 1.5) {
      vec3 sp = vWorld * 900.0;
      float seed = step(0.93, fract(sin(dot(floor(sp), vec3(7.13, 157.1, 113.7))) * 43758.5453));
      base = mix(base, vec3(0.93, 0.78, 0.35), seed * 0.6 * near * step(0.5, base.r - base.b));
    }
    // marble: grey veins through white
    if (k > 8.5 && k < 9.5) {
      // (fine and pale: a white stone with a few soft grey threads, not a crackle)
      float v = sin(vWorld.x * 64.0 + sin(vWorld.z * 23.0 + vWorld.x * 9.0) * 2.2);
      base *= 1.0 - 0.1 * smoothstep(0.985, 1.0, abs(v)) * (0.4 + 0.6 * near);
    }
    vec3 col = base * light * clamp(ao, 0.0, 1.0);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    if (k < 0.5) col += spec * 0.06 + base * rim * 0.12 + vec3(1.0, 0.55, 0.5) * base * rim * 0.08; // buttercream: satin sheen + light through its edge
    else if (k < 1.5) col += spec * 0.5 + vec3(1.0, 0.85, 0.8) * pow(max(dot(reflect(-V, n), normalize(vec3(-0.3, 0.8, 0.4))), 0.0), 40.0) * 0.25; // berries: glossy
    else if (k < 2.5) col += spec * 0.35 + vec3(1.0) * rim * 0.25;                          // sugar pearls
    else if (k < 4.5 && k > 3.5) {
      // wax: lit from within near the flame
      col += vec3(1.0, 0.62, 0.32) * uLit * smoothstep(0.55, 0.62, vY) * 0.35;
    } else if (k < 5.5 && k > 4.5) {
      // ganache: deep, glassy — sharp highlights of the flames and the room, a cool rim
      vec3 R = reflect(-V, n);
      col += spec * 0.9 + vec3(1.0, 0.86, 0.78) * pow(max(dot(R, normalize(vec3(-0.3, 0.85, 0.4))), 0.0), 60.0) * 0.5 + vec3(0.7, 0.45, 0.5) * rim * 0.25;
    } else if (k > 5.5 && k < 6.5) col = vec3(0.06, 0.04, 0.03) + vec3(1.0, 0.45, 0.15) * 0.3 * uLit; // the wick, glowing at its tip
    else if (k > 7.5 && k < 8.5) {
      // gold leaf / the fork: metal — its colour IS its reflection
      vec3 R = reflect(-V, n);
      float env = 0.35 + 0.65 * smoothstep(-0.2, 0.9, R.y);
      col = base * (0.25 + env * 0.55) + spec * 1.4 * base + base * pow(max(dot(R, normalize(vec3(-0.3, 0.85, 0.4))), 0.0), 30.0) * 0.9;
    } else if (k > 8.5) {
      // marble and porcelain: polished, and white — they keep their white under warm light
      col = max(col, base * vec3(0.8, 0.79, 0.78) * ao);
      vec3 R = reflect(-V, n);
      col += spec * 0.5 + vec3(1.0, 0.95, 0.9) * pow(max(dot(R, normalize(vec3(-0.3, 0.85, 0.4))), 0.0), 80.0) * 0.35 + base * rim * 0.06;
    }
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

/**
 * The reveal: a ring of warm gold and soft pink motes that runs once round the cake,
 * rising a little, then fades — the moment the cake "answers" her touch. `uSince` is the
 * time since the touch (large = idle: nothing drawn).
 */
export const ringVertex = /* glsl */ `
  uniform float uSince;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  varying vec3 vCol;
  void main() {
    float t = clamp((uSince - 0.5) / 1.8, 0.0, 1.0);          // starts ~0.5 s after the touch
    float a = aSeed * 6.28318 + t * 4.2;
    float r = 0.44 + 0.04 * sin(aSeed * 40.0);
    vec3 p = vec3(cos(a) * r, 0.28 + t * 0.32 + sin(aSeed * 23.0) * 0.03, sin(a) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min((1.6 + fract(aSeed * 7.0) * 2.0) * uPixelRatio * (5.0 / -mv.z), 10.0 * uPixelRatio);
    vA = sin(3.14159 * t) * step(uSince, 3.0) * (0.55 + 0.45 * fract(aSeed * 13.0));
    vCol = mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.62, 0.7), step(0.5, fract(aSeed * 3.7)));
  }
`;
export const ringFragment = /* glsl */ `
  varying float vA;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vCol * smoothstep(0.5, 0.0, d) * vA * 0.8, 1.0);
  }
`;
export function ringGeometry(count: number): THREE.BufferGeometry {
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count);
  for (let i = 0; i < count; i++) sd[i] = i / count + 0.013 * Math.sin(i * 12.9);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  return g;
}
