import * as THREE from 'three';

/*
 * The letter-carrier: a small, fluffy spaniel-like golden puppy, standing in a
 * three-quarter pose with a love letter held crosswise in its mouth.
 *
 * Unlike the intro's puppy of light, this one is SOLID — a lit character standing in
 * the gift room with the gifts, candles and floor. Its body is sculpted as a signed
 * distance field (ellipsoids and tapered round cones melted together with a smooth
 * union) and turned into a smooth mesh by a small "surface nets" mesher, once, so
 * head, cheeks, chest, legs and paws flow into each other like a modelled character
 * instead of a stack of spheres. Normals come from the field's gradient (silky
 * shading), colours from whichever part each vertex belongs to, with soft fur streaks.
 *
 * Three pieces move independently: the body (it breathes), the head (it turns toward
 * her, tilts, lifts the letter) and the tail (it wags). Local units: feet at y = 0,
 * facing +z, about 1.05 tall.
 */

export type V3 = [number, number, number];
type Col = 'gold' | 'deep' | 'cream' | 'pale' | 'lip' | 'gum' | 'tooth' | 'tongue' | 'cavity';

interface Ell {
  kind: 'e';
  c: V3;
  r: V3;
  /** rotation (radians); only Z (a tilt) is used */
  rot?: V3;
}
interface Cone {
  kind: 'c';
  a: V3;
  b: V3;
  r1: number;
  r2: number;
}
/** `sub`: carved away from the surface (a smooth subtraction) — the mouth's opening; the carved walls take its colour. */
type Part = (Ell | Cone) & { col: Col; k?: number; streak?: 'ear' | 'coat'; sub?: boolean };

/** Where the head turns, and its resting pose: nose lifted a little, a gentle tilt. */
export const HEAD_PIVOT: V3 = [0, 0.74, 0.25];
export const HEAD_REST: V3 = [-0.12, 0.0, 0.13]; // x (lift, nose up), y (turn), z (tilt)
export const TAIL_PIVOT: V3 = [0, 0.5, -0.33];

// ── the body (with neck): gold coat, cream chest, belly and paws ────────────
const BODY: Part[] = [
  { kind: 'e', c: [0, 0.42, -0.04], r: [0.19, 0.185, 0.33], col: 'gold' },
  { kind: 'e', c: [0, 0.46, 0.19], r: [0.17, 0.2, 0.15], col: 'cream', k: 0.08, streak: 'coat' }, // chest ruff
  { kind: 'e', c: [0, 0.3, 0.0], r: [0.14, 0.08, 0.22], col: 'pale', k: 0.08, streak: 'coat' }, // feathered belly
  { kind: 'c', a: [0, 0.52, 0.16], b: [0, 0.76, 0.26], r1: 0.125, r2: 0.108, col: 'gold', k: 0.07 }, // neck
  // front legs and paws
  ...[-1, 1].flatMap((s): Part[] => [
    { kind: 'c', a: [s * 0.095, 0.38, 0.19], b: [s * 0.1, 0.07, 0.235], r1: 0.066, r2: 0.053, col: 'gold', k: 0.05 },
    { kind: 'e', c: [s * 0.1, 0.045, 0.272], r: [0.064, 0.046, 0.082], col: 'cream', k: 0.03 },
  ]),
  // haunches, back legs, paws
  ...[-1, 1].flatMap((s): Part[] => [
    { kind: 'e', c: [s * 0.115, 0.37, -0.25], r: [0.088, 0.15, 0.14], col: 'gold', k: 0.06 },
    { kind: 'c', a: [s * 0.12, 0.28, -0.31], b: [s * 0.12, 0.07, -0.26], r1: 0.06, r2: 0.05, col: 'gold', k: 0.05 },
    { kind: 'e', c: [s * 0.12, 0.045, -0.225], r: [0.06, 0.045, 0.074], col: 'cream', k: 0.03 },
  ]),
];

