import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Glow } from './Glow';
import { useShader } from './useShader';
import { sound } from '../../lib/audio';
import { gifts } from '../../data/gifts';

/*
 * The memory celestial: a small universe kept inside a glass orb — the room's centerpiece
 * and the heart of the finale (it replaced the heart of light: "two people have made a
 * small world of memories together", said without drawing a heart).
 *
 * Built from a few cheap pieces, all in the orb's own space (radius ≈ 1):
 *  • one point cloud (GPU): star dust on slow drifts, warm motes on five tilted orbital
 *    bands, a few brighter motes close to the core. Every motion is in the vertex shader;
 *    the CPU only writes a handful of uniforms per frame.
 *  • a hand-shaped glass shell (two passes of one small shader): almost invisible, it shows
 *    itself only by its rim, a few warm highlights and a faint lens-like streak.
 *  • the core: a tiny warm star (two halos) and the room's one coloured point light.
 *  • ~34 anchor stars (CPU, tiny buffers) that gather into abstract constellations when she
 *    touches it, joined by hair-thin lines drawn one after another; the orbital paths; the
 *    titles of her memories (sprites, only real data — placeholders are skipped).
 *
 * Touch: CONTACT (it holds its breath, the light leans in to the core) → EXPANSION (the
 * glass shows, the orbits open) → CONSTELLATION → MEMORIES → RETURN (≈ 6 s). Touched again
 * once it is calm: it folds into its core and lets one slow wave of light go — and says
 * "our little universe".
 */

const R_COLORS = {
  // star dust: ivory, champagne, a rare cool lavender
  dust: ['#f3e6d8', '#e9d3b4', '#d9c2b0', '#c8b6d8'],
  // the warm motes: rose, blush, wine, champagne
  warm: ['#e8a3ad', '#f0c2c3', '#c2606f', '#e2bf8f', '#f2d9c0'],
  bright: ['#ffd9b8', '#f7c1b0', '#ffe4cc'],
};

/** Five orbital bands: radius, tilt, node, thickness, share of the warm motes. */
const BANDS = [
  { r: 0.62, incl: 0.18, node: 0.0, h: 0.035, share: 0.3 },
  { r: 0.78, incl: 0.62, node: 1.3, h: 0.03, share: 0.2 },
  { r: 0.45, incl: -0.42, node: 2.4, h: 0.025, share: 0.2 },
  { r: 0.88, incl: 1.05, node: 4.1, h: 0.02, share: 0.12 },
  { r: 0.33, incl: 0.85, node: 5.2, h: 0.02, share: 0.18 },
];

/* ── seeded randomness: the universe is the same every time she comes back ── */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rotX = (v: THREE.Vector3, a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v.set(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
};
const rotY = (v: THREE.Vector3, a: number) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
};
/** A point on an orbit — the same maths as the vertex shader. */
function orbitPoint(out: THREE.Vector3, r: number, incl: number, node: number, a: number, h: number) {
  out.set(Math.cos(a) * r, h, Math.sin(a) * r);
  return rotY(rotX(out, incl), node);
}

