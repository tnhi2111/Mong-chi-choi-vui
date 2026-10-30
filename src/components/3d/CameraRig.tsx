import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitInput } from '../../hooks/usePointerOrbit';
import { sprite } from './lightSprite';
import { motion as MOTION } from '../../config/motion';

interface Props {
  position: [number, number, number];
  lookAt?: [number, number, number];
  /** How much the camera sways with the pointer (world units). */
  parallax?: number;
  /** Higher = snappier. */
  speed?: number;
  fov?: number;
  /** User orbit input: always applies its zoom; yaw/pitch too when `orbitCamera`. */
  orbit?: OrbitInput;
  orbitCamera?: boolean;
  /** Extra distance multiplier for a given orbit yaw (e.g. to keep an oval scene framed). */
  fit?: (yaw: number) => number;
  /** A shift of both the framing and its look point, updated in place by the world (focus-follows-cursor). */
  nudge?: THREE.Vector3;
}

// (the spring lives in its own module so the light sprite can share it — see lightSprite)
export { Spring } from './spring';
import { Spring } from './spring';

const sph = new THREE.Spherical();
const off = new THREE.Vector3();
const right = new THREE.Vector3();
const tPos = new THREE.Vector3();
type RigState = { r: Spring; theta: Spring; phi: Spring; look: Spring[]; px: number; py: number };
/** How recently the last rig must have run for a new one to carry on its springs (ms). */
const HANDOVER_MS = 250;

/**
 * Move the camera and every spring that carries it by `offset` — a change of world under a
 * moving camera (the light sprite's flight carries on in the next world's coordinates).
 */
export function rebaseCamera(camera: THREE.Camera, offset: THREE.Vector3) {
  camera.position.add(offset);
  (camera.userData.look as THREE.Vector3 | undefined)?.add(offset);
  const rig = camera.userData.rig as { s: RigState } | undefined;
  if (rig) {
    rig.s.look[0].x += offset.x;
    rig.s.look[1].x += offset.y;
    rig.s.look[2].x += offset.z;
  }
}
const tLook = new THREE.Vector3();

/**
 * Moves the camera like a person holding it: eases toward each framing on a
 * spring (in spherical coordinates, so orbiting never cuts through the scene),
 * adds the user's orbit/zoom and a whisper of pointer parallax.
 */
