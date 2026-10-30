import * as THREE from 'three';
import { motion } from '../../config/motion';
import type { CardRect } from '../../lib/gateRect';
import { easeInCubic, easeOutCubic, linear, sprite, type Leg } from './lightSprite';

/**
 * The three flights of the light sprite (storyboard D in `reference/STORYBOARD.md`).
 * Each builder returns the legs; the worlds start them because only they know where their
 * hero light is. Timings in `motion.sprite`.
 */
const S = motion.sprite;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const curve = (pts: THREE.Vector3[], tension = 0.5) => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension);

/* ── D3.1 heart → password: draw the card's frame ───────────────────────── */

/**
 * Points along the card's frame, in the world, at the heart's distance from the camera — so
 * the leader flies the same line on screen that the frame is drawn along (PasswordGate's
 * SVG runs with the same duration and the same constant speed).
 */
export function cardFrame(rect: CardRect, camera: THREE.PerspectiveCamera, size: { width: number; height: number }, depth: number) {
  const { left: l, top: t, width: w, height: h } = rect;
  const r = Math.min(rect.radius, w / 2, h / 2);
  const cx = l + w / 2;
  // the outline in screen px: top centre → right → bottom → left → back to the top centre
  const px: [number, number][] = [];
  const arc = (ox: number, oy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      px.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  };
  px.push([cx, t]);
  arc(l + w - r, t + r, -Math.PI / 2, 0);
  arc(l + w - r, t + h - r, 0, Math.PI / 2);
  arc(l + r, t + h - r, Math.PI / 2, Math.PI);
  arc(l + r, t + r, Math.PI, Math.PI * 1.5);
  px.push([cx, t]);
  camera.updateMatrixWorld();
  const dir = new THREE.Vector3();
  const pts = px.map(([x, y]) => {
    dir.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    // the same distance along the view axis for every corner (a plane facing the camera)
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const k = depth / Math.max(0.05, dir.dot(fwd));
    return camera.position.clone().addScaledVector(dir, k);
  });
  return pts;
}

export function cardScript(heart: THREE.Vector3, frame: THREE.Vector3[]): Leg[] {
  const C = S.card;
  const start = frame[0];
  // out of the heart in a small rising curl, to the top of the card
  const mid = heart.clone().lerp(start, 0.5).add(V(0.35, 0.25, 0.1));
  return [
    {
      curve: curve([heart.clone(), mid, start]),
      duration: C.leave,
      ease: easeOutCubic,
      camera: { mode: 'watch', weight: 0.05 },
      intensity: 1,
    },
    // the frame itself, at one constant speed (the SVG stroke runs linear too)
    { curve: new THREE.CatmullRomCurve3(frame, false, 'centripetal'), duration: C.draw, ease: linear, signal: 'card-drawn' },
    // home into the heart, where it is quiet again
    {
      curve: curve([frame[frame.length - 1], start.clone().lerp(heart, 0.5).add(V(-0.2, 0.2, 0.05)), heart.clone()]),
      duration: C.home,
      ease: easeInCubic,
      intensity: 0,
      camera: { mode: 'off' },
    },
  ];
}

/* ── D3.2 password → room: out of the heart, down a corridor, round the room ── */

/** The first half, in the intro's world: out of the heart and into the spiral corridor. */
export function leaveHeartScript(heart: THREE.Vector3, until: () => boolean): Leg[] {
  const R = S.room;
  return [
    {
      // it leaves the heart toward her a little, curls, and dives away into the depth —
      // the camera goes after it
      curve: curve([heart.clone(), heart.clone().add(V(0.5, 0.15, 0.7)), heart.clone().add(V(0.2, -0.1, -1.8)), heart.clone().add(V(-0.5, 0.0, -5.0)), heart.clone().add(V(0.3, 0.1, -9.0))]),
      duration: R.leave,
      ease: easeInCubic,
      camera: { mode: 'follow', fov: 4 },
      corridor: 1,
      intensity: 1,
    },
    // the corridor holds until the room has been built behind it
    { until, maxHold: 6, holdSpeed: 4.5, duration: 0, signal: 'corridor-ready' },
  ];
}

