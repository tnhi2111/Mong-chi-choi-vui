import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useShader } from './useShader';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';
import { sound } from '../../lib/audio';
import { getHeartGeometry } from './heartShape';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomProps, roomLamps, roomRugs, furnitureBlobs, cakePosition, LAYOUT } from './RoomProps';
import { surface } from './Gift3D';
import { BirthdaySign, metalVertex, metalFragment, satinVertex, satinFragment, mergeAll } from './BirthdaySign';

/*
 * The gift room's set: a small, warm room dressed for her birthday, at night.
 *
 *   • a wooden floor with a round rug under the ring of gifts, lit by pools of candlelight,
 *     a pink breath from the heart and a cool slant of moonlight from the window
 *   • a round wall — plaster over wood panelling — with an arched window onto a
 *     moonlit, starry sky, fairy lights and HAPPY BIRTHDAY bunting sagging along it
 *   • clusters of candles whose flames flicker irregularly (and their light with them)
 *   • a birthday cake on a little round table — touch it and its candles are blown out
 *     (a wisp of smoke), then catch again a few seconds later
 *   • balloons (round and heart-shaped) on ribbons, bobbing in the draught; touched, they
 *     bounce on their ribbons with a soft chime
 *   • a secret: a little glowing letter leaning against the cake table, only found by
 *     turning the room round
 *
 * Everything is drawn with small unlit shaders that fake their own light (so the room
 * adds no real lights and no heavy shaders — the gift materials stay the only lit ones).
 * The flicker function is shared by the flames and by the light they throw on floor/wall.
 */

const FLICK = /* glsl */ `
  float flick(float t, float s) {
    return 0.78 + 0.12 * sin(t * 7.3 + s * 13.0) + 0.07 * sin(t * 13.1 + s * 7.0)
         + 0.06 * sin(t * 23.7 + s * 3.0) * sin(t * 1.7 + s);
  }
`;

/**
 * Her hand in the room: the pointer's ray, how present it is (fades out when it rests or
 * leaves), and the "wind" it makes — its smoothed sideways speed. Written once a frame by
 * RoomSet (mouse only), read by flames, balloons and dust.
 */
const hand = { o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1), on: 0, wind: 0, speed: 0 };
const closest = new THREE.Vector3();
/** Distance from a point to her hand's ray, and the push direction (xz) away from it. */
const HAZE = /* glsl */ `
  vec3 haze(vec3 col, vec3 world) {
    float d = length(world - cameraPosition);
    return mix(col, vec3(0.035, 0.026, 0.05), smoothstep(8.0, 19.0, d) * 0.45);
  }
`;

function fromHand(p: THREE.Vector3, away: THREE.Vector2): number {
  closest.copy(p).sub(hand.o);
  const along = Math.max(0, closest.dot(hand.d));
  closest.copy(hand.o).addScaledVector(hand.d, along);
  away.set(p.x - closest.x, p.z - closest.z);
  const dist = p.distanceTo(closest);
  if (away.lengthSq() > 1e-6) away.normalize();
  return dist;
}

const WALL_R = 6.9; // a small private room (the camera stands outside it: see CUT)
const WALL_H = 6.2;
/** Direction of the window: back-left, so the HAPPY BIRTHDAY installation owns the centre. */
const WINDOW_ANGLE = -0.78; // measured as atan(x, -z)
/** Where the moonlight from the window falls on the floor. */
const MOON: [number, number] = [Math.sin(WINDOW_ANGLE) * 4.9, -Math.cos(WINDOW_ANGLE) * 4.9];
/** The stage stands this much above the wooden floor (two steps). */
export const STAGE_STEP = 0.08;
const MAX_CANDLES = 12;
/** The window in the distant city that lights up for her (window-local x, y). */
const LOVE_WIN: [number, number] = [-0.535, -0.67];

/** The dolls'-house cut: the stretch of wall between the camera and the room is not drawn. */
const CUT = /* glsl */ `
  bool cutAway(vec2 dir) {
    vec2 cam = cameraPosition.xz;
    return length(cam) > ${WALL_R.toFixed(1)} - 0.6 && dot(dir, normalize(cam)) > 0.45;
  }
`;

interface Candle {
  x: number;
  z: number;
  h: number;
  r: number;
  seed: number;
}

function placeCandles(rx: number, rz: number): Candle[] {
  // clusters of 2–3 between the gifts, just outside the rug
  const clusters = [0, 1.257, 2.513, 3.77, 5.027]; // between the gifts (which stand half a step round)
  const out: Candle[] = [];
  clusters.forEach((a, ci) => {
    // (two to a cluster: atmosphere, not a light show)
    const n = ci === 2 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const aa = a + (k - (n - 1) / 2) * 0.09 + (ci === 2 ? 0.25 : 0);
      const push = 1.35 + (k % 2) * 0.22;
      out.push({
        x: Math.sin(aa) * (rx + push),
        z: Math.cos(aa) * (rz + push),
        h: [0.42, 0.28, 0.2][k % 3] + (ci % 3) * 0.04,
        r: [0.065, 0.055, 0.05][k % 3],
        seed: ci * 3.1 + k * 1.7,
      });
    }
  });
  return out.slice(0, MAX_CANDLES);
}

/** One candle as a single mesh: a slightly uneven column, a drip down one side and a
 *  wick (its uv.y is pushed above 1.5 so the wax shader draws it charred). */
const candleCache = new Map<string, THREE.BufferGeometry>();
function candleGeometry(c: Candle): THREE.BufferGeometry {
  const key = `${c.r}:${c.h}:${c.seed}`;
  const hit = candleCache.get(key);
  if (hit) return hit;
  const body = new THREE.CylinderGeometry(c.r * 0.97, c.r * 1.04, c.h, 20, 3);
  // a melted top: the rim sags a little lower on one side
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > c.h / 2 - 1e-4) pos.setY(i, y - (0.5 + 0.5 * Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) + c.seed)) * 0.012);
  }
  const side = c.seed * 2.3;
  const dripLen = 0.03 + (c.seed % 1) * 0.05;
  const drip = new THREE.CapsuleGeometry(c.r * 0.16, dripLen, 3, 8);
  drip.translate(Math.cos(side) * c.r * 0.98, c.h / 2 - dripLen / 2 - 0.012, Math.sin(side) * c.r * 0.98);
  const dripUv = drip.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < dripUv.count; i++) dripUv.setY(i, 0.92);
  const wick = new THREE.CylinderGeometry(0.004, 0.005, 0.045, 5);
  wick.translate(0, c.h / 2 + 0.02, 0);
  const wUv = wick.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < wUv.count; i++) wUv.setY(i, 2 + wUv.getY(i));
  const merged = mergeGeometries([body.toNonIndexed(), drip.toNonIndexed(), wick.toNonIndexed()]) ?? body;
  merged.computeVertexNormals();
  candleCache.set(key, merged);
  return merged;
}

