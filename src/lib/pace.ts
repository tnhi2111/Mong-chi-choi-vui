/**
 * The pace of the scene playing now (the owner's brief):
 *  • a touch or any key while a scene plays HURRIES it — the scene speeds up smoothly toward
 *    its end (up to `HURRY`×), it is never cut;
 *  • a scene she has already seen plays at ~40 % of its length (`REPEAT`), on a reload, on a
 *    second visit, when a memory is opened again. `?reset` forgets what was seen.
 *
 * Every clock that tells a scene (the light sprite, a gift's opening, the heart's bloom, the
 * page's own waits) advances by `pace.rate × dt` instead of `dt`. One rAF loop here eases the
 * hurry in and resolves `sceneWait()`. No three.js: the page's main chunk imports it.
 */
const SEEN_KEY = 'love-story:seen';
/** A scene seen before runs at 1 / 0.4 = 2.5× (≈40 % of its length). */
const REPEAT = 2.5;
/** How fast a hurried scene may run, and how quickly it gets there (1/s). */
const HURRY = 3.5;
const EASE = 2.4;
/** A touch in the first moments of a scene is the touch that started it, not a hurry. */
const GRACE_MS = 650;

function readSeen(): Set<string> {
  try {
    if (new URLSearchParams(location.search).has('reset')) {
      localStorage.removeItem(SEEN_KEY);
      return new Set();
    }
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

const seen = typeof window === 'undefined' ? new Set<string>() : readSeen();
const waits: { left: number; done: () => void }[] = [];

export const pace = {
  scene: null as string | null,
  base: 1,
  boost: 1,
  target: 1,
  startedAt: 0,
  /** What every scene clock multiplies its dt by. */
  get rate() {
    return this.base * this.boost;
  },
};

/** A scene starts: shorter if she has seen it before. Returns its base rate. */
export function beginScene(name: string, reduced = false): number {
  pace.scene = name;
  pace.base = reduced ? 1 : seen.has(name) ? REPEAT : 1;
  pace.boost = 1;
  pace.target = 1;
  pace.startedAt = performance.now();
  seen.add(name);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode: every scene is the first time */
  }
  return pace.base;
}

/** The scene is over: back to the normal pace. */
export function endScene(name?: string) {
  if (name && pace.scene !== name) return;
  pace.scene = null;
  pace.base = 1;
  pace.boost = 1;
  pace.target = 1;
}

/** She touched or pressed a key while a scene plays: hurry it (smoothly). */
export function hurryUp() {
  if (!pace.scene || performance.now() - pace.startedAt < GRACE_MS) return false;
  pace.target = HURRY;
  return true;
}

/** Was this scene seen before this visit's first time? (for CSS durations decided at start) */
export function seenBefore(name: string) {
  return seen.has(name) && pace.scene === name && pace.base > 1;
}

/** Wait `ms` of SCENE time: shorter if the scene is a repeat, cut short as she hurries it. */
export function sceneWait(ms: number): Promise<void> {
  return new Promise((done) => {
    if (ms <= 0) return done();
    waits.push({ left: ms, done });
  });
}

if (typeof window !== 'undefined') {
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    pace.boost += (pace.target - pace.boost) * (1 - Math.exp(-dt * EASE));
    const used = dt * 1000 * pace.rate;
    for (let i = waits.length - 1; i >= 0; i--) {
      waits[i].left -= used;
      if (waits[i].left <= 0) waits.splice(i, 1)[0].done();
    }
  };
  const loop = (now: number) => {
    step(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // a hidden tab gets no animation frames: keep the waits moving so nothing hangs
  setInterval(() => document.hidden && step(performance.now()), 250);
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __pace: pace });
}
