import * as THREE from 'three';

/**
 * A rope of Verlet points (ribbons, balloon strings, the fairy-light cable): positions only,
 * velocity is what moved last step, and the segments are kept their length by a few passes of
 * relaxation. A few dozen lines instead of a physics library — ropes are all the room needs,
 * and this one is stable at any frame time (fixed substeps), cheap (a few hundred points in
 * the whole room) and easy to push with her hand.
 *
 * Why Verlet and not springs: a spring rope stretches and wobbles like elastic; a constrained
 * Verlet rope keeps its length, so it hangs, swings and drapes like cloth tape or string.
 */
export interface RopeOptions {
  /** Number of points (segments + 1). */
  points: number;
  /** Rest length of each segment (m). */
  segment: number;
  /** Gravity along y (m/s²): negative hangs, positive floats (a balloon string's lift). */
  gravity?: number;
  /** Fraction of velocity kept per second (air drag). */
  damping?: number;
  /** Relaxation passes per substep (more = stiffer). */
  iterations?: number;
  /** Optional floor height: points never go below it. */
  floor?: number;
}

const SUBSTEP = 1 / 120;

export class Rope {
  readonly p: Float32Array;
  readonly prev: Float32Array;
  readonly pinned: boolean[];
  readonly n: number;
  segment: number;
  gravity: number;
  damping: number;
  iterations: number;
  floor: number;
  private acc = 0;
  /** Spheres the rope rests on / drapes over (xyz, r). */
  readonly colliders: THREE.Vector4[] = [];
  /** A box the rope drapes over (min, max) — the gift box's top and sides. */
  box: THREE.Box3 | null = null;

  constructor(start: THREE.Vector3, dir: THREE.Vector3, o: RopeOptions) {
    this.n = o.points;
    this.segment = o.segment;
    this.gravity = o.gravity ?? -9.8;
    this.damping = o.damping ?? 0.35;
    this.iterations = o.iterations ?? 6;
    this.floor = o.floor ?? -Infinity;
    this.p = new Float32Array(this.n * 3);
    this.prev = new Float32Array(this.n * 3);
    this.pinned = Array.from({ length: this.n }, () => false);
    const d = dir.clone().normalize();
    for (let i = 0; i < this.n; i++) {
      this.p[i * 3] = start.x + d.x * this.segment * i;
      this.p[i * 3 + 1] = start.y + d.y * this.segment * i;
      this.p[i * 3 + 2] = start.z + d.z * this.segment * i;
    }
    this.prev.set(this.p);
  }

  /** Pin point `i` at `at` (it moves with whatever holds it). */
  pin(i: number, at: THREE.Vector3) {
    this.pinned[i] = true;
    this.p[i * 3] = at.x;
    this.p[i * 3 + 1] = at.y;
    this.p[i * 3 + 2] = at.z;
  }

  get(i: number, out: THREE.Vector3) {
    return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
  }

  /**
   * A push from her hand: every point within `radius` of `at` is moved by `push` × falloff
   * (a displacement, not a force — Verlet turns it into velocity on its own).
   */
  nudge(at: THREE.Vector3, push: THREE.Vector3, radius: number) {
    const r2 = radius * radius;
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      const dx = this.p[i * 3] - at.x;
      const dy = this.p[i * 3 + 1] - at.y;
      const dz = this.p[i * 3 + 2] - at.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const f = (1 - Math.sqrt(d2) / radius) ** 2;
      this.p[i * 3] += push.x * f;
      this.p[i * 3 + 1] += push.y * f;
      this.p[i * 3 + 2] += push.z * f;
    }
  }

  /** Advance by dt (fixed substeps, so a slow frame never blows it up). `wind` is m/s². */
  step(dt: number, wind?: THREE.Vector3) {
    this.acc = Math.min(this.acc + Math.min(dt, 0.1), 0.1);
    while (this.acc >= SUBSTEP) {
      this.acc -= SUBSTEP;
      this.integrate(SUBSTEP, wind);
      for (let k = 0; k < this.iterations; k++) this.relax();
    }
  }

  private integrate(h: number, wind?: THREE.Vector3) {
    const keep = Math.pow(this.damping, h);
    const g = this.gravity * h * h;
    const wx = (wind?.x ?? 0) * h * h;
    const wy = (wind?.y ?? 0) * h * h;
    const wz = (wind?.z ?? 0) * h * h;
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      const j = i * 3;
      const x = this.p[j];
      const y = this.p[j + 1];
      const z = this.p[j + 2];
      this.p[j] = x + (x - this.prev[j]) * keep + wx;
      this.p[j + 1] = y + (y - this.prev[j + 1]) * keep + g + wy;
      this.p[j + 2] = z + (z - this.prev[j + 2]) * keep + wz;
      this.prev[j] = x;
      this.prev[j + 1] = y;
      this.prev[j + 2] = z;
    }
  }

  private relax() {
    const L = this.segment;
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 3;
      const b = a + 3;
      const dx = this.p[b] - this.p[a];
      const dy = this.p[b + 1] - this.p[a + 1];
      const dz = this.p[b + 2] - this.p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const diff = (d - L) / d;
      const pa = this.pinned[i];
      const pb = this.pinned[i + 1];
      if (pa && pb) continue;
      const wa = pa ? 0 : pb ? 1 : 0.5;
      const wb = pb ? 0 : pa ? 1 : 0.5;
      this.p[a] += dx * diff * wa;
      this.p[a + 1] += dy * diff * wa;
      this.p[a + 2] += dz * diff * wa;
      this.p[b] -= dx * diff * wb;
      this.p[b + 1] -= dy * diff * wb;
      this.p[b + 2] -= dz * diff * wb;
    }
    // collisions: the floor, round things, and the box it is draped over
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      const j = i * 3;
      if (this.p[j + 1] < this.floor) this.p[j + 1] = this.floor;
      for (const c of this.colliders) {
        const dx = this.p[j] - c.x;
        const dy = this.p[j + 1] - c.y;
        const dz = this.p[j + 2] - c.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < c.w && d > 1e-6) {
          const k = c.w / d;
          this.p[j] = c.x + dx * k;
          this.p[j + 1] = c.y + dy * k;
          this.p[j + 2] = c.z + dz * k;
        }
      }
      const b = this.box;
      if (b) {
        const x = this.p[j];
        const y = this.p[j + 1];
        const z = this.p[j + 2];
        if (x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z) {
          // out by the nearest face (the ribbon lies on the lid or hangs down a side)
          const dxl = x - b.min.x;
          const dxh = b.max.x - x;
          const dyh = b.max.y - y;
          const dzl = z - b.min.z;
          const dzh = b.max.z - z;
          const m = Math.min(dxl, dxh, dyh, dzl, dzh);
          if (m === dyh) this.p[j + 1] = b.max.y;
          else if (m === dxl) this.p[j] = b.min.x;
          else if (m === dxh) this.p[j] = b.max.x;
          else if (m === dzl) this.p[j + 2] = b.min.z;
          else this.p[j + 2] = b.max.z;
        }
      }
    }
  }
}