/** Where the tour enters the room and the points it flies past (room world). */
export interface RoomMarks {
  orb: THREE.Vector3;
  window: THREE.Vector3;
  sign: THREE.Vector3;
  balloons: THREE.Vector3;
  cake: THREE.Vector3;
}

/** The second half, in the room: the corridor opens into the room, the leader flies past the
 *  window, the sign, the balloons and the cake (each wakes as it goes by), and rises into the orb. */
export function roomTourScript(m: RoomMarks, onHome: () => void): { entry: THREE.Vector3; legs: Leg[] } {
  const R = S.room;
  const entry = V(-0.3, 1.25, R.entryZ);
  const toward = (p: THREE.Vector3, k: number) => p.clone().multiplyScalar(k).setY(p.y);
  const tour = curve([
    entry,
    V(-2.5, 1.15, 1.6),
    toward(m.window, 0.72).setY(m.window.y + 0.1),
    toward(m.sign, 0.78).setY(m.sign.y - 0.1),
    toward(m.balloons, 0.78),
    toward(m.cake, 0.72).setY(m.cake.y + 0.55),
    V(3.4, 1.0, -0.6),
    // round the front-right (the seating corner), so the flight ends facing the room the way
    // she will see it: the camera is let go close to its own framing, not behind the cake
    V(3.0, 1.15, 2.6),
  ]);
  const rise = curve([V(3.0, 1.15, 2.6), V(1.5, 1.35, 2.1), m.orb.clone().add(V(0.1, 0.55, 0.45)), m.orb.clone()]);
  return {
    entry,
    legs: [
      // (a follower a little lower than the leader: more lit floor and things, less of the dark
      // above the walls — the room has no ceiling)
      { curve: tour, duration: R.tour, ease: (x) => x, camera: { mode: 'follow', back: 1.35, up: 0.05 }, corridor: 0, build: 'sweep', intensity: 1 },
      {
        curve: rise,
        duration: R.rise,
        ease: easeOutCubic,
        // the camera lets go: the room's own framing takes over on its spring and pulls back
        camera: { mode: 'off' },
        build: 'finish',
        intensity: 0,
        onEnd: onHome,
        signal: 'room-home',
      },
    ],
  };
}

/* ── D3.3 room → finale: out through the arched window ───────────────────── */

export function windowScript(orb: THREE.Vector3, glass: THREE.Vector3, outward: THREE.Vector3): Leg[] {
  const W = S.window;
  const before = glass.clone().addScaledVector(outward, -1.6);
  const beyond = glass.clone().addScaledVector(outward, 4.0);
  return [
    {
      curve: curve([orb.clone(), orb.clone().add(V(0.3, 0.7, 0.4)), orb.clone().lerp(before, 0.5).add(V(0, 0.5, 0)), before]),
      duration: W.reach,
      ease: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
      camera: { mode: 'follow', back: 1.15, up: 0.12, fov: 2 },
      intensity: 1,
    },
    // through the glass; the camera follows it into the night until the pane fills the view
    // (RoomWorld signals 'window' when the camera is at the glass). The flock is already
    // spreading into the night sky beyond it — the same stars the finale opens on.
    { curve: curve([before, glass.clone(), beyond]), duration: W.through, ease: linear, stars: 0.6 },
    // flying on into the night until the finale takes the story (FinalWorld continues it)
    { until: () => false, maxHold: 3, holdSpeed: 3.5, duration: 0 },
  ];
}

/** On the other side: the flock spreads into the finale's sky and the leader goes home into its orb. */
export function finaleArrivalScript(orb: THREE.Vector3, from: THREE.Vector3): Leg[] {
  return [
    {
      curve: curve([from.clone(), from.clone().lerp(orb, 0.5).add(V(0.4, 0.6, 0)), orb.clone()]),
      duration: 2.2,
      ease: easeOutCubic,
      camera: { mode: 'off' },
      stars: 1,
      intensity: 1,
    },
    { duration: 1.6, intensity: 0, stars: 1 },
  ];
}

export { sprite };
