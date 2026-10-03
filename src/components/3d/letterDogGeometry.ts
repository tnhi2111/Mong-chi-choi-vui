import * as THREE from 'three';
import { buildLetterDog, toGeometry, type LetterDogData } from './letterDogModel';

export interface LetterDogGeometry {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
}

let ready: LetterDogGeometry | null = null;
let pending: Promise<LetterDogGeometry> | null = null;

const wrap = (d: LetterDogData): LetterDogGeometry => ({ body: toGeometry(d.body), head: toGeometry(d.head), jaw: toGeometry(d.jaw), tail: toGeometry(d.tail) });

/**
 * The puppy's meshes. Sculpted once, in a worker (started early — during the welcome —
 * by Prewarm, so it is ready long before the room opens). Falls back to building on the
 * main thread if workers are unavailable.
 */
export function loadLetterDog(): Promise<LetterDogGeometry> {
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;
  pending = new Promise<LetterDogData>((resolve) => {
    try {
      const w = new Worker(new URL('./letterDog.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<LetterDogData>) => {
        resolve(e.data);
        w.terminate();
      };
      w.onerror = () => {
        w.terminate();
        resolve(buildLetterDog());
      };
    } catch {
      resolve(buildLetterDog());
    }
  }).then((d) => (ready = wrap(d)));
  return pending;
}

export function letterDogReady(): LetterDogGeometry | null {
  return ready;
}
