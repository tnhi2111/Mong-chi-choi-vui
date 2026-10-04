import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { getHeartGeometry } from './heartShape';

/*
 * The room someone lives in. Seen from the default view (left to right):
 *
 *   PERSONAL SHELF   a walnut bookcase: books (one leaning), a mug of pens, a keepsake box,
 *                    a little plant, a ceramic jar, a small globe — and gaps; a basket
 *   WINDOW CORNER    linen curtains, an armchair turned toward the room with a throw over
 *                    its arm, a round side table with a lamp, a book and a cup, a tall
 *                    plant, slippers left by the chair, all on a cream rug
 *   FEATURE WALL     (the wall shader draws the arched alcove for the HAPPY BIRTHDAY
 *                    installation) two brass sconces and tall vases of pampas either side
 *   BIRTHDAY PREP    a sideboard: stacked plates, forks, folded napkins, a bud vase, a
 *                    wrapped present with a card, a stray curl of ribbon; the cake on its
 *                    little table in front
 *   SEATING CORNER   a loveseat with cushions (one creased and askew) and a knitted throw,
 *                    a floor lamp, a side table with books, a cup and a small photo, a
 *                    gallery of four frames above (not quite aligned), a blush rug beneath
 *
 * Everything but the photographs and curtains is ONE merged mesh with a small shader
 * that fakes the room's light on it — its four lamps, the candles, the heart, the moon —
 * with per-material response and contact darkening. Each piece belongs to a cluster (an
 * anchor direction): when the camera comes round to that side of the room, the whole
 * cluster steps out of the way, like the cut-away wall (a dolls'-house room).
 */

export type Kind = 0 | 1 | 2 | 3 | 4 | 5; // wood, fabric, ceramic, paper, metal, glowing (shades)

/** Where things stand (wall angles, measured like the window: atan(x, -z)). */
export const LAYOUT = {
  window: -0.78,
  shelf: -1.33,
  chair: -1.06,
  sideTable: -0.93,
  plant: -0.52,
  sconce: 0.445,
  sideboard: 0.68,
  cake: 0.74,
  seat: 1.17,
  floorLamp: 1.43,
  seatTable: 0.95,
};

/** A frame on the wall at angle `a` and radius `r`, facing the middle of the room. */
function wallFrame(a: number, r: number, y: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(-a);
  m.setPosition(Math.sin(a) * r, y, -Math.cos(a) * r);
  return m;
}
const onWall = (a: number, r: number) => new THREE.Vector2(Math.sin(a) * r, -Math.cos(a) * r);

/** The room's lamps, in the world: xyz, and how strong (the room's shaders add their light). */
export function roomLamps(floorY: number, R: number): THREE.Vector4[] {
  const p = (a: number, r: number, h: number, w: number) => {
    const q = onWall(a, r);
    return new THREE.Vector4(q.x, floorY + h, q.y, w);
  };
  return [
    p(LAYOUT.sideTable, R - 0.55, 1.08, 1.0), // table lamp by the armchair
    p(LAYOUT.floorLamp, R - 0.4, 1.55, 1.0), // floor lamp by the loveseat
    p(-LAYOUT.sconce, R - 0.2, 2.2, 0.5), // the two sconces either side of the alcove
    p(LAYOUT.sconce, R - 0.2, 2.2, 0.5),
  ];
}

/** Where the cake's little table stands (in front of the sideboard). */
export function cakePosition(floorY: number, R: number): [number, number, number] {
  const q = onWall(LAYOUT.cake, R - 1.35);
  return [q.x, floorY, q.y];
}

/** Rugs the floor draws: centre + angle, and half size + tint. */
export function roomRugs(R: number): { at: THREE.Vector4[]; size: THREE.Vector4[] } {
  const a = onWall(-0.98, R - 1.05);
  const b = onWall(LAYOUT.seat, R - 1.1);
  return {
    at: [new THREE.Vector4(a.x, a.y, -0.98, 0), new THREE.Vector4(b.x, b.y, LAYOUT.seat, 0)],
    size: [new THREE.Vector4(0.95, 0.78, 0, 0), new THREE.Vector4(1.25, 0.95, 1, 0)],
  };
}

/** Contact shadows the floor draws under the furniture: [x, z, along-wall angle, half length]. */
export function furnitureBlobs(R: number): THREE.Vector4[] {
  const at = (a: number, r: number, half: number) => {
    const q = onWall(a, r);
    return new THREE.Vector4(q.x, q.y, a, half);
  };
  return [at(LAYOUT.sideboard, R - 0.3, 0.8), at(LAYOUT.seat, R - 0.75, 0.75), at(LAYOUT.shelf, R - 0.2, 0.5), at(LAYOUT.chair, R - 1.05, 0.35)];
}

/** Every cluster's anchor direction (it steps aside when the camera comes round behind it). */
const ANCHOR = { shelf: LAYOUT.shelf, window: -0.95, feature: 0, prep: LAYOUT.sideboard, seat: LAYOUT.seat };

class Builder {
  parts: THREE.BufferGeometry[] = [];
  anchor = new THREE.Vector2();
  setAnchor(a: number) {
    this.anchor.set(Math.sin(a), -Math.cos(a));
  }
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation, kind: Kind) {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    if (geo.index) geo.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const anc = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      anc.set([this.anchor.x, this.anchor.y], i * 2);
    }
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    g.setAttribute('aAnchor', new THREE.BufferAttribute(anc, 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'aColor', 'aKind', 'aAnchor'].includes(name)) g.deleteAttribute(name);
    this.parts.push(g);
  }
  merge(): THREE.BufferGeometry {
    return mergeAttrs(this.parts, ['position', 'normal', 'aColor', 'aKind', 'aAnchor']);
  }
}