/* ── shaders ────────────────────────────────────────────────────────────── */
export const celestialVertex = /* glsl */ `
  uniform float uTime;      // the orbital clock (it pauses for a breath when touched)
  uniform float uClock;     // real time (shimmer)
  uniform float uPR;
  uniform float uMotion;
  uniform float uBreath;
  uniform float uAssemble;
  uniform float uConverge;
  uniform float uExpand;
  uniform float uConst;
  uniform float uCollapse;
  uniform float uWave;
  uniform vec3 uHoverPos;
  uniform float uHover;
  uniform float uGlow;
  uniform float uFocus;
  uniform float uOn;
  attribute vec4 aOrbit;   // radius, tilt, node, phase
  attribute vec4 aShape;   // angular speed, height off the orbit plane, seed, layer
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec3 aStart;   // where it waits before the universe gathers
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  varying float vSoft;

  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

  void main() {
    float seed = aShape.z;
    float layer = aShape.w;
    float a = aOrbit.w + uTime * aShape.x;
    vec3 p = rotY(rotX(vec3(cos(a) * aOrbit.x, aShape.y, sin(a) * aOrbit.x), aOrbit.y), aOrbit.z);
    // every mote also drifts on its own, very little
    p += vec3(sin(uClock * 0.37 + seed * 31.0), cos(uClock * 0.29 + seed * 17.0), sin(uClock * 0.33 + seed * 47.0)) * 0.012 * uMotion;
    float rr = length(p);
    p *= 1.0 + uBreath;
    // contact: the light leans in toward the core
    p *= 1.0 - uConverge * (0.28 + 0.25 * seed);
    // expansion: the little universe opens
    p *= 1.0 + uExpand * (0.14 + 0.2 * seed) * (0.6 + 0.4 * rr);
    // the secret: it folds into its core
    p *= 1.0 - uCollapse * (0.86 + 0.1 * seed);
    // her hand: the motes nearby lean toward it, brighten, and a soft ripple runs out
    vec3 d = uHoverPos - p;
    float dd = dot(d, d);
    float near = uHover * exp(-dd * 14.0);
    float ripple = uHover * sin(sqrt(dd) * 22.0 - uClock * 4.0) * exp(-dd * 6.0);
    p += d * near * 0.22 + normalize(d + 1e-4) * ripple * 0.006;
    // gathering (the finale): from scattered light into the orb
    float e = clamp((uAssemble - seed * 0.4) / 0.6, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    p = mix(aStart, p, e);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // a shallow depth of field around the core's plane: softer, dimmer motes in front/behind
    float blur = clamp(abs(-mv.z - uFocus) * 1.1, 0.0, 1.0);
    float wave = uWave < 0.0 ? 0.0 : exp(-pow((length(p) - uWave) * 7.0, 2.0));
    float size = aSize * (1.0 + blur * 0.5 + near * 0.9 + wave * 0.6);
    // seen from across the room the motes would shrink to nothing: they keep some presence
    float far = smoothstep(3.0, 8.5, -mv.z);
    gl_PointSize = min(size * uPR * (9.0 / -mv.z) * (1.0 + far * 0.9), 26.0 * uPR);
    // never a flash in her face when the camera passes close
    float camNear = smoothstep(0.35, 1.8, -mv.z);
    float tw = 0.75 + 0.25 * sin(uClock * (0.6 + seed * 1.7) + seed * 70.0);
    // now and then, a single tiny pulse of light
    float pulse = pow(max(0.0, sin(uClock * (0.23 + seed * 0.31) + seed * 91.0)), 40.0) * step(0.6, fract(seed * 13.0));
    float dim = layer < 0.5 ? 1.0 - uConst * 0.45 : 1.0 - uConst * 0.2;
    vAlpha = (tw + pulse * 1.5) * (1.0 - blur * 0.35 * (1.0 - far)) * (1.0 + far * 0.3) * camNear * uOn * dim * (0.55 + 0.45 * uGlow) * mix(0.35, 1.0, e);
    vHot = clamp(near * 1.6 + wave * 0.45 + pulse + uConverge * 0.4 * (1.0 - rr), 0.0, 1.0);
    vSoft = blur;
    vColor = aColor;
  }
`;

export const celestialFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  varying float vSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(mix(0.2, 0.08, vSoft), 0.0, d);
    float halo = smoothstep(0.5, 0.05, d) * mix(0.32, 0.55, vSoft);
    float a = (core * (1.0 - vSoft * 0.5) + halo) * vAlpha;
    vec3 col = mix(vColor, vec3(1.0, 0.9, 0.8), core * 0.22 + vHot * 0.4);
    gl_FragColor = vec4(col * (1.0 + vHot * 0.5), a);
  }
`;

/** The glass: nearly invisible — a warm rim, small highlights, a faint lens streak. */
export const orbGlassVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  void main() {
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
export const orbGlassFragment = /* glsl */ `
  uniform float uVis;
  uniform float uOn;
  uniform float uInner;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  void main() {
    vec3 n = normalize(vN);
    if (uInner > 0.5) n = -n;
    vec3 v = normalize(vV);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fres = pow(1.0 - facing, 4.0);
    if (uInner > 0.5) {
      // the far wall: only a whisper of the rim, as seen through the glass
      gl_FragColor = vec4(vec3(0.75, 0.55, 0.6) * fres * 0.5, fres * 0.12 * uVis * uOn);
      return;
    }
    vec3 R = reflect(-v, n);
    // the room's warm lamps and the cool window, caught on the curve
    float sp = pow(max(dot(R, normalize(vec3(-0.45, 0.62, 0.65))), 0.0), 180.0) * 0.9
             + pow(max(dot(R, normalize(vec3(0.72, 0.32, 0.6))), 0.0), 120.0) * 0.35;
    float moon = pow(max(dot(R, normalize(vec3(-0.8, 0.4, -0.3))), 0.0), 60.0) * 0.18;
    // a soft, elongated streak, as a lens would show it
    float streak = exp(-pow((dot(R, normalize(vec3(0.0, 0.25, 1.0))) - 0.86) * 18.0, 2.0)) * smoothstep(0.2, 0.7, R.y + 0.6) * 0.1;
    vec3 c = vec3(1.0, 0.86, 0.72) * fres * 0.42      // champagne rim
           + vec3(0.78, 0.68, 0.95) * pow(fres, 2.0) * 0.12 // the faintest lavender at grazing angles
           + vec3(1.0, 0.94, 0.86) * sp
           + vec3(0.62, 0.72, 1.0) * moon
           + vec3(1.0, 0.85, 0.8) * streak;
    float a = 0.015 + fres * 0.32 + sp * 0.8 + moon * 0.5 + streak;
    gl_FragColor = vec4(c, clamp(a * uVis, 0.0, 1.0) * uOn);
  }
