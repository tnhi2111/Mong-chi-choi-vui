import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitInput } from '../../hooks/usePointerOrbit';

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
}

/**
 * Critically damped spring: starts gently, arrives without overshoot.
 * Unlike a plain lerp, velocity is continuous — no jolt when a target changes.
 */
export class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, omega: number, dt: number) {
    const f = 1 + 2 * dt * omega;
    const hoo = dt * omega * omega;
    const detInv = 1 / (f + dt * hoo);
    const x = (f * this.x + dt * this.v + dt * hoo * target) * detInv;
    this.v = (this.v + hoo * (target - this.x)) * detInv;
    this.x = x;
    return x;
  }
}

const sph = new THREE.Spherical();
const off = new THREE.Vector3();
const right = new THREE.Vector3();

/**
 * Moves the camera like a person holding it: eases toward each framing on a
 * spring (in spherical coordinates, so orbiting never cuts through the scene),
 * adds the user's orbit/zoom and a whisper of pointer parallax.
 */
export function CameraRig({ position, lookAt = [0, 0, 0], parallax = 0.25, speed = 1.6, fov, orbit, orbitCamera = false, fit }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const state = useRef<{ r: Spring; theta: Spring; phi: Spring; look: Spring[]; px: number; py: number } | null>(null);

  useFrame((frame, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
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
    const omega = speed * 2.1;

    sph.setFromVector3(off.set(position[0] - lookAt[0], position[1] - lookAt[1], position[2] - lookAt[2]));
    // unwrap theta so the spring always takes the short way round
    let theta = sph.theta;
    while (theta - s.theta.x > Math.PI) theta -= Math.PI * 2;
    while (theta - s.theta.x < -Math.PI) theta += Math.PI * 2;

    const r = s.r.step(sph.radius, omega, dt);
    const th = s.theta.step(theta, omega, dt);
    const ph = s.phi.step(sph.phi, omega, dt);
    const lx = s.look[0].step(lookAt[0], omega, dt);
    const ly = s.look[1].step(lookAt[1], omega, dt);
    const lz = s.look[2].step(lookAt[2], omega, dt);

    const yaw = orbit && orbitCamera ? -orbit.yaw : 0;
    const zoom = (orbit ? orbit.zoom : 1) * (fit ? fit(yaw) : 1);
    const pitch = orbit && orbitCamera ? -orbit.pitch : 0;
    sph.set(r * zoom, THREE.MathUtils.clamp(ph + pitch, 0.08, Math.PI - 0.08), th + yaw);
    off.setFromSpherical(sph);

    // pointer parallax, smoothed; applied in camera space so it is right at any orbit angle
    const kp = 1 - Math.exp(-dt * 2.5);
    s.px += (frame.pointer.x * parallax - s.px) * kp;
    s.py += (frame.pointer.y * parallax * 0.6 - s.py) * kp;
    right.set(Math.cos(sph.theta), 0, -Math.sin(sph.theta));
    camera.position.set(lx + off.x, ly + off.y + s.py, lz + off.z).addScaledVector(right, s.px);
    camera.lookAt(lx, ly, lz);
    // QA (?debug): window.__camOverride = { pos: [x,y,z], look: [x,y,z] } holds a framing
    const ov = (window as unknown as { __camOverride?: { pos: number[]; look: number[] } }).__camOverride;
    if (ov) {
      camera.position.set(ov.pos[0], ov.pos[1], ov.pos[2]);
      camera.lookAt(ov.look[0], ov.look[1], ov.look[2]);
    }
    (camera.userData.look ??= new THREE.Vector3()).set(lx, ly, lz);

    if (fov && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * speed));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