// ── the head (posed about HEAD_PIVOT): skull, muzzle, cheeks, long silky ears ──
const HEAD: Part[] = [
  { kind: 'e', c: [0, 0.875, 0.32], r: [0.158, 0.148, 0.152], col: 'gold' },
  // the muzzle grows out of the skull as one tapering volume (no seam where it meets it)
  { kind: 'c', a: [0, 0.842, 0.37], b: [0, 0.818, 0.51], r1: 0.084, r2: 0.058, col: 'cream', k: 0.07 },
  { kind: 'e', c: [0, 0.832, 0.47], r: [0.064, 0.042, 0.075], col: 'cream', k: 0.05 }, // the bridge
  // soft, slightly raised cheeks — not quite the same on both sides
  { kind: 'e', c: [-0.075, 0.802, 0.41], r: [0.07, 0.064, 0.07], col: 'cream', k: 0.06 },
  { kind: 'e', c: [0.077, 0.8, 0.412], r: [0.071, 0.063, 0.07], col: 'cream', k: 0.06 },
  ...[-1, 1].map((s): Part => ({ kind: 'e', c: [s * 0.062, 0.928, 0.425], r: [0.05, 0.035, 0.04], col: 'pale', k: 0.05 })), // soft brows
  // the upper lips: they hang from the muzzle's sides and frame the mouth, their edges
  // darkly pigmented, curving up a little at the corners (a soft, relaxed smile)
  { kind: 'e', c: [-0.041, 0.779, 0.49], r: [0.031, 0.021, 0.05], col: 'cream', k: 0.03 },
  { kind: 'e', c: [0.043, 0.778, 0.489], r: [0.032, 0.022, 0.05], col: 'cream', k: 0.03 },
  { kind: 'e', c: [-0.041, 0.7635, 0.49], r: [0.031, 0.009, 0.05], col: 'lip', k: 0.01 },
  { kind: 'e', c: [0.043, 0.7625, 0.489], r: [0.032, 0.009, 0.05], col: 'lip', k: 0.01 },
  ...[-1, 1].map((s): Part => ({ kind: 'e', c: [s * 0.062, 0.772, 0.452], r: [0.008, 0.009, 0.012], col: 'lip', k: 0.012 })), // the corners, lifted
  // the nose sits in its own dark leather
  { kind: 'e', c: [0, 0.836, 0.553], r: [0.028, 0.019, 0.016], col: 'lip', k: 0.02 },
  // (the ears are their own meshes now — see EAR — so they can swing after the head)
  // the ear roots stay in the skull, so the hinge is hidden in the fur
  ...[-1, 1].map((s): Part => ({ kind: 'e', c: [s * 0.142, 0.89, 0.3], r: [0.036, 0.06, 0.06], rot: [0, 0, s * 0.25], col: 'deep', k: 0.035, streak: 'ear' })),
  // the mouth: a real recess under the muzzle, between the lips, where the jaw closes
  { kind: 'e', c: [0, 0.761, 0.47], r: [0.05, 0.012, 0.074], col: 'cavity', sub: true, k: 0.012 },
];

/** Long, thin ears hanging from high on the sides of the head: a root, a broad drop, a heavy lobe. */
export const EAR_PIVOT = (s: number): V3 => [s * 0.15, 0.905, 0.3];
const earParts = (s: number): Part[] => [
  { kind: 'e', c: [s * 0.148, 0.885, 0.3], r: [0.04, 0.075, 0.075], rot: [0, 0, s * 0.25], col: 'deep', k: 0.035, streak: 'ear' },
  { kind: 'e', c: [s * 0.178, 0.745, 0.315], r: [0.042, 0.13, 0.088], rot: [0, 0, s * 0.12], col: 'deep', k: 0.05, streak: 'ear' },
  { kind: 'e', c: [s * 0.185, 0.6, 0.325], r: [0.048, 0.075, 0.085], rot: [0, 0, s * 0.05], col: 'deep', k: 0.05, streak: 'ear' },
];

// ── the lower jaw (hinged at JAW_PIVOT): chin and lower lip — it opens to let the letter go ──
export const JAW_PIVOT: V3 = [0, 0.79, 0.37];
const JAW: Part[] = [
  { kind: 'e', c: [0, 0.756, 0.44], r: [0.058, 0.03, 0.074], col: 'cream' },
  { kind: 'e', c: [0, 0.748, 0.468], r: [0.04, 0.02, 0.05], col: 'cream', k: 0.03 }, // the chin
  { kind: 'e', c: [0, 0.771, 0.468], r: [0.05, 0.0075, 0.066], col: 'lip', k: 0.01 }, // the lower lip
  // the floor of the mouth is hollowed out, dark inside, rimmed by the lower lip…
  { kind: 'e', c: [0, 0.79, 0.43], r: [0.043, 0.016, 0.06], col: 'cavity', sub: true, k: 0.01 },
  // …and the tongue lies in it
  { kind: 'e', c: [0.002, 0.776, 0.45], r: [0.029, 0.0095, 0.05], col: 'tongue', k: 0.008 },
];

