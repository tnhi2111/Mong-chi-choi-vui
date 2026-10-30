import * as THREE from 'three';
import { motion } from '../../config/motion';
import { Spring } from './spring';
import { story } from '../../lib/story';

/**
 * The light sprite: one leader and the flock that follows it (storyboard D).
 *
 * This is the brain; `LightSprite.tsx` draws it and `CameraRig` follows it. It is a module
 * singleton because it outlives every world: it leaves the heart in the intro, carries the
 * camera through the change of world, and lands in the room's orb on the other side.
 *
 * A script is a list of legs. A leg flies the leader along a curve (arc-length, eased), or
 * — with `until` — keeps it flying on along its last heading until something is ready (the
 * room compiling). The leader's path is recorded (`motion.sprite.history` seconds) and the
 * shader reads that record: each mote of the flock is somewhere back along it, so the
 * flock is a comet's tail that follows the leader's real path, curves and all.
 */

const S = motion.sprite;
const F = motion.follow;
/** History samples (the shader reads `uHist[0..H-1]`). */
export const HIST = 48;
const HIST_DT = S.history / (HIST - 1);

export interface SpriteCamera {
  /** follow: run after the leader. watch: stay, but turn the head toward it. off: let go. */
  mode: 'follow' | 'watch' | 'off';
  /** watch: how far the look turns toward the leader (0..1). */
  weight?: number;
  back?: number;
  up?: number;
  /** follow: extra fov on top of motion.follow.fov. */
  fov?: number;
}

export interface Leg {
  /** World-space path (flown at constant speed: getPointAt). */
  curve?: THREE.Curve<THREE.Vector3>;
  duration: number;
  /** Easing of the arc parameter (default: in-out cubic). */
  ease?: (x: number) => number;
  /** Fly on along the last heading until this is true (or `maxHold` seconds pass). */
  until?: () => boolean;
  maxHold?: number;
  /** Speed while holding (m/s). */
  holdSpeed?: number;
  /** Flock shape targets, 0..1. */
  corridor?: number;
  stars?: number;
  /** Brightness target of the whole sprite. */
  intensity?: number;
  camera?: SpriteCamera;
  /** Room build progress: sweep the build angle with the leader during this leg. */
  build?: 'sweep' | 'finish';
  onStart?: () => void;
  /** Fired when the leg ends (and as `signal`). */
  onEnd?: () => void;
  signal?: string;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x: number) => x * x * x;
export const linear = (x: number) => x;

/** Uniforms the flock shader reads (shared object: LightSprite builds its material on it). */
export const spriteUniforms = {
  uHist: { value: Array.from({ length: HIST }, () => new THREE.Vector3()) },
  /** Seconds since the newest history sample (so the tail slides, not steps). */
  uSince: { value: 0 },
  uLeader: { value: new THREE.Vector3() },
  uVel: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  uIntensity: { value: 0 },
  uCorridor: { value: 0 },
  uStars: { value: 0 },
  uStarCenter: { value: new THREE.Vector3() },
  uPixelRatio: { value: 1 },
  /** How far the flock is from the camera, as a scale (1 up close, up to 2.6 far away): the
   *  sprite keeps a readable size on screen — a character, not a speck. */
  uSpan: { value: 1 },
};

/**
 * What the room's shaders read so the leader wakes what it passes (no real lights):
 * `uWake[i]` = a point on the leader's path (xyz) and how strongly it glows there (w);
 * `uBuild` = (start angle, angle reached, active) — the stretch of the room the leader has
 * flown past is "built" (fully lit), the rest waits in a dimmer light.
 */
export const spriteWake = {
  uWake: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -100, 0, 0)) },
  uBuild: { value: new THREE.Vector3(-Math.PI, Math.PI, 0) },
};

/** GLSL for the room's shaders: the warm light the leader leaves along its path, and the build mask. */
export const SPRITE_GLSL = /* glsl */ `
  uniform vec4 uWake[4];
  uniform vec3 uBuild;
  vec3 spriteGlow(vec3 P) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec3 d = uWake[i].xyz - P;
      g += uWake[i].w * exp(-dot(d, d) * ${(1 / (S.wakeRadius * S.wakeRadius)).toFixed(3)});
    }
    return vec3(1.0, 0.78, 0.55) * g;
  }
  float spriteBuilt(vec3 P) {
    if (uBuild.z < 0.5) return 1.0;
    float a = atan(P.x, -P.z);
    // the middle of the room (the stage) is built with the last part of the sweep
    float r = length(P.xz);
    float reach = uBuild.y - mix(0.0, 0.6, smoothstep(2.2, 0.6, r));
    return smoothstep(a - 0.3, a + 0.1, reach);
  }
`;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const upV = new THREE.Vector3(0, 1, 0);

