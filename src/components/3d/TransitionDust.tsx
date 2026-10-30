import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';

/**
 * The dust a change of world travels through.
 *
 * From the reference videos (see `reference/VIDEO_ANALYSIS.md`, section G): a chapter never
 * fades into the next one — a seed of light appears at one point, bursts into a front of
 * glitter that eats the old scene outward, and the next scene's colour is already inside
 * that glitter. Measured there: seed ≈0.15 s, the front crosses the frame in ≈0.4 s, it
 * settles over ≈0.3 s, and no frame of the whole change is a white or black cover.
 *
 * Here the front starts at the hero light the camera is diving into (the heart, the orb —
 * always screen centre) and carries the tint of the world she is going to. It lives on a
 * plane a fixed distance in front of the camera (the group rides the camera), draws over
 * everything (`depthTest: false`) and is additive, so it reads as light, not as a curtain.
 *
 *  - `phase: 'close'` — the front runs out from the centre and fills the frame.
 *  - `phase: 'open'`  — the motes keep going outward and clear from the centre first, so
 *                       the new hero is the first thing she sees again.
 *  - `phase: 'none'`  — nothing is drawn (intensity falls to 0 and the draw is skipped).
 */
export type DustPhase = 'none' | 'close' | 'open';

/**
 * `dust` — the field that holds over a cut (every change of world).
 * `warp` — the way into the room: the same motes stretch into streaks and fly past the
 * camera in three layers at different speeds, then brake (storyboard B, 0.5-2.0 s).
 */
export type DustMode = 'dust' | 'warp' | 'veil';
// `veil` — the light sprite leads the way (storyboard D): only the dark at the edges is kept,
// so the sprite's own corridor is the material the change travels through.

interface Props {
  phase: DustPhase;
  mode?: DustMode;
  /** Tint of the world being entered. */
  color: string;
  /** Scales the number of motes (quality tier). */
  factor: number;
  reducedMotion?: boolean;
}