// ── the tail: a plume curling up behind ──────────────────────────────────────
// up and back off the rump, then curling forward over the back — a full, feathered plume
const TAIL_SPINE: V3[] = [TAIL_PIVOT, [0, 0.63, -0.45], [0.01, 0.77, -0.45], [0.02, 0.85, -0.35], [0.03, 0.84, -0.23]];
const TAIL_R = [0.05, 0.068, 0.07, 0.056, 0.03];
const TAIL: Part[] = TAIL_SPINE.slice(1).map((b, i) => ({ kind: 'c', a: TAIL_SPINE[i], b, r1: TAIL_R[i], r2: TAIL_R[i + 1], col: i > 3 ? 'pale' : 'gold', k: 0.06, streak: 'coat' }));

const COLORS: Record<Col, THREE.Color> = {
  gold: new THREE.Color('#d99a4e'),
  deep: new THREE.Color('#b9722f'),
  cream: new THREE.Color('#f4dcb4'),
  pale: new THREE.Color('#ebc58a'),
  // the face's own skin: dark pigmented lips and nose leather, pink gums, ivory teeth
  lip: new THREE.Color('#3b1e17'),
  gum: new THREE.Color('#b8606c'),
  tooth: new THREE.Color('#efe4d3'),
  tongue: new THREE.Color('#d8667c'),
  cavity: new THREE.Color('#3c1416'),
};
const SKIN: Col[] = ['lip', 'gum', 'tooth', 'tongue', 'cavity'];

// ── distance functions ───────────────────────────────────────────────────────
function sdEll(x: number, y: number, z: number, e: Ell): number {
  let px = x - e.c[0];
  let py = y - e.c[1];
  const pz = z - e.c[2];
  // (only a tilt about Z is used: the ears hang slightly outward)
  if (e.rot && e.rot[2]) {
    const c = Math.cos(-e.rot[2]);
    const s = Math.sin(-e.rot[2]);
    [px, py] = [px * c - py * s, px * s + py * c];
  }
  const qx = px / e.r[0];
  const qy = py / e.r[1];
  const qz = pz / e.r[2];
  const k0 = Math.hypot(qx, qy, qz);
  const k1 = Math.hypot(qx / e.r[0], qy / e.r[1], qz / e.r[2]);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}

/** Round cone (iq): a capsule whose radius tapers from r1 at a to r2 at b. */
function sdCone(x: number, y: number, z: number, s: Cone): number {
  const bax = s.b[0] - s.a[0];
  const bay = s.b[1] - s.a[1];
  const baz = s.b[2] - s.a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = s.r1 - s.r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - s.a[0];
  const pay = y - s.a[1];
  const paz = z - s.a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const xvx = pax * l2 - bax * yy;
  const xvy = pay * l2 - bay * yy;
  const xvz = paz * l2 - baz * yy;
  const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - s.r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - s.r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - s.r1;
}

const sdPart = (x: number, y: number, z: number, p: Part) => (p.kind === 'e' ? sdEll(x, y, z, p) : sdCone(x, y, z, p));

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** A part's bounding box, grown by its blend radius (outside it, the part can't matter). */
function bounds(p: Part): [number, number, number, number, number, number] {
  const m = (p.k ?? 0.04) + 0.02;
  if (p.kind === 'e') {
    const r = Math.max(p.r[0], p.r[1], p.r[2]) + m;
    return [p.c[0] - r, p.c[1] - r, p.c[2] - r, p.c[0] + r, p.c[1] + r, p.c[2] + r];
  }
  const r = Math.max(p.r1, p.r2) + m;
  return [
    Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r,
    Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r,
  ];
}