function mergeAttrs(parts: THREE.BufferGeometry[], names: string[]): THREE.BufferGeometry {
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array as Float32Array, o);
      o += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  parts.forEach((g) => g.dispose());
  return out;
}

/** local placement inside a furniture frame */
function at(frame: THREE.Matrix4, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(...s));
  return frame.clone().multiply(m);
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** a soft, rounded block (cushions, seat pads, upholstered bodies) */
function pillow(w: number, h: number, d: number, round = 0.55) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position as THREE.BufferAttribute;
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), round);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)) * w * 0.5, f(p.getY(i)) * h * 0.5, f(p.getZ(i)) * d * 0.5);
  g.computeVertexNormals();
  return g;
}
const cyl = (rt: number, rb: number, h: number, seg = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

const WALNUT = '#4a2c1c';
const WALNUT_L = '#5c3826';
const OAK = '#6b4a30';
const BRASS = '#c9a46e';
const LINEN = '#d6c3ad';
const ROSE = '#a8636c';
const BURGUNDY = '#6e2634';
const BLUSH = '#c99a96';
const SAGE = '#5f7350';

/** a table lamp: glazed belly, brass neck, linen shade (its light is in roomLamps) */
function tableLamp(b: Builder, M: THREE.Matrix4, y: number) {
  b.add(new THREE.SphereGeometry(0.1, 20, 14), at(M, 0, y + 0.1, 0, 0, 0, 0, [1, 1.05, 1]), '#d8b9a4', 2);
  b.add(cyl(0.05, 0.07, 0.035), at(M, 0, y + 0.017, 0), '#d8b9a4', 2);
  b.add(cyl(0.012, 0.012, 0.16), at(M, 0, y + 0.27, 0), BRASS, 4);
  b.add(cyl(0.12, 0.2, 0.22, 28, true), at(M, 0, y + 0.43, 0), '#f1dcc0', 5);
}
function book(b: Builder, M: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, col: string, ry = 0, rz = 0) {
  b.add(box(w, h, d), at(M, x, y, z, ry, 0, rz), col, 3);
}
function cup(b: Builder, M: THREE.Matrix4, x: number, y: number, z: number, ry = 0) {
  b.add(cyl(0.04, 0.034, 0.08, 20, true), at(M, x, y + 0.04, z), '#efe4d6', 2);
  b.add(new THREE.CircleGeometry(0.038, 18), at(M, x, y + 0.065, z, 0, -Math.PI / 2), '#6e4026', 2);
  b.add(cyl(0.034, 0.034, 0.004, 18), at(M, x, y + 0.002, z), '#efe4d6', 2);
  b.add(new THREE.TorusGeometry(0.02, 0.006, 6, 12), at(M, x + Math.cos(ry) * 0.045, y + 0.042, z - Math.sin(ry) * 0.045, ry), '#efe4d6', 2);
}
function vaseWithFlowers(b: Builder, M: THREE.Matrix4, x: number, y: number, z: number) {
  b.add(cyl(0.026, 0.042, 0.15, 18), at(M, x, y + 0.075, z), '#c9b4c0', 2);
  (
    [
      [-0.03, 0.28, 0.16, '#f0e2d4'],
      [0.025, 0.24, -0.22, '#d99aa0'],
      [0.0, 0.32, 0.04, '#b4505f'],
    ] as const
  ).forEach(([dx, h, lean, col]) => {
    b.add(cyl(0.004, 0.004, h, 5), at(M, x + dx - (Math.sin(lean) * h) / 2, y + 0.075 + (Math.cos(lean) * h) / 2, z, 0, 0, lean), SAGE, 1);
    b.add(new THREE.IcosahedronGeometry(0.03, 1), at(M, x + dx - Math.sin(lean) * h, y + 0.075 + Math.cos(lean) * h, z, 0, 0, 0, [1, 0.8, 1]), col, 1);
  });
}

/** The pictures: four on the wall above the loveseat (not quite aligned). */
interface Pic {
  a: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  pic: number;
  frame: 'gilt' | 'dark' | 'cream';
}
const GALLERY: Pic[] = [
  { a: 1.075, y: 1.62, w: 0.34, h: 0.44, tilt: 0.0, pic: 0, frame: 'gilt' },
  { a: 1.155, y: 1.8, w: 0.26, h: 0.26, tilt: 0.03, pic: 1, frame: 'dark' },
  { a: 1.155, y: 1.44, w: 0.26, h: 0.2, tilt: -0.02, pic: 2, frame: 'cream' },
  { a: 1.235, y: 1.58, w: 0.3, h: 0.4, tilt: 0.0, pic: 3, frame: 'dark' },
];
const PICS = 5;
function galleryFrame(f: Pic, R: number, floorY: number) {
  return wallFrame(f.a, R - 0.03, floorY)
    .multiply(new THREE.Matrix4().makeTranslation(0, f.y, 0.015))
    .multiply(new THREE.Matrix4().makeRotationZ(f.tilt));
}

function frameBorder(b: Builder, M: THREE.Matrix4, w: number, h: number, t: number, col: string, kind: Kind) {
  const tr = (x: number, y: number) => M.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, 0));
  b.add(box(w + t * 2, t, 0.025), tr(0, h / 2 + t / 2), col, kind);
  b.add(box(w + t * 2, t, 0.025), tr(0, -h / 2 - t / 2), col, kind);
  b.add(box(t, h, 0.025), tr(w / 2 + t / 2, 0), col, kind);
  b.add(box(t, h, 0.025), tr(-w / 2 - t / 2, 0), col, kind);
}

