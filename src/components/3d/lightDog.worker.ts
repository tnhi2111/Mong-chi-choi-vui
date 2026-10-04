/// <reference lib="webworker" />
import { buildLightDogArrays } from './lightDogData';

// Sample the intro puppy of light off the main thread, and hand the arrays back without copying.
self.onmessage = (e: MessageEvent<number>) => {
  const a = buildLightDogArrays(e.data);
  const transfer = Object.values(a).map((x: Float32Array) => x.buffer);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(a, transfer);
};