class SpriteController {
  /** The leader, in world space. */
  readonly leader = new THREE.Vector3(0, -100, 0);
  readonly vel = new THREE.Vector3();
  readonly acc = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private hist = Array.from({ length: HIST }, () => new THREE.Vector3(0, -100, 0));
  private since = 0;
  private legs: Leg[] = [];
  private leg = 0;
  private legT = 0;
  private holdDir = new THREE.Vector3(0, 0, -1);
  private holdSpeed = 2;
  playing = false;
  private frame = -1;
  private time = 0;
  /** Smoothed flock shape / brightness. */
  private intensity = new Spring(0);
  private corridor = new Spring(0);
  private stars = new Spring(0);
  private targets = { intensity: 0, corridor: 0, stars: 0 };
  /** Build angle reached (room tour). */
  private build = { active: false, start: -Math.PI, reach: -Math.PI, finishing: false };

  /** What CameraRig reads. `weight` eases in and out so taking over never jumps. */
  readonly cam = {
    mode: 'off' as SpriteCamera['mode'],
    weight: new Spring(0),
    target: 0,
    watch: 0,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    roll: new Spring(0),
    fov: new Spring(F.fov),
    back: F.back as number,
    up: F.up as number,
    extraFov: 0,
  };

  /** Start a script. `from` is where the leader is born (the heart, the orb). */
  play(legs: Leg[], from: THREE.Vector3) {
    this.legs = legs;
    this.leg = 0;
    this.legT = 0;
    this.playing = true;
    story.reset();
    this.leader.copy(from);
    this.prev.copy(from);
    this.vel.set(0, 0, 0);
    this.prevVel.set(0, 0, 0);
    this.acc.set(0, 0, 0);
    for (const h of this.hist) h.copy(from);
    this.since = 0;
    this.startLeg();
  }

  /** Stop and fade out (the camera is let go on a spring, never dropped). */
  stop() {
    this.playing = false;
    this.legs = [];
    this.targets.intensity = 0;
    this.targets.corridor = 0;
    this.cam.target = 0;
    this.cam.mode = 'off';
    this.build.active = false;
    spriteWake.uBuild.value.z = 0;
  }

  /**
   * She does not want to wait: finish now. The flock fades, the camera is let go on its spring
   * (never dropped), the rest of the room wakes, and every pending leg's end is honoured
   * (`onEnd` / `signal`) so whoever waits on the flight is told it is over.
   */
  skip() {
    const rest = this.legs.slice(this.leg);
    this.playing = false;
    this.legs = [];
    this.targets.intensity = 0;
    this.targets.corridor = 0;
    this.cam.target = 0;
    this.cam.mode = 'off';
    if (this.build.active) this.build.finishing = true;
    for (const L of rest) {
      L.onEnd?.();
      if (L.signal) this.signal(L.signal);
    }
  }

  /** Move everything by `offset` (the change of world under the camera: a new coordinate frame). */
  rebase(offset: THREE.Vector3) {
    this.leader.add(offset);
    this.prev.add(offset);
    for (const h of this.hist) h.add(offset);
    this.cam.pos.add(offset);
    this.cam.look.add(offset);
    spriteUniforms.uStarCenter.value.add(offset);
  }

  /** Replace what is left of the script (the next world takes over the story). */
  continueWith(legs: Leg[]) {
    this.legs = legs;
    this.leg = 0;
    this.legT = 0;
    this.playing = true;
    this.startLeg();
  }

  signal(name: string) {
    story.signal(name);
  }

  /** 0..1: has the build sweep passed this angle (atan(x, -z)) yet? (1 when no tour is running.) */
  builtAt(angle: number) {
    if (!this.build.active) return 1;
    // (the same ramp as spriteBuilt in the shader: it wakes as the leader comes up to it)
    return THREE.MathUtils.smoothstep(this.build.reach, angle - 0.3, angle + 0.1);
  }

  get active() {
    return this.playing || this.intensity.x > 0.01;
  }

  /** Fixed sample of the recorded path `lag` seconds ago. */
  sampleAt(lag: number, out: THREE.Vector3) {
    if (lag <= this.since) {
      const k = this.since > 1e-4 ? lag / this.since : 0;
      return out.copy(this.leader).lerp(this.hist[0], k);
    }
    const f = (lag - this.since) / HIST_DT;
    const i = Math.min(HIST - 2, Math.floor(f));
    return out.copy(this.hist[i]).lerp(this.hist[i + 1], Math.min(1, f - i));
  }