/* ── the floor: planks, rug, pools of light ───────────────────────────────── */
const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const floorFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform vec2 uRug;
  uniform vec2 uCake;
  uniform vec4 uLamps[8];
  uniform vec4 uRugAt[4];
  uniform vec4 uRugSize[4];
  uniform vec4 uBlobs[8];
  uniform float uHeart;
  uniform float uMotion;
  varying vec3 vWorld;
  ${FLICK}
  ${HAZE}
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    // planks: 0.34 wide, staggered ends, grain running along them
    float row = floor(p.y / 0.34);
    float along = p.x + hash(row) * 3.0;
    float plank = floor(along / 2.2);
    float id = hash(row * 17.0 + plank);
    float seamW = smoothstep(0.0, 0.012, abs(fract(p.y / 0.34) - 0.5) * 0.34 - 0.155);
    float seamE = smoothstep(0.0, 0.01, abs(fract(along / 2.2) - 0.5) * 2.2 - 1.09);
    float grain = 0.5 + 0.5 * sin(along * 90.0 + sin(p.y * 40.0 + id * 9.0) * 2.4 + id * 20.0);
    vec3 wood = mix(vec3(0.15, 0.085, 0.05), vec3(0.25, 0.145, 0.085), id * 0.6 + grain * 0.25); // dark walnut
    wood *= 0.7 + 0.3 * (1.0 - seamW) * (1.0 - seamE);

    // the stage stands on the floor: a soft contact shadow round its foot
    float e = length(p / uRug);
    vec3 base = wood * (1.0 - 0.6 * smoothstep(1.12, 1.0, e));
    // area rugs under the armchair and the loveseat: wool, a border, a soft fringe, a little thickness
    for (int i = 0; i < 4; i++) {
      vec2 q = p - uRugAt[i].xy;
      float ang0 = uRugAt[i].z;
      vec2 tng = vec2(cos(ang0), sin(ang0));
      vec2 nrm = vec2(-tng.y, tng.x);
      vec2 lq = vec2(dot(q, tng), dot(q, nrm)) / uRugSize[i].xy;
      float box = max(abs(lq.x), abs(lq.y));
      float on = 1.0 - smoothstep(0.985, 1.0, box);
      vec3 wool = uRugSize[i].z < 0.5 ? vec3(0.5, 0.44, 0.38) : vec3(0.42, 0.27, 0.27);
      wool *= 0.9 + 0.1 * fract(sin(dot(floor(p * 110.0), vec2(12.9, 78.2))) * 43758.5);
      float border = smoothstep(0.84, 0.86, box) * (1.0 - smoothstep(0.9, 0.92, box));
      wool = mix(wool, wool * 0.62, border);
      // a quiet lozenge pattern in the field
      vec2 dm = abs(fract(lq * vec2(3.0, 2.0)) - 0.5);
      wool *= 1.0 - 0.06 * smoothstep(0.03, 0.0, abs(dm.x + dm.y - 0.35)) * (1.0 - border);
      float fringe = step(1.0, abs(lq.x)) * (1.0 - smoothstep(1.0, 1.05, abs(lq.x))) * step(abs(lq.y), 0.98) * step(0.4, fract(lq.y * 40.0));
      base = mix(base, wool, on);
      base = mix(base, vec3(0.6, 0.52, 0.44), fringe * 0.8);
      // its edge stands a little proud of the boards
      base *= 1.0 - 0.35 * smoothstep(1.06, 1.0, box) * (1.0 - on);
    }
    // light: a dim room, pools of candlelight, the heart's breath, a slant of moonlight
    vec3 light = vec3(0.13, 0.09, 0.1);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      float d = length(p - c.xy);
      float f = flick(uTime * uMotion + 20.0, c.z);
      light += vec3(1.0, 0.68, 0.42) * f * (0.55 * exp(-d * d * 1.8) + 0.16 * exp(-d * d * 0.2));
    }
    light += vec3(1.0, 0.36, 0.52) * uHeart * exp(-r * r * 0.12) * 0.55;
    // moonlight from the window: a cool, soft shaft on the floor toward the back
    vec2 m = p - vec2(${MOON[0].toFixed(3)}, ${MOON[1].toFixed(3)});
    light += vec3(0.3, 0.42, 0.85) * 0.45 * exp(-dot(m, m) * 0.22);
    // the birthday sign's champagne glow, falling forward from the back of the room
    vec2 sg = p - vec2(0.0, -6.0);
    light += vec3(1.0, 0.78, 0.52) * 0.22 * exp(-sg.x * sg.x * 0.25 - sg.y * sg.y * 0.3);
    // contact shadows: the floor darkens right under each candle and the cake table
    float ao = 1.0;
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec2 q = p - uCandles[i].xy;
      ao *= 1.0 - 0.55 * exp(-dot(q, q) * 140.0);
    }
    vec2 qc = p - uCake;
    ao *= 1.0 - 0.45 * exp(-dot(qc, qc) * 5.0);
    // the furniture against the wall: soft contact shadows along its length
    for (int i = 0; i < 8; i++) {
      vec4 b = uBlobs[i];
      vec2 tng = vec2(cos(b.z), sin(b.z));
      vec2 q = p - b.xy;
      float along = clamp(dot(q, tng), -b.w, b.w);
      vec2 dq = q - tng * along;
      ao *= 1.0 - 0.6 * exp(-dot(dq, dq) * 14.0);
    }
    // the lamps' warm pools on the floor below them
    for (int i = 0; i < 8; i++) {
      vec2 lq = p - uLamps[i].xz;
      light += vec3(1.0, 0.7, 0.42) * uLamps[i].w * 0.6 * exp(-dot(lq, lq) * 0.5);
    }
    vec3 col = base * light * ao;
    // out toward the wall the room falls into darkness
    col *= 1.0 - smoothstep(6.0, 9.0, r) * 0.7;
    col = haze(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── the stage: a two-step round platform, matte burgundy with champagne inlays ── */
const stageFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform vec2 uRug;
  uniform float uHeart;
  uniform float uMotion;
  uniform vec3 uDog;   // the puppy's spot: x, z, which way it faces
  uniform vec2 uGift;  // the gift box's spot
  varying vec3 vWorld;
  ${FLICK}
  ${HAZE}
  float sdHeart(vec2 q) {
    q.x = abs(q.x);
    if (q.y + q.x > 1.0) return length(q - vec2(0.25, 0.75)) - 0.3536;
    return sqrt(min(dot(q - vec2(0.0, 1.0), q - vec2(0.0, 1.0)), dot(q - 0.5 * max(q.x + q.y, 0.0), q - 0.5 * max(q.x + q.y, 0.0)))) * sign(q.x - q.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    float e = length(p / uRug);
    float ang = atan(p.y, p.x);
    float rm = 0.5 * (uRug.x + uRug.y);

    // matte burgundy, a fine woven grain, a little lighter toward the middle
    vec3 base = vec3(0.2, 0.052, 0.078);
    base *= 0.93 + 0.07 * fract(sin(dot(floor(p * 140.0), vec2(12.9, 78.2))) * 43758.5);
    base *= 0.82 + 0.3 * (1.0 - smoothstep(0.0, 0.95, e));
    float trim = 0.0;  // champagne inlay (catches more light than the cloth)
    // an inset ring: a recessed darker band between two fine inlays
    float inset = smoothstep(0.735, 0.74, e) * (1.0 - smoothstep(0.785, 0.79, e));
    base *= 1.0 - inset * 0.32;
    trim += smoothstep(0.0035, 0.0, abs(e - 0.735)) + smoothstep(0.0035, 0.0, abs(e - 0.79)) * 0.8;
    // the engraved border: a running chain of small hearts, very faint
    float band = smoothstep(0.83, 0.835, e) * (1.0 - smoothstep(0.925, 0.93, e));
    float N = 40.0;
    vec2 cell = vec2((fract(ang * N / 6.28318) - 0.5) * (6.28318 / N) * rm * 0.88, (e - 0.878) * rm);
    float dh = sdHeart((cell + vec2(0.0, 0.07)) / 0.14) * 0.14;
    trim += band * smoothstep(0.006, 0.0, abs(dh)) * 0.45;
    trim += smoothstep(0.003, 0.0, abs(e - 0.83)) * 0.5 + smoothstep(0.003, 0.0, abs(e - 0.93)) * 0.5;
    // a hand-stitched seam just inside the edge, like an upholstered top
    float stitch = smoothstep(0.0025, 0.0, abs(e - 0.943)) * step(0.45, fract(ang * rm * 9.0));
    base = mix(base, vec3(0.5, 0.36, 0.3), stitch * 0.55);
    // the lower step, outside the main top
    float step1 = smoothstep(0.952, 0.958, e);
    base = mix(base, vec3(0.13, 0.04, 0.055), step1);
    // the emblem under the heart: two rings interlaced round a small heart - a detail to discover
    float er = min(abs(length(p - vec2(-0.17, 0.0)) - 0.42), abs(length(p - vec2(0.17, 0.0)) - 0.42));
    trim += smoothstep(0.009, 0.0, er) * 0.32;
    trim += smoothstep(0.006, 0.0, abs(r - 0.78)) * 0.4;
    float eh = sdHeart(vec2(p.x, -p.y + 0.11) / 0.2) * 0.2;
    trim += smoothstep(0.008, 0.0, abs(eh)) * 0.5;

    // light: candles round the stage, the heart above it (rose), the sign behind (champagne)
    vec3 light = vec3(0.11, 0.075, 0.095);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      float d = length(p - c.xy);
      float f = flick(uTime * uMotion + 20.0, c.z);
      light += vec3(1.0, 0.66, 0.4) * f * (0.42 * exp(-d * d * 1.8) + 0.13 * exp(-d * d * 0.2));
    }
    light += vec3(1.0, 0.3, 0.5) * uHeart * (exp(-r * r * 0.16) * 0.95 + exp(-r * r * 2.0) * 0.4);
    vec2 sg = p - vec2(0.0, -6.0);
    light += vec3(1.0, 0.78, 0.52) * 0.16 * exp(-sg.x * sg.x * 0.2 - sg.y * sg.y * 0.12);
    // the puppy's memory spot: a warm golden pool, shaped (just) like a heart, its point toward her
    vec2 dq = p - uDog.xy;
    float ca = cos(uDog.z), sa = sin(uDog.z);
    vec2 hl = vec2(dq.x * ca - dq.y * sa, -(dq.x * sa + dq.y * ca)); // y: inward (toward the middle)
    float dHeart = sdHeart((hl + vec2(0.0, 0.62)) / 1.05) * 1.05;
    light += vec3(1.0, 0.72, 0.36) * (0.5 * exp(-dot(dq, dq) * 2.4) + 0.22 * smoothstep(0.12, -0.25, dHeart));
    trim += smoothstep(0.012, 0.0, abs(dHeart)) * 0.16;
    // the gift's spot: a small soft blush pool
    vec2 gq = p - uGift;
    light += vec3(1.0, 0.55, 0.6) * 0.22 * exp(-dot(gq, gq) * 3.0);
    vec2 m = p - vec2(${MOON[0].toFixed(3)}, ${MOON[1].toFixed(3)});
    light += vec3(0.3, 0.42, 0.85) * 0.3 * exp(-dot(m, m) * 0.22);

    // the puppy stands here: a soft contact shadow under its body and paws
    float under = exp(-(hl.x * hl.x * 26.0 + (hl.y + 0.02) * (hl.y + 0.02) * 7.0));
    light *= 1.0 - 0.5 * under;
    vec3 col = base * light * 1.25;
    col += vec3(0.86, 0.66, 0.42) * clamp(trim, 0.0, 1.0) * (light * 0.75 + 0.02);
    col = haze(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
  }
`;
/* the stage's sides: dark wine lacquer, the candles glinting along them */
const bandFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform vec2 uRug;
  uniform float uMotion;
  varying vec3 vWorld;
  ${FLICK}
  ${HAZE}
  void main() {
    vec2 p = vWorld.xz;
    vec2 n = normalize(p / (uRug * uRug));
    vec3 light = vec3(0.08, 0.05, 0.07);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      vec2 to = c.xy - p;
      float d = length(to);
      light += vec3(1.0, 0.62, 0.36) * flick(uTime * uMotion + 20.0, c.z) * max(dot(n, to / d), 0.0) * 0.9 * exp(-d * d * 0.9);
    }
    vec3 col = vec3(0.2, 0.055, 0.075) * light * 2.0;
    col = haze(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── the wall: plaster, panelling, an arched window onto a starry night ──── */
const wallVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const wallFragment = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform float uFloorY;
  uniform float uMotion;
  uniform float uLove;      // seconds since she touched the window (large = never)
  uniform vec4 uLamps[8];
  varying vec3 vWorld;
  ${FLICK}
  ${HAZE}
  ${CUT}
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    if (cutAway(normalize(vWorld.xz))) discard;
    float a = atan(vWorld.x, -vWorld.z) - ${WINDOW_ANGLE.toFixed(3)};
    float h = vWorld.y - uFloorY;
    float s = a * ${WALL_R.toFixed(1)};   // distance along the wall
    float t = uTime * uMotion;

    float sw = (a + ${WINDOW_ANGLE.toFixed(3)}) * ${WALL_R.toFixed(1)}; // along the wall from its centre (the sign)
    float nearWin = 1.0 - step(1.45, abs(s));

    // a room of human height: walnut wainscot to 0.95, plaster above, a crown moulding
    // at 3.05 and the shadowy ceiling cove above it
    vec3 plaster = vec3(0.2, 0.145, 0.135) * (0.93 + 0.07 * hash2(floor(vec2(sw, h) * 40.0)));
    vec3 col = plaster;
    // the feature wall: an arched alcove for the HAPPY BIRTHDAY installation
    float aw = 2.5;
    float alcTop = 2.35 + sqrt(max(0.0, 1.0 - (sw / aw) * (sw / aw))) * 0.6;
    float inAlc = step(abs(sw), aw) * step(h, alcTop) * step(0.95, h);
    float alcEdge = min(aw - abs(sw), alcTop - h);
    col = mix(col, vec3(0.27, 0.19, 0.17), inAlc);                 // a warmer blush-cream plaster
    col *= 1.0 - inAlc * 0.35 * smoothstep(0.18, 0.0, alcEdge);    // its depth: shade at the reveal
    // moulded panels on the plain walls, in a calm rhythm (not behind the window or alcove)
    float pp = 1.7;
    float px0 = mod(sw + pp * 0.5, pp) - pp * 0.5;
    float inPanel = step(abs(px0), 0.58) * step(1.2, h) * step(h, 2.7) * (1.0 - nearWin) * step(aw + 0.75, abs(sw));
    float pEdge = min(0.58 - abs(px0), min(h - 1.2, 2.7 - h));
    float moulding = inPanel * smoothstep(0.014, 0.0, abs(pEdge - 0.02));
    // walnut wainscot below, in panels with a bevelled inset
    vec3 panel = vec3(0.16, 0.085, 0.05);
    float wpx = mod(sw + 0.6, 1.2) - 0.6;
    float pinset = step(abs(wpx), 0.48) * step(0.14, h) * step(h, 0.82);
    float pedge = smoothstep(0.012, 0.0, abs(min(0.48 - abs(wpx), min(h - 0.14, 0.82 - h))));
    panel *= 1.0 - pinset * 0.12;
    panel += vec3(0.08, 0.05, 0.03) * pedge * pinset;
    col = mix(panel, col, smoothstep(0.93, 0.97, h));
    // the crown moulding and the ceiling cove above
    float crown = smoothstep(2.98, 3.0, h) * (1.0 - smoothstep(3.12, 3.14, h));
    col = mix(col, vec3(0.3, 0.22, 0.19), crown);
    col *= 1.0 - smoothstep(3.14, 3.5, h) * 0.6;

    // warm light from the candles below, climbing the wall (over a warm room ambient)
    vec3 light = vec3(0.16, 0.11, 0.12);
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      float ca = atan(c.x, -c.y);
      float d = abs(mod(a + ${WINDOW_ANGLE.toFixed(3)} - ca + 3.14159, 6.28318) - 3.14159) * ${WALL_R.toFixed(1)};
      float reach = length(c.xy) / ${WALL_R.toFixed(1)};
      light += vec3(1.0, 0.58, 0.3) * flick(t + 20.0, c.z) * 0.55 * reach * reach * exp(-d * d * 0.35) * exp(-h * 0.55);
    }
    // hidden architectural light: a warm wash rising in the alcove from a cove at its foot,
    // and a soft uplight along the crown moulding
    light += vec3(1.0, 0.7, 0.45) * 0.5 * inAlc * exp(-(h - 0.95) * 1.2);
    light += vec3(1.0, 0.72, 0.48) * 0.22 * exp(-(h - 2.95) * (h - 2.95) * 30.0) * step(h, 3.0);
    // the sign's champagne halo on the alcove behind it
    light += vec3(1.0, 0.78, 0.52) * 0.6 * exp(-sw * sw * 0.2 - (h - 2.0) * (h - 2.0) * 0.4);
    // the lamps: warm pools on the wall, brightest just above and below a shade
    for (int i = 0; i < 8; i++) {
      vec3 lw = vWorld - uLamps[i].xyz;
      float lr = length(lw.xz);
      light += vec3(1.0, 0.7, 0.42) * uLamps[i].w * (0.9 * exp(-dot(lw, lw) * 0.9) + 0.45 * exp(-lr * lr * 6.0 / (0.1 + abs(lw.y) * 0.8)) * exp(-abs(lw.y) * 0.9));
    }
    // and a cool breath of moonlight round the window
    light += vec3(0.3, 0.42, 0.85) * 0.35 * exp(-s * s * 0.18 - (h - 2.4) * (h - 2.4) * 0.12);
    col *= light * 1.6;
    // thin champagne trims: the chair rail, the cornice, the arch outlines
    float trims = smoothstep(0.016, 0.0, abs(h - 0.95)) + smoothstep(0.012, 0.0, abs(h - 3.0)) * 0.8 + smoothstep(0.012, 0.0, abs(alcEdge)) * step(0.95, h) * step(abs(sw), aw + 0.02) * 0.8 + moulding * 0.45;
    col += vec3(0.86, 0.66, 0.42) * trims * (light * 0.55);
    col *= 0.5 + 0.5 * smoothstep(0.0, 0.45, h); // shadow where wall meets floor

    // the arched window
    float wx = s;
    float wy = h - 1.85;
    float archTop = 0.55 + sqrt(max(0.0, 1.0 - (wx / 0.95) * (wx / 0.95))) * 0.45;
    float inWin = step(abs(wx), 0.95) * step(-0.95, wy) * step(wy, archTop);
    float frame = step(abs(wx), 1.07) * step(-1.07, wy) * step(wy, archTop + 0.12) * (1.0 - inWin);
    if (inWin > 0.5) {
      // the night: deep blue, a big soft moon, stars
      vec3 sky = mix(vec3(0.03, 0.04, 0.12), vec3(0.1, 0.13, 0.3), smoothstep(1.0, -0.95, wy));
      vec2 moon = vec2(0.42, 0.72);
      float md = length(vec2(wx, wy) - moon);
      sky += vec3(0.9, 0.92, 1.0) * smoothstep(0.24, 0.2, md) + vec3(0.3, 0.35, 0.6) * exp(-md * md * 3.0) * 0.6;
      vec2 sg = floor(vec2(wx, wy) * 22.0);
      sky += vec3(0.8) * step(0.985, hash2(sg)) * (0.5 + 0.5 * sin(t * 2.0 + hash2(sg) * 40.0));
      // the city, far away: a row of dark buildings, their windows lit here and there,
      // switching on and off now and then — people living their evenings
      float col9 = floor((wx + 1.0) * 9.0);
      float bh = 0.12 + hash2(vec2(col9, 3.0)) * 0.42;
      if (abs(col9 - 4.0) < 0.5) bh = max(bh, 0.4);
      float by = wy + 0.95;
      if (by < bh) {
        sky = mix(sky, vec3(0.018, 0.02, 0.045), 0.94);
        vec2 wc = vec2((wx + 1.0) * 60.0, by * 55.0);
        vec2 cell = floor(wc);
        vec2 f = fract(wc);
        float isWin = step(0.3, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8) * step(by, bh - 0.03);
        float on = step(0.72, hash2(cell + floor(t * 0.05 + hash2(cell) * 7.0)));
        sky += vec3(1.0, 0.72, 0.4) * isWin * on * 0.32;
        // the secret window: the one she lights with a touch
        vec2 home = vec2(${LOVE_WIN[0].toFixed(3)}, ${LOVE_WIN[1].toFixed(3)});
        float mine = smoothstep(0.03, 0.0, max(abs(wx - home.x) - 0.012, abs(wy - home.y) - 0.012));
        float lit = smoothstep(0.0, 0.6, uLove) * (1.0 - smoothstep(9.0, 12.0, uLove));
        sky += vec3(1.0, 0.45, 0.6) * mine * lit * 1.6;
      }
      // …and from it a little heart of light rises into the sky, and becomes a star
      {
        vec2 home = vec2(${LOVE_WIN[0].toFixed(3)}, ${LOVE_WIN[1].toFixed(3)});
        float rise = clamp((uLove - 0.8) / 3.2, 0.0, 1.0);
        float e = rise * rise * (3.0 - 2.0 * rise);
        vec2 hp = home + vec2(sin(e * 5.0) * 0.06, e * 1.25);
        float size = 0.07 * (1.0 - e * 0.75);
        vec2 q = (vec2(wx, wy) - hp) / size + vec2(0.0, 0.55);
        q.x = abs(q.x);
        float dh = q.y + q.x > 1.0
          ? length(q - vec2(0.25, 0.75)) - 0.3536
          : sqrt(min(dot(q - vec2(0.0, 1.0), q - vec2(0.0, 1.0)), dot(q - 0.5 * max(q.x + q.y, 0.0), q - 0.5 * max(q.x + q.y, 0.0)))) * sign(q.x - q.y);
        float showH = step(0.8, uLove) * (1.0 - step(4.0, uLove));
        sky += vec3(1.0, 0.5, 0.65) * smoothstep(0.08, -0.05, dh) * showH;
        sky += vec3(1.0, 0.6, 0.72) * exp(-dot(vec2(wx, wy) - hp, vec2(wx, wy) - hp) * 90.0) * showH * 0.5;
        // the new star stays for the rest of her visit
        vec2 st = home + vec2(sin(5.0) * 0.06, 1.25);
        float star = step(4.0, uLove) * step(uLove, 900.0);
        float sd = length(vec2(wx, wy) - st);
        float tw = 0.75 + 0.25 * sin(t * 3.0);
        sky += vec3(1.0, 0.85, 0.9) * (smoothstep(0.018, 0.0, sd) + exp(-sd * sd * 900.0) * 0.6
               + smoothstep(0.004, 0.0, abs(vec2(wx, wy).x - st.x)) * exp(-abs(wy - st.y) * 40.0) * 0.4
               + smoothstep(0.004, 0.0, abs(wy - st.y)) * exp(-abs(wx - st.x) * 40.0) * 0.4) * star * tw;
      }
      // mullions: a cross of glazing bars, and the city's faint glow low on the horizon
      float bars = smoothstep(0.025, 0.0, abs(wx)) + smoothstep(0.025, 0.0, abs(wy - 0.2));
      sky = mix(sky, vec3(0.2, 0.12, 0.08), clamp(bars, 0.0, 1.0));
      sky += vec3(0.25, 0.2, 0.35) * smoothstep(-0.55, -0.95, wy) * 0.2;
      // the glass: a faint reflection of the warm room in it, a soft diagonal sheen,
      // and a breath of mist low on the pane where the cold meets the warm air
      sky += vec3(0.22, 0.13, 0.1) * 0.25;
      sky += vec3(1.0, 0.8, 0.65) * smoothstep(0.05, 0.0, abs(wx * 0.7 + wy * 0.5 - 0.3)) * 0.05;
      sky = mix(sky, vec3(0.32, 0.3, 0.38), smoothstep(-0.3, -0.95, wy) * 0.22);
      col = sky;
    } else if (frame > 0.5) {
      col = vec3(0.3, 0.17, 0.1) * (light * 1.6 + vec3(0.1, 0.12, 0.2));
    }
    // the sill catches a little moonlight
    col += vec3(0.25, 0.3, 0.5) * smoothstep(0.05, 0.0, abs(wy + 1.01)) * step(abs(wx), 1.12) * 0.6;
    // up into the dark
    col *= 1.0 - smoothstep(3.6, ${WALL_H.toFixed(1)}, h) * 0.85;
    col = haze(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── candles: wax that glows near the flame, flames that flicker ──────────── */
const waxVertex = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  varying float vTint;
  void main() {
    vY = uv.y;
    vN = normalize(normalMatrix * normal);
    vec3 o = modelMatrix[3].xyz;
    vTint = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5453);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const waxFragment = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  varying float vTint;
  void main() {
    // the wick (uv.y > 1.5): charred, glowing orange at its tip
    if (vY > 1.5) {
      gl_FragColor = vec4(mix(vec3(0.05, 0.03, 0.02), vec3(1.0, 0.45, 0.15), smoothstep(2.6, 3.0, vY)), 1.0);
      return;
    }
    // lit from its own flame above: translucent, warm at the top, cooler below;
    // every candle a slightly different wax — ivory, blush, champagne
    vec3 base = mix(mix(vec3(0.3, 0.2, 0.17), vec3(0.32, 0.18, 0.19), step(0.5, vTint)), vec3(0.3, 0.23, 0.16), step(0.8, vTint));
    vec3 top = mix(mix(vec3(0.95, 0.72, 0.5), vec3(0.98, 0.66, 0.6), step(0.5, vTint)), vec3(0.95, 0.8, 0.5), step(0.8, vTint));
    vec3 wax = mix(base, top, pow(clamp(vY, 0.0, 1.0), 4.0));
    float rim = pow(1.0 - abs(vN.z), 2.0) * 0.25;
    gl_FragColor = vec4(wax + rim * vec3(1.0, 0.6, 0.35), 1.0);
  }
`;
const flameVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform vec3 uHandO;
  uniform vec3 uHandD;
  uniform float uHandOn;
  uniform float uWind;
  attribute float aSeed;
  varying float vF;
  varying float vSeed;
  varying float vLean;
  ${FLICK}
  void main() {
    vF = flick(uTime * uMotion + 20.0, aSeed);
    vSeed = aSeed;
    // her hand passing close by drags the air: the flame leans with it and flares a little
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float d = length(cross(wp - uHandO, uHandD));
    float near = uHandOn * exp(-d * d * 2.5);
    vLean = near * clamp(uWind, -1.5, 1.5);
    vF *= 1.0 + near * 0.18 + abs(vLean) * 0.15;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 300.0 * uPixelRatio / -mv.z;
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uLit;
  varying float vF;
  varying float vSeed;
  varying float vLean;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5, 0.62);
    c.y = -c.y;
    // leaning in the wind of her hand: the tip goes further than the base
    c.x -= vLean * 0.35 * max(c.y + 0.07, 0.0);
    // the flame sways a little from side to side
    c.x += sin(uTime * uMotion * 5.0 + vSeed * 9.0) * 0.012 * (c.y + 0.1) * 6.0;
    // a teardrop: round at the bottom, drawn up to a point
    float w = 0.055 * (1.0 - smoothstep(-0.06, 0.2, c.y)) + 0.012;
    float body = smoothstep(w, w * 0.4, abs(c.x)) * smoothstep(-0.075, -0.045, c.y) * smoothstep(0.22 * vF, 0.08, c.y);
    float core = smoothstep(0.03, 0.0, length(c - vec2(0.0, -0.02)));
    float blue = smoothstep(0.03, 0.0, length(c - vec2(0.0, -0.058))) * 0.6;
    float halo = exp(-dot(c, c) * 22.0) * 0.35 * vF;
    vec3 col = vec3(1.0, 0.62, 0.22) * body + vec3(1.0, 0.95, 0.8) * core * body + vec3(0.3, 0.45, 1.0) * blue + vec3(1.0, 0.55, 0.25) * halo;
    float a = clamp(body + halo + blue * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col * uLit, a * uLit);
  }
`;

/* ── little lights: fairy lights, the tree's lights and star ─────────────── */
const twinkleVertex = /* glsl */ `
  ${CUT}
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    if (cutAway(normalize(position.xz))) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    // each bulb breathes at its own pace, now and then dipping low
    float tw = 0.65 + 0.35 * sin(uTime * uMotion * (0.8 + aSeed * 1.6) + aSeed * 30.0);
    tw *= 0.8 + 0.2 * step(0.2, fract(uTime * 0.13 * uMotion + aSeed * 5.0));
    vA = tw;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (24.0 / -mv.z) * (0.8 + 0.3 * tw);
  }
