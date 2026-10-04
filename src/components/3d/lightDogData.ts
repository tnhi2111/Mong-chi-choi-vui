import * as THREE from 'three';
import { buildDog, SHOULDER } from './dogModel';
import { growFur } from './dogFur';
import { bindRun } from './dogRun';

/** Share of the body's points that grow a strand of fur. */
export const FUR_SHARE = 0.5;

/** The intro puppy of light, as plain arrays (built in a worker — see loadLightDog). */
export interface LightDogArrays {
  pos: Float32Array;
  rest: Float32Array;
  run: Float32Array;
  boneA: Float32Array;
  boneB: Float32Array;
  boneW: Float32Array;
  start: Float32Array;
  delay: Float32Array;
  seed: Float32Array;
  anim: Float32Array;
  size: Float32Array;
  color: Float32Array;
}

/**
 * Sample the puppy's surface and fur into points (a few seconds of SDF work — which is why
 * it runs in a worker, so the first moments of the site never freeze on it).
 */
export function buildLightDogArrays(density: number): LightDogArrays {
  const surface = buildDog(Math.round(15000 * density));
  const bound = bindRun(surface, surface.length);
  // a coat of fur strands over the body and legs (dogFur.ts)
  const fur = growFur(surface, bound, FUR_SHARE);
  const dog = [...surface, ...fur.sit];
  const extra = Math.round(260 * density);
  const n = dog.length + extra;
  const pos = new Float32Array(n * 3);
  const start = new Float32Array(n * 3);
  const delay = new Float32Array(n);
  const seed = new Float32Array(n);
  const anim = new Float32Array(n);
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = dog[i];
    if (d) {
      pos.set([d.p.x, d.p.y, d.p.z], i * 3);
      color.set([d.col.r, d.col.g, d.col.b], i * 3);
    }
    // scattered across the sky around (and behind) the puppy, in its local units
    start.set([(Math.random() - 0.5) * 9, (Math.random() - 0.4) * 5, -1 - Math.random() * 3], i * 3);
    delay[i] = Math.random();
    seed[i] = Math.random();
    anim[i] = d ? d.anim : 4;
    size[i] = d ? d.size : 0.8 + Math.pow(Math.random(), 3) * 2.2;
  }
  const run = new Float32Array(n * 3);
  const boneA = new Float32Array(n);
  const boneB = new Float32Array(n);
  const boneW = new Float32Array(n);
  run.set(bound.pos, 0);
  run.set(fur.run.pos, surface.length * 3);
  boneA.set(bound.boneA, 0);
  boneA.set(fur.run.boneA, surface.length);
  boneB.set(bound.boneB, 0);
  boneB.set(fur.run.boneB, surface.length);
  boneW.set(bound.boneW, 0);
  boneW.set(fur.run.boneW, surface.length);
  // Where the waving arm's light goes when the paw comes down: onto the mirror image of
  // the other front leg, point for point (both lists ordered shoulder → paw, so the light
  // flows down the leg instead of scattering). Pads and toe gaps (dark) fade out — a paw
  // standing on the floor doesn't show them.
  const rest = new Float32Array(n * 4);
  const armIdx: number[] = [];
  const legIdx: number[] = [];
  const S = new THREE.Vector3(...SHOULDER);
  const D = new THREE.Vector3(0.17, 0.28, 0.07).normalize();
  const v = new THREE.Vector3();
  dog.forEach((d, i) => {
    if (d.anim > 1.5 && d.anim < 2.5) armIdx.push(i);
    else if (d.part === 'fl' && d.anim < 0.05) legIdx.push(i);
  });
  armIdx.sort((a, b) => v.copy(dog[a].p).sub(S).dot(D) - v.copy(dog[b].p).sub(S).dot(D));
  legIdx.sort((a, b) => dog[b].p.y - dog[a].p.y);
  armIdx.forEach((ai, k) => {
    const li = legIdx[Math.min(legIdx.length - 1, Math.floor((k / Math.max(1, armIdx.length - 1)) * (legIdx.length - 1)))];
    const q = li !== undefined ? dog[li].p : dog[ai].p;
    const c = dog[ai].col;
    const dark = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 0.42 ? 1 : 0;
    rest.set([-q.x, q.y, q.z, dark], ai * 4);
  });
  return { pos, rest, run, boneA, boneB, boneW, start, delay, seed, anim, size, color };
}

export function lightDogGeometry(a: LightDogArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('aRest', new THREE.BufferAttribute(a.rest, 4));
  g.setAttribute('aRun', new THREE.BufferAttribute(a.run, 3));
  g.setAttribute('aBoneA', new THREE.BufferAttribute(a.boneA, 1));
  g.setAttribute('aBoneB', new THREE.BufferAttribute(a.boneB, 1));
  g.setAttribute('aBoneW', new THREE.BufferAttribute(a.boneW, 1));
  g.setAttribute('aStart', new THREE.BufferAttribute(a.start, 3));
  g.setAttribute('aDelay', new THREE.BufferAttribute(a.delay, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(a.seed, 1));
  g.setAttribute('aAnim', new THREE.BufferAttribute(a.anim, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(a.size, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(a.color, 3));
  return g;
}

/** One invisible point with every attribute: lets the shader compile before the puppy is ready. */
export function emptyLightDogGeometry(): THREE.BufferGeometry {
  const one = (k: number) => new Float32Array(k);
  return lightDogGeometry({ pos: one(3), rest: one(4), run: one(3), boneA: one(1), boneB: one(1), boneW: one(1), start: one(3), delay: one(1), seed: one(1), anim: one(1), size: one(1), color: one(3) });
}

const pending = new Map<number, Promise<LightDogArrays>>();

/** The puppy's points, built once per density in a worker (main-thread fallback). */
export function loadLightDog(density: number): Promise<LightDogArrays> {
  const hit = pending.get(density);
  if (hit) return hit;
  const p = new Promise<LightDogArrays>((resolve) => {
    try {
      const w = new Worker(new URL('./lightDog.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<LightDogArrays>) => {
        resolve(e.data);
        w.terminate();
      };
      w.onerror = () => {
        w.terminate();
        resolve(buildLightDogArrays(density));
      };
      w.postMessage(density);
    } catch {
      resolve(buildLightDogArrays(density));
    }
  });
  pending.set(density, p);
  return p;
}