  private startLeg() {
    const L = this.legs[this.leg];
    if (!L) return;
    this.legT = 0;
    if (L.intensity !== undefined) this.targets.intensity = L.intensity;
    else this.targets.intensity = 1;
    if (L.corridor !== undefined) this.targets.corridor = L.corridor;
    if (L.stars !== undefined) {
      if (L.stars > 0 && this.targets.stars === 0) spriteUniforms.uStarCenter.value.copy(this.leader);
      this.targets.stars = L.stars;
    }
    if (L.camera) {
      this.cam.mode = L.camera.mode;
      this.cam.target = L.camera.mode === 'off' ? 0 : 1;
      this.cam.watch = L.camera.weight ?? 0.3;
      this.cam.back = L.camera.back ?? F.back;
      this.cam.up = L.camera.up ?? F.up;
      this.cam.extraFov = L.camera.fov ?? 0;
    }
    if (L.build === 'sweep') {
      if (!this.build.active) {
        this.build.active = true;
        this.build.reach = this.build.start;
      }
      this.build.finishing = false;
    } else if (L.build === 'finish') this.build.finishing = true;
    if (L.until && L.curve === undefined) {
      // fly on along the heading it had
      if (this.vel.lengthSq() > 1e-6) this.holdDir.copy(this.vel).normalize();
      this.holdSpeed = L.holdSpeed ?? Math.max(1.2, this.vel.length());
    }
    L.onStart?.();
  }

  private endLeg() {
    const L = this.legs[this.leg];
    if (!L) return;
    L.onEnd?.();
    if (L.signal) this.signal(L.signal);
    this.leg++;
    if (this.leg >= this.legs.length) {
      this.playing = false;
      this.targets.intensity = 0;
      return;
    }
    this.startLeg();
  }

  /** Advance one frame. Safe to call from several components: only the first call per frame counts. */
  update(frameId: number, rawDt: number, camera: THREE.Camera) {
    if (frameId === this.frame) return;
    this.frame = frameId;
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;

    // ── the leader ─────────────────────────────────────────────
    const L = this.playing ? this.legs[this.leg] : undefined;
    if (L) {
      this.legT += dt;
      if (L.curve) {
        const u = Math.min(1, this.legT / Math.max(0.001, L.duration));
        L.curve.getPointAt((L.ease ?? easeInOut)(u), this.leader);
        if (u >= 1 && (!L.until || L.until())) this.endLeg();
      } else if (L.until) {
        // holding: fly on, swaying a little, so it is never still while it waits
        tmp.copy(this.holdDir).multiplyScalar(this.holdSpeed * dt);
        tmp.x += Math.sin(this.time * 1.7) * 0.25 * dt;
        tmp.y += Math.sin(this.time * 1.1 + 1.0) * 0.15 * dt;
        this.leader.add(tmp);
        if (L.until() || this.legT > (L.maxHold ?? 6)) this.endLeg();
      } else if (this.legT >= L.duration) this.endLeg();
    }

    // velocity / acceleration, smoothed (finite differences of a curve are noisy)
    if (dt > 1e-5) {
      tmp.copy(this.leader).sub(this.prev).divideScalar(dt);
      this.vel.lerp(tmp, 1 - Math.exp(-dt * 14));
      tmp2.copy(this.vel).sub(this.prevVel).divideScalar(dt);
      this.acc.lerp(tmp2, 1 - Math.exp(-dt * 6));
      this.prevVel.copy(this.vel);
    }
    this.prev.copy(this.leader);

    // ── the recorded path ──────────────────────────────────────
    this.since += dt;
    while (this.since >= HIST_DT) {
      this.since -= HIST_DT;
      for (let i = HIST - 1; i > 0; i--) this.hist[i].copy(this.hist[i - 1]);
      // the newest sample is where the leader was HIST_DT ago (approximately: now − since)
      this.hist[0].copy(this.leader);
    }

    // ── flock shape ────────────────────────────────────────────
    this.intensity.step(this.targets.intensity, 3.2, dt);
    this.corridor.step(this.targets.corridor, 2.2, dt);
    this.stars.step(this.targets.stars, 1.6, dt);
    const u = spriteUniforms;
    for (let i = 0; i < HIST; i++) u.uHist.value[i].copy(this.hist[i]);
    u.uSince.value = this.since;
    u.uLeader.value.copy(this.leader);
    u.uVel.value.copy(this.vel);
    u.uTime.value = this.time;
    u.uIntensity.value = Math.max(0, this.intensity.x);
    u.uCorridor.value = THREE.MathUtils.clamp(this.corridor.x, 0, 1);
    u.uStars.value = THREE.MathUtils.clamp(this.stars.x, 0, 1);

    // ── waking what it passes ──────────────────────────────────
    const glow = Math.max(0, this.intensity.x) * (1 - u.uStars.value);
    for (let i = 0; i < 4; i++) {
      this.sampleAt(S.wakeLags[i], tmp);
      spriteWake.uWake.value[i].set(tmp.x, tmp.y, tmp.z, glow * S.wakeTrail[i] * 0.8);
    }
    if (this.build.active) {
      if (!this.playing) this.build.finishing = true;
      const r = Math.hypot(this.leader.x, this.leader.z);
      if (this.build.finishing) this.build.reach = Math.min(Math.PI + 0.8, this.build.reach + dt * 2.6);
      else if (r > 1.6) {
        // the angle the leader has reached round the room (it only ever moves on)
        let a = Math.atan2(this.leader.x, -this.leader.z);
        if (a < this.build.start - 0.2) a += Math.PI * 2;
        if (a > this.build.reach && a - this.build.reach < 1.2) this.build.reach = a;
      }
      spriteWake.uBuild.value.set(this.build.start, this.build.reach, 1);
      if (this.build.finishing && this.build.reach >= Math.PI + 0.75) {
        this.build.active = false;
        spriteWake.uBuild.value.z = 0;
      }
    }

    // ── the camera running after it ────────────────────────────
    const c = this.cam;
    // (quick enough that the camera is on the leader's heels within half a second)
    c.weight.step(c.target, 4.5, dt);
    if (c.mode === 'follow') {
      this.sampleAt(F.lag, tmp);
      tmp2.copy(this.leader).sub(tmp);
      if (tmp2.lengthSq() < 1e-6) tmp2.copy(this.vel);
      if (tmp2.lengthSq() < 1e-6) tmp2.set(0, 0, -1);
      tmp2.normalize();
      c.pos.copy(tmp).addScaledVector(tmp2, -c.back);
      c.pos.y += c.up;
      c.look.copy(this.leader).addScaledVector(this.vel, F.lookahead);
      // bank into the curve: sideways acceleration, seen from the camera
      const right = tmp.crossVectors(tmp2, upV).normalize();
      const lateral = this.acc.dot(right);
      const rollT = THREE.MathUtils.clamp(-lateral * F.rollGain, -F.rollMax, F.rollMax);
      c.roll.step(rollT, 5, dt);
      const fovT = F.fov + c.extraFov + Math.min(F.fovMax, this.vel.length() * F.fovGain);
      c.fov.step(fovT, 3, dt);
    } else {
      c.roll.step(0, 4, dt);
      c.look.copy(this.leader);
      c.fov.step((camera as THREE.PerspectiveCamera).fov ?? F.fov, 3, dt);
    }
  }