`;
const twinkleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5), (core + halo * halo * 0.5) * vA);
  }
`;

/* ── glossy latex: the balloons ────────────────────────────────────────────── */
const glassVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const glassFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float facing = clamp(dot(vN, vView), 0.0, 1.0);
    float fres = pow(1.0 - facing, 3.0);
    // warm candle light from below, cool moonlight from the back window, a crisp highlight
    float warm = clamp(-vN.y * 0.6 + 0.4, 0.0, 1.0);
    vec3 col = uColor * (0.14 + 0.42 * warm) + vec3(1.0, 0.7, 0.45) * fres * 0.45;
    vec3 hl = normalize(vec3(-0.4, 0.6, 0.7));
    col += vec3(1.0, 0.95, 0.9) * pow(max(dot(reflect(-vView, vN), hl), 0.0), 60.0) * 0.6;
    col += uColor * uGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A balloon on a ribbon, tied down near the floor — it bobs in the draught and bounces when touched. */
function Balloon({
  at,
  length,
  color,
  heart,
  pitch,
  motion,
  hoverFx,
}: {
  at: [number, number, number];
  length: number;
  color: string;
  heart: boolean;
  pitch: number;
  motion: number;
  hoverFx: boolean;
}) {
  const pivot = useRef<THREE.Group>(null);
  // held up by its ribbon: a damped spring on two angles, like an upside-down pendulum
  const s = useRef({ ax: 0, az: 0, vx: 0, vz: 0, glow: 0 });
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uGlow: { value: 0 } }), [color]);
  const latex = useShader(glassVertex, glassFragment, uniforms, { opaque: true });
  const seed = useMemo(() => Math.random() * 10, []);
  const ribbon = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8c9b0', transparent: true, opacity: 0.35, depthWrite: false }), []);
  const knot = useMemo(() => new THREE.MeshBasicMaterial({ color }), [color]);
  const heartGeo = useMemo(() => (heart ? getHeartGeometry('low') : null), [heart]);
  const head = useMemo(() => new THREE.Vector3(), []);
  const away = useMemo(() => new THREE.Vector2(), []);
  useEffect(
    () => () => {
      ribbon.dispose();
      knot.dispose();
    },
    [ribbon, knot],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = s.current;
    const t = state.clock.elapsedTime;
    const k = 5.5 / length;
    // a lazy bob and a faint draught keep it alive
    const breeze = (Math.sin(t * 0.6 + seed) * 0.006 + Math.sin(t * 1.7 + seed * 2) * 0.003) * motion;
    p.vx += (-k * Math.sin(p.ax) - p.vx * 0.9) * dt + breeze * dt * 10;
    p.vz += (-k * Math.sin(p.az) - p.vz * 0.9) * dt + breeze * dt * 6;
    // the air of her hand sweeping past nudges it away (light, so it drifts, then settles)
    if (hand.on > 0.01) {
      head.set(at[0], at[1] + length + 0.27, at[2]);
      const d = fromHand(head, away);
      if (d < 0.9) {
        const f = (1 - d / 0.9) ** 2 * Math.min(hand.speed, 4) * hand.on * dt * 1.6;
        p.vx += away.y * f;
        p.vz -= away.x * f;
        p.glow = Math.min(1, p.glow + f * 0.5);
      }
    }
    p.ax += p.vx * dt;
    p.az += p.vz * dt;
    p.glow *= Math.exp(-dt * 2.5);
    uniforms.uGlow.value = p.glow * 0.5;
    if (pivot.current) {
      pivot.current.rotation.set(p.ax, 0, p.az);
      pivot.current.position.y = Math.sin(t * 0.9 + seed) * 0.03 * motion;
    }
  });

  const push = (strength: number, e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = s.current;
    const dir = e.ray.direction;
    p.vz += -dir.x * strength;
    p.vx += dir.z * strength;
    p.glow = Math.min(1, p.glow + strength);
  };

  return (
    <group position={at}>
      <group ref={pivot}>
        <mesh position={[0, length / 2, 0]} material={ribbon}>
          <cylinderGeometry args={[0.004, 0.004, length, 4, 1, true]} />
        </mesh>
        <mesh position={[0, length + 0.01, 0]} material={knot}>
          <coneGeometry args={[0.03, 0.05, 10]} />
        </mesh>
        <mesh
          position={[0, length + (heart ? 0.25 : 0.27), 0]}
          scale={heart ? [0.24, 0.24, 0.17] : [0.19, 0.23, 0.19]}
          geometry={heartGeo ?? undefined}
          material={latex}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 8) return;
            push(1.2, e);
            sound.chime(pitch, 0.04);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (!hoverFx) return;
            push(0.3, e);
            sound.hover(`balloon-${pitch}`);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            sound.hoverEnd(`balloon-${pitch}`);
            document.body.style.cursor = '';
          }}
        >
          {!heart && <sphereGeometry args={[1, 32, 24]} />}
        </mesh>
      </group>
    </group>
  );
}

