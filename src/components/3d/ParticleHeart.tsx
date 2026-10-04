import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeartRadiusTexture, sampleHeartPoints } from './heartShape';
import { useShader } from './useShader';

/**
 * The heart as a cloud of light.
 *
 * Every point has two lives:
 *  • dormant — swirling in the flat ring of light beneath where the heart will be,
 *    or wandering slowly around the scene;
 *  • the heart — once `assemble` runs 0 → 1, each point rises on a spiral (staggered)
 *    to its place in a 3D heart.
 *
 * Inside the heart most points sit on the surface and keep *flowing*: they climb
 * the surface along its meridians from the tip toward the lobes, spiralling slightly,
 * and sink back in at the cleft — a quiet, endless current of light. The rest fill
 * the volume and shimmer, so the heart keeps its depth from every angle.
 *
 * Driven from outside (Heart3D) through `ParticleHeartHandle.set`.
 */
export interface ParticleHeartHandle {
  set(state: { beat: number; glow: number; hoverPos: THREE.Vector3 | null; hover: number; assemble: number }): void;
}

/** Where the dormant ring lies, in the heart's own (local) space. */
export interface DormantRing {
  y: number;
  radius: number;
  tilt: number;
}

const PALETTE = ['#ff2e74', '#ff4a8c', '#ff6fa3', '#ff95bd', '#ffc2da', '#fff0f6'];

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform float uGlow;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform vec3 uHoverPos;
  uniform float uHover;
  uniform float uAssemble;
  uniform sampler2D uRadius;
  uniform float uNormScale;
  uniform float uNormCy;
  uniform float uRingY;
  uniform float uRingR;
  uniform float uRingTilt;
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aColor;
  attribute vec4 aFlow;   // x: on-surface flag, y: φ0, z: θ0, w: speed
  attribute vec4 aStart;  // x: radius (ring: fraction of uRingR), y: angle, z: height, w: wanderer flag
  attribute float aDelay;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;

  const float PI = 3.14159265;

  vec3 onSurface(float th, float ph, float k) {
    vec3 dir = vec3(sin(th) * sin(ph), cos(th), sin(th) * cos(ph));
    float r = texture2D(uRadius, vec2(ph / (2.0 * PI), th / PI)).r * 1.6;
    return (dir * r * k - vec3(0.0, uNormCy, 0.0)) * uNormScale;
  }

  void main() {
    float t = uTime;
    float fade = 1.0;
    vec3 target;
    if (aFlow.x > 0.5) {
      // the current: up from the tip (θ = π) toward the cleft (θ = 0), spiralling gently
      float run = mod(aFlow.z + t * aFlow.w * uMotion, PI);
      float th = PI - run;
      float ph = aFlow.y + t * 0.2 * uMotion;
      target = onSurface(th, ph, 0.93 + 0.07 * aSeed);
      // the meridians crowd together at the tip and the cleft: let the light fade in and out there
      fade = smoothstep(0.05, 0.5, th) * smoothstep(PI, PI - 0.55, th);
    } else {
      target = position;
    }
    // every point shimmers on its own tiny orbit
    target += vec3(sin(t * 1.3 + aSeed * 40.0), cos(t * 1.1 + aSeed * 23.0), sin(t * 0.9 + aSeed * 11.0)) * 0.012 * uMotion;

    // dormant: the flat ring beneath, or a slow wander around the scene
    float wander = aStart.w;
    // same angular speeds as the spiral disc beneath, so the two read as one ring
    float spin = wander > 0.5 ? 0.12 : 0.28 + 0.6 / (0.45 + aStart.x * 1.45);
    float rr = wander > 0.5 ? aStart.x : aStart.x * uRingR;
    float a = aStart.y + t * spin * uMotion;
    vec3 start = vec3(sin(a) * rr, 0.0, cos(a) * rr);
    if (wander > 0.5) {
      start.y = aStart.z + sin(t * 0.3 + aSeed * 20.0) * 0.25;
    } else {
      float c = cos(uRingTilt), s = sin(uRingTilt);
      start = vec3(start.x, start.y * c - start.z * s, start.y * s + start.z * c);
      start.y += uRingY + aStart.z;
    }

    // assembling: staggered, eased, rising on a spiral
    float e = clamp((uAssemble - aDelay * 0.45) / 0.55, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    float swirl = (1.0 - e) * 2.4;
    vec3 tgt = vec3(target.x * cos(swirl) - target.z * sin(swirl), target.y, target.x * sin(swirl) + target.z * cos(swirl));
    vec3 p = mix(start, tgt, e);
    p.y += sin(e * PI) * 0.35;

    // heartbeat: spring outward, with per-point variation
    p *= 1.0 + uBeat * e * (0.05 + 0.09 * aSeed);
    // her finger / cursor parts the light
    vec3 d = p - uHoverPos;
    float near = uHover * exp(-dot(d, d) * 16.0);
    p += normalize(d + 1e-4) * near * 0.09;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dormantSize = wander > 0.5 ? 0.8 : 0.9;
    gl_PointSize = aSize * uPixelRatio * (10.5 / -mv.z) * mix(dormantSize, 1.0, e) * (1.0 + uBeat * 0.5 + near * 1.2);
    // never a flash in her face: a point right in front of the camera fades and stops growing
    float camNear = smoothstep(0.35, 1.8, -mv.z);
    gl_PointSize = min(gl_PointSize, 36.0 * uPixelRatio);

    float twinkle = 0.65 + 0.35 * sin(t * (1.2 + aSeed * 2.5) + aSeed * 60.0);
    float dormantAlpha = wander > 0.5 ? 0.55 : 0.8;
    vAlpha = twinkle * (0.8 + 0.5 * uGlow) * mix(dormantAlpha, fade, e) * camNear;
    vHot = clamp(near * 1.4 + uBeat * 0.6 + sin(e * PI) * 0.5, 0.0, 1.0);
    vColor = aColor;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // a bright core with a soft halo — reads as light, not as dots
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.55;
    float a = (core + halo) * vAlpha;
    vec3 col = mix(vColor, vec3(1.0, 0.95, 0.97), core * 0.35 + vHot * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;

export const ParticleHeart = forwardRef<ParticleHeartHandle, { count: number; reducedMotion: boolean; ring: DormantRing }>(
  function ParticleHeart({ count, reducedMotion, ring }, ref) {
    const geometry = useMemo(() => {
      const g = new THREE.BufferGeometry();
      const pos = sampleHeartPoints(count, 0);
      const seed = new Float32Array(count);
      const size = new Float32Array(count);
      const color = new Float32Array(count * 3);
      const flow = new Float32Array(count * 4);
      const start = new Float32Array(count * 4);
      const delay = new Float32Array(count);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        seed[i] = Math.random();
        // mostly fine dust, a few larger "petals" of light
        size[i] = 1.1 + Math.pow(Math.random(), 3) * 3.4;
        const y = pos[i * 3 + 1];
        const lift = THREE.MathUtils.clamp((y + 0.6) / 1.2, 0, 1);
        const idx = Math.min(PALETTE.length - 1, Math.floor(Math.pow(Math.random(), 1.6 - lift * 0.6) * PALETTE.length));
        c.set(PALETTE[idx]);
        color.set([c.r, c.g, c.b], i * 3);
        // 62% flow on the surface, the rest fill the volume (their `position`)
        const onSurface = Math.random() < 0.62;
        flow.set([onSurface ? 1 : 0, Math.random() * Math.PI * 2, Math.random() * Math.PI, 0.22 + Math.random() * 0.24], i * 4);
        // dormant: most in the ring (dense toward its rim), some wandering around the scene
        const wanderer = Math.random() < 0.22;
        if (wanderer) {
          start.set([2.2 + Math.random() * 3.2, Math.random() * Math.PI * 2, -1.2 + Math.random() * 3.4, 1], i * 4);
        } else {
          const r = Math.random() < 0.6 ? 0.8 + (Math.random() - 0.5) * 0.35 : 0.15 + Math.pow(Math.random(), 0.8) * 0.8;
          start.set([r, Math.log(r * 1.45 + 0.2) * 1.8 + (i % 6) * (Math.PI / 3) + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.04, 0], i * 4);
        }
        // the ring's inner light leaves first, the wanderers last
        delay[i] = wanderer ? 0.55 + Math.random() * 0.45 : Math.random() * 0.7;
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
      g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
      g.setAttribute('aStart', new THREE.BufferAttribute(start, 4));
      g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
      return g;
    }, [count]);
    useEffect(() => () => geometry.dispose(), [geometry]);

    const uniforms = useMemo(() => {
      const r = getHeartRadiusTexture();
      return {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uGlow: { value: 0.5 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMotion: { value: 1 },
        uHoverPos: { value: new THREE.Vector3(0, 0, 9) },
        uHover: { value: 0 },
        uAssemble: { value: 1 },
        uRadius: { value: r.texture },
        uNormScale: { value: r.scale },
        uNormCy: { value: r.cy },
        uRingY: { value: 0 },
        uRingR: { value: 1 },
        uRingTilt: { value: 0 },
      };
    }, []);
    useEffect(() => {
      uniforms.uMotion.value = reducedMotion ? 0.2 : 1;
      uniforms.uRingY.value = ring.y;
      uniforms.uRingR.value = ring.radius;
      uniforms.uRingTilt.value = ring.tilt;
    }, [reducedMotion, ring.y, ring.radius, ring.tilt, uniforms]);

    useImperativeHandle(
      ref,
      () => ({
        set({ beat, glow, hoverPos, hover, assemble }) {
          uniforms.uBeat.value = beat;
          uniforms.uGlow.value = glow;
          if (hoverPos) uniforms.uHoverPos.value.copy(hoverPos);
          uniforms.uHover.value = hover;
          uniforms.uAssemble.value = assemble;
        },
      }),
      [uniforms],
    );

    useFrame((state) => {
      uniforms.uTime.value = state.clock.elapsedTime;
    });

    const material = useShader(vertex, fragment, uniforms);
    return <points geometry={geometry} frustumCulled={false} renderOrder={1} material={material} />;
  },
);
