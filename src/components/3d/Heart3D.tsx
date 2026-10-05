import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeartGeometry } from './heartShape';
import { createHeartMaterial } from './heartMaterial';
import { Glow } from './Glow';
import { ParticleHeart, type DormantRing, type ParticleHeartHandle } from './ParticleHeart';
import type { OrbitInput } from '../../hooks/usePointerOrbit';
import { sound } from '../../lib/audio';

interface Props {
  /** Increment to make the heart beat once, strongly. */
  pulseKey?: number;
  /** 0..1 how "awake" the heart is — drives inner light. */
  charge?: number;
  interactive?: boolean;
  onTap?: () => void;
  reducedMotion?: boolean;
  /** Glass-like refraction (costs an extra render pass → high tier only). */
  glass?: boolean;
  scale?: number;
  /** Extra halo size multiplier. */
  halo?: number;
  lowDetail?: boolean;
  /** Multiplier for the light glowing from inside the heart. */
  innerLight?: number;
  /** Lets the viewer turn the heart in their hands (drag / inertia). */
  orbit?: OrbitInput;
  /** > 0: draw the heart as this many points of light instead of a glossy solid. */
  particles?: number;
  /**
   * Points of light only: false keeps them scattered in the ring below / around the
   * scene; switching to true gathers them into the heart (~3 s), then it beats once.
   */
  assembled?: boolean;
  onAssembled?: () => void;
  /** Where the scattered light waits (heart-local space). */
  ring?: DormantRing;
}

const g = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));

/**
 * One heartbeat after a touch, as offsets (s = size, light = inner light).
 * A breath of stillness, a squeeze, the strong beat, then a second, softer one.
 */
function beat(t: number) {
  if (t < 0 || t > 1.6) return { s: 0, squash: 0, light: 0 };
  const s = -0.05 * g(t, 0.14, 0.05) + 0.075 * g(t, 0.3, 0.08) - 0.022 * g(t, 0.53, 0.05) + 0.04 * g(t, 0.66, 0.09);
  const squash = -0.05 * g(t, 0.14, 0.05) + 0.03 * g(t, 0.3, 0.07) - 0.02 * g(t, 0.53, 0.05);
  const light = g(t, 0.32, 0.12) + 0.55 * g(t, 0.68, 0.13) + 0.25 * Math.max(0, 1 - t / 1.6);
  return { s, squash, light };
}

/** Resting pulse: two quiet beats, then rest — barely there, just alive. */
function idlePulse(t: number): number {
  const c = t % 2.6;
  return g(c, 0.15, 0.09) + 0.6 * g(c, 0.45, 0.09);
}

const worldPos = new THREE.Vector3();
const DEFAULT_RING: DormantRing = { y: -1.2, radius: 1.2, tilt: 0 };