function buildProps(floorY: number, R: number) {
  const b = new Builder();

  // ── PERSONAL SHELF ─────────────────────────────────────────────────────────
  b.setAnchor(ANCHOR.shelf);
  const SH = wallFrame(LAYOUT.shelf, R - 0.2, floorY);
  const W = 1.0;
  const H = 1.75;
  b.add(box(0.03, H, 0.32), at(SH, -W / 2, H / 2, 0), WALNUT, 0);
  b.add(box(0.03, H, 0.32), at(SH, W / 2, H / 2, 0), WALNUT, 0);
  b.add(box(W + 0.03, 0.025, 0.33), at(SH, 0, H, 0), WALNUT, 0);
  b.add(box(W, H, 0.015), at(SH, 0, H / 2, -0.155), '#3a2216', 0);
  [0.06, 0.48, 0.9, 1.3].forEach((y) => b.add(box(W - 0.03, 0.025, 0.3), at(SH, 0, y, 0), WALNUT_L, 0));
  // third shelf: a row of books, one leaning, a mug of pens
  let x = -0.44;
  (
    [
      [0.035, 0.24, '#3f4a40'],
      [0.045, 0.27, BURGUNDY],
      [0.03, 0.22, '#cdbba0'],
      [0.04, 0.26, '#4b5a6e'],
      [0.035, 0.23, '#8a5a52'],
    ] as const
  ).forEach(([t, h, c]) => {
    book(b, SH, x + t / 2, 0.9125 + h / 2, 0.0, t, h, 0.2, c);
    x += t + 0.004;
  });
  book(b, SH, x + 0.055, 0.9125 + 0.112, 0.0, 0.032, 0.24, 0.19, '#b98c86', 0, -0.36);
  cup(b, SH, 0.3, 0.9125, 0.03, 0.4);
  b.add(cyl(0.004, 0.004, 0.14, 5), at(SH, 0.29, 0.99, 0.03, 0, 0, 0.18), '#2a2a2a', 4);
  b.add(cyl(0.004, 0.004, 0.13, 5), at(SH, 0.31, 0.985, 0.025, 0, 0, -0.12), BRASS, 4);
  // second shelf: books lying flat, a keepsake box, a little plant
  book(b, SH, -0.28, 0.4925 + 0.025, 0.0, 0.26, 0.05, 0.2, '#6a2633', 0.08);
  book(b, SH, -0.27, 0.4925 + 0.07, 0.0, 0.24, 0.04, 0.19, '#d6c6ac', -0.05);
  b.add(box(0.16, 0.08, 0.12), at(SH, 0.05, 0.4925 + 0.04, 0.02, 0.2), ROSE, 1);
  b.add(box(0.165, 0.015, 0.125), at(SH, 0.05, 0.4925 + 0.087, 0.02, 0.2), ROSE, 1);
  b.add(cyl(0.06, 0.05, 0.1, 18), at(SH, 0.33, 0.4925 + 0.05, 0.0), '#cbb9a3', 2);
  for (let i = 0; i < 7; i++)
    b.add(new THREE.SphereGeometry(1, 8, 6), at(SH, 0.33 + Math.cos(i * 2.4) * 0.03, 0.63 + (i % 3) * 0.03, Math.sin(i * 2.4) * 0.03, i * 2.4, 0, 0.7 + (i % 2) * 0.3, [0.03, 0.09, 0.008]), i % 2 ? '#4f6b45' : SAGE, 1);
  // top shelf: a ceramic jar and a small globe on its stand — and room to spare
  b.add(cyl(0.07, 0.06, 0.18, 20), at(SH, -0.3, 1.3125 + 0.09, 0.0), '#e7dccd', 2);
  b.add(new THREE.SphereGeometry(0.07, 16, 12), at(SH, 0.25, 1.3125 + 0.12, 0.0), '#4b6a78', 2);
  b.add(cyl(0.012, 0.04, 0.05, 10), at(SH, 0.25, 1.3125 + 0.025, 0.0), BRASS, 4);
  // bottom: big books and a box file
  (
    [
      [0.05, 0.36, '#3a3a40'],
      [0.06, 0.38, '#5a3a2c'],
      [0.045, 0.34, '#3f4a40'],
    ] as const
  ).forEach(([t, h, c], i) => book(b, SH, -0.4 + i * 0.065, 0.0725 + h / 2, 0.0, t, h, 0.24, c));
  b.add(box(0.3, 0.26, 0.24), at(SH, 0.22, 0.0725 + 0.13, 0.0, -0.06), '#c9b39a', 3);
  // a basket on the floor beside it, a soft throw folded inside
  b.add(cyl(0.2, 0.17, 0.3, 24, true), at(SH, 0.8, 0.15, 0.2), '#a07a52', 1);
  b.add(cyl(0.17, 0.17, 0.01, 24), at(SH, 0.8, 0.01, 0.2), '#a07a52', 1);
  b.add(pillow(0.32, 0.12, 0.3), at(SH, 0.8, 0.3, 0.2, 0.4), '#c9a7a0', 1);

  // ── WINDOW CORNER ──────────────────────────────────────────────────────────
  b.setAnchor(ANCHOR.window);
  const CH = wallFrame(LAYOUT.chair, R - 1.05, floorY).multiply(new THREE.Matrix4().makeRotationY(0.42));
  for (const [lx, lz] of [
    [-0.3, -0.28],
    [0.3, -0.28],
    [-0.3, 0.28],
    [0.3, 0.28],
  ])
    b.add(cyl(0.022, 0.016, 0.14, 8), at(CH, lx, 0.07, lz), OAK, 0);
  b.add(pillow(0.8, 0.3, 0.76, 0.35), at(CH, 0, 0.29, 0), LINEN, 1);
  b.add(pillow(0.62, 0.13, 0.62, 0.5), at(CH, 0, 0.48, 0.05, 0, 0, 0.02), '#e2d3bf', 1);
  b.add(pillow(0.78, 0.66, 0.2, 0.45), at(CH, 0, 0.74, -0.31, 0, -0.14), LINEN, 1);
  for (const s of [-1, 1]) b.add(pillow(0.16, 0.34, 0.72, 0.45), at(CH, s * 0.36, 0.58, 0.0), LINEN, 1);
  b.add(pillow(0.36, 0.32, 0.1), at(CH, 0.1, 0.68, -0.18, 0.2, -0.3, 0.15), BURGUNDY, 1);
  b.add(pillow(0.26, 0.05, 0.6), at(CH, -0.38, 0.77, 0.05, 0.05), '#b98c86', 1);
  b.add(box(0.03, 0.42, 0.55), at(CH, -0.47, 0.56, 0.06, 0.05, 0, 0.06), '#b98c86', 1);
  b.add(pillow(0.1, 0.06, 0.25), at(CH, -0.12, 0.03, 0.62, 0.2), '#efe2d2', 1);
  b.add(pillow(0.1, 0.06, 0.25), at(CH, 0.06, 0.03, 0.66, -0.15), '#efe2d2', 1);
  const ST = wallFrame(LAYOUT.sideTable, R - 0.55, floorY);
  b.add(cyl(0.25, 0.25, 0.03, 32), at(ST, 0, 0.6, 0), WALNUT_L, 0);
  b.add(cyl(0.035, 0.045, 0.58, 12), at(ST, 0, 0.3, 0), WALNUT, 0);
  b.add(cyl(0.16, 0.19, 0.03, 24), at(ST, 0, 0.015, 0), WALNUT, 0);
  tableLamp(b, ST, 0.615);
  book(b, ST, 0.08, 0.629, 0.12, 0.17, 0.028, 0.23, '#6a2633', 0.6);
  cup(b, ST, -0.12, 0.615, 0.1, 2.2);
  const PL = wallFrame(LAYOUT.plant, R - 0.45, floorY);
  b.add(cyl(0.2, 0.15, 0.42, 26), at(PL, 0, 0.21, 0), '#d2c3ae', 2);
  b.add(cyl(0.012, 0.016, 1.0, 6), at(PL, 0, 0.9, 0, 0, 0, 0.05), '#4a3a2a', 0);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39;
    b.add(new THREE.SphereGeometry(1, 10, 6), at(PL, Math.cos(a) * 0.12, 0.62 + i * 0.055, Math.sin(a) * 0.12, -a, 0, 0.9, [0.08, 0.15, 0.012]), i % 3 ? '#4f6b45' : SAGE, 1);
  }

  // ── FEATURE WALL: sconces and pampas either side of the alcove ─────────────
  b.setAnchor(ANCHOR.feature);
  for (const s of [-1, 1]) {
    const SC = wallFrame(s * LAYOUT.sconce, R - 0.03, floorY);
    b.add(box(0.1, 0.2, 0.02), at(SC, 0, 2.05, 0.01), BRASS, 4);
    b.add(cyl(0.008, 0.008, 0.16, 6), at(SC, 0, 2.08, 0.09, 0, Math.PI / 2), BRASS, 4);
    b.add(cyl(0.07, 0.1, 0.16, 20, true), at(SC, 0, 2.2, 0.17), '#f1dcc0', 5);
    const V = wallFrame(s * 0.33, R - 0.32, floorY);
    b.add(cyl(0.09, 0.13, 0.55, 22), at(V, 0, 0.275, 0), s < 0 ? '#c9b4a0' : '#a88f7a', 2);
    for (let i = 0; i < 9; i++) {
      const lean = (i - 4) * 0.09;
      const len = 0.75 + (i % 3) * 0.18;
      b.add(cyl(0.004, 0.004, len, 4), at(V, -(Math.sin(lean) * len) / 2, 0.55 + (Math.cos(lean) * len) / 2, (i % 2) * 0.04 - 0.02, 0, 0, lean), '#b49a78', 1);
      b.add(new THREE.SphereGeometry(1, 8, 6), at(V, -Math.sin(lean) * len, 0.55 + Math.cos(lean) * len, (i % 2) * 0.04 - 0.02, 0, 0, lean, [0.05, 0.16, 0.05]), '#e3d2b8', 1);
    }
  }

  // ── BIRTHDAY PREP: the sideboard ───────────────────────────────────────────
  b.setAnchor(ANCHOR.prep);
  const SB = wallFrame(LAYOUT.sideboard, R - 0.3, floorY);
  for (const [lx, lz] of [
    [-0.78, -0.16],
    [0.78, -0.16],
    [-0.78, 0.16],
    [0.78, 0.16],
  ])
    b.add(cyl(0.02, 0.014, 0.14, 8), at(SB, lx, 0.07, lz), WALNUT, 0);
  b.add(box(1.66, 0.66, 0.42), at(SB, 0, 0.47, 0), WALNUT, 0);
  b.add(box(1.72, 0.03, 0.46), at(SB, 0, 0.815, 0.01), WALNUT_L, 0);
  for (const dx of [-0.55, 0, 0.55]) {
    b.add(box(0.52, 0.56, 0.012), at(SB, dx, 0.47, 0.215), WALNUT_L, 0);
    b.add(new THREE.SphereGeometry(0.016, 10, 8), at(SB, dx, 0.6, 0.232), BRASS, 4);
  }
  const top = 0.83;
  for (let i = 0; i < 4; i++) b.add(cyl(0.11, 0.09, 0.012, 28), at(SB, -0.55 + (i === 3 ? 0.014 : 0), top + 0.006 + i * 0.013, 0.02 + (i === 3 ? 0.01 : 0)), '#f0e7da', 2);
  for (let i = 0; i < 3; i++) b.add(box(0.012, 0.004, 0.17), at(SB, -0.36 + i * 0.022, top + 0.002, 0.03, 0.05 * i), BRASS, 4);
  b.add(box(0.15, 0.02, 0.15), at(SB, -0.2, top + 0.01, 0.06, 0.1), '#d9aaa6', 1);
  b.add(box(0.15, 0.02, 0.15), at(SB, -0.2, top + 0.03, 0.06, 0.35), '#e7c7c0', 1);
  vaseWithFlowers(b, SB, 0.05, top, -0.08);
  b.add(box(0.24, 0.16, 0.2), at(SB, 0.42, top + 0.08, 0.0, -0.2), '#efe1d2', 3);
  b.add(box(0.245, 0.165, 0.03), at(SB, 0.42, top + 0.081, 0.0, -0.2), BURGUNDY, 1);
  b.add(box(0.03, 0.165, 0.205), at(SB, 0.42, top + 0.081, 0.0, -0.2), BURGUNDY, 1);
  b.add(new THREE.TorusGeometry(0.035, 0.009, 6, 16), at(SB, 0.4, top + 0.175, 0.0, -0.2, 0, 0.5), BURGUNDY, 1);
  b.add(new THREE.TorusGeometry(0.035, 0.009, 6, 16), at(SB, 0.44, top + 0.175, 0.0, -0.2, 0, -0.5), BURGUNDY, 1);
  b.add(new THREE.TorusGeometry(0.05, 0.005, 5, 18, 4.2), at(SB, 0.66, top + 0.006, 0.1, 0.4, Math.PI / 2), BURGUNDY, 1);
  b.add(box(0.1, 0.07, 0.004), at(SB, 0.25, top + 0.035, 0.1, 0.3, -0.2), '#f6ece0', 3);
  b.add(getHeartGeometry('low').clone(), at(SB, 0.25, top + 0.04, 0.103, 0.3, -0.2, 0, [0.012, 0.012, 0.003]), '#b3223c', 3);

  // ── SEATING CORNER ─────────────────────────────────────────────────────────
  b.setAnchor(ANCHOR.seat);
  const LS = wallFrame(LAYOUT.seat, R - 0.75, floorY);
  for (const [lx, lz] of [
    [-0.66, -0.3],
    [0.66, -0.3],
    [-0.66, 0.3],
    [0.66, 0.3],
  ])
    b.add(cyl(0.022, 0.016, 0.13, 8), at(LS, lx, 0.065, lz), OAK, 0);
  b.add(pillow(1.5, 0.3, 0.82, 0.3), at(LS, 0, 0.28, 0), '#e2d2be', 1);
  b.add(pillow(1.48, 0.66, 0.22, 0.4), at(LS, 0, 0.72, -0.33, 0, -0.1), '#e2d2be', 1);
  for (const s of [-1, 1]) b.add(pillow(0.18, 0.4, 0.8, 0.4), at(LS, s * 0.68, 0.55, 0.0), '#e2d2be', 1);
  b.add(pillow(0.6, 0.13, 0.64, 0.5), at(LS, -0.3, 0.47, 0.06), '#e8dacb', 1);
  b.add(pillow(0.6, 0.12, 0.64, 0.5), at(LS, 0.31, 0.465, 0.06, 0, 0, -0.02), '#e8dacb', 1);
  b.add(pillow(0.4, 0.36, 0.11), at(LS, -0.45, 0.72, -0.2, 0.25, -0.25, 0.1), BURGUNDY, 1);
  b.add(pillow(0.36, 0.34, 0.11), at(LS, 0.42, 0.7, -0.19, -0.3, -0.3, -0.22), BLUSH, 1);
  b.add(pillow(0.3, 0.28, 0.09), at(LS, -0.12, 0.7, -0.16, 0.1, -0.3, 0.05), ROSE, 1);
  b.add(pillow(0.55, 0.05, 0.5), at(LS, 0.32, 0.55, 0.08, 0.15), '#b98c86', 1);
  b.add(box(0.5, 0.3, 0.03), at(LS, 0.34, 0.38, 0.4, 0.15, 0.12), '#b98c86', 1);
  const FL = wallFrame(LAYOUT.floorLamp, R - 0.4, floorY);
  b.add(cyl(0.16, 0.18, 0.03, 28), at(FL, 0, 0.015, 0), BRASS, 4);
  b.add(cyl(0.012, 0.012, 1.42, 8), at(FL, 0, 0.73, 0), BRASS, 4);
  b.add(cyl(0.17, 0.25, 0.3, 30, true), at(FL, 0, 1.56, 0), '#f1dcc0', 5);
  const T2 = wallFrame(LAYOUT.seatTable, R - 0.45, floorY);
  b.add(box(0.42, 0.03, 0.42), at(T2, 0, 0.55, 0), WALNUT_L, 0);
  b.add(box(0.36, 0.02, 0.36), at(T2, 0, 0.2, 0), WALNUT_L, 0);
  for (const [lx, lz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ])
    b.add(box(0.03, 0.55, 0.03), at(T2, lx, 0.275, lz), WALNUT, 0);
  book(b, T2, -0.05, 0.581, 0.06, 0.2, 0.032, 0.26, '#3f4a40', -0.3);
  book(b, T2, -0.04, 0.609, 0.05, 0.18, 0.024, 0.24, '#cdbba0', -0.12);
  cup(b, T2, 0.12, 0.565, 0.1, 0.8);
  book(b, T2, 0.0, 0.23, 0.0, 0.26, 0.04, 0.3, '#8a5a52', 0.2);
  // the small photo's frame on the side table
  frameBorder(b, at(T2, 0.1, 0.565 + 0.09, -0.1, -0.35, -0.12), 0.12, 0.16, 0.016, BRASS, 4);
  b.add(box(0.12, 0.16, 0.006), at(T2, 0.1, 0.565 + 0.09, -0.108, -0.35, -0.12), '#2e1d14', 0);
  // the gallery's frames
  for (const f of GALLERY) {
    const t = f.frame === 'gilt' ? 0.02 : 0.026;
    frameBorder(b, galleryFrame(f, R, floorY), f.w, f.h, t, f.frame === 'gilt' ? BRASS : f.frame === 'dark' ? '#2e1d14' : '#e4d6c4', f.frame === 'gilt' ? 4 : 0);
  }
  return b.merge();
}