/* ── smoke curling up from blown-out candles ──────────────────────────────── */
const smokeVertex = /* glsl */ `
  uniform float uTime;
  uniform float uBlown;      // seconds since the candles were blown out (large = never)
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    float life = fract(aSeed * 3.7);
    float t = uBlown - life * 0.8;
    float rise = clamp(t, 0.0, 3.0);
    vec3 p = position + vec3(sin(rise * 2.2 + aSeed * 20.0) * 0.05 * rise, rise * 0.35, cos(rise * 1.7 + aSeed * 9.0) * 0.04 * rise);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (4.0 + rise * 10.0) * uPixelRatio * (6.0 / -mv.z);
    vA = step(0.0, t) * (1.0 - smoothstep(0.4, 3.0, rise)) * 0.35;
  }
`;
const smokeFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(0.75, 0.72, 0.74), smoothstep(0.5, 0.0, d) * vA);
  }
`;

/** A birthday cake on a little round table. Touch it: the candles are blown out, then relit. */
/**
 * "26" — a fine rose-gold wire cake topper, each numeral one continuous stroke (as a
 * jeweller would bend it), on two slim picks. Numeral units: 1 = its height.
 */
function numeralPaths(): THREE.Vector3[][] {
  const two: THREE.Vector3[] = [];
  // the bowl of the 2: an arc over the top, then a sweep down to the foot, then the base
  for (let i = 0; i <= 14; i++) {
    const a = THREE.MathUtils.lerp(Math.PI * 0.95, -Math.PI * 0.18, i / 14);
    two.push(new THREE.Vector3(0.3 + Math.cos(a) * 0.27, 0.71 + Math.sin(a) * 0.27, 0));
  }
  two.push(new THREE.Vector3(0.36, 0.42, 0), new THREE.Vector3(0.16, 0.2, 0), new THREE.Vector3(0.02, 0.02, 0), new THREE.Vector3(0.3, 0.0, 0), new THREE.Vector3(0.64, 0.02, 0));
  const six: THREE.Vector3[] = [new THREE.Vector3(0.56, 0.96, 0), new THREE.Vector3(0.38, 0.92, 0), new THREE.Vector3(0.18, 0.76, 0), new THREE.Vector3(0.07, 0.5, 0)];
  // …down into the loop
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI * 2;
    six.push(new THREE.Vector3(0.33 + Math.cos(a) * 0.26, 0.28 + Math.sin(a) * 0.27, 0));
  }
  return [two, six];
}

function CakeTopper({ y, outward }: { y: number; outward: THREE.Vector2 }) {
  const parts = useMemo(() => {
    const [two, six] = numeralPaths();
    const tube = (pts: THREE.Vector3[], dx: number) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 90, 0.045, 8, false);
      g.translate(dx, 0, 0);
      return g;
    };
    return { two: tube(two, -0.7), six: tube(six, 0.06) };
  }, []);
  useEffect(() => () => [parts.two, parts.six].forEach((g) => g.dispose()), [parts]);
  // rose gold, restrained: it catches the candlelight and the room's lamps, never glows
  const gold = useMemo(() => surface({ color: '#d8a48e', metalness: 0.88, roughness: 0.26, clearcoat: 0.4, clearcoatRoughness: 0.2, bumpScale: 0.02 }), []);
  useEffect(() => () => gold.dispose(), [gold]);
  // stands behind the candles, its face turned to the middle of the room
  const face = Math.atan2(-outward.x, -outward.y);
  const H = 0.19;
  return (
    <group position={[outward.x * 0.1, y, outward.y * 0.1]} rotation-y={face}>
      <group position={[0, 0.12, 0]} scale={H} rotation-z={-0.03}>
        <mesh geometry={parts.two} material={gold} />
        <mesh geometry={parts.six} material={gold} />
      </group>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.04, 0]} material={gold}>
          <cylinderGeometry args={[0.004, 0.003, 0.17, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Cake({
  at,
  outward = at,
  motion,
  secretFound,
  onSecret,
}: {
  at: [number, number, number];
  /** where it stands in the room (for which way is "toward the wall") */
  outward?: [number, number, number];
  motion: number;
  secretFound: boolean;
  onSecret: () => void;
}) {
  const TABLE_H = 0.72;
  const wood = useMemo(() => new THREE.MeshBasicMaterial({ color: '#2c170d' }), []);
  const cloth = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      varying vec3 vN;
      void main() {
        // an ivory tablecloth, warmer where the candlelight falls from above
        vec3 c = mix(vec3(0.34, 0.26, 0.24), vec3(0.78, 0.66, 0.58), 0.35 + 0.65 * vY);
        gl_FragColor = vec4(c * (0.7 + 0.3 * abs(vN.x)), 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  const sponge = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      varying vec3 vN;
      void main() {
        // pink buttercream, a darker berry drip round the top edge, lit from above
        vec3 cream = vec3(0.96, 0.66, 0.72);
        float drip = step(0.78, vY + 0.08 * sin(vN.x * 30.0 + vN.z * 21.0));
        vec3 c = mix(cream, vec3(0.62, 0.12, 0.25), drip);
        float lit = 0.55 + 0.45 * vY + 0.15 * abs(vN.z);
        gl_FragColor = vec4(c * lit, 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  const icing = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fbe6ea' }), []);
  const berry = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b4122e' }), []);
  const stripe = useShader(
    waxVertex,
    /* glsl */ `
      varying float vY;
      void main() {
        // a twisted candy-stripe birthday candle
        float s = step(0.5, fract(vY * 5.0));
        gl_FragColor = vec4(mix(vec3(0.95, 0.9, 0.85), vec3(0.9, 0.35, 0.5), s), 1.0);
      }
    `,
    useMemo(() => ({}), []),
    { opaque: true },
  );
  useEffect(
    () => () => {
      wood.dispose();
      icing.dispose();
      berry.dispose();
    },
    [wood, icing, berry],
  );

  const top = TABLE_H + 0.02;
  const candleTops = useMemo(
    () => [-0.14, -0.05, 0.05, 0.14].map((x, i) => [x, top + 0.46 + 0.14, (i % 2 ? 0.05 : -0.04)] as [number, number, number]),
    [top],
  );
  const flames = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(candleTops.flatMap((p) => [p[0], p[1] + 0.03, p[2]]), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(candleTops.map((_, i) => 40 + i * 2.3), 1));
    return g;
  }, [candleTops]);
  const smoke = useMemo(() => {
    const n = 60;
    const pos: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = candleTops[i % candleTops.length];
      pos.push(c[0], c[1] + 0.04, c[2]);
      seed.push(Math.random());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
  }, [candleTops]);
  useEffect(
    () => () => {
      flames.dispose();
      smoke.dispose();
    },
    [flames, smoke],
  );
  const flameU = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 }, uLit: { value: 1 } }), []);
  const flameMat = useShader(flameVertex, flameFragment, flameU);
  const smokeU = useMemo(() => ({ uTime: { value: 0 }, uBlown: { value: 999 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }), []);
  const smokeMat = useShader(smokeVertex, smokeFragment, smokeU, { additive: false });

  const blownAt = useRef<number | null>(null);
  const now = useRef(0);
  const letter = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    now.current = t;
    flameU.uTime.value = t;
    flameU.uMotion.value = motion;
    smokeU.uTime.value = t;
    const since = blownAt.current === null ? 999 : t - blownAt.current;
    smokeU.uBlown.value = since;
    // out in a breath; after a few seconds they catch again, one by one-ish
    flameU.uLit.value = since < 0.12 ? 1 - since / 0.12 : since < 4 ? 0 : Math.min(1, (since - 4) / 0.6);
    if (letter.current) (letter.current.material as THREE.MeshBasicMaterial).color.setScalar(0.75 + 0.25 * Math.sin(t * 2.2));
  });

  const blow = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    const since = blownAt.current === null ? 999 : now.current - blownAt.current;
    if (since < 5) return;
    blownAt.current = now.current;
    sound.blow();
    setTimeout(() => sound.flourish(), 450);
  };

  // outward from the room's centre, and along the wall — the secret hides beside the table
  const out = new THREE.Vector2(outward[0], outward[2]).normalize();
  const along = new THREE.Vector2(-out.y, out.x);

  return (
    <group position={at}>
      {/* the little round table with its cloth */}
      <mesh position={[0, TABLE_H / 2, 0]} material={wood}>
        <cylinderGeometry args={[0.05, 0.1, TABLE_H, 12]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={wood}>
        <cylinderGeometry args={[0.28, 0.32, 0.04, 24]} />
      </mesh>
      <mesh position={[0, TABLE_H - 0.1, 0]} material={cloth}>
        <cylinderGeometry args={[0.55, 0.62, 0.24, 40, 1, true]} />
      </mesh>
      <mesh position={[0, TABLE_H + 0.015, 0]} rotation-x={-Math.PI / 2} material={icing}>
        <circleGeometry args={[0.56, 40]} />
      </mesh>
      {/* the cake: two tiers, a cream rim, berries on top, candles */}
      <group onClick={blow} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh position={[0, top + 0.13, 0]} material={sponge}>
          <cylinderGeometry args={[0.34, 0.35, 0.26, 40]} />
        </mesh>
        <mesh position={[0, top + 0.26, 0]} rotation-x={-Math.PI / 2} material={icing}>
          <circleGeometry args={[0.34, 40]} />
        </mesh>
        <mesh position={[0, top + 0.36, 0]} material={sponge}>
          <cylinderGeometry args={[0.22, 0.23, 0.2, 36]} />
        </mesh>
        <mesh position={[0, top + 0.46, 0]} rotation-x={-Math.PI / 2} material={icing}>
          <circleGeometry args={[0.22, 36]} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.sin(a) * 0.3, top + 0.28, Math.cos(a) * 0.3]} material={berry}>
              <sphereGeometry args={[0.03, 10, 8]} />
            </mesh>
          );
        })}
        {candleTops.map((p, i) => (
          <mesh key={i} position={[p[0], p[1] - 0.07, p[2]]} material={stripe}>
            <cylinderGeometry args={[0.012, 0.012, 0.14, 8]} />
          </mesh>
        ))}
        {/* a generous invisible target, so the whole cake answers a touch */}
        <mesh position={[0, top + 0.3, 0]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      <CakeTopper y={top + 0.46} outward={out} />
      <points geometry={flames} material={flameMat} frustumCulled={false} />
      <points geometry={smoke} material={smokeMat} frustumCulled={false} />

      {/* the secret: a little glowing letter leaning against the table leg, on the far side */}
      <group position={[along.x * 0.45 + out.x * 0.3, 0.09, along.y * 0.45 + out.y * 0.3]} rotation={[-0.25, Math.atan2(along.x, along.y), 0.08]}>
        <mesh
          ref={letter}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 8) return;
            onSecret();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <planeGeometry args={[0.26, 0.17]} />
          <meshBasicMaterial color="#fff2e2" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={[0.05, 0.045]} />
          <meshBasicMaterial color="#b3223c" side={THREE.DoubleSide} />
        </mesh>
        {secretFound && (
          <Html center position={[0, 0.55, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
            <div className="room-secret">
              <p className="room-secret__title">{fill(birthdayConfig.room.secret.title)}</p>
              <p className="room-secret__text">{fill(birthdayConfig.room.secret.text)}</p>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/** Bunting — little pennants spelling HAPPY BIRTHDAY, sagging across the wall. */
/* ── dust: only seen where it drifts through light ───────────────────────── */
const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform vec4 uCandles[${MAX_CANDLES}];
  uniform int uCount;
  uniform float uFloorY;
  uniform vec3 uHandO;
  uniform vec3 uHandD;
  uniform float uHandOn;
  attribute float aSeed;
  varying float vA;
  varying vec3 vCol;
  void main() {
    float t = uTime * uMotion;
    // a slow, lazy drift — each mote on its own path, sinking and lifting on warm air
    vec3 p = position + vec3(
      sin(t * 0.13 + aSeed * 40.0) * 0.35 + sin(t * 0.31 + aSeed * 11.0) * 0.1,
      sin(t * 0.09 + aSeed * 23.0) * 0.25,
      cos(t * 0.11 + aSeed * 31.0) * 0.35);
    // her hand stirs the air: motes near it are pushed aside
    vec3 rel = p - uHandO;
    vec3 perp = rel - dot(rel, uHandD) * uHandD;
    float d = length(perp);
    p += normalize(perp + 1e-4) * uHandOn * 0.25 * exp(-d * d * 6.0);
    // lit only near a flame (warm) or in the moonlight by the window (cool)
    float warm = 0.0;
    for (int i = 0; i < ${MAX_CANDLES}; i++) {
      if (i >= uCount) break;
      vec4 c = uCandles[i];
      vec3 f = vec3(c.x, uFloorY + c.w + 0.1, c.y);
      vec3 q = p - f;
      warm += exp(-dot(q, q) * 2.2);
    }
    vec2 m = vec2(p.x - ${MOON[0].toFixed(3)}, p.z - ${MOON[1].toFixed(3)});
    float cool = exp(-m.x * m.x * 0.9 - m.y * m.y * 0.25) * smoothstep(uFloorY, uFloorY + 1.0, p.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // catching the light as it turns
    float glint = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 60.0);
    vA = clamp(warm * 1.3 + cool * 0.7, 0.0, 1.0) * glint;
    vCol = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.8, 0.55), clamp(warm * 3.0, 0.0, 1.0));
    gl_PointSize = (1.2 + aSeed * 1.4) * uPixelRatio * (14.0 / -mv.z);
  }
`;
const dustFragment = /* glsl */ `
  varying float vA;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vCol, smoothstep(0.5, 0.0, d) * vA * 0.8);
  }
`;

