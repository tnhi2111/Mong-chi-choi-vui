/**
 * Named moments of the light sprite's flights (storyboard D) that the page waits on —
 * "the camera has reached the window", "the tour is home". No three.js here: App imports it.
 */
const waiting = new Map<string, (() => void)[]>();
const fired = new Set<string>();

export const story = {
  /** Forget earlier moments (a new flight is starting). */
  reset() {
    fired.clear();
  },
  signal(name: string) {
    fired.add(name);
    const list = waiting.get(name);
    waiting.delete(name);
    list?.forEach((f) => f());
  },
  wait(name: string): Promise<void> {
    if (fired.has(name)) return Promise.resolve();
    return new Promise((res) => {
      const list = waiting.get(name) ?? [];
      list.push(res);
      waiting.set(name, list);
    });
  },
};