/** Seconds. The close matches the iris closing (1.35 s + its 0.18 s anticipation). */
const CLOSE = 1.2;
/** The opening is slower than the closing — an arrival should breathe out. */
const OPEN = 1.7;
/** How far in front of the camera the dust hangs (well inside the near plane). */
const DEPTH = 1.4;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uOpen;
  uniform float uSpread;
  uniform float uDepth;
  uniform float uSize;
  uniform float uHold;
  uniform float uWarp;
  uniform float uWarpT;
  uniform float uWarpSpeed;
  uniform float uPixelRatio;
  attribute vec2 aDir;
  attribute float aBase;
  attribute float aSeed;
  attribute float aScale;
  attribute float aDepth;
  varying float vAlpha;
  varying float vFront;
  varying float vSeed;
  varying float vStretch;
  varying vec2 vDir;

  void main() {
    vStretch = 1.0;
    vDir = vec2(1.0, 0.0);
    float t = uProgress;
    // the front passing this mote: it wakes just before the front reaches its place
    float wake = smoothstep(aBase - 0.16, aBase + 0.02, t);
    // how close the front is right now — the travelling edge is the bright part
    float edge = exp(-pow((t - aBase) / 0.11, 2.0));

    // every mote hangs at its own distance (aDepth): the field has a front and a back, so
    // while the camera dives the near motes slide past the far ones — depth, not a sticker
    float depth = uDepth * aDepth;
    float spread = uSpread * aDepth;
    float r = aBase * spread * (0.70 + 0.34 * wake + 0.30 * uOpen * smoothstep(aBase, 1.0, t));
    // while the field holds over the cut it keeps breathing in and out, so the screen is
    // never a still picture waiting for the next world
    r += uHold * spread * 0.035 * sin(uTime * 0.55 + aSeed * 9.0);
    float ang = aSeed * 6.2831853 + uTime * 0.45;
    vec3 p = vec3(aDir * r, -depth);
    // a slow individual swirl, so it is dust and not a ring of dots
    p.xy += vec2(cos(ang), sin(ang)) * spread * 0.018 * (0.4 + aScale);
    p.z += sin(uTime * 0.8 + aSeed * 11.0) * 0.04;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // size falls off with distance (a near mote is a soft blob, a far one a pinprick)
    gl_PointSize = min(uSize * aScale * uPixelRatio * (0.55 + 1.30 * edge + 0.60 * uHold) / aDepth, 26.0 * uPixelRatio);

    float twinkle = 0.62 + 0.38 * sin(uTime * (1.1 + aSeed * 1.7) + aSeed * 40.0);
    // closing: the mote stays lit behind the front. opening: it clears from the centre out.
    float lit = mix(wake, 1.0 - smoothstep(aBase - 0.18, aBase + 0.06, t), uOpen);
    vAlpha = clamp(lit, 0.0, 1.0) * twinkle * mix(1.0, 0.55, smoothstep(1.0, 2.2, aDepth));
    vFront = edge;
    vSeed = aSeed;

    // The way in: the same motes become streaks flying past the lens. Each one keeps a
    // fixed distance from the axis and runs from far to near, so perspective alone opens
    // them outward; the three depth layers run at different speeds (parallax), and the
    // sprite is stretched along the direction it is travelling on screen.
    if (uWarp > 0.5) {
      float r0 = 0.05 + aBase * 2.3;
      float sp = 0.42 + aDepth * 0.5;
      float life = fract(aSeed + uWarpT * sp);
      float z = mix(11.0, 0.32, life);
      vec3 wp = vec3(aDir * r0, -z);
      vec4 wmv = modelViewMatrix * vec4(wp, 1.0);
      gl_Position = projectionMatrix * wmv;
      gl_PointSize = clamp(uSize * aScale * uPixelRatio * (4.2 / z), 2.0, 46.0 * uPixelRatio);
      // in at the far end, out before it reaches the lens — never a blast in her face
      vAlpha = smoothstep(11.0, 8.0, z) * smoothstep(0.32, 1.1, z) * twinkle * uWarp;
      vFront = 0.35 + 0.5 * smoothstep(6.0, 1.0, z);
      vStretch = 1.0 + 2.4 * uWarpSpeed * smoothstep(7.0, 0.8, z);
      vec2 scr = gl_Position.xy / max(abs(gl_Position.w), 1e-4);
      vDir = length(scr) > 1e-4 ? normalize(scr) : vec2(1.0, 0.0);
    }
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uHold;
  varying float vAlpha;
  varying float vFront;
  varying float vSeed;
  varying float vStretch;
  varying vec2 vDir;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    // a streak: the speck keeps its length along the way it travels and is squeezed
    // across it (so a fast mote reads as a line of light, not a dot)
    vec2 u = vec2(dot(d, vDir), dot(d, vec2(-vDir.y, vDir.x)) * vStretch);
    float r = length(u);
    if (r > 0.5) discard;
    // soft grain with a small hot centre — a speck of light, never a disc
    float core = smoothstep(0.5, 0.0, r);
    float halo = smoothstep(0.5, 0.12, r);
    // the travelling edge is warmer and brighter; what is left behind is the world's tint
    vec3 col = mix(uColor, mix(uColor, vec3(1.0, 0.92, 0.86), 0.55), vFront);
    float a = vAlpha * uIntensity * (halo * 0.55 + core * 0.85) * (1.0 + 0.75 * uHold);
    gl_FragColor = vec4(col * (0.7 + 0.6 * vFront + 0.35 * uHold), a);
  }