const fineHover = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function Heart3D({
  pulseKey = 0,
  charge = 0,
  interactive = false,
  onTap,
  reducedMotion = false,
  glass = false,
  scale = 1,
  halo = 1,
  lowDetail = false,
  innerLight = 1,
  orbit,
  particles = 0,
  assembled = true,
  onAssembled,
  ring = DEFAULT_RING,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Group>(null);
  const cloud = useRef<ParticleHeartHandle>(null);
  const hoverLocal = useRef(new THREE.Vector3(0, 0, 9));
  const touch = useRef(0);
  const pBeat = useRef(0);
  const assembly = useRef(assembled ? 1 : 0);
  const glow = useRef<THREE.Sprite>(null);
  const inner = useRef<THREE.PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const beatStart = useRef(-10);
  const hover = useRef(0);
  const s = useRef(scale * 0.6);
  const geometry = useMemo(() => getHeartGeometry(lowDetail ? 'low' : 'high'), [lowDetail]);
  const asLight = particles > 0;
  const { material, uniforms } = useMemo(() => createHeartMaterial(glass), [glass]);
  // the point-of-light heart still needs a surface to touch: an invisible copy of the solid
  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), []);
  useEffect(() => () => hitMaterial.dispose(), [hitMaterial]);
  const clock = useRef(0);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    if (pulseKey > 0) beatStart.current = clock.current;
  }, [pulseKey]);

  useEffect(() => {
    if (!interactive) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, interactive]);

  useFrame((state, rawDt) => {
    const grp = group.current;
    if (!grp || !spin.current || !tilt.current || !mesh.current) return;
    const dt = Math.min(rawDt, 0.05);
    clock.current = state.clock.elapsedTime;
    const t = clock.current;
    const motion = reducedMotion ? 0 : 1;

    const b = beat(t - beatStart.current);
    const beatAmt = reducedMotion ? 0.3 : 1;
    hover.current += ((hovered && interactive ? 1 : 0) - hover.current) * (1 - Math.exp(-dt * 5));
    const h = hover.current;

    // breathing + a resting pulse + the touch heartbeat
    const breath = Math.sin(t * 1.25) * 0.011 * motion;
    const idle = idlePulse(t) * (0.008 + charge * 0.012) * motion;
    const target = scale * (1 + breath + idle + b.s * beatAmt);
    s.current += (target - s.current) * (1 - Math.exp(-dt * 10));
    grp.scale.setScalar(s.current);
    // squeeze a touch more vertically than sideways — reads as muscle, not a balloon
    const sq = b.squash * beatAmt;
    mesh.current.scale.set(1 - sq * 0.35, 1 + sq, 1 - sq * 0.35);

    // floating, never spinning on its own
    grp.position.y = Math.sin(t * 0.72) * 0.045 * motion;

    let yaw = Math.sin(t * 0.31) * 0.14 * motion + state.pointer.x * 0.12 * motion;
    let pitch = Math.sin(t * 0.47) * 0.045 * motion - state.pointer.y * 0.07 * motion;
    if (orbit) {
      orbit.step(dt);
      // after a while untouched, the heart turns gently back to face her
      if (!orbit.dragging && orbit.idle() > 3.5) {
        const home = Math.round(orbit.tYaw / (Math.PI * 2)) * Math.PI * 2;
        const k = 1 - Math.exp(-dt * 0.5);
        orbit.tYaw += (home - orbit.tYaw) * k;
        orbit.tPitch += (0 - orbit.tPitch) * k;
      }
      yaw += orbit.yaw;
      pitch += orbit.pitch;
    }
    spin.current.rotation.y = yaw;
    tilt.current.rotation.x = pitch;

    // gathering the light: eased by the shader per point; here just the clock of it
    if (assembled && assembly.current < 1) {
      assembly.current = Math.min(1, assembly.current + Math.min(rawDt, 0.25) / (reducedMotion ? 1 : 3.2));
      if (assembly.current >= 1) {
        beatStart.current = t; // the moment it becomes a heart, it beats
        onAssembled?.();
      }
    }
    const A = assembly.current;
    // a camera passing close by (on its way to the cake or the sign) must never be filled
    // with the heart's light: it quietly withdraws while the camera is near
    grp.getWorldPosition(worldPos);
    const camGap = state.camera.position.distanceTo(worldPos);
    const close = THREE.MathUtils.smoothstep(camGap, 1.4, 2.8);

    if (cloud.current) {
      touch.current = Math.max(0, touch.current - dt * 1.6);
      const expand = Math.max(0, b.s) / 0.075;
      pBeat.current += (expand * beatAmt - pBeat.current) * (1 - Math.exp(-dt * 14));
      const glowAmt = THREE.MathUtils.clamp(0.35 + charge * 0.35 + b.light * 0.45 + h * 0.15, 0, 1.4);
      cloud.current.set({ beat: pBeat.current, glow: glowAmt * close, hoverPos: hoverLocal.current, hover: Math.max(h, touch.current) * A, assemble: A });
    }

    const light = 0.1 + charge * 0.28 + b.light * 0.9 + h * 0.1;
    const kk = 1 - Math.exp(-dt * 8);
    uniforms.uGlow.value += (light * Math.min(1, 0.4 + innerLight) * 0.55 - uniforms.uGlow.value) * kk;
    uniforms.uRim.value += (0.22 + charge * 0.1 + h * 0.3 + b.light * 0.2 - uniforms.uRim.value) * kk;
    if (glow.current) {
      const m = glow.current.material as THREE.SpriteMaterial;
      m.opacity += ((asLight ? 0.07 : 0.1) + charge * 0.12 + b.light * 0.3 + h * 0.05 - m.opacity) * kk;
      glow.current.scale.setScalar((2.8 + charge * 0.8 + b.light * 1.1) * halo);
      m.opacity *= A * close;
    }
    if (inner.current) inner.current.intensity = (1.2 + light * 5) * innerLight * A;
  });

  const handle = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    if (e.intersections.some((h) => h.object.userData.dogHit)) return; // the puppy's touch
    e.stopPropagation();
    if (e.delta > 8 || (orbit && orbit.travel > 10)) return; // that was a drag
    onTap?.();
  };

  return (
    <group ref={group}>
      <Glow ref={glow} color="#ff9fb4" size={2.8} opacity={0.12} />
      <group ref={tilt}>
        <group ref={spin}>
          <group ref={mesh}>
            <mesh
              geometry={geometry}
              material={asLight ? hitMaterial : material}
              onClick={handle}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(true);
                if (interactive && fineHover()) sound.hover('heart');
              }}
              onPointerMove={(e) => {
                if (asLight && mesh.current) hoverLocal.current.copy(mesh.current.worldToLocal(e.point.clone()));
              }}
              onPointerDown={(e) => {
                // on touch there is no hover: let the finger part the light for a moment
                if (asLight && interactive && mesh.current) {
                  hoverLocal.current.copy(mesh.current.worldToLocal(e.point.clone()));
                  touch.current = 1;
                }
              }}
              onPointerOut={() => {
                setHovered(false);
                sound.hoverEnd('heart');
              }}
            />
            {asLight && (
              <ParticleHeart ref={cloud} count={particles} reducedMotion={reducedMotion} ring={ring} />
            )}
          </group>
        </group>
      </group>
      <pointLight ref={inner} color="#ff7d97" intensity={2} distance={3.2} decay={2} position={[0, 0, 0]} />
    </group>
  );
}
