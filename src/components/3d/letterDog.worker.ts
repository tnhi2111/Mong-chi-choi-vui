/// <reference lib="webworker" />
import { buildLetterDog } from './letterDogModel';

// Sculpt the letter-carrying puppy off the main thread, and hand the arrays back without copying.
const data = buildLetterDog();
const transfer = [data.body, data.head, data.jaw, data.tail, data.earL, data.earR].flatMap((m) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer]);
(self as unknown as DedicatedWorkerGlobalScope).postMessage(data, transfer);
