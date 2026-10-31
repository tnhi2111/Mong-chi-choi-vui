import * as THREE from 'three';

/**
 * Tiny shared state between 3D worlds and the light rig.
 *
 * The rig always owns the same set of lights, in every scene: three bakes the
 * number of lights into each shader, so a light that comes and goes would force
 * every material to recompile (a visible freeze on Windows/ANGLE). Worlds steer
 * those lights through here instead.
 */
export const hoverLight = {
  /** Where the hover rim light should glide to, or null when nothing is hovered. */
  target: null as THREE.Vector3 | null,
};

/**
 * The gift room's two story lights, steered by RoomWorld:
 *  • heart — the particle heart glowing pink onto the floor, the puppy and the gifts
 *  • character — a soft golden key light falling on the puppy (the room's second subject)
 */
export const roomLights = {
  heart: null as THREE.Vector3 | null,
  character: null as THREE.Vector3 | null,
};

/**
 * The finale's final surprise, steered by FinalWorld:
 *  • gift — where the last gift box sits: the top spot becomes its warm key light
 *  • hush — 0..1, how quiet the rest of the world has grown (rims, key, environment dim)
 */
export const finaleLights = {
  gift: null as THREE.Vector3 | null,
  hush: 0,
};

/**
 * Her hand in the room: the pointer's ray (`o`, `d`), how present it is (`on`, fades when it
 * rests or leaves), the "wind" it makes (smoothed sideways speed of the pointer, screen units
 * per second) and its speed. Written once a frame by RoomSet (mouse, or a finger on a phone),
 * read by flames, balloons, ropes, curtains, gifts and dust.
 */
export const roomHand = {
  o: new THREE.Vector3(),
  d: new THREE.Vector3(0, 0, -1),
  on: 0,
  wind: 0,
  speed: 0,
};

const _c = new THREE.Vector3();
/** Closest point on her hand's ray to `p` (written to `out`); returns the distance. */
export function handNear(p: THREE.Vector3, out: THREE.Vector3): number {
  _c.copy(p).sub(roomHand.o);
  const along = Math.max(0, _c.dot(roomHand.d));
  out.copy(roomHand.o).addScaledVector(roomHand.d, along);
  return p.distanceTo(out);
}

/**
 * The five gifts on their ring, as one display table under her hand (storyboard F2):
 * a gift her hand brushes sends a lean on to its neighbours (80 ms a step, weaker each step),
 * and sweeping across several in one stroke turns the whole ring a little on its inertia —
 * then it settles back where it was.
 */
export const giftRing = {
  /** Leans travelling round the ring: when it started, from which gift, how strong, which way. */
  waves: [] as { id: number; at: number; from: number; strength: number; side: number }[],
  nextId: 1,
  /** Recent touches (gift index, time) — three different gifts in a short stroke spin the ring. */
  touched: [] as { i: number; t: number }[],
  /** The ring's turn (rad) and its speed; RoomWorld integrates it. */
  spin: 0,
  spinVel: 0,
  count: 5,
  /** QA only (`__giftRing.qaTurn`): an extra turn of the whole ring, so tests can sweep it. */
  qaTurn: 0,
  /** QA only: keep the gifts standing during a moment (shows what the duck prevents). */
  qaNoDuck: false,
};

// QA (?debug): window.__giftRing
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) Object.assign(window, { __giftRing: giftRing });
