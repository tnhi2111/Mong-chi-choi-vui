/**
 * Tiny "the 3D world is ready" signals between the scene (inside the canvas) and the page.
 *
 *  • 'scene-warm'  — the renderer has done its one-off heavy setup (the environment's
 *                    reflection map is filtered), so the first moments can play smoothly
 *  • 'room-ready'  — the gift room has compiled all its shaders and can be shown
 *
 * The page keeps a veil up until the signal arrives (or a timeout passes), so nothing is
 * ever seen frozen mid-frame.
 */
export type ReadySignal = 'scene-warm' | 'room-ready';

const fired = new Set<ReadySignal>();

export function signalReady(name: ReadySignal): void {
  fired.add(name);
  window.dispatchEvent(new Event(name));
}

/** Forget a signal, so the next wait waits for a fresh one (e.g. each time the room mounts). */
export function resetReady(name: ReadySignal): void {
  fired.delete(name);
}

export function waitReady(name: ReadySignal, timeout: number): Promise<void> {
  if (fired.has(name)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener(name, done);
      clearTimeout(id);
      resolve();
    };
    const id = setTimeout(done, timeout);
    window.addEventListener(name, done);
  });
}