`;

/** Anchor stars and their constellation lines (tiny CPU-written buffers). */
const starVertex = /* glsl */ `
  uniform float uPR;
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uPR * (9.0 / -mv.z) * (1.0 + smoothstep(3.0, 8.5, -mv.z) * 0.9), 30.0 * uPR);
    vAlpha = aAlpha * smoothstep(0.35, 1.8, -mv.z);
  }
`;
const starFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.4;
    gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.92), core * 0.6), (core + halo) * vAlpha);
  }
`;
export const lineVertex = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const lineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(uColor, vAlpha * uAlpha); }
`;

/* ── the universe's contents (built once) ───────────────────────────────── */
function buildMotes(count: number) {
  const rand = rng(20260105);
  const orbit = new Float32Array(count * 4);
  const shape = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const start = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3); // (bounds only — the shader places them)
  const c = new THREE.Color();
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  // a few denser "clouds" and two quiet voids in the dust: composed, not uniform
  const clumps = Array.from({ length: 6 }, () => new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.8, rand() - 0.5).normalize().multiplyScalar(0.45 + rand() * 0.4));
  const voids = [new THREE.Vector3(0.5, 0.35, -0.2), new THREE.Vector3(-0.35, -0.45, 0.4)];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const u = rand();
    let r: number, incl: number, node: number, h: number, speed: number, layer: number, sz: number;
    if (u < 0.55) {
      // layer 1 — star dust: slow drift on its own random orbit, some gathered into clouds
      layer = 0;
      let tries = 0;
      do {
        if (rand() < 0.4) {
          const k = clumps[Math.floor(rand() * clumps.length)];
          v.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.36).add(k);
        } else {
          v.set(rand() * 2 - 1, (rand() * 2 - 1) * 0.92, rand() * 2 - 1);
        }
        tries++;
      } while ((v.length() > 0.97 || v.length() < 0.12 || voids.some((q) => q.distanceTo(v) < 0.24)) && tries < 20);
      r = Math.hypot(v.x, v.z);
      h = v.y;
      incl = (rand() - 0.5) * 0.3;
      node = rand() * Math.PI * 2;
      speed = (0.012 + rand() * 0.02) * (rand() < 0.5 ? 1 : -0.6);
      sz = 0.9 + rand() * 0.8;
      c.set(pick(R_COLORS.dust)).multiplyScalar(0.6 + rand() * 0.35);
    } else if (u < 0.985) {
      // layer 2 — warm motes on the tilted bands (a few cross between them)
      layer = 1;
      let b = BANDS[0];
      let acc = 0;
      const pickB = rand();
      for (const band of BANDS) {
        acc += band.share;
        if (pickB <= acc) {
          b = band;
          break;
        }
      }
      const stray = rand() < 0.08;
      r = b.r * (1 + (rand() - 0.5) * (stray ? 0.6 : 0.16));
      incl = b.incl + (rand() - 0.5) * (stray ? 0.6 : 0.08);
      node = b.node + (rand() - 0.5) * (stray ? 0.8 : 0.06);
      h = (rand() - 0.5) * 2 * b.h;
      speed = 0.07 / Math.pow(r + 0.2, 1.5) * (0.85 + rand() * 0.3);
      sz = 1.5 + Math.pow(rand(), 2) * 1.9;
      c.set(pick(R_COLORS.warm)).multiplyScalar(0.6 + rand() * 0.4);
    } else {
      // layer 3 — a few brighter motes close around the core
      layer = 2;
      r = 0.12 + rand() * 0.32;
      incl = (rand() - 0.5) * 1.6;
      node = rand() * Math.PI * 2;
      h = (rand() - 0.5) * 0.05;
      speed = 0.1 + rand() * 0.08;
      sz = 2.8 + rand() * 1.6;
      c.set(pick(R_COLORS.bright)).multiplyScalar(0.85);
    }
    orbit.set([r, incl, node, rand() * Math.PI * 2], i * 4);
    shape.set([speed, h, rand(), layer], i * 4);
    color.set([c.r, c.g, c.b], i * 3);
    size[i] = sz;
    // before the finale gathers it: spread wide, a loose shell of light around the scene
    v.set(rand() - 0.5, (rand() - 0.5) * 0.6, rand() - 0.5).normalize().multiplyScalar(2.2 + rand() * 3);
    start.set([v.x, v.y - 0.4, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
  g.setAttribute('aShape', new THREE.BufferAttribute(shape, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  return g;
}

/** The glass: a sphere shaped by hand — a little uneven, a little heavier below. */
let glassGeo: THREE.BufferGeometry | null = null;
export function getOrbGeometry(): THREE.BufferGeometry {
  if (glassGeo) return glassGeo;
  // (welded: an icosphere comes as separate triangles, which would light facet by facet)
  const ico = new THREE.IcosahedronGeometry(1, 14);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  ico.dispose();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + Math.sin(x * 2.3 + y * 1.7) * 0.018 + Math.sin(z * 3.1 - x * 1.4) * 0.014 + Math.sin(y * 4.2 + z * 2.2) * 0.008 - y * 0.012;
    p.setXYZ(i, x * k, y * k * 0.97, z * k);
  }
  g.computeVertexNormals();
  glassGeo = g;
  return g;
}

interface Star {
  orbit: [number, number, number, number, number]; // r, incl, node, phase, speed
  target: THREE.Vector3;
  group: number;
  order: number;
}

/** Five abstract constellations, scattered round the orb (each a short path with a branch). */
function buildConstellations() {
  const rand = rng(1402);
  const stars: Star[] = [];
  const edges: [number, number, number][] = []; // a, b, order (when it is drawn)
  const centers: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let gi = 0; gi < 5; gi++) {
    const y = 0.55 - (gi / 4) * 1.1;
    const rad = Math.sqrt(1 - y * y);
    const th = gi * golden + 0.6;
    const center = new THREE.Vector3(Math.cos(th) * rad, y * 0.8, Math.sin(th) * rad).normalize();
    const radius = 0.6 + rand() * 0.18;
    centers.push(center.clone().multiplyScalar(radius));
    // tangent frame
    const t1 = new THREE.Vector3(0, 1, 0).cross(center).normalize();
    if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
    const t2 = center.clone().cross(t1).normalize();
    const n = 5 + Math.floor(rand() * 3);
    const base = stars.length;
    let px = 0;
    let py = 0;
    let dir = rand() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      if (k > 0) {
        dir += (rand() - 0.5) * 1.6;
        const step = 0.1 + rand() * 0.09;
        px += Math.cos(dir) * step;
        py += Math.sin(dir) * step;
      }
      const target = center.clone().add(t1.clone().multiplyScalar(px)).add(t2.clone().multiplyScalar(py)).normalize().multiplyScalar(radius + (rand() - 0.5) * 0.08);
      stars.push({
        orbit: [0.3 + rand() * 0.55, (rand() - 0.5) * 1.4, rand() * Math.PI * 2, rand() * Math.PI * 2, 0.04 + rand() * 0.05],
        target,
        group: gi,
        order: k,
      });
      if (k > 0) edges.push([base + k - 1, base + k, k - 1]);
    }
    // one branch from the middle star to a new one
    const mid = base + Math.floor(n / 2);
    const extra = stars[mid].target.clone().add(t1.clone().multiplyScalar(0.1 * (rand() < 0.5 ? 1 : -1))).add(t2.clone().multiplyScalar(0.12)).normalize().multiplyScalar(radius);
    stars.push({ orbit: [0.3 + rand() * 0.5, (rand() - 0.5) * 1.4, rand() * Math.PI * 2, rand() * Math.PI * 2, 0.05], target: extra, group: gi, order: n });
    edges.push([mid, stars.length - 1, n - 1]);
  }
  return { stars, edges, centers };
}

/** Her memories, as written in the gift list — only what is real (no placeholders). */
function memoryWords(): string[] {
  const real = (s?: string) => !!s && !/[[\]]/.test(s);
  const out: string[] = [];
  for (const g of gifts) {
    if (g.kind !== 'memory') continue;
    if (real(g.title)) out.push(g.title);
    else if (real(g.subtitle)) out.push(g.subtitle!);
  }
  return out.slice(0, 5);
}

/** A word drawn in the page's serif, as a texture (width / height kept for its aspect). */
function wordTexture(text: string, italic: boolean, px = 64) {
  const font = `${italic ? 'italic ' : ''}400 ${px}px 'Cormorant Garamond', Georgia, serif`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + px * 0.8);
  c.width = w;
  c.height = Math.ceil(px * 1.6);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255, 196, 170, 0.55)';
  g.shadowBlur = px * 0.25;
  g.fillStyle = '#f6e7d4';
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / c.height };
}

export interface MemoryCelestialHandle {
  /** The finale's "one more thing": one slow wave of light (no words). */
  wave(): void;
}

interface Props {
  count: number;
  scale?: number;
  interactive?: boolean;
  reducedMotion?: boolean;
  /** 0 → 1: the scattered light gathers into the orb (the finale; a ref to animate it). Default: gathered. */
  assemble?: number | { current: number };
  /** Called on a touch, `tapAfter` ms later (the room uses it to go on to the finale). */
  onTap?: () => void;
  tapAfter?: number;
  /** How awake the universe is (0..1): the core and the motes are a little brighter. */
  charge?: number;
  /** Words may appear inside it (her memories, the secret phrase). */
  words?: boolean;
}

const fineHover = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const sm = THREE.MathUtils.smoothstep;
const bump = (t: number, a: number, b: number, fade: number) => sm(t, a, a + fade) * (1 - sm(t, b - fade, b));
const worldPos = new THREE.Vector3();
const tmp = new THREE.Vector3();
const SEQ = 6.2; // the touch sequence, seconds
const SECRET = 6.0;

export const MemoryCelestial = forwardRef<MemoryCelestialHandle, Props>(function MemoryCelestial(
  { count, scale = 1, interactive = false, reducedMotion = false, assemble: assembleIn = 1, onTap, tapAfter = 0, charge = 0.5, words = true },
  ref,
) {
  const geometry = useMemo(() => buildMotes(count), [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uClock: { value: 0 },
      uPR: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: 1 },
      uBreath: { value: 0 },
      uAssemble: { value: 1 },
      uConverge: { value: 0 },
      uExpand: { value: 0 },
      uConst: { value: 0 },
      uCollapse: { value: 0 },
      uWave: { value: -1 },
      uHoverPos: { value: new THREE.Vector3(0, 0, 9) },
      uHover: { value: 0 },
      uGlow: { value: 0.5 },
      uFocus: { value: 6 },
      uOn: { value: 1 },
    }),
    [],
  );
  const motes = useShader(celestialVertex, celestialFragment, uniforms);

  // the glass, two passes
  const glassU = useMemo(() => ({ uVis: { value: 1 }, uOn: { value: 1 }, uInner: { value: 0 }, uTime: { value: 0 } }), []);
  const glassInU = useMemo(() => ({ ...glassU, uInner: { value: 1 } }), [glassU]);
  const glassFront = useShader(orbGlassVertex, orbGlassFragment, glassU, { additive: false });
  const glassBack = useShader(orbGlassVertex, orbGlassFragment, glassInU, { additive: false, side: THREE.BackSide });
  const orbGeo = useMemo(getOrbGeometry, []);

  // constellations: anchor stars + lines; the orbital paths
  const sky = useMemo(buildConstellations, []);
  const starU = useMemo(() => ({ uPR: { value: Math.min(window.devicePixelRatio, 2) }, uColor: { value: new THREE.Color('#ffd9bf') } }), []);
  const starMat = useShader(starVertex, starFragment, starU);
  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sky.stars.length * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(sky.stars.length), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(sky.stars.map((_, i) => 2.6 + (i % 3) * 0.7)), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return g;
  }, [sky]);
  const lineU = useMemo(() => ({ uColor: { value: new THREE.Color('#f3c9b4') }, uAlpha: { value: 0.55 } }), []);
  const lineMat = useShader(lineVertex, lineFragment, lineU);
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sky.edges.length * 6), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(sky.edges.length * 2), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    return g;
  }, [sky]);
  const pathU = useMemo(() => ({ uColor: { value: new THREE.Color('#e9bfa3') }, uAlpha: { value: 0.04 } }), []);
  const pathMat = useShader(lineVertex, lineFragment, pathU);
  const pathGeo = useMemo(() => {
    const seg = 160;
    const pts: number[] = [];
    const al: number[] = [];
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (const b of BANDS) {
      for (let k = 0; k < seg; k++) {
        orbitPoint(v, b.r, b.incl, b.node, (k / seg) * Math.PI * 2, 0);
        orbitPoint(w, b.r, b.incl, b.node, ((k + 1) / seg) * Math.PI * 2, 0);
        pts.push(v.x, v.y, v.z, w.x, w.y, w.z);
        // a path is never a full drawn ring: it fades in and out along its length
        const f = (k: number) => 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin((k / seg) * Math.PI * 2 * 2 + b.node), 2);
        al.push(f(k), f(k + 1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(al, 1));
    return g;
  }, []);
  useEffect(
    () => () => {
      starGeo.dispose();
      lineGeo.dispose();
      pathGeo.dispose();
    },
    [starGeo, lineGeo, pathGeo],
  );

  // the words: her memories (one by each constellation), and the secret phrase
  const [labels, setLabels] = useState<{ tex: THREE.CanvasTexture; aspect: number; at: THREE.Vector3 }[]>([]);
  const [phrase, setPhrase] = useState<{ tex: THREE.CanvasTexture; aspect: number } | null>(null);
  useEffect(() => {
    if (!words) return;
    let live = true;
    const made: THREE.Texture[] = [];
    const build = () => {
      if (!live) return;
      const ws = memoryWords();
      const ls = ws.map((w, i) => {
        const t = wordTexture(w, true);
        made.push(t.tex);
        return { ...t, at: sky.centers[i % sky.centers.length].clone().multiplyScalar(1.02).add(new THREE.Vector3(0, -0.07, 0)) };
      });
      const p = wordTexture('our little universe', true, 72);
      made.push(p.tex);
      setLabels(ls);
      setPhrase(p);
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) void fonts.load("italic 400 64px 'Cormorant Garamond'").then(build, build);
    else build();
    return () => {
      live = false;
      made.forEach((t) => t.dispose());
    };
  }, [words, sky]);

  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const paths = useRef<THREE.Group>(null);
  const coreA = useRef<THREE.Sprite>(null);
  const coreB = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const wordRefs = useRef<THREE.Sprite[]>([]);
  const phraseRef = useRef<THREE.Sprite>(null);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), []);
  useEffect(() => () => hit.dispose(), [hit]);

  const st = useRef({
    sim: 0,
    seqAt: -100, // when the touch sequence started (real clock)
    secretAt: -100,
    waveAt: -100,
    hover: 0,
    hoverWorld: new THREE.Vector3(0, 0, 99),
    hovering: false,
    nextSecret: false,
    clock: 0,
  });
  const [hovered, setHovered] = useState(false);

  useImperativeHandle(ref, () => ({
    wave() {
      st.current.waveAt = st.current.clock;
    },
  }));

  useEffect(() => {
    if (!interactive) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, interactive]);
  useEffect(() => {
    uniforms.uMotion.value = reducedMotion ? 0.25 : 1;
  }, [reducedMotion, uniforms]);

  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, rawDt) => {
    const grp = group.current;
    const sp = spin.current;
    if (!grp || !sp) return;
    const s = st.current;
    const dt = Math.min(rawDt, 0.05);
    s.clock += dt;
    const t = s.clock;
    const motion = reducedMotion ? 0.25 : 1;
    const assemble = typeof assembleIn === 'number' ? assembleIn : assembleIn.current;

    // where are we in a touch sequence?
    const T = t - s.seqAt;
    const inSeq = T >= 0 && T < SEQ;
    const S = t - s.secretAt;
    const inSecret = S >= 0 && S < SECRET;
    const contact = inSeq ? bump(T, 0, 0.42, 0.12) : 0;
    const expand = inSeq ? bump(T, 0.2, SEQ - 0.3, 0.9) : 0;
    const constel = inSeq ? bump(T, 0.8, SEQ - 0.2, 1.4) : 0;
    const memories = inSeq ? bump(T, 2.0, SEQ - 0.6, 0.9) : 0;
    const collapse = inSecret ? sm(S, 0, 0.9) * (1 - sm(S, 1.2, 2.6)) : 0;

    // the orbital clock: it holds its breath on contact and when folding in
    s.sim += dt * motion * (1 - contact * 0.95) * (1 - collapse * 0.8);
    const u = uniforms;
    u.uTime.value = s.sim;
    u.uClock.value = t;
    u.uBreath.value = Math.sin(t * 0.55) * 0.018 * motion;
    u.uAssemble.value = assemble;
    const k = 1 - Math.exp(-dt * 9);
    u.uConverge.value += (contact - u.uConverge.value) * k;
    u.uExpand.value += (expand * (reducedMotion ? 0.3 : 1) - u.uExpand.value) * (1 - Math.exp(-dt * 4));
    // (the motes step back a little while constellations or the phrase are showing)
    const phraseOn = inSecret ? bump(S, 1.8, SECRET, 1.0) : 0;
    u.uConst.value = Math.max(constel, phraseOn);
    u.uCollapse.value += (collapse - u.uCollapse.value) * k;
    // the slow release wave (the secret, or the finale's "one more thing")
    const live = (x: number) => x >= 0 && x < 3.2;
    const w1 = inSecret ? S - 1.5 : -1;
    const w2 = t - s.waveAt;
    const wT = live(w1) ? w1 : live(w2) ? w2 : -1;
    u.uWave.value = wT >= 0 ? sm(wT, 0, 3.2) * 1.5 : -1;

    // her hand
    s.hover += ((s.hovering && interactive ? 1 : 0) - s.hover) * (1 - Math.exp(-dt * 4));
    if (s.hover > 0.001) u.uHoverPos.value.copy(sp.worldToLocal(tmp.copy(s.hoverWorld)));
    u.uHover.value = s.hover * (1 - contact);

    // the whole orb turns very slowly about a slightly tilted axis; it breathes
    sp.rotation.y = s.sim * 0.045;
    sp.rotation.z = 0.12 + Math.sin(t * 0.07) * 0.03 * motion;
    grp.position.y = Math.sin(t * 0.42) * 0.03 * motion;
    grp.scale.setScalar(scale * (1 + expand * 0.06 * (reducedMotion ? 0.3 : 1)));

    // a camera passing close by never fills with its light
    grp.getWorldPosition(worldPos);
    const camGap = state.camera.position.distanceTo(worldPos);
    const close = sm(camGap, 1.4 * scale + 0.4, 2.8 * scale + 0.6);
    u.uOn.value = close;
    v.copy(worldPos).applyMatrix4(state.camera.matrixWorldInverse);
    u.uFocus.value = -v.z;
    const glow = 0.45 + charge * 0.35 + s.hover * 0.1 + contact * 0.4 + collapse * 0.3;
    u.uGlow.value += (glow - u.uGlow.value) * k;

    // the glass shows itself more as it opens
    glassU.uVis.value = 1 + expand * 1.1 + contact * 0.4;
    glassU.uOn.value = close * Math.min(1, assemble * 1.2);

    // the core: a tiny warm star — brighter on contact, a breath of its own
    const coreLight = (0.55 + charge * 0.25 + contact * 0.7 + collapse * 0.9 + Math.sin(t * 0.8) * 0.05) * close * assemble;
    if (coreA.current) {
      const m = coreA.current.material as THREE.SpriteMaterial;
      m.opacity = 0.75 * coreLight;
      coreA.current.scale.setScalar(0.12 + contact * 0.05 + collapse * 0.08);
    }
    if (coreB.current) {
      const m = coreB.current.material as THREE.SpriteMaterial;
      m.opacity = 0.32 * coreLight;
      coreB.current.scale.setScalar(0.42 + contact * 0.15 + collapse * 0.3);
    }
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.opacity = (0.07 + charge * 0.04 + expand * 0.03) * close * assemble;
    }
    if (light.current) light.current.intensity = (1.0 + charge * 0.9 + contact * 1.2 + collapse * 1.5) * assemble;

    // the orbital paths: barely there, clearer while it is open
    pathU.uAlpha.value = (0.035 + expand * 0.26) * close * assemble;
    if (paths.current) paths.current.scale.setScalar(1 + u.uExpand.value * 0.26);

    // anchors → constellations; lines drawn one after another
    const pos = starGeo.attributes.position as THREE.BufferAttribute;
    const al = starGeo.attributes.aAlpha as THREE.BufferAttribute;
    const breathe = 1 + u.uBreath.value;
    for (let i = 0; i < sky.stars.length; i++) {
      const star = sky.stars[i];
      const [r, incl, node, ph, speed] = star.orbit;
      orbitPoint(v, r, incl, node, ph + s.sim * speed, 0);
      v.multiplyScalar(breathe * (1 - u.uConverge.value * 0.3) * (1 - u.uCollapse.value * 0.9) * (1 + u.uExpand.value * 0.18));
      const e = THREE.MathUtils.clamp(constel * 1.25 - star.group * 0.06 - star.order * 0.02, 0, 1);
      const ee = e * e * (3 - 2 * e);
      v.lerp(star.target, ee);
      pos.setXYZ(i, v.x, v.y, v.z);
      al.setX(i, (0.42 + ee * 0.58 + Math.sin(t * 1.3 + i) * 0.08) * close * assemble);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
    const lp = lineGeo.attributes.position as THREE.BufferAttribute;
    const la = lineGeo.attributes.aAlpha as THREE.BufferAttribute;
    for (let j = 0; j < sky.edges.length; j++) {
      const [a, b, order] = sky.edges[j];
      const g = sky.stars[a].group;
      // each line grows from its first star to its second, in order, a constellation at a time
      const start = 1.3 + g * 0.22 + order * 0.16;
      const grow = inSeq ? sm(T, start, start + 0.45) : 0;
      const fade = inSeq ? 1 - sm(T, SEQ - 1.4, SEQ - 0.5) : 0;
      const ax = pos.getX(a);
      const ay = pos.getY(a);
      const az = pos.getZ(a);
      lp.setXYZ(j * 2, ax, ay, az);
      lp.setXYZ(j * 2 + 1, ax + (pos.getX(b) - ax) * grow, ay + (pos.getY(b) - ay) * grow, az + (pos.getZ(b) - az) * grow);
      const aa = grow * fade * close;
      la.setX(j * 2, aa);
      la.setX(j * 2 + 1, aa * 0.7);
    }
    lp.needsUpdate = true;
    la.needsUpdate = true;

    // her memories, by the constellations — readable from across the room too
    const reach = THREE.MathUtils.clamp(camGap / (4.2 * scale), 1, 1.7);
    lineU.uAlpha.value = 0.55 * (1 + (reach - 1) * 0.6);
    for (let i = 0; i < wordRefs.current.length; i++) {
      const w = wordRefs.current[i];
      if (!w) continue;
      w.scale.set(0.14 * reach * (w.userData.aspect as number), 0.14 * reach, 1);
      const m = w.material as THREE.SpriteMaterial;
      const f = THREE.MathUtils.clamp(memories * 1.3 - i * 0.12, 0, 1);
      // the words on the far side of the orb stay faint (seen through the glass)
      w.getWorldPosition(tmp);
      const front = sm(worldPos.distanceTo(state.camera.position) - tmp.distanceTo(state.camera.position), -0.25 * scale, 0.25 * scale);
      m.opacity = f * (0.3 + 0.6 * front) * close;
      w.visible = m.opacity > 0.002;
    }
    if (phraseRef.current) {
      const m = phraseRef.current.material as THREE.SpriteMaterial;
      m.opacity = phraseOn * 0.95 * close;
      phraseRef.current.scale.set(0.2 * reach * (phraseRef.current.userData.aspect as number), 0.2 * reach, 1);
      phraseRef.current.visible = m.opacity > 0.002;
    }
  });

  const touch = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    if (e.intersections.some((h) => h.object.userData.dogHit)) return; // the puppy's touch
    e.stopPropagation();
    if (e.delta > 8) return; // that was a drag
    const s = st.current;
    const calm = s.clock - s.seqAt > SEQ && s.clock - s.secretAt > SECRET;
    if (!calm) return;
    if (s.nextSecret && words) {
      s.secretAt = s.clock;
      s.nextSecret = false;
      sound.gather(1.2);
    } else {
      s.seqAt = s.clock;
      s.nextSecret = true;
      sound.chime(2);
    }
    if (onTap) {
      if (tapAfter > 0) setTimeout(onTap, tapAfter);
      else onTap();
    }
  };

  return (
    <group ref={group}>
      <Glow ref={halo} color="#c98a93" size={2.6} opacity={0.05} />
      <group ref={spin}>
        <mesh
          geometry={orbGeo}
          material={hit}
          scale={1.02}
          onClick={touch}
          onPointerOver={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            setHovered(true);
            st.current.hovering = true;
            if (fineHover()) sound.hover('heart');
          }}
          onPointerMove={(e) => {
            // a point a little inside the glass, where the light is
            st.current.hoverWorld.copy(e.point).lerp(worldPos, 0.18);
          }}
          onPointerDown={(e) => {
            if (!interactive) return;
            st.current.hoverWorld.copy(e.point).lerp(worldPos, 0.18);
            st.current.hovering = true;
          }}
          onPointerOut={() => {
            setHovered(false);
            st.current.hovering = false;
            sound.hoverEnd('heart');
          }}
        />
        <mesh geometry={orbGeo} material={glassBack} renderOrder={0} raycast={() => null} />
        {/* faint dust clouds deep inside (a few large soft sprites) */}
        <Glow color="#8f6a9c" size={0.9} opacity={0.035} position={[0.3, 0.22, -0.25]} />
        <Glow color="#a1556a" size={1.1} opacity={0.04} position={[-0.32, -0.18, 0.15]} />
        <Glow color="#c9a27c" size={0.7} opacity={0.03} position={[0.12, -0.36, 0.38]} />
        <points geometry={geometry} material={motes} frustumCulled={false} renderOrder={1} />
        <group ref={paths}>
          <lineSegments geometry={pathGeo} material={pathMat} renderOrder={1} frustumCulled={false} />
        </group>
        <lineSegments geometry={lineGeo} material={lineMat} renderOrder={1} frustumCulled={false} />
        <points geometry={starGeo} material={starMat} renderOrder={1} frustumCulled={false} />
        {labels.map((l, i) => (
          <sprite key={i} ref={(s) => void (s && (wordRefs.current[i] = s))} position={l.at} scale={[0.14 * l.aspect, 0.14, 1]} userData={{ aspect: l.aspect }} visible={false} renderOrder={3}>
            <spriteMaterial map={l.tex} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
          </sprite>
        ))}
        <mesh geometry={orbGeo} material={glassFront} renderOrder={2} raycast={() => null} />
      </group>
      {/* the core: a tiny warm star, not a heart — something precious at the centre */}
      <Glow ref={coreB} color="#f7b9a2" size={0.42} opacity={0.3} />
      <Glow ref={coreA} color="#fff0dc" size={0.12} opacity={0.7} />
      {phrase && (
        <sprite ref={phraseRef} position={[0, -0.16, 0]} scale={[0.2 * phrase.aspect, 0.2, 1]} userData={{ aspect: phrase.aspect }} visible={false} renderOrder={4}>
          <spriteMaterial map={phrase.tex} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
        </sprite>
      )}
      <pointLight ref={light} color="#ffa99e" intensity={1.5} distance={3.2} decay={2} />
    </group>
  );
});