function Dust({ candles, candleVec, floorY, count, motion }: { candles: Candle[]; candleVec: THREE.Vector4[]; floorY: number; count: number; motion: number }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      // most around the candle clusters, some in the moonlight by the window
      if (i % 4 === 3) {
        pos.push(MOON[0] + (Math.random() - 0.5) * 2.4, floorY + 0.3 + Math.random() * 2.6, MOON[1] + (Math.random() - 0.5) * 2.4);
      } else {
        const c = candles[i % candles.length];
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.9;
        pos.push(c.x + Math.cos(a) * r, floorY + 0.15 + Math.random() * 1.3, c.z + Math.sin(a) * r);
      }
      seed.push(Math.random());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
  }, [candles, floorY, count]);
  useEffect(() => () => geo.dispose(), [geo]);
  const u = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: 1 },
      uCandles: { value: candleVec },
      uCount: { value: candles.length },
      uFloorY: { value: floorY },
      uHandO: { value: hand.o },
      uHandD: { value: hand.d },
      uHandOn: { value: 0 },
    }),
    [candleVec, candles.length, floorY],
  );
  const mat = useShader(dustVertex, dustFragment, u);
  useFrame((state) => {
    u.uTime.value = state.clock.elapsedTime;
    u.uMotion.value = motion;
    u.uHandOn.value = hand.on;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** A garland of fairy lights sagging between hooks along the wall. */
function Garland({ floorY }: { floorY: number }) {
  const geo = useMemo(() => {
    const hooks = 9;
    const per = 16;
    const pts: number[] = [];
    const seed: number[] = [];
    const color: number[] = [];
    const size: number[] = [];
    const palette = ['#ffd9a0', '#ffb070', '#fff2d8', '#ff9fb5'].map((c) => new THREE.Color(c));
    const r = WALL_R - 0.08;
    // along the back two thirds of the wall
    const a0 = -2.1;
    const a1 = 2.1;
    for (let hk = 0; hk < hooks; hk++) {
      for (let k = 0; k < per; k++) {
        const u = k / per;
        const a = a0 + ((hk + u) / hooks) * (a1 - a0);
        const sag = Math.sin(u * Math.PI) * 0.32;
        const y = floorY + 2.9 - sag * 0.6;
        pts.push(Math.sin(a) * r, y, -Math.cos(a) * r);
        seed.push(Math.random());
        const c = palette[(hk * per + k) % palette.length];
        color.push(c.r, c.g, c.b);
        size.push(2.4 + Math.random() * 0.8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    return g;
  }, [floorY]);
  useEffect(() => () => geo.dispose(), [geo]);
  const u = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: 1 } }), []);
  const mat = useShader(twinkleVertex, twinkleFragment, u);
  useFrame((state) => {
    u.uTime.value = state.clock.elapsedTime;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** A spot on the stage that belongs to one of the memories. */
export interface Spot {
  x: number;
  z: number;
  /** which way it faces (the ring angle) */
  angle: number;
}

/** A handful of rose and blush petals scattered round the puppy's spot. */
function Petals({ spot, y, motion }: { spot: Spot; y: number; motion: number }) {
  const geo = useMemo(() => {
    const cols = ['#b4505f', '#d99aa0', '#efd9c8', '#c46a78'].map((c) => new THREE.Color(c));
    const parts: THREE.BufferGeometry[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      // mostly in front of it and to the sides, never under its paws
      const a = spot.angle + (rnd() - 0.5) * 2.6;
      const d = 0.42 + rnd() * 0.5;
      const g = new THREE.SphereGeometry(1, 7, 4);
      g.scale(0.034 + rnd() * 0.015, 0.006, 0.024 + rnd() * 0.01);
      g.rotateY(rnd() * Math.PI);
      g.rotateZ((rnd() - 0.5) * 0.3);
      g.translate(spot.x + Math.sin(a) * d, y + 0.007, spot.z + Math.cos(a) * d);
      const flat = g.toNonIndexed();
      g.dispose();
      const c = cols[i % cols.length];
      const n = flat.attributes.position.count;
      flat.setAttribute('aColor', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
      flat.setAttribute('aSway', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
      parts.push(flat);
    }
    return mergeAll(parts);
  }, [spot.x, spot.z, spot.angle, y]);
  useEffect(() => () => geo.dispose(), [geo]);
  const u = useMemo(() => ({ uTime: { value: 0 }, uMotion: { value: motion } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useShader(satinVertex, satinFragment, u, { opaque: true, side: THREE.DoubleSide });
  return <mesh geometry={geo} material={mat} />;
}

/** The stage: two shallow steps, matte burgundy tops with inlays, lacquered sides, champagne trims. */
function Stage({ y, rug, stageMat, bandMat }: { y: number; rug: THREE.Vector2; stageMat: THREE.Material; bandMat: THREE.Material }) {
  const parts = useMemo(() => {
    const ellipse = (k: number, yy: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * rug.x * k, yy, Math.cos(a) * rug.y * k));
      }
      return new THREE.CatmullRomCurve3(pts, true);
    };
    const half = STAGE_STEP / 2;
    return {
      trimTop: new THREE.TubeGeometry(ellipse(0.955, y + 0.004), 260, 0.014, 6, true),
      trimStep: new THREE.TubeGeometry(ellipse(1.0, y - half + 0.004), 260, 0.011, 6, true),
      trimInset: new THREE.TubeGeometry(ellipse(0.79, y + 0.003), 220, 0.005, 4, true),
    };
  }, [rug.x, rug.y, y]);
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts]);
  const goldU = useMemo(() => ({ uColor: { value: new THREE.Color('#d2ab74') } }), []);
  const gold = useShader(metalVertex, metalFragment, goldU, { opaque: true });
  const half = STAGE_STEP / 2;
  return (
    <group>
      {/* tops: the lower step, then the main stage */}
      <mesh rotation-x={-Math.PI / 2} position-y={y - half} scale={[rug.x, rug.y, 1]} material={stageMat} renderOrder={-3}>
        <circleGeometry args={[1, 128]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={y} scale={[rug.x * 0.955, rug.y * 0.955, 1]} material={stageMat} renderOrder={-3}>
        <circleGeometry args={[1, 128]} />
      </mesh>
      {/* sides */}
      <mesh position-y={y - half - half / 2} scale={[rug.x, 1, rug.y]} material={bandMat}>
        <cylinderGeometry args={[1, 1, half, 128, 1, true]} />
      </mesh>
      <mesh position-y={y - half / 2} scale={[rug.x * 0.955, 1, rug.y * 0.955]} material={bandMat}>
        <cylinderGeometry args={[1, 1, half, 128, 1, true]} />
      </mesh>
      <mesh geometry={parts.trimTop} material={gold} />
      <mesh geometry={parts.trimStep} material={gold} />
      <mesh geometry={parts.trimInset} material={gold} />
    </group>
  );
}

interface Props {
  floorY: number;
  rx: number;
  rz: number;
  /** 0..1 how awake the heart is (its pink breath on the floor). */
  heart: number;
  reducedMotion: boolean;
  hoverFx: boolean;
  portrait: boolean;
  /** the letter-carrying puppy's spot (its own pool of golden light and petals) */
  dogSpot: Spot | null;
  /** the gift box's spot (a small blush pool) */
  giftSpot: Spot | null;
}

export function RoomSet({ floorY: stageY, rx, rz, heart, reducedMotion, hoverFx, portrait, dogSpot, giftSpot }: Props) {
  // the gifts stand on the stage (stageY); the room's floor is a step below it
  const floorY = stageY - STAGE_STEP;
  const motion = reducedMotion ? 0.15 : 1;
  const candles = useMemo(() => placeCandles(rx, rz), [rx, rz]);
  const candleVec = useMemo(() => {
    const arr = Array.from({ length: MAX_CANDLES }, () => new THREE.Vector4());
    candles.forEach((c, i) => arr[i].set(c.x, c.z, c.seed, c.h));
    return arr;
  }, [candles]);

  const floorU = useMemo(
    () => ({
      uTime: { value: 0 },
      uCandles: { value: candleVec },
      uCount: { value: candles.length },
      uRug: { value: new THREE.Vector2(rx + 0.95, rz + 0.95) },
      uCake: { value: new THREE.Vector2(9, 9) },
      uLamps: { value: roomLamps(stageY - STAGE_STEP, WALL_R) },
      uRugAt: { value: roomRugs(WALL_R).at },
      uRugSize: { value: roomRugs(WALL_R).size },
      uBlobs: { value: furnitureBlobs(WALL_R) },
      uHeart: { value: heart },
      uMotion: { value: motion },
    }),
    [candleVec, candles.length, rx, rz], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const wallU = useMemo(
    () => ({ uTime: { value: 0 }, uCandles: { value: candleVec }, uCount: { value: candles.length }, uFloorY: { value: floorY }, uMotion: { value: motion }, uLove: { value: 999 }, uLamps: floorU.uLamps }),
    [candleVec, candles.length, floorY, floorU], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const floorMat = useShader(floorVertex, floorFragment, floorU, { opaque: true });
  const stageU = useMemo(
    () => ({
      uTime: { value: 0 },
      uCandles: { value: candleVec },
      uCount: { value: candles.length },
      uRug: floorU.uRug,
      uHeart: floorU.uHeart,
      uMotion: { value: motion },
      uDog: { value: new THREE.Vector3(99, 99, 0) },
      uGift: { value: new THREE.Vector2(99, 99) },
    }),
    [candleVec, candles.length, floorU], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bandU = useMemo(
    () => ({ uTime: stageU.uTime, uCandles: { value: candleVec }, uCount: { value: candles.length }, uRug: floorU.uRug, uMotion: stageU.uMotion }),
    [candleVec, candles.length, floorU, stageU],
  );
  const stageMat = useShader(floorVertex, stageFragment, stageU, { opaque: true });
  const bandMat = useShader(floorVertex, bandFragment, bandU, { opaque: true });
  useEffect(() => {
    if (dogSpot) stageU.uDog.value.set(dogSpot.x, dogSpot.z, dogSpot.angle);
    else stageU.uDog.value.set(99, 99, 0);
    if (giftSpot) stageU.uGift.value.set(giftSpot.x, giftSpot.z);
    else stageU.uGift.value.set(99, 99);
  }, [dogSpot, giftSpot, stageU]);
  const wallMat = useShader(wallVertex, wallFragment, wallU, { side: THREE.BackSide, opaque: true });
  const waxMat = useShader(waxVertex, waxFragment, useMemo(() => ({}), []), { opaque: true });

  const flames = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(candles.flatMap((c) => [c.x, floorY + c.h + 0.06, c.z]), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(candles.map((c) => c.seed), 1));
    return g;
  }, [candles, floorY]);
  useEffect(() => () => flames.dispose(), [flames]);
  const flameU = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: 1 },
      uLit: { value: 1 },
      uHandO: { value: hand.o },
      uHandD: { value: hand.d },
      uHandOn: { value: 0 },
      uWind: { value: 0 },
    }),
    [],
  );
  const flameMat = useShader(flameVertex, flameFragment, flameU);

  // her hand: where the pointer points into the room, and the air it moves
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const lastPointer = useRef({ x: 0, y: 0, moved: -10 });
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (!hoverFx || reducedMotion) {
      hand.on = 0;
      hand.wind = 0;
      hand.speed = 0;
      return;
    }
    const pt = state.pointer;
    const lp = lastPointer.current;
    const dx = pt.x - lp.x;
    const dy = pt.y - lp.y;
    if (dx !== 0 || dy !== 0) lp.moved = state.clock.elapsedTime;
    lp.x = pt.x;
    lp.y = pt.y;
    ray.setFromCamera(pt, state.camera);
    hand.o.copy(ray.ray.origin);
    hand.d.copy(ray.ray.direction);
    const k = 1 - Math.exp(-dt * 6);
    const moving = state.clock.elapsedTime - lp.moved < 0.6 ? 1 : 0;
    hand.on += (moving - hand.on) * (1 - Math.exp(-dt * (moving ? 8 : 1.5)));
    hand.wind += ((dx / Math.max(dt, 1e-3)) * 0.6 - hand.wind) * k;
    hand.speed += (Math.hypot(dx, dy) / Math.max(dt, 1e-3) - hand.speed) * k;
    flameU.uHandOn.value = hand.on;
    flameU.uWind.value = hand.wind;
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    floorU.uTime.value = t;
    stageU.uTime.value = t;
    stageU.uMotion.value = motion;
    wallU.uTime.value = t;
    flameU.uTime.value = t;
    floorU.uMotion.value = wallU.uMotion.value = flameU.uMotion.value = motion;
    floorU.uHeart.value += (heart - floorU.uHeart.value) * 0.05;
  });

  // balloons: round and heart-shaped, tied down toward the back and sides, at different heights
  const balloons = useMemo(
    () =>
      // three, muted, loosely gathered by the sign — two on one side, one on the other
      // tied in a loose bunch by the end of the sideboard, where the party things are
      [LAYOUT.sideboard - 0.2, LAYOUT.sideboard - 0.15, LAYOUT.sideboard - 0.24].map((a, i) => ({
        at: [Math.sin(a) * (WALL_R - [0.55, 0.85, 0.75][i]), floorY, -Math.cos(a) * (WALL_R - [0.55, 0.85, 0.75][i])] as [number, number, number],
        length: [1.95, 1.55, 1.75][i],
        color: ['#c98a98', '#c9a56a', '#e6d6d0', '#b8788a'][i],
        heart: i === 1,
        pitch: [2, 4, 5, 3][i],
      })),
    [rx, rz, floorY],
  );

  const [secretFound, setSecretFound] = useState(false);
  const findSecret = () => {
    if (!secretFound) sound.flourish();
    setSecretFound(true);
  };

  const cakeAt: [number, number, number] = cakePosition(floorY, WALL_R);
  useEffect(() => {
    floorU.uCake.value.set(cakeAt[0], cakeAt[2]);
  }, [cakeAt[0], cakeAt[2], floorU]); // eslint-disable-line react-hooks/exhaustive-deps

  // the dolls'-house cut for the set pieces: whatever stands between the camera and the
  // room (when she walks round it) steps out of the way, like the wall behind it
  const cutGroups = useRef<(THREE.Object3D | null)[]>([]);
  useFrame(({ camera: cam }) => {
    const cx = cam.position.x;
    const cz = cam.position.z;
    const d = Math.hypot(cx, cz);
    for (const g of cutGroups.current) {
      if (!g) continue;
      const a = g.userData.anchor as number;
      g.visible = !(d > WALL_R - 0.6 && (Math.sin(a) * cx - Math.cos(a) * cz) / d > 0.42);
    }
  });

  const loveAt = useRef<number | null>(null);
  const clockNow = useRef(0);
  useFrame((state) => {
    clockNow.current = state.clock.elapsedTime;
    wallU.uLove.value = loveAt.current === null ? 999 : state.clock.elapsedTime - loveAt.current;
  });
  // QA hook (?debug): light the far window without having to aim at it
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return;
    (window as unknown as { __roomLove?: () => void }).__roomLove = () => (loveAt.current = clockNow.current);
  }, []);
  const touchWindow = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    if (loveAt.current !== null && clockNow.current - loveAt.current < 5) return;
    // (once the star is there, a second touch lights the window again and sends another)
    loveAt.current = clockNow.current;
    [4, 5, 7].forEach((pch, i) => setTimeout(() => sound.chime(pch, 0.035), 700 + i * 160));
  };

  // (its shaders are compiled with the rest of the room, in parallel, before RoomWorld shows it)
  const root = useRef<THREE.Group>(null);

  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position-y={floorY - 0.002} material={floorMat} renderOrder={-4}>
        <circleGeometry args={[WALL_R, 96]} />
      </mesh>
      <mesh position-y={floorY + WALL_H / 2} material={wallMat} renderOrder={-5}>
        <cylinderGeometry args={[WALL_R, WALL_R, WALL_H, 96, 1, true]} />
      </mesh>
      {candles.map((c, i) => (
        <mesh
          key={i}
          position={[c.x, floorY + c.h / 2, c.z]}
          rotation={[Math.sin(c.seed * 3.1) * 0.035, 0, Math.cos(c.seed * 1.7) * 0.035]}
          geometry={candleGeometry(c)}
          material={waxMat}
        />
      ))}
      <points geometry={flames} material={flameMat} frustumCulled={false} />
      <Dust candles={candles} candleVec={candleVec} floorY={floorY} count={portrait ? 90 : 170} motion={motion} />
      {/* the window pane, as something to touch */}
      <mesh
        ref={(m) => void (cutGroups.current[3] = m)}
        userData={{ anchor: WINDOW_ANGLE }}
        position={[Math.sin(WINDOW_ANGLE) * (WALL_R - 0.12), floorY + 1.9, -Math.cos(WINDOW_ANGLE) * (WALL_R - 0.12)]}
        rotation-y={-WINDOW_ANGLE}
        onClick={touchWindow}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[1.9, 2.0]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <Garland floorY={floorY} />
      <group ref={(g) => void (cutGroups.current[0] = g)} userData={{ anchor: 0 }}>
        <BirthdaySign floorY={floorY} radius={portrait ? 4.9 : 5.95} scale={portrait ? 0.68 : 0.95} drop={portrait ? 0.75 : 0.32} heart={heart} motion={motion} />
      </group>
      <Stage y={stageY} rug={floorU.uRug.value} stageMat={stageMat} bandMat={bandMat} />
      <RoomProps floorY={floorY} windowAngle={WINDOW_ANGLE} wallR={WALL_R} candleVec={candleVec} candleCount={candles.length} heart={heart} motion={motion} />
      {dogSpot && <Petals spot={dogSpot} y={stageY} motion={motion} />}
      <group position={cakeAt} scale={0.82} ref={(g) => void (cutGroups.current[1] = g)} userData={{ anchor: LAYOUT.cake }}>
        <Cake at={[0, 0, 0]} outward={cakeAt} motion={motion} secretFound={secretFound} onSecret={findSecret} />
      </group>
      <group ref={(g) => void (cutGroups.current[2] = g)} userData={{ anchor: LAYOUT.sideboard }}>
        {balloons.map((b, i) => (
          <Balloon key={i} {...b} motion={motion} hoverFx={hoverFx} />
        ))}
      </group>
    </group>
  );
}