/** A tube along a rope, rebuilt in place each frame (a ribbon or a string). */
export class RopeTube {
  readonly geometry: THREE.BufferGeometry;
  private sides: number;
  private n: number;
  private width: number;
  private thick: number;
  private flat: boolean;
  private tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), bn: new THREE.Vector3() };

  /** `flat`: a satin band `width` wide and `thick` thick; otherwise a round string of radius `width`. */
  constructor(points: number, width: number, { flat = false, thick = 0.004, sides = 6 } = {}) {
    this.n = points;
    this.width = width;
    this.thick = thick;
    this.flat = flat;
    this.sides = flat ? 4 : sides;
    const g = new THREE.BufferGeometry();
    const verts = points * this.sides;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const uv = new Float32Array(verts * 2);
    for (let i = 0; i < points; i++) for (let s = 0; s < this.sides; s++) {
      uv[(i * this.sides + s) * 2] = s / this.sides;
      uv[(i * this.sides + s) * 2 + 1] = i / (points - 1);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < points - 1; i++)
      for (let s = 0; s < this.sides; s++) {
        const a = i * this.sides + s;
        const b = i * this.sides + ((s + 1) % this.sides);
        const c = a + this.sides;
        const d = b + this.sides;
        idx.push(a, c, b, b, c, d);
      }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    this.geometry = g;
  }

  /** Rebuild from the rope (world positions — draw the mesh with an identity transform). */
  /** `side` (flat bands): the direction the band's width keeps where it can — projected off
   *  the rope's tangent, so a tail lying on a lid and then hanging down its front stays flat to
   *  both faces instead of turning on edge where the tangent crosses `twist`. */
  update(rope: Rope, twist = new THREE.Vector3(0, 1, 0), side?: THREE.Vector3) {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const nor = this.geometry.attributes.normal as THREE.BufferAttribute;
    const { a, b, t, n, bn } = this.tmp;
    for (let i = 0; i < this.n; i++) {
      rope.get(i, a);
      rope.get(Math.min(this.n - 1, i + 1), b);
      if (i === this.n - 1) rope.get(i - 1, t).sub(a).negate();
      else t.copy(b).sub(a);
      t.normalize();
      // a frame round the rope that keeps `twist` as its "up" where it can (a satin band
      // lies flat, it does not corkscrew)
      if (side && this.flat) n.copy(side).addScaledVector(t, -side.dot(t));
      else n.crossVectors(t, twist);
      if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
      n.normalize();
      bn.crossVectors(n, t).normalize();
      for (let s = 0; s < this.sides; s++) {
        const k = i * this.sides + s;
        if (this.flat) {
          const sx = s === 0 || s === 3 ? -1 : 1;
          const sy = s < 2 ? 1 : -1;
          pos.setXYZ(k, a.x + n.x * sx * this.width * 0.5 + bn.x * sy * this.thick * 0.5, a.y + n.y * sx * this.width * 0.5 + bn.y * sy * this.thick * 0.5, a.z + n.z * sx * this.width * 0.5 + bn.z * sy * this.thick * 0.5);
          nor.setXYZ(k, bn.x * sy, bn.y * sy, bn.z * sy);
        } else {
          const ang = (s / this.sides) * Math.PI * 2;
          const cx = Math.cos(ang);
          const cy = Math.sin(ang);
          const nx = n.x * cx + bn.x * cy;
          const ny = n.y * cx + bn.y * cy;
          const nz = n.z * cx + bn.z * cy;
          pos.setXYZ(k, a.x + nx * this.width, a.y + ny * this.width, a.z + nz * this.width);
          nor.setXYZ(k, nx, ny, nz);
        }
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}