/** Small, non-identifying pictures. */
function drawPhotos(): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W * PICS;
  c.height = H;
  const g = c.getContext('2d')!;
  const figs = (ox: number, y: number, col: string) => {
    g.fillStyle = col;
    for (const [x, s] of [
      [0.42, 1],
      [0.5, 0.92],
    ]) {
      g.beginPath();
      g.arc(ox + W * x, H * y, 9 * s, 0, Math.PI * 2);
      g.fill();
      g.fillRect(ox + W * x - 8 * s, H * y + 6, 16 * s, 58 * s);
    }
  };
  // 0 — the sea at sunset, two figures close together
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
  g.arc(W * 0.66, H * 0.6, 26, Math.PI, 0);
  g.fill();
  figs(0, 0.68, '#2a1c22');
  // 1 — two cups from above, a heart in the foam
  let o = W;
  g.fillStyle = '#6b4632';
  g.fillRect(o, 0, W, H);
  for (const [px, py] of [
    [0.36, 0.45],
    [0.64, 0.55],
  ]) {
    g.fillStyle = '#f2e6d8';
    g.beginPath();
    g.arc(o + W * px, H * py, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a5a3c';
    g.beginPath();
    g.arc(o + W * px, H * py, 32, 0, Math.PI * 2);
    g.fill();
  }
  const hx0 = o + W * 0.64;
  const hy0 = H * 0.55;
  g.fillStyle = '#f2e6d8';
  g.beginPath();
  g.moveTo(hx0, hy0 + 12);
  g.bezierCurveTo(hx0 - 20, hy0 - 2, hx0 - 10, hy0 - 18, hx0, hy0 - 6);
  g.bezierCurveTo(hx0 + 10, hy0 - 18, hx0 + 20, hy0 - 2, hx0, hy0 + 12);
  g.fill();
  // 2 — mountains under a pale sky
  o = 2 * W;
  grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#9fb3c4');
  grd.addColorStop(1, '#e9d8c4');
  g.fillStyle = grd;
  g.fillRect(o, 0, W, H);
  g.fillStyle = '#6f7f86';
  g.beginPath();
  g.moveTo(o, H * 0.75);
  g.lineTo(o + W * 0.3, H * 0.45);
  g.lineTo(o + W * 0.55, H * 0.7);
  g.lineTo(o + W * 0.75, H * 0.5);
  g.lineTo(o + W, H * 0.72);
  g.lineTo(o + W, H);
  g.lineTo(o, H);
  g.fill();
  g.fillStyle = '#4c5a52';
  g.fillRect(o, H * 0.82, W, H * 0.18);
  // 3 — night, a moon, two silhouettes under it
  o = 3 * W;
  grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#141a33');
  grd.addColorStop(1, '#3a3050');
  g.fillStyle = grd;
  g.fillRect(o, 0, W, H);
  g.fillStyle = '#f3ead6';
  g.beginPath();
  g.arc(o + W * 0.7, H * 0.25, 22, 0, Math.PI * 2);
  g.fill();
  figs(o, 0.66, '#0b0d18');
  // 4 — a heart drawn in the sand
  o = 4 * W;
  g.fillStyle = '#d9c2a0';
  g.fillRect(o, 0, W, H);
  g.fillStyle = 'rgba(120, 90, 60, 0.35)';
  for (let i = 0; i < 40; i++) g.fillRect(o + ((i * 53) % W), (i * 97) % H, 3, 2);
  g.strokeStyle = 'rgba(110, 80, 50, 0.7)';
  g.lineWidth = 6;
  const hx = o + W / 2;
  const hy = H * 0.5;
  g.beginPath();
  g.moveTo(hx, hy + 60);
  g.bezierCurveTo(hx - 100, hy - 10, hx - 50, hy - 90, hx, hy - 30);
  g.bezierCurveTo(hx + 50, hy - 90, hx + 100, hy - 10, hx, hy + 60);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** the dolls'-house cut: a cluster between the camera and the room steps aside */
const CUTAWAY = /* glsl */ `
  uniform float uWallR;
  bool cutAway(vec2 anchor) {
    vec2 cam = cameraPosition.xz;
    return length(cam) > uWallR - 0.6 && dot(anchor, normalize(cam)) > 0.42;
  }
`;
const propVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aKind;
  attribute vec2 aAnchor;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying float vKind;
  ${CUTAWAY}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = aColor;
    vKind = aKind;
    gl_Position = projectionMatrix * viewMatrix * w;
    if (cutAway(aAnchor)) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;
/** The room's light on a surface (shared by the props, the photos and the curtains). */
export const ROOM_LIGHT = /* glsl */ `
  uniform vec4 uLamps[4];
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
    for (int i = 0; i < 4; i++) {
      vec3 L = uLamps[i].xyz - P;
      float d2 = dot(L, L);
      light += vec3(1.0, 0.7, 0.42) * uLamps[i].w * (0.25 + 0.75 * max(dot(n, normalize(L)), 0.0)) * 1.1 / (1.0 + d2 * 1.5);
    }
    for (int i = 0; i < 12; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      vec3 f = vec3(c.x, uFloorY + c.w + 0.08, c.y) - P;
      light += vec3(1.0, 0.62, 0.36) * flickP(t + 20.0, c.z) * max(dot(n, normalize(f)), 0.0) * 0.5 / (1.0 + dot(f, f) * 2.5);
    }
    vec3 H = vec3(0.0, uFloorY + 1.3, 0.0) - P;
    light += vec3(1.0, 0.32, 0.5) * uHeart * max(dot(n, normalize(H)), 0.0) * 0.4 / (1.0 + dot(H, H) * 0.08);
    light += vec3(0.28, 0.38, 0.75) * max(dot(n, uMoonDir), 0.0) * 0.16;
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
    vec3 Hh = normalize(normalize(vec3(-0.3, 0.8, 0.4)) + V);
    if (k > 4.5) {
      // lamp shades: linen glowing from the bulb inside
      float rim = pow(1.0 - abs(dot(n, V)), 2.0);
      col = base * (0.7 + 0.3 * rim) + vec3(1.0, 0.66, 0.36) * 0.16;
    } else if (k < 0.5) {
      // walnut / oak: grain along the piece, satin
      float grain = 0.5 + 0.5 * sin((vWorld.x + vWorld.z) * 60.0 + sin(vWorld.y * 30.0) * 2.0);
      base *= 0.86 + 0.18 * grain;
      col = base * light + vec3(1.0, 0.78, 0.55) * pow(max(dot(n, Hh), 0.0), 24.0) * 0.16 * length(light);
    } else if (k < 1.5) {
      // fabric: a fine weave, a velvet-like sheen at grazing angles
      base *= 0.92 + 0.08 * h3(floor(vWorld * 220.0));
      col = base * light * (1.0 + pow(1.0 - max(dot(n, V), 0.0), 2.5) * 0.6);
    } else if (k < 2.5) {
      // glazed ceramic
      col = base * light + vec3(1.0, 0.85, 0.7) * pow(max(dot(n, Hh), 0.0), 40.0) * 0.4 * length(light);
    } else if (k < 3.5) {
      // paper and book cloth
      col = base * (0.94 + 0.06 * h3(floor(vWorld * 300.0))) * light;
    } else {
      // muted brass, never chrome
      base *= 0.7 + 0.3 * pow(1.0 - max(dot(n, V), 0.0), 2.0);
      col = base * light + vec3(1.0, 0.8, 0.55) * pow(max(dot(n, Hh), 0.0), 30.0) * 0.7 * length(light);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const photoVertex = /* glsl */ `
  attribute vec2 aAnchor;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  ${CUTAWAY}
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
    if (cutAway(aAnchor)) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
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
    vec3 col = texture2D(uMap, vUv).rgb * roomLight(vWorld, n, uTime) * 1.3;
    col += vec3(1.0, 0.85, 0.7) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.25;  // the glass
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
  ${CUTAWAY}
  void main() {
    vec3 p = position;
    float t = uTime * uMotion;
    // breathing in a slow draught from the window, more toward the hem
    p.z += sin(t * 0.6 + p.x * 3.0) * 0.02 * aFree + sin(t * 0.23 + p.x * 1.3) * 0.015 * aFree;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vFold = uv.x;
    gl_Position = projectionMatrix * viewMatrix * w;
    if (cutAway(normalize(modelMatrix[3].xz))) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
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
    float fold = 0.5 + 0.5 * cos(vFold * uFolds * 6.28318);
    vec3 base = vec3(0.74, 0.63, 0.57) * (0.94 + 0.06 * fract(sin(dot(floor(vWorld.xy * 200.0), vec2(12.9, 78.2))) * 43758.5));
    vec3 col = base * roomLight(vWorld, n, uTime) * (0.6 + 0.55 * fold);
    col += vec3(0.25, 0.32, 0.6) * 0.07 * fold;  // moonlight through the linen
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A linen curtain panel: gathered folds, hanging from the rod, its hem free to move. */
function curtainGeometry(width: number, height: number, folds: number, gather: number) {
  const g = new THREE.PlaneGeometry(width, height, folds * 8, 16);
  const p = g.attributes.position as THREE.BufferAttribute;
  const free = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = x / width + 0.5;
    const down = 0.5 - y / height;
    p.setX(i, x * (1 - down * gather)); // not quite symmetrical: gathered back differently
    p.setZ(i, Math.sin(u * folds * Math.PI * 2) * (0.045 + down * 0.025));
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
  const geo = useMemo(() => {
    const merged = buildProps(floorY, wallR);
    // the curtain rod, following the curve of the wall above the window
    const b = new Builder();
    b.setAnchor(ANCHOR.window);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = windowAngle + ((i / 24 - 0.5) * 3.1) / (wallR - 0.3);
      pts.push(new THREE.Vector3(Math.sin(a) * (wallR - 0.3), floorY + 3.0, -Math.cos(a) * (wallR - 0.3)));
    }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6, false), new THREE.Matrix4(), BRASS, 4);
    b.parts.unshift(merged);
    return b.merge();
  }, [floorY, wallR, windowAngle]);
  useEffect(() => () => geo.dispose(), [geo]);

  const light = useMemo(
    () => ({
      uLamps: { value: roomLamps(floorY, wallR) },
      uCandles: { value: candleVec },
      uCount: { value: candleCount },
      uFloorY: { value: floorY },
      uHeart: { value: heart },
      uMoonDir: { value: new THREE.Vector3(Math.sin(windowAngle), 0.35, -Math.cos(windowAngle)).normalize() },
      uTime: { value: 0 },
      uWallR: { value: wallR },
    }),
    [floorY, windowAngle, wallR, candleVec, candleCount], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const propMat = useShader(propVertex, propFragment, light, { opaque: true });

  const photoTex = useMemo(drawPhotos, []);
  useEffect(() => () => photoTex.dispose(), [photoTex]);
  const photoU = useMemo(() => ({ ...light, uMap: { value: photoTex } }), [light, photoTex]);
  const photoMat = useShader(photoVertex, photoFragment, photoU, { opaque: true });
  const photos = useMemo(() => {
    const plane = (w: number, h: number, pic: number, m: THREE.Matrix4) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (pic + uv.getX(i)) / PICS);
      g.applyMatrix4(m);
      const f = g.toNonIndexed();
      g.dispose();
      const n = f.attributes.position.count;
      const anc = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) anc.set([Math.sin(ANCHOR.seat), -Math.cos(ANCHOR.seat)], i * 2);
      f.setAttribute('aAnchor', new THREE.BufferAttribute(anc, 2));
      return f;
    };
    const parts = GALLERY.map((f) => plane(f.w, f.h, f.pic, galleryFrame(f, wallR, floorY).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.005))));
    // and the small one standing on the loveseat's side table
    parts.push(plane(0.12, 0.16, 4, at(wallFrame(LAYOUT.seatTable, wallR - 0.45, floorY), 0.1, 0.565 + 0.09, -0.1, -0.35, -0.12)));
    return mergeAttrs(parts, ['position', 'normal', 'uv', 'aAnchor']);
  }, [floorY, wallR]);
  useEffect(() => () => photos.dispose(), [photos]);

  const curtainU = useMemo(() => ({ ...light, uMotion: { value: motion }, uFolds: { value: 6 } }), [light]); // eslint-disable-line react-hooks/exhaustive-deps
  const curtainMat = useShader(curtainVertex, curtainFragment, curtainU, { opaque: true, side: THREE.DoubleSide });
  const curtains = useMemo(() => [curtainGeometry(0.78, 2.95, 6, 0.14), curtainGeometry(0.7, 2.95, 6, 0.04)], []);
  useEffect(() => () => curtains.forEach((c) => c.dispose()), [curtains]);

  useFrame((state) => {
    light.uTime.value = state.clock.elapsedTime;
    light.uHeart.value += (heart - light.uHeart.value) * 0.05;
    curtainU.uMotion.value = motion;
  });

  const curtainAt = (side: number) => {
    const a = windowAngle + (side * 1.3) / (wallR - 0.25);
    return {
      position: [Math.sin(a) * (wallR - 0.25), floorY + 2.98 - 2.95 / 2, -Math.cos(a) * (wallR - 0.25)] as [number, number, number],
      rotation: [0, -a, 0] as [number, number, number],
    };
  };
  return (
    <group>
      <mesh geometry={geo} material={propMat} />
      <mesh geometry={photos} material={photoMat} />
      {[-1, 1].map((s, i) => (
        <mesh key={s} geometry={curtains[i]} material={curtainMat} {...curtainAt(s)} />
      ))}
    </group>
  );
}