function field(parts: Part[]) {
  const boxes = parts.map(bounds);
  return (x: number, y: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const b = boxes[i];
      if (x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) continue;
      const di = sdPart(x, y, z, parts[i]);
      if (parts[i].sub) {
        // carve: a smooth subtraction (−smin(−d, di))
        if (d !== Infinity) d = -smin(-d, di, parts[i].k ?? 0.01);
        continue;
      }
      d = d === Infinity ? di : smin(d, di, parts[i].k ?? 0.04);
    }
    // far from every part: any clearly-outside value will do
    return d === Infinity ? 0.1 : d;
  };
}

/** One part's own colour at a point: its base tone with soft fur streaks (none on bare skin). */
function partColour(p: Part, x: number, y: number, z: number, c: THREE.Color) {
  c.copy(COLORS[p.col]);
  if (SKIN.includes(p.col)) return;
  // fur: long soft streaks running down (ears) or along the coat, a lighter crown and back
  let l = 0;
  if (p.streak === 'ear') l += Math.sin(z * 140 + Math.sin(y * 30) * 2.2) * 0.05 - (0.9 - y) * 0.12;
  else if (p.streak === 'coat') l += Math.sin(x * 120 + Math.sin(y * 40) * 1.5) * 0.035;
  else l += Math.sin(x * 70 + z * 35 + Math.sin(y * 25) * 1.5) * 0.025;
  l += (y - 0.5) * 0.06 - Math.max(0, 0.18 - y) * 0.15;
  c.offsetHSL(0, -0.02, l);
}

// ── surface nets: a smooth mesh from a distance field ───────────────────────
function mesh(parts: Part[], min: V3, max: V3, cell: number): THREE.BufferGeometry {
  const f = field(parts);
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const val = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) val[at(i, j, k)] = f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);

  // one vertex per cube that the surface passes through: the mean of its edge crossings
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let neg = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          cv[c] = val[at(i + a, j + b, k + d)];
          if (cv[c] < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const v0 = cv[e0];
          const v1 = cv[e1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          const [a0, b0, d0] = corners[e0];
          const [a1, b1, d1] = corners[e1];
          sx += a0 + (a1 - a0) * t;
          sy += b0 + (b1 - b0) * t;
          sz += d0 + (d1 - d0) * t;
          n++;
        }
        vid[cat(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }

  // a quad across every grid edge the surface crosses, joining the 4 cubes around it
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v = val[at(i, j, k)] < 0;
        if (v !== val[at(i + 1, j, k)] < 0 && i < nx - 1) quad(vid[cat(i, j - 1, k - 1)], vid[cat(i, j, k - 1)], vid[cat(i, j, k)], vid[cat(i, j - 1, k)]);
        if (v !== val[at(i, j + 1, k)] < 0 && j < ny - 1) quad(vid[cat(i - 1, j, k - 1)], vid[cat(i - 1, j, k)], vid[cat(i, j, k)], vid[cat(i, j, k - 1)]);
        if (v !== val[at(i, j, k + 1)] < 0 && k < nz - 1) quad(vid[cat(i - 1, j - 1, k)], vid[cat(i, j - 1, k)], vid[cat(i, j, k)], vid[cat(i - 1, j, k)]);
      }

  // normals from the field's gradient; colours softly blended from the nearby parts
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const h = cell * 0.6;
  const c = new THREE.Color();
  const acc = new THREE.Color();
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const gx = f(x + h, y, z) - f(x - h, y, z);
    const gy = f(x, y + h, z) - f(x, y - h, z);
    const gz = f(x, y, z + h) - f(x, y, z - h);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor.set([gx / gl, gy / gl, gz / gl], v * 3);
    // colour: a soft blend of the nearby parts (no hard, stair-stepped borders between
    // gold and cream fur, or where the lips' and nose's dark skin meets the fur)
    let dmin = Infinity;
    for (const q of parts) if (!q.sub) dmin = Math.min(dmin, sdPart(x, y, z, q));
    let wsum = 0;
    acc.setRGB(0, 0, 0);
    let carved = false;
    for (const q of parts) {
      // (a part added after a carve sits inside it — the tongue in the mouth — and wins there)
      const late = carved && !q.sub;
      if (q.sub) carved = true;
      const soft = q.sub ? 0.003 : SKIN.includes(q.col) ? 0.0022 : 0.006;
      // a carve colours the walls it leaves (everything on or near its boundary)
      const dd = q.sub ? Math.max(0, sdPart(x, y, z, q)) : sdPart(x, y, z, q) - dmin;
      if (dd > soft * 6) continue;
      const w = Math.exp(-dd / soft) * (q.sub ? 30 : late ? 200 : 1);
      partColour(q, x, y, z, c);
      acc.r += c.r * w;
      acc.g += c.g * w;
      acc.b += c.b * w;
      wsum += w;
    }
    c.setRGB(acc.r / wsum, acc.g / wsum, acc.b / wsum);
    col.set([c.r, c.g, c.b], v * 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // wind every triangle to face outward (the field's gradient says which way that is)
  const ia = new Uint32Array(idx);
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();
  for (let t = 0; t < ia.length; t += 3) {
    const [a, b, d] = [ia[t], ia[t + 1], ia[t + 2]];
    e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
    e2.set(pos[d * 3] - pos[a * 3], pos[d * 3 + 1] - pos[a * 3 + 1], pos[d * 3 + 2] - pos[a * 3 + 2]);
    fn.crossVectors(e1, e2);
    const nn = nor[a * 3] * fn.x + nor[a * 3 + 1] * fn.y + nor[a * 3 + 2] * fn.z;
    if (nn < 0) {
      ia[t + 1] = d;
      ia[t + 2] = b;
    }
  }
  g.setIndex(new THREE.BufferAttribute(ia, 1));
  g.computeBoundingSphere();
  return g;
}

/** The raw arrays of one mesh — plain data, so a worker can build it and hand it over. */
export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
}
export interface LetterDogData {
  body: MeshData;
  head: MeshData;
  jaw: MeshData;
  tail: MeshData;
  earL: MeshData;
  earR: MeshData;
}