`;

/**
 * The dark that closes in around the dust. It used to be a CSS layer over the canvas, which
 * meant it covered the dust as well and the cut became a second of almost nothing. In the
 * world it sits UNDER the motes: wine-dark creeping in from the edges while the star dust
 * keeps glittering over it, exactly as the reference chapters change.
 */
const vignetteVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const vignetteFragment = /* glsl */ `
  uniform float uCover;
  uniform float uHole;
  uniform float uAspect;
  varying vec2 vUv;

  void main() {
    vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
    float r = length(d);
    float a = uCover * smoothstep(uHole, uHole + 0.55, r);
    // the same wine the iris used: warmer near the light at the centre, ink at the edges
    // wine, not ink: even at its darkest the screen keeps a colour (the references never
    // go near black, and a black frame is the one thing that reads as a cut)
    vec3 col = mix(vec3(0.255, 0.098, 0.142), vec3(0.082, 0.044, 0.058), smoothstep(0.1, 1.2, r));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

const easeOut = (x: number) => 1 - Math.pow(1 - x, 2.4);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** How far the window in the dark has shrunk: open → shut. */
const HOLE = { open: 2.3, shut: -0.5 };

export function TransitionDust({ phase, color, factor, mode = 'dust', reducedMotion = false }: Props) {
  const group = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);
  const veil = useRef<THREE.Mesh>(null);
  const warmed = useRef(0);
  // enough motes that the field itself hides the cut: the iris only darkens the edges
  const count = Math.max(520, Math.round(2600 * Math.min(1, Math.max(0.25, factor))));

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const dir = new Float32Array(count * 2);
    const base = new Float32Array(count);
    const seed = new Float32Array(count);
    const scale = new Float32Array(count);
    const depth = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      dir[i * 2] = Math.cos(a);
      dir[i * 2 + 1] = Math.sin(a);
      // sqrt keeps the motes evenly spread over the area, not bunched at the centre
      base[i] = Math.sqrt(Math.random()) * 0.98 + 0.02;
      seed[i] = Math.random();
      // mostly fine grain with a few larger specks — glitter, not bokeh
      scale[i] = 0.42 + Math.pow(Math.random(), 2.6) * 1.9;
      // 0.75 (right in front of the lens) … 2.3 (well behind): three or four readable planes
      depth[i] = 0.75 + Math.pow(Math.random(), 0.8) * 1.55;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    // the points live in camera space; a generous sphere keeps three from culling them
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -DEPTH), 40);
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpen: { value: 0 },
      uSpread: { value: 2.4 },
      uDepth: { value: DEPTH },
      uSize: { value: 6.2 },
      uHold: { value: 0 },
      uWarp: { value: 0 },
      uWarpT: { value: 0 },
      uWarpSpeed: { value: 0 },
      uPixelRatio: { value: 1 },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color('#f2cdb0') },
    }),
    [],
  );
  const material = useShader(vertex, fragment, uniforms);
  material.depthTest = false;

  const veilUniforms = useMemo(
    () => ({ uCover: { value: 0 }, uHole: { value: HOLE.open }, uAspect: { value: 1.6 } }),
    [],
  );
  const veilMaterial = useShader(vignetteVertex, vignetteFragment, veilUniforms, { additive: false });
  veilMaterial.depthTest = false;

  useEffect(() => {
    uniforms.uColor.value.set(color);
  }, [color, uniforms]);

  // the phase changes rarely; the clock below runs the shape of it
  const run = useRef({ phase: 'none' as DustPhase, t: 0 });
  useEffect(() => {
    run.current = { phase, t: 0 };
  }, [phase]);

  useFrame(({ camera, viewport, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = group.current;
    const p = points.current;
    const v = veil.current;
    if (!g || !p || !v) return;
    const r = run.current;
    // reduced motion: the same shape, told in a third of the time and without the drifting
    // (App's own timings are short there too), so the change is still never a bare cut
    // the way into the room has its own story to tell once she is there (the light draws
    // the room — see RoomBuild), so the dark gets out of the way faster
    const open = mode === 'warp' ? OPEN * 0.6 : OPEN;
    const dur = (r.phase === 'open' ? open : CLOSE) * (reducedMotion ? 0.35 : 1);
    if (r.phase !== 'none') r.t = Math.min(dur, r.t + dt);
    // the closed field HOLDS (it is what hides the change of world); only the opening one
    // fades away when it is done
    const live = r.phase !== 'none' && (r.phase === 'close' || r.t < dur);
    // a short fade on the way out, so nothing pops when the phase is cleared
    const want = live ? 1 : 0;
    uniforms.uIntensity.value += (want - uniforms.uIntensity.value) * (1 - Math.exp(-dt * (want ? 14 : 6)));
    const on = uniforms.uIntensity.value > 0.004;
    // the first frames are drawn at zero alpha (nothing to see): that is when three links
    // these two programs, under the boot veil — never in the middle of a change of world
    const warm = warmed.current < 3;
    if (warm) warmed.current++;
    p.visible = (on && mode !== 'veil') || warm;
    v.visible = on || warm;
    if (!on) return;

    const k = Math.min(1, r.t / dur);
    if (!reducedMotion) uniforms.uTime.value += dt;
    // the streaks: they build up, cruise, then brake as the room arrives
    const warping = mode === 'warp' && !reducedMotion && r.phase !== 'none';
    const speed = warping ? (r.phase === 'close' ? THREE.MathUtils.smoothstep(k, 0, 0.35) : Math.max(0, 1 - k * 2.2)) : 0;
    uniforms.uWarpSpeed.value += (speed - uniforms.uWarpSpeed.value) * (1 - Math.exp(-dt * 4));
    uniforms.uWarp.value += ((warping ? 1 : 0) - uniforms.uWarp.value) * (1 - Math.exp(-dt * 8));
    uniforms.uWarpT.value += dt * uniforms.uWarpSpeed.value * 0.75;
    uniforms.uOpen.value = r.phase === 'open' ? 1 : 0;
    uniforms.uProgress.value = easeOut(k);
    // the settled field over the cut: brighter and fuller than the travelling front, which
    // by then has left the frame — otherwise the hold would be almost dark
    const hold = r.phase === 'close' ? THREE.MathUtils.smoothstep(k, 0.45, 0.95) : 0;
    uniforms.uHold.value += (hold - uniforms.uHold.value) * (1 - Math.exp(-dt * 6));
    uniforms.uPixelRatio.value = viewport.dpr;
    // cover the frame at any lens / aspect: half-diagonal of the view at DEPTH, plus margin
    const cam = camera as THREE.PerspectiveCamera;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * DEPTH;
    const aspect = size.width / Math.max(1, size.height);
    uniforms.uSpread.value = Math.hypot(halfH, halfH * aspect) * 1.18;

    // the dark: it closes a little behind the dust (the glitter is seen first) and opens
    // again a little ahead of it, so she never looks at a still, empty screen
    const closing = r.phase === 'close';
    // led by the light sprite (veil), the dark only gathers at the edges: the corridor of
    // light in the middle is what she travels through, so it must never be covered
    const shut = mode === 'veil' ? 0.85 : HOLE.shut;
    const hole = closing
      ? THREE.MathUtils.lerp(HOLE.open, shut, easeInOut(Math.min(1, k / 0.92)))
      : THREE.MathUtils.lerp(shut, HOLE.open, easeOut(Math.min(1, k / 0.8)));
    veilUniforms.uHole.value = hole;
    veilUniforms.uCover.value = uniforms.uIntensity.value;
    veilUniforms.uAspect.value = aspect;

    // ride the camera: the dust is always in front of the lens, whatever world is on screen
    g.position.copy(cam.position);
    g.quaternion.copy(cam.quaternion);
    // the dark sits a hair behind the motes and covers the whole frame at that distance
    const d = DEPTH + 0.25;
    v.position.set(0, 0, -d);
    const h = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * d * 2.2;
    v.scale.set(h * aspect, h, 1);
  });

  return (
    <group ref={group}>
      <mesh ref={veil} material={veilMaterial} frustumCulled={false} renderOrder={58} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={60} visible={false} />
    </group>
  );
}
