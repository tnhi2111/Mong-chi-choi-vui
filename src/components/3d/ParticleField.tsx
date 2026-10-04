import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';

interface Props {
  count: number;
  /** Radius of the dust cloud. */
  radius?: number;
  /** Keeps an empty pocket in the middle so dust never sits on top of the heart. */
  innerRadius?: number;
  color?: string;
  size?: number;
  /** Bumping this number sends a ripple of light through the particles. */
  burstKey?: number;
  /** 0..1 overall brightness. */
  intensity?: number;
  /** Seconds between a burstKey change and the ripple (e.g. to land on the heartbeat). */
  burstDelay?: number;
  reducedMotion?: boolean;
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uBurst;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  attribute float aScale;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 p = position;
    float t = uTime * 0.12 * uMotion;
    // slow, individual drift
    p.x += sin(t * 1.7 + aSeed * 12.0) * 0.18 * uMotion;
    p.y += cos(t * 1.3 + aSeed * 7.0) * 0.22 * uMotion + sin(t * 0.6 + aSeed * 3.0) * 0.1 * uMotion;
    p.z += sin(t * 1.1 + aSeed * 5.0) * 0.18 * uMotion;
    // burst: push outward along the radius, strongest for close particles
    float d = length(p);
    p += normalize(p + 0.0001) * uBurst * (1.4 / (0.6 + d * 0.35));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uSize * aScale * uPixelRatio * (1.0 + uBurst * 1.2) * (8.0 / -mv.z), 28.0 * uPixelRatio);

    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0);
    vAlpha = twinkle * smoothstep(40.0, 4.0, -mv.z) * smoothstep(0.3, 1.5, -mv.z);
    vSeed = aSeed;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uBurst;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = mix(uColor, vec3(1.0, 0.97, 0.95), 0.35 + 0.4 * vSeed + uBurst * 0.4);
    gl_FragColor = vec4(col, a * vAlpha * uIntensity * (1.0 + uBurst * 1.5));
  }
`;

/** Soft, slowly drifting dust with twinkle and an optional light burst. */
export function ParticleField({
  count,
  radius = 9,
  innerRadius = 1.6,
  color = '#f4c9d0',
  size = 3.2,
  burstKey = 0,
  intensity = 0.8,
  burstDelay = 0,
  reducedMotion = false,
}: Props) {
  const burst = useRef(0);
  const pendingBurst = useRef(-1);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const scale = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(innerRadius + Math.pow(Math.random(), 0.8) * (radius - innerRadius));
      v.y *= 0.7;
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
      scale[i] = 0.35 + Math.pow(Math.random(), 3) * 1.4;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    return g;
  }, [count, radius, innerRadius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBurst: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: reducedMotion ? 0.15 : 1 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    }),
    [],
  );

  useEffect(() => {
    if (burstKey > 0) pendingBurst.current = burstDelay;
  }, [burstKey, burstDelay]);

  useEffect(() => {
    uniforms.uColor.value.set(color);
    uniforms.uSize.value = size;
    uniforms.uMotion.value = reducedMotion ? 0.15 : 1;
  }, [color, size, reducedMotion, uniforms]);

  useFrame((state, dt) => {
    const u = uniforms;
    u.uTime.value = state.clock.elapsedTime;
    if (pendingBurst.current >= 0) {
      pendingBurst.current -= dt;
      if (pendingBurst.current < 0) burst.current = reducedMotion ? 0.25 : 0.8;
    }
    burst.current = Math.max(0, burst.current - dt * 0.9);
    u.uBurst.value = burst.current * burst.current * (3 - 2 * burst.current);
    u.uIntensity.value += (intensity - u.uIntensity.value) * Math.min(1, dt * 2);
  });

  const fieldMat = useShader(vertex, fragment, uniforms);
  return (
    <points geometry={geometry} frustumCulled={false} material={fieldMat} />
  );
}