function toData(g: THREE.BufferGeometry): MeshData {
  return {
    position: g.attributes.position.array as Float32Array,
    normal: g.attributes.normal.array as Float32Array,
    color: g.attributes.color.array as Float32Array,
    index: g.index!.array as Uint32Array,
  };
}

/** Sculpt the puppy (CPU-heavy: run it in a worker — see letterDog.worker.ts). */
export function buildLetterDog(): LetterDogData {
  return {
    body: toData(mesh(BODY, [-0.3, -0.02, -0.5], [0.3, 0.84, 0.42], 0.0135)),
    // the head is sculpted in its own frame, then turned to its resting pose by its group;
    // finer, because that is where she looks
    head: toData(mesh(HEAD, [-0.28, 0.48, 0.12], [0.28, 1.06, 0.6], 0.0095)),
    // (finer: the teeth and the lip's edge are small)
    jaw: toData(mesh(JAW, [-0.075, 0.71, 0.35], [0.075, 0.8, 0.56], 0.0042)),
    tail: toData(mesh(TAIL, [-0.14, 0.42, -0.62], [0.17, 1.03, -0.2], 0.0135)),
    earL: toData(mesh(earParts(-1), [-0.26, 0.5, 0.2], [-0.09, 0.98, 0.43], 0.0085)),
    earR: toData(mesh(earParts(1), [0.09, 0.5, 0.2], [0.26, 0.98, 0.43], 0.0085)),
  };
}

export function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Features on the face, in head space (before the head's pose). */
export const FACE = {
  eyes: [
    [-0.066, 0.897, 0.452],
    [0.066, 0.897, 0.452],
  ] as V3[],
  eyeR: 0.027,
  nose: [0, 0.838, 0.56] as V3,
  /** The letter, held crosswise in the mouth: its top edge sits between the jaws. */
  letter: { c: [0.0, 0.69, 0.555] as V3, rot: [0.16, 0, -0.12] as V3, w: 0.27, h: 0.175, t: 0.012 },
  /** Inside the mouth (dark) and the tongue — seen only when the jaw opens. */
  mouth: { c: [0, 0.772, 0.44] as V3, r: [0.042, 0.013, 0.055] as V3 },
  tongue: { c: [0, 0.776, 0.468] as V3, r: [0.034, 0.011, 0.05] as V3 },
  collar: { c: [0, 0.6, 0.205] as V3, r: 0.122 },
};