  /** Breathing roll (degrees) to add while the camera follows. */
  breath() {
    return Math.sin(this.time * Math.PI * 2 * F.breathHz) * F.breathDeg;
  }
}

export const sprite = new SpriteController();

/** QA (?debug): window.__sprite */
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __sprite: sprite });
}

/**
 * Her hand as light (storyboard F3): a soft warm glow where the pointer's ray passes close to
 * a surface, a warm pool where it meets the floor, and beside it the faint shadow a hand held
 * above the floor would throw. Uniform objects shared by the room's shaders; RoomSet writes them.
 */
export const handUniforms = {
  uHandO: { value: new THREE.Vector3() },
  uHandD: { value: new THREE.Vector3(0, 0, -1) },
  uHandOn: { value: 0 },
  /** where the ray meets the floor (xyz) and how present (w) */
  uHandFloor: { value: new THREE.Vector4(0, -100, 0, 0) },
};
export const HAND_GLSL = /* glsl */ `
  uniform vec3 uHandO;
  uniform vec3 uHandD;
  uniform float uHandOn;
  uniform vec4 uHandFloor;
  vec3 handGlow(vec3 P) {
    vec3 c = uHandO + uHandD * max(0.0, dot(P - uHandO, uHandD));
    vec3 d = P - c;
    return vec3(1.0, 0.74, 0.5) * 0.22 * uHandOn * exp(-dot(d, d) * 4.0);
  }
  // on the floor: x = the warm pool, y = the hand's soft shadow
  vec2 handFloor(vec3 P) {
    vec2 hd = P.xz - uHandFloor.xz;
    vec2 sd = hd - vec2(0.1, 0.16);
    return vec2(exp(-dot(hd, hd) * 5.0), exp(-dot(sd, sd) * 16.0)) * uHandFloor.w;
  }
`;