export function CameraRig({ position, lookAt = [0, 0, 0], parallax = 0.25, speed = 1.6, fov, orbit, orbitCamera = false, fit, nudge }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const state = useRef<RigState | null>(null);

  useFrame((frame, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    // the light sprite may be leading the camera (storyboard D): it is advanced here as well
    // as where it is drawn, whichever runs first — once per frame
    sprite.update(frame.clock.elapsedTime, rawDt, camera);
    const follow = Math.max(0, Math.min(1, sprite.cam.weight.x));
    const chasing = follow > 0.001 && sprite.cam.mode === 'follow';
    const watching = follow > 0.001 && sprite.cam.mode === 'watch';
    // a rig that takes over from one that was running a moment ago (a change of world while
    // the camera is moving) carries on its springs — velocity included — so nothing jolts
    const handed = camera.userData.rig as { s: RigState; at: number } | undefined;
    if (!state.current && handed && performance.now() - handed.at < HANDOVER_MS) state.current = handed.s;
    if (!state.current) {
      // start from wherever the camera is now, so stage changes glide instead of jump
      const look = camera.userData.look as THREE.Vector3 | undefined;
      const from = look ?? new THREE.Vector3(...lookAt);
      sph.setFromVector3(off.copy(camera.position).sub(from));
      state.current = {
        r: new Spring(sph.radius),
        theta: new Spring(sph.theta),
        phi: new Spring(sph.phi),
        look: [from.x, from.y, from.z].map((v) => new Spring(v)),
        px: 0,
        py: 0,
      };
    }
    const s = state.current;
    camera.userData.rig = { s, at: performance.now() };
    // following, the springs tighten: the lag is the sprite's (motion.follow.lag), not theirs
    const omega = THREE.MathUtils.lerp(speed, chasing ? MOTION.follow.speed : speed, follow) * 2.1;

    // the framing this world wants, or (blended in on a spring) the place behind the leader
    tPos.set(position[0], position[1], position[2]);
    tLook.set(lookAt[0], lookAt[1], lookAt[2]);
    if (nudge) tLook.add(nudge);
    if (chasing) {
      tPos.lerp(sprite.cam.pos, follow);
      tLook.lerp(sprite.cam.look, follow);
    } else if (watching) tLook.lerp(sprite.cam.look, follow * sprite.cam.watch);
    sph.setFromVector3(off.copy(tPos).sub(tLook));
    // unwrap theta so the spring always takes the short way round
    let theta = sph.theta;
    while (theta - s.theta.x > Math.PI) theta -= Math.PI * 2;
    while (theta - s.theta.x < -Math.PI) theta += Math.PI * 2;

    const r = s.r.step(sph.radius, omega, dt);
    const th = s.theta.step(theta, omega, dt);
    const ph = s.phi.step(sph.phi, omega, dt);
    const lx = s.look[0].step(tLook.x, omega, dt);
    const ly = s.look[1].step(tLook.y, omega, dt);
    const lz = s.look[2].step(tLook.z, omega, dt);

    // her own turning of the world is set aside while the camera runs after the light
    const own = chasing ? 1 - follow : 1;
    const yaw = (orbit && orbitCamera ? -orbit.yaw : 0) * own;
    const zoom = THREE.MathUtils.lerp(1, (orbit ? orbit.zoom : 1) * (fit ? fit(yaw) : 1), own);
    const pitch = (orbit && orbitCamera ? -orbit.pitch : 0) * own;
    sph.set(r * zoom, THREE.MathUtils.clamp(ph + pitch, 0.08, Math.PI - 0.08), th + yaw);
    off.setFromSpherical(sph);

    // pointer parallax, smoothed; applied in camera space so it is right at any orbit angle
    const kp = 1 - Math.exp(-dt * 2.5);
    s.px += (frame.pointer.x * parallax * own - s.px) * kp;
    s.py += (frame.pointer.y * parallax * 0.6 * own - s.py) * kp;
    right.set(Math.cos(sph.theta), 0, -Math.sin(sph.theta));
    camera.position.set(lx + off.x, ly + off.y + s.py, lz + off.z).addScaledVector(right, s.px);
    camera.lookAt(lx, ly, lz);
    // a body running round a curve banks into it, and even standing it breathes
    if (chasing) camera.rotateZ(THREE.MathUtils.degToRad(sprite.cam.roll.x + sprite.breath()) * follow);
    // QA (?debug): window.__camOverride = { pos: [x,y,z], look: [x,y,z] } holds a framing
    // (with `in: 'name'`, pos and look are local to window.__<name> — e.g. the puppy's head)
    const w = window as unknown as Record<string, unknown> & { __camOverride?: { pos: number[]; look: number[]; in?: string } };
    const ov = w.__camOverride;
    if (ov) {
      const obj = ov.in ? (w[`__${ov.in}`] as THREE.Object3D | undefined) : undefined;
      obj?.updateWorldMatrix(true, false);
      const at = (v: number[]) => (obj ? obj.localToWorld(new THREE.Vector3(v[0], v[1], v[2])) : new THREE.Vector3(v[0], v[1], v[2]));
      camera.position.copy(at(ov.pos));
      camera.lookAt(at(ov.look));
    }
    (camera.userData.look ??= new THREE.Vector3()).set(lx, ly, lz);

    const wantFov = chasing ? THREE.MathUtils.lerp(fov ?? camera.fov, sprite.cam.fov.x, follow) : fov;
    if (wantFov && Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * (chasing ? 6 : speed)));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
