import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { ScreenLabel } from './ScreenLabel';
import { motion as MOTION } from '../../config/motion';
import { ShotTitle } from './ShotTitle';
import * as THREE from 'three';
import { useShader } from './useShader';
import type { Gift } from '../../data/gifts';
import { Glow } from './Glow';
import { getHeartGeometry } from './heartShape';
import { getGlowTexture, getPaperTexture, getShadowTexture } from './glowTexture';
import { Spring } from './CameraRig';
import { sound } from '../../lib/audio';
import { LetterDog } from './LetterDog';
import { Rope, RopeTube } from './verlet';
import { roomHand, handNear, giftRing } from './sceneStore';

interface Props {
  gift: Gift;
  index: number;
  /** Resting place on the ring. */
  home: [number, number, number];
  /** Where it rises to while opening (in front of the camera). */
  showcase: [number, number, number];
  /** Direction the gift faces (radians around Y) — outward from the heart. */
  facing: number;
  floorY: number;
  size: number;
  opened: boolean;
  opening: boolean;
  disabled: boolean;
  focused: boolean;
  /** Hide the title (e.g. when everything is opened and the heart takes the stage). */
  quiet?: boolean;
  /** The room is being left: the floating name goes first (see RoomWorld). */
  hideLabel?: boolean;
  glass: boolean;
  reducedMotion: boolean;
  /** Fine pointer present: hover sparkles, tilt and sound. */
  hoverFx: boolean;
  onSelect: (id: string) => void;
  onOpened: (id: string) => void;
  onHover: (id: string, on: boolean) => void;
}

/** 0 → 1 while the gift is being opened. Shared with the shape so lids/flaps can move. */
type Progress = { current: number };

function starGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.36 : 0.16;
    const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 6,
  });
  g.center();
  return g;
}

/**
 * Each object gets a material that fits what it is — wrapping paper and satin,
 * glass, polished metal, card — so the room reads as real things, not icons.
 * The "main" material is returned too, so hover can warm it up.
 */
export type GiftMaterials = {
  main: THREE.MeshPhysicalMaterial;
  ribbon?: THREE.MeshPhysicalMaterial;
  flap?: THREE.MeshPhysicalMaterial;
  seal?: THREE.MeshPhysicalMaterial;
  /** brushed brass: tags, hinges, keys, the star on the journal */
  metal?: THREE.MeshPhysicalMaterial;
  /** paper: the rolled note, the journal's pages */
  paper?: THREE.MeshPhysicalMaterial;
  /** cork and twine for the bottle; polished walnut for the music box; velvet lining */
  cork?: THREE.MeshPhysicalMaterial;
  twine?: THREE.MeshPhysicalMaterial;
  wood?: THREE.MeshPhysicalMaterial;
  velvet?: THREE.MeshPhysicalMaterial;
};

const brass = () => surface({ color: '#c9a46e', metalness: 0.85, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3, bumpScale: 0.05 });
const paperSurface = (color = '#f2e8da') => surface({ color, roughness: 0.86, sheen: 0.25, sheenRoughness: 0.9, bumpScale: 0.9 });

/**
 * Every opaque gift surface switches on the same shader features (sheen,
 * clearcoat, a bump map, emissive) and differs only in their amounts. three.js
 * builds one shader program per feature set, so the whole room compiles one
 * opaque program instead of six — the difference between a smooth entrance
 * and a multi-second freeze on Windows.
 */
export function surface(p: {
  color: THREE.ColorRepresentation;
  roughness: number;
  metalness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: THREE.ColorRepresentation;
  clearcoat?: number;
  clearcoatRoughness?: number;
  bumpScale?: number;
  emissive?: THREE.Color;
}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: p.color,
    roughness: p.roughness,
    metalness: p.metalness ?? 0,
    sheen: Math.max(0.02, p.sheen ?? 0),
    sheenRoughness: p.sheenRoughness ?? 0.6,
    sheenColor: new THREE.Color(p.sheenColor ?? '#ffffff'),
    clearcoat: Math.max(0.02, p.clearcoat ?? 0),
    clearcoatRoughness: p.clearcoatRoughness ?? 0.4,
    bumpMap: getPaperTexture(),
    bumpScale: p.bumpScale ?? 0.02,
    emissive: p.emissive ?? new THREE.Color('#000000'),
    emissiveIntensity: 0,
  });
}

// `_glass` is kept for callers; real refraction (transmission) is no longer used for gifts:
// it forced a second render of the room every frame and a second copy of every shader.
export function createGiftMaterials(gift: Pick<Gift, 'shape' | 'tint'>, _glass?: boolean): GiftMaterials {
  const tint = new THREE.Color(gift.tint);
  const glassShell = () =>
    new THREE.MeshPhysicalMaterial({
      color: tint.clone().lerp(new THREE.Color('#ffffff'), 0.35),
      roughness: 0.05,
      metalness: 0,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      iridescence: 0.25,
      iridescenceIOR: 1.3,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      specularIntensity: 1,
      envMapIntensity: 1.4,
    });
  switch (gift.shape) {
    case 'box': {
      const main = surface({
        color: tint,
        roughness: 0.62,
        sheen: 0.55,
        sheenRoughness: 0.7,
        sheenColor: '#fff1ee',
        clearcoat: 0.1,
        clearcoatRoughness: 0.6,
        bumpScale: 1.2,
        emissive: tint,
      });
      const ribbon = surface({
        color: '#9a2745',
        roughness: 0.32,
        sheen: 1,
        sheenRoughness: 0.28,
        sheenColor: '#ffb9c9',
        clearcoat: 0.3,
        clearcoatRoughness: 0.25,
      });
      return { main, ribbon, metal: brass(), paper: paperSurface('#efe3d2') };
    }
    case 'capsule': {
      // a little glass keepsake bottle: cork, twine, a rolled note inside
      const main = glassShell();
      main.opacity = 0.26;
      const cork = surface({ color: '#a77d52', roughness: 0.92, bumpScale: 2.2 });
      const twine = surface({ color: '#c9a77a', roughness: 0.95, sheen: 0.4, sheenRoughness: 0.9, bumpScale: 1.5 });
      const ribbon = surface({ color: '#9a2745', roughness: 0.32, sheen: 1, sheenRoughness: 0.28, sheenColor: '#ffb9c9', clearcoat: 0.3 });
      return { main, cork, twine, paper: paperSurface('#f3e4cf'), ribbon };
    }
    case 'orb': {
      // a miniature music box: polished walnut, brass, a velvet lining
      const main = surface({ color: '#7a5234', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.14, sheen: 0.15, sheenColor: '#ffd9b0', bumpScale: 0.3, emissive: new THREE.Color('#ffcf9a') });
      const velvet = surface({ color: '#6e2634', roughness: 0.9, sheen: 1, sheenRoughness: 0.35, sheenColor: '#d77a8e', bumpScale: 0.6 });
      return { main, metal: brass(), velvet };
    }
    case 'star': {
      // a travel journal bound in soft leather, a gilt star pressed into its cover
      const main = surface({ color: '#6b3a2c', roughness: 0.55, sheen: 0.45, sheenRoughness: 0.5, sheenColor: '#d9a184', clearcoat: 0.15, clearcoatRoughness: 0.5, bumpScale: 1.4, emissive: tint });
      const ribbon = surface({ color: '#9a2745', roughness: 0.32, sheen: 1, sheenRoughness: 0.28, sheenColor: '#ffb9c9', clearcoat: 0.3 });
      return { main, metal: brass(), paper: paperSurface('#efe3cf'), ribbon };
    }
    case 'envelope': {
      const card = { roughness: 0.82, sheen: 0.3, sheenRoughness: 0.9, bumpScale: 0.8, emissive: tint };
      const main = surface({ color: '#f3e6d8', ...card });
      const flap = surface({ color: '#ead9c7', ...card });
      const seal = surface({ color: '#7a1c33', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      return { main, flap, seal };
    }
  }
}

function useGiftMaterials(gift: Gift, glass: boolean): GiftMaterials {
  const mats = useMemo(() => createGiftMaterials(gift, glass), [gift, glass]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m?.dispose());
    },
    [mats],
  );
  return mats;
}

/**
 * The bow's two tails: satin bands of 10 Verlet segments each, lying over the lid and falling
 * over its front edge (storyboard E2). Simulated in the lid's own space, so they ride the lid
 * when it swings open; gravity and the lid's own jolts are turned into that space each frame,
 * and her hand passing close sweeps them aside.
 */
const _g = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wp = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _push = new THREE.Vector3();
function RibbonTails({ material, motion }: { material: THREE.Material; motion: number }) {
  const holder = useRef<THREE.Group>(null);
  const sim = useMemo(() => {
    // the knot sits just in front of the bow's centre; one tail goes forward-left, one forward-right
    const make = (x: number, len: number, side: number) => {
      const n = 11;
      const r = new Rope(new THREE.Vector3(x, 0.082, 0.015), new THREE.Vector3(side * 0.35, -0.05, 1), { points: n, segment: len / (n - 1), gravity: 0, damping: 0.12, iterations: 8 });
      r.pin(0, new THREE.Vector3(x, 0.082, 0.015));
      // the lid (in this space): the ribbon drapes over its top and down its front
      r.box = new THREE.Box3(new THREE.Vector3(-0.335, -0.07, -0.335), new THREE.Vector3(0.335, 0.072, 0.335));
      return { rope: r, tube: new RopeTube(n, 0.04, { flat: true, thick: 0.004 }) };
    };
    return [make(-0.02, 0.3, -1), make(0.03, 0.25, 1)];
  }, []);
  useEffect(() => () => sim.forEach((t) => t.tube.dispose()), [sim]);
  const last = useRef({ p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), init: false });

  useFrame((_, rawDt) => {
    const h = holder.current;
    if (!h) return;
    const dt = Math.min(rawDt, 0.05);
    h.updateWorldMatrix(true, false);
    h.getWorldQuaternion(_q).invert();
    // the lid's motion in the world, felt as a pull the other way in its own space
    h.getWorldPosition(_wp);
    const L = last.current;
    if (!L.init) {
      L.p.copy(_wp);
      L.init = true;
    }
    const v = _g.copy(_wp).sub(L.p).divideScalar(Math.max(dt, 1e-3));
    L.a.lerp(v.clone().sub(L.v).divideScalar(Math.max(dt, 1e-3)), 0.3);
    L.v.copy(v);
    L.p.copy(_wp);
    const wind = new THREE.Vector3(0, -9.8, 0).sub(L.a.clone().multiplyScalar(0.6)).applyQuaternion(_q);
    // a breath of draught so satin is never dead still
    wind.x += Math.sin(performance.now() * 0.0011) * 0.25 * motion;
    // her hand passing close sweeps the tails aside
    let near = false;
    if (roomHand.on > 0.02) {
      const d = handNear(_wp, _hp);
      if (d < 0.6) {
        near = true;
        _push.copy(_wp).sub(_hp).applyQuaternion(_q).normalize().multiplyScalar((1 - d / 0.6) * Math.min(roomHand.speed, 4) * roomHand.on * 0.004);
      }
    }
    for (const { rope, tube } of sim) {
      if (near) rope.nudge(rope.get(rope.n - 1, _hp), _push, 0.4);
      rope.step(dt, wind);
      tube.update(rope, new THREE.Vector3(0, 1, 0));
    }
  });

  return (
    <group ref={holder}>
      {sim.map(({ tube }, i) => (
        <mesh key={i} geometry={tube.geometry} material={material} frustumCulled={false} />
      ))}
    </group>
  );
}

/** The music box's mechanism: pins on the drum (x along it, angle round it) and the comb's teeth. */
const COMB_TEETH = 12;
const DRUM_PINS: [number, number][] = Array.from({ length: 28 }, (_, i) => [-0.05 + ((i * 7) % 12) * 0.009, (i / 28) * Math.PI * 2]);

/** A little card tag with "for you" written by hand. */
let tagTex: THREE.CanvasTexture | null = null;
function getTagTexture(): THREE.CanvasTexture {
  if (tagTex) return tagTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3e9da';
  g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(120, 90, 60, ${0.03 + Math.random() * 0.04})`;
    g.fillRect(Math.random() * 256, Math.random() * 160, 2, 1);
  }
  g.strokeStyle = 'rgba(150, 110, 80, 0.5)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 236, 140);
  g.fillStyle = '#6e2634';
  g.font = '500 58px "Dancing Script", "Segoe Script", cursive';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(128, 84);
  g.rotate(-0.06);
  g.fillText('for you', 0, 0);
  g.restore();
  tagTex = new THREE.CanvasTexture(c);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  tagTex.anisotropy = 4;
  return tagTex;
}

/** The bottle's profile (radius, height), turned on a lathe: a round body, shoulders, a neck. */
function bottleGeometry(): THREE.LatheGeometry {
  const pts = [
    [0.0, -0.21],
    [0.15, -0.21],
    [0.172, -0.18],
    [0.178, -0.05],
    [0.17, 0.06],
    [0.12, 0.13],
    [0.065, 0.17],
    [0.058, 0.25],
    [0.068, 0.265],
    [0.066, 0.28],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 40);
}

/**
 * A little rose water in the bottom of the keepsake bottle (storyboard E2): its own lathe just
 * inside the glass, with a slightly domed meniscus. Shaded as a liquid, not a solid: rim light
 * from Fresnel, colour that deepens with the thickness the eye looks through (Beer–Lambert, on
 * a cylinder's chord), and light passing through it from the room behind.
 */
function liquidGeometry(): THREE.LatheGeometry {
  const pts = [
    [0.0, -0.198],
    [0.142, -0.198],
    [0.162, -0.172],
    [0.167, -0.1],
    [0.166, -0.085],
    [0.1, -0.08],
    [0.0, -0.078],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 36);
}
export const liquidVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vL;
  void main() {
    vL = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
export const liquidFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uLight;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vL;
  void main() {
    float facing = clamp(abs(dot(normalize(vN), vV)), 0.0, 1.0);
    float fres = pow(1.0 - facing, 3.0);
    // thickness through a cylinder seen side-on: longest through the middle
    float r = clamp(length(vL.xz) / 0.167, 0.0, 1.0);
    float thick = sqrt(max(0.0, 1.0 - r * r)) * 0.33;
    vec3 absorb = exp(-(vec3(1.0) - uTint) * thick * 9.0);
    vec3 col = absorb * vec3(1.0, 0.86, 0.8) * (0.28 + uLight * 0.5) + vec3(1.0, 0.9, 0.85) * fres * 0.35;
    gl_FragColor = vec4(col, 0.55 + fres * 0.35);
  }
`;
function Liquid({ tint, level }: { tint: string; level: () => number }) {
  const geo = useMemo(() => liquidGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const u = useMemo(() => ({ uTint: { value: new THREE.Color(tint).lerp(new THREE.Color('#ff9fb0'), 0.5) }, uLight: { value: 0 } }), [tint]);
  const mat = useShader(liquidVertex, liquidFragment, u, { additive: false });
  useFrame(() => {
    u.uLight.value = level();
  });
  return <mesh geometry={geo} material={mat} renderOrder={1} />;
}

/** A few glowing motes (the hover-sparkle shader again, so no new program to compile). */
function Motes({ count, radius, level, seed = 1 }: { count: number; radius: number; level: () => number; seed?: number }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOn: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }), []);
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count);
    let x = seed * 9301;
    const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(radius * Math.cbrt(rnd()));
      pos.set([v.x, v.y, v.z], i * 3);
      sd[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    return g;
  }, [count, radius, seed]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useShader(sparkVertex, sparkFragment, uniforms);
  const pts = useRef<THREE.Points>(null);
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uOn.value = Math.max(0, level());
    if (pts.current) pts.current.visible = uniforms.uOn.value > 0.01;
  });
  // (motes of light are never something to touch: a Points' raycast reaches a whole metre)
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />;
}

const openOf = (o: number) => THREE.MathUtils.smoothstep(o, 0.4, 0.85);
/** How long a steady press takes to lift a lid all the way (seconds). */
const HOLD_SECS = 0.7;
/** QA (?debug): window.__giftHold shows which lid is being lifted, and how far. */
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

function GiftBody({
  gift,
  progress,
  hold,
  hover,
  glass,
  aim,
  reducedMotion,
  opening,
  onDelivered,
}: {
  gift: Gift;
  progress: Progress;
  /** 0..1 — how far her press has lifted the lid, before the opening itself begins. */
  hold: Progress;
  hover: Progress;
  glass: boolean;
  aim: { current: { x: number; y: number } };
  reducedMotion: boolean;
  opening: boolean;
  onDelivered: () => void;
}) {
  const lid = useRef<THREE.Group>(null);
  const light = useRef<THREE.Sprite>(null);
  const tag = useRef<THREE.Group>(null);
  const cork = useRef<THREE.Group>(null);
  const cover = useRef<THREE.Group>(null);
  const pages = useRef<THREE.Group[]>([]);
  const ribbonTail = useRef<THREE.Group>(null);
  const figure = useRef<THREE.Group>(null);
  const key = useRef<THREE.Group>(null);
  const drum = useRef<THREE.Group>(null);
  const teeth = useRef<(THREE.Mesh | null)[]>([]);
  /** When each comb tooth was last plucked (s, scene clock). */
  const plucked = useRef<number[]>([]);
  const clockNow = useRef(0);
  const mats = useGiftMaterials(gift, glass);
  const star = useMemo(() => (gift.shape === 'star' ? starGeometry() : null), [gift.shape]);
  const bottle = useMemo(() => (gift.shape === 'capsule' ? bottleGeometry() : null), [gift.shape]);
  useEffect(
    () => () => {
      star?.dispose();
      bottle?.dispose();
    },
    [star, bottle],
  );

  // the music box plays a few soft notes as its lid lifts
  useEffect(() => {
    if (!opening || gift.shape !== 'orb') return;
    const ids = [7, 9, 11, 9, 7, 4].map((p, i) =>
      setTimeout(() => {
        sound.chime(p, 0.04);
        // the tooth that sounds that note rings (higher note, shorter tooth)
        plucked.current[Math.min(COMB_TEETH - 1, Math.max(0, p - 1))] = clockNow.current;
      }, 420 + i * 260),
    );
    return () => ids.forEach(clearTimeout);
  }, [opening, gift.shape]);

  const motion = reducedMotion ? 0.3 : 1;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    clockNow.current = t;
    const o = progress.current;
    const h = hover.current;
    const open = openOf(o);
    // her press, before the opening itself: enough to feel the thing give, never enough to
    // see inside — that is what the opening is for (storyboard C)
    const lift = hold.current * (1 - open);
    switch (gift.shape) {
      case 'box':
        if (lid.current) {
          // the lid lifts a breath first, then swings open on its back edge
          const pop = THREE.MathUtils.smoothstep(o, 0.25, 0.45);
          lid.current.rotation.x = -open * 1.35 - lift * 0.22;
          lid.current.position.y = 0.24 + pop * 0.04 + open * 0.08 + lift * 0.035;
        }
        // the little brass tag swings on its thread — a touch more when her hand is near
        if (tag.current) tag.current.rotation.z = Math.sin(t * 1.3 * motion + 0.6) * (0.05 + h * 0.12) * motion + open * 0.4;
        break;
      case 'capsule':
        // the cork works loose and lifts off, tilting; the motes inside rise out
        if (cork.current) {
          const pop = THREE.MathUtils.smoothstep(o, 0.3, 0.6);
          cork.current.position.y = 0.3 + pop * 0.22 + open * 0.1 + lift * 0.04 + Math.sin(t * 40) * 0.003 * h * (1 - pop);
          cork.current.rotation.z = pop * 0.6 + lift * 0.12;
          cork.current.position.x = pop * 0.08;
        }
        break;
      case 'star':
        // the journal's cover swings open, then two pages turn after it
        if (cover.current) cover.current.rotation.z = open * 2.5 + lift * 0.3 + h * 0.06 * (1 - open);
        pages.current.forEach((pg, i) => {
          if (!pg) return;
          const d = THREE.MathUtils.smoothstep(o, 0.62 + i * 0.1, 0.95 + i * 0.03);
          pg.rotation.z = d * (2.35 - i * 0.12) + Math.sin(t * 3 + i) * 0.02 * h;
        });
        if (ribbonTail.current) ribbonTail.current.rotation.x = Math.sin(t * 0.9 * motion) * 0.12 * motion;
        break;
      case 'orb':
        // the music box: the lid lifts, the little heart rises on its spindle and turns
        if (lid.current) lid.current.rotation.x = -open * 1.75 - lift * 0.3;
        if (figure.current) {
          figure.current.position.y = -0.075 + open * 0.24; // tucked under the lid until it opens
          figure.current.rotation.y = t * 1.6 * open;
        }
        if (key.current) key.current.rotation.x = t * (0.25 * motion + open * 2.4);
        if (drum.current) drum.current.rotation.x = t * open * 3;
        // each plucked tooth rings: a fast, decaying shiver at its free end
        teeth.current.forEach((m, i) => {
          if (!m) return;
          const since = t - (plucked.current[i] ?? -99);
          m.rotation.x = since < 1.5 ? Math.sin(since * 95) * 0.09 * Math.exp(-since * 5) * motion : 0;
        });
        break;
    }
    if (light.current) {
      // a warm breath of light from inside — it shows the inside, it doesn't blind
      (light.current.material as THREE.SpriteMaterial).opacity = open * 0.32 + lift * 0.12;
      light.current.scale.setScalar(0.4 + open * 0.9);
      light.current.position.y = (gift.shape === 'capsule' ? 0.3 : 0.1) + open * 0.4;
    }
    // warm the surface a touch when she hovers, and flare as it opens
    if (gift.shape !== 'capsule') mats.main.emissiveIntensity = h * 0.12 + open * 0.3;
  });

  switch (gift.shape) {
    case 'box':
      return (
        <group>
          <RoundedBox args={[0.6, 0.48, 0.6]} radius={0.035} smoothness={4} material={mats.main} />
          {/* a wide band of cream paper under the satin: wrapped in two layers, by hand */}
          <mesh material={mats.paper} rotation-y={0.015}>
            <boxGeometry args={[0.22, 0.482, 0.603]} />
          </mesh>
          <mesh material={mats.ribbon}>
            <boxGeometry args={[0.1, 0.485, 0.605]} />
          </mesh>
          <mesh material={mats.ribbon}>
            <boxGeometry args={[0.605, 0.485, 0.1]} />
          </mesh>
          <Glow ref={light} color="#ffc9a8" size={0.4} opacity={0} />
          {/* a brass tag on a thread, hanging from the ribbon at the front, not quite straight */}
          <group ref={tag} position={[0.05, 0.18, 0.31]}>
            <mesh position={[0, -0.05, 0.004]} material={mats.ribbon}>
              <cylinderGeometry args={[0.002, 0.002, 0.1, 4]} />
            </mesh>
            <group position={[0.012, -0.135, 0.008]} rotation={[0.08, 0, 0.18]}>
              {/* a card tag, written by hand, with a little brass eyelet */}
              <mesh>
                <planeGeometry args={[0.12, 0.075]} />
                <meshBasicMaterial map={getTagTexture()} color="#b9aa9a" side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, 0.03, 0.002]} material={mats.metal}>
                <torusGeometry args={[0.007, 0.0022, 6, 12]} />
              </mesh>
            </group>
          </group>
          {/* lid hinged on the back edge */}
          <group ref={lid} position={[0, 0.24, -0.33]}>
            <group position={[0, 0.06, 0.33]}>
              <RoundedBox args={[0.66, 0.13, 0.66]} radius={0.03} smoothness={4} material={mats.main} />
              <mesh material={mats.ribbon}>
                <boxGeometry args={[0.1, 0.135, 0.665]} />
              </mesh>
              <mesh material={mats.ribbon}>
                <boxGeometry args={[0.665, 0.135, 0.1]} />
              </mesh>
              {/* a hand-tied bow: one loop a little larger, the knot a little off centre */}
              <group rotation-y={0.14}>
                <mesh position={[-0.08, 0.105, 0]} rotation={[0, 0, 0.5]} scale={[1.08, 0.78, 1.5]} material={mats.ribbon}>
                  <torusGeometry args={[0.075, 0.024, 12, 28]} />
                </mesh>
                <mesh position={[0.072, 0.1, 0]} rotation={[0, 0, -0.62]} scale={[0.95, 0.72, 1.5]} material={mats.ribbon}>
                  <torusGeometry args={[0.075, 0.024, 12, 28]} />
                </mesh>
                <mesh position={[0.006, 0.09, 0]} material={mats.ribbon}>
                  <sphereGeometry args={[0.035, 16, 12]} />
                </mesh>
                {/* the ribbon's tails: real satin, draped over the lid and down its front */}
                <RibbonTails material={mats.ribbon!} motion={motion} />
              </group>
            </group>
          </group>
        </group>
      );
    case 'capsule':
      // a keepsake bottle: a note rolled inside, motes of light, cork and twine
      return (
        <group rotation={[0, 0, 0.16]}>
          <Liquid tint={gift.tint} level={() => openOf(progress.current)} />
          <mesh geometry={bottle!} material={mats.main} />
          <mesh position={[0, -0.03, 0]} rotation={[0.2, 0, 0.42]} material={mats.paper}>
            <cylinderGeometry args={[0.035, 0.035, 0.22, 18]} />
          </mesh>
          <mesh position={[0, -0.03, 0]} rotation={[0.2, 0, 0.42]} material={mats.ribbon}>
            <cylinderGeometry args={[0.037, 0.037, 0.02, 18]} />
          </mesh>
          {[0.2, 0.215].map((y, i) => (
            <mesh key={i} position={[0, y, 0]} rotation-x={Math.PI / 2} material={mats.twine}>
              <torusGeometry args={[0.06, 0.006, 6, 24]} />
            </mesh>
          ))}
          <mesh position={[0.05, 0.17, 0.03]} rotation={[0.3, 0, -0.4]} material={mats.twine}>
            <cylinderGeometry args={[0.005, 0.005, 0.1, 4]} />
          </mesh>
          <group ref={cork} position={[0, 0.3, 0]}>
            <mesh material={mats.cork}>
              <cylinderGeometry args={[0.062, 0.052, 0.08, 20]} />
            </mesh>
          </group>
          <Glow ref={light} color="#ffe3c2" size={0.4} opacity={0} />
          <group position={[0, -0.04, 0]} scale={0.32}>
            <Motes count={22} radius={0.42} seed={2} level={() => 0.55 + hover.current * 0.45 - openOf(progress.current) * 0.4} />
          </group>
          <group position={[0, 0.32, 0]} scale={1.2}>
            <Motes count={26} radius={0.18} seed={5} level={() => openOf(progress.current)} />
          </group>
        </group>
      );
    case 'star':
      // a travel journal: leather covers, a block of pages, a gilt star, a ribbon marker
      return (
        <group rotation={[1.05, 0, 0]}>
          <mesh position={[0, -0.034, 0]} material={mats.main}>
            <boxGeometry args={[0.46, 0.014, 0.34]} />
          </mesh>
          <mesh material={mats.paper}>
            <boxGeometry args={[0.44, 0.052, 0.32]} />
          </mesh>
          <mesh position={[-0.232, 0, 0]} material={mats.main}>
            <boxGeometry args={[0.02, 0.082, 0.34]} />
          </mesh>
          {/* two loose pages, turning after the cover */}
          {[0, 1].map((i) => (
            <group key={i} ref={(g) => void (g && (pages.current[i] = g))} position={[-0.22, 0.027 + i * 0.001, 0]}>
              <mesh position={[0.22, 0, 0]} material={mats.paper}>
                <boxGeometry args={[0.43, 0.002, 0.315]} />
              </mesh>
            </group>
          ))}
          <group ref={cover} position={[-0.23, 0.034, 0]}>
            <group position={[0.23, 0, 0]}>
              <mesh material={mats.main}>
                <boxGeometry args={[0.46, 0.014, 0.34]} />
              </mesh>
              <mesh geometry={star!} position={[0.02, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0.08]} scale={[0.32, 0.32, 0.12]} material={mats.metal} />
              {/* a fine pressed border */}
              {[-1, 1].map((sz) => (
                <mesh key={sz} position={[0.0, 0.0075, sz * 0.15]} material={mats.metal}>
                  <boxGeometry args={[0.4, 0.002, 0.004]} />
                </mesh>
              ))}
            </group>
          </group>
          {/* the satin ribbon marker hanging out of the pages, stirring */}
          <group ref={ribbonTail} position={[0.05, 0.0, 0.16]}>
            <mesh position={[0, -0.01, 0.06]} rotation={[0.35, 0, 0.05]} material={mats.ribbon}>
              <boxGeometry args={[0.022, 0.003, 0.13]} />
            </mesh>
          </group>
          <Glow ref={light} color="#ffe6c8" size={0.4} opacity={0} />
          <group position={[0.05, 0.1, 0]} scale={1.1}>
            <Motes count={16} radius={0.2} seed={9} level={() => openOf(progress.current) * 0.8} />
          </group>
        </group>
      );
    case 'orb':
      // a miniature music box: walnut, brass corners, a winding key, a velvet lining,
      // a tiny heart on a spindle that rises and turns when the lid opens
      return (
        <group rotation={[0.15, 0, 0]}>
          <RoundedBox args={[0.44, 0.2, 0.3]} radius={0.012} smoothness={2} material={mats.main} />
          <mesh position={[0, 0.101, 0]} rotation-x={-Math.PI / 2} material={mats.velvet}>
            <planeGeometry args={[0.4, 0.26]} />
          </mesh>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[sx * 0.215, -0.08, sz * 0.145]} material={mats.metal}>
                <boxGeometry args={[0.03, 0.045, 0.03]} />
              </mesh>
            )),
          )}
          <mesh position={[0, 0.02, 0.152]} material={mats.metal}>
            <boxGeometry args={[0.05, 0.06, 0.004]} />
          </mesh>
          {/* the mechanism, seen when the lid is up (storyboard E2): a brass drum studded with
              pins turns, and each pin plucks a tooth of the steel comb, which rings and stills */}
          <group ref={drum} position={[0.1, 0.08, -0.05]}>
            <mesh rotation-z={Math.PI / 2} material={mats.metal}>
              <cylinderGeometry args={[0.03, 0.03, 0.12, 16]} />
            </mesh>
            {DRUM_PINS.map(([x, a], i) => (
              <mesh key={i} position={[x, Math.cos(a) * 0.032, Math.sin(a) * 0.032]} rotation-x={a} material={mats.metal}>
                <cylinderGeometry args={[0.0018, 0.0018, 0.008, 4]} />
              </mesh>
            ))}
          </group>
          <group position={[0.1, 0.082, -0.0]}>
            {Array.from({ length: COMB_TEETH }, (_, i) => (
              <mesh
                key={i}
                ref={(m) => void (teeth.current[i] = m)}
                position={[-0.055 + (i * 0.11) / (COMB_TEETH - 1), 0, 0.022 - (i % 2) * 0.002]}
                material={mats.metal}
              >
                <boxGeometry args={[0.0065, 0.003, 0.05 - i * 0.0018]} />
              </mesh>
            ))}
          </group>
          <group ref={figure} position={[-0.05, -0.075, 0.02]}>
            <mesh position={[0, 0.05, 0]} material={mats.metal}>
              <cylinderGeometry args={[0.004, 0.004, 0.1, 6]} />
            </mesh>
            <mesh geometry={getHeartGeometry('low')} position={[0, 0.12, 0]} scale={[0.045, 0.045, 0.02]} material={mats.velvet} />
          </group>
          {/* the winding key on its side */}
          <group ref={key} position={[0.235, 0, 0]}>
            <mesh rotation-z={Math.PI / 2} material={mats.metal}>
              <cylinderGeometry args={[0.007, 0.007, 0.04, 8]} />
            </mesh>
            <mesh position={[0.03, 0, 0]} rotation-y={Math.PI / 2} material={mats.metal}>
              <torusGeometry args={[0.022, 0.006, 6, 16]} />
            </mesh>
          </group>
          {/* the lid, hinged at the back, a brass heart inlaid in it */}
          <group ref={lid} position={[0, 0.1, -0.15]}>
            <group position={[0, 0.025, 0.15]}>
              <RoundedBox args={[0.45, 0.05, 0.31]} radius={0.012} smoothness={2} material={mats.main} />
              <mesh geometry={getHeartGeometry('low')} position={[0, 0.026, 0.01]} rotation-x={-Math.PI / 2} scale={[0.05, 0.05, 0.006]} material={mats.metal} />
              <mesh position={[0, -0.026, 0]} rotation-x={Math.PI / 2} material={mats.velvet}>
                <planeGeometry args={[0.4, 0.27]} />
              </mesh>
            </group>
          </group>
          <Glow ref={light} color="#ffe0c8" size={0.4} opacity={0} />
          <group position={[-0.03, 0.2, 0]} scale={1.1}>
            <Motes count={22} radius={0.2} seed={13} level={() => openOf(progress.current)} />
          </group>
        </group>
      );
    case 'envelope':
      // the letter isn't a floating envelope any more: a golden puppy brings it, in its mouth
      return <LetterDog opening={opening} hover={hover} aim={aim} mats={mats} reducedMotion={reducedMotion} onDelivered={onDelivered} />;
  }
}

const sparkVertex = /* glsl */ `
  uniform float uTime;
  uniform float uOn;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    float life = fract(uTime * (0.25 + aSeed * 0.2) + aSeed * 7.0);
    vec3 p = position * (0.85 + life * 0.35);
    p.y += life * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + aSeed * 2.5) * uPixelRatio * (6.0 / -mv.z);
    vA = uOn * sin(3.14159 * life);
  }
`;
const sparkFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.9, 0.93), a * a * vA);
  }
`;

/** A few tiny lights that rise around a gift while it is hovered. */
function HoverSparkles({ on }: { on: Progress }) {
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uOn: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }),
    [],
  );
  const geo = useMemo(() => {
    const n = 14;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(0.45 + Math.random() * 0.25);
      v.y *= 0.8;
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const pts = useRef<THREE.Points>(null);
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uOn.value = on.current;
    if (pts.current) pts.current.visible = on.current > 0.01;
  });
  const sparkMat = useShader(sparkVertex, sparkFragment, uniforms);
  return (
    <points ref={pts} geometry={geo} frustumCulled={false} material={sparkMat} raycast={() => null} />
  );
}

const tmp = new THREE.Vector3();
const toCam = new THREE.Vector3();

/** One gift standing in the room: hover lifts and lights it, click opens it toward the camera. */
export function Gift3D({
  gift,
  index,
  home,
  showcase,
  facing,
  floorY,
  size,
  opened,
  opening,
  disabled,
  focused,
  quiet = false,
  hideLabel = false,
  glass,
  reducedMotion,
  hoverFx,
  onSelect,
  onOpened,
  onHover,
}: Props) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const shadow = useRef<THREE.Mesh>(null);
  // the "product shot" while it opens: a lit pedestal under it, a wash of its colour behind it
  const pedestal = useRef<THREE.Group>(null);
  const wash = useRef<THREE.Sprite>(null);
  const backlight = useRef<THREE.Sprite>(null);
  // two layers, as in a studio: the room behind sinks into a deep wine dark (it darkens —
  // a pale layer would only fog it), and a halo of the gift's own colour lights it from behind
  const washColor = useMemo(() => new THREE.Color('#14040a').lerp(new THREE.Color(gift.tint), 0.08), [gift.tint]);
  const backColor = useMemo(() => new THREE.Color(gift.tint).offsetHSL(0, 0.2, -0.05), [gift.tint]);
  const stage = useMemo(() => new Spring(0), []);
  // its name, set large behind it (a beat after the pedestal: product first, then the words)
  const titleCard = useRef<THREE.Mesh>(null);
  const titleIn = useMemo(() => new Spring(0), []);
  const recede = useMemo(() => new Spring(0), []);
  const label = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const hover = useRef(0);
  const lift = useMemo(() => new Spring(0), []);
  const tiltX = useMemo(() => new Spring(0), []);
  const tiltZ = useMemo(() => new Spring(0), []);
  // her hand brushing it (storyboard F): a little sideways give on a spring with friction,
  // and which ring waves it has already answered
  const shove = useMemo(() => ({ x: new Spring(0), z: new Spring(0), lastPush: -9, seen: new Set<number>(), hp: new THREE.Vector3(), at: new THREE.Vector3() }), []);
  const aim = useRef({ x: 0, y: 0 });
  /** Her finger is on it; how far the lid has been lifted (0..1); the lift is finishing. */
  const held = useRef(false);
  const hold = useRef(0);
  const finish = useRef(false);
  const pressedAt = useRef(0);
  const asked = useRef(false);
  const notified = useRef(false);
  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => index * 1.7, [index]);
  const homeV = useMemo(() => new THREE.Vector3(...home), [home]);
  const showV = useMemo(() => new THREE.Vector3(...showcase), [showcase]);
  const active = (hovered || focused) && !disabled;
  const isDog = gift.shape === 'envelope';
  // at rest, gifts turn part-way toward the room's front so thin ones (the envelope) never show only an edge
  // (wrapped to −π…π so turning between the two always takes the short way)
  const face = useMemo(() => Math.atan2(Math.sin(facing), Math.cos(facing)), [facing]);
  const restFacing = face * (gift.shape === 'star' ? 0.12 : 0.45);
  /**
   * Weight (storyboard C): a lacquered box and a music box are heavy and answer slowly; a
   * glass bottle and a journal are light and answer at once. One number, used by every
   * spring the thing has and by how long its lid takes to lift.
   */
  const heavy = gift.shape === 'box' || gift.shape === 'orb';
  const [stiff, damp] = MOTION.hand.spring[heavy ? 'heavy' : 'light'];

  useEffect(() => {
    if (opening) return;
    notified.current = false;
    // the lid is shut again: her next press starts from the beginning
    asked.current = false;
    finish.current = false;
    held.current = false;
    hold.current = 0;
  }, [opening]);

  useEffect(() => {
    if (disabled) setHovered(false);
  }, [disabled]);

  useEffect(() => {
    onHover(gift.id, active);
  }, [active, gift.id, onHover]);

  useFrame((state, rawDt) => {
    const r = root.current;
    const s = spin.current;
    if (!r || !s) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;

    const speed = reducedMotion ? 2.4 : 1.05;
    // timing runs on real time (not frames), so a slow phone opens just as quickly
    const real = Math.min(rawDt, 0.25);
    progress.current = opening ? Math.min(1, progress.current + real * speed) : Math.max(0, progress.current - real * 1.6);
    // QA (?debug): window.__shotHold = 0.8 holds an opening product shot at that point
    const shotHold = (window as unknown as { __shotHold?: number }).__shotHold;
    if (opening && shotHold !== undefined) progress.current = Math.min(progress.current, shotHold);
    const o = progress.current;
    // opening: a breath of stillness first (the light gathers), then it rises to her
    const oo = THREE.MathUtils.clamp((o - 0.14) / 0.86, 0, 1);
    const e = oo * oo * (3 - 2 * oo);
    hover.current += ((active ? 1 : 0) - hover.current) * (1 - Math.exp(-dt * 6));
    const h = hover.current;

    // the lid under her finger: it lifts while she presses, carries itself the rest of the
    // way once she has lifted it far enough, and falls shut if she lets go too early
    if (!opening && !disabled) {
      if (finish.current) hold.current = Math.min(1, hold.current + dt * 2.6);
      else if (held.current) hold.current = Math.min(1, hold.current + dt / (HOLD_SECS * (heavy ? 1.25 : 0.85)));
      else hold.current = Math.max(0, hold.current - dt * 2.2);
      if (hold.current >= 0.999 && !asked.current) {
        asked.current = true;
        onSelect(gift.id);
      }
      if (DEBUG && (held.current || hold.current > 0)) {
        (window as unknown as { __giftHold?: unknown }).__giftHold = { id: gift.id, hold: +hold.current.toFixed(2), held: held.current };
      }
    } else if (opening) {
      hold.current = 1;
    }

    // floating at home; lifts a little when hovered; rises toward the camera while opening
    // (the letter-carrying puppy stands on the floor: it doesn't float or lift)
    // each one floats on its own slow rhythm, drifting a little — never in step with the others
    const still = reducedMotion || isDog ? 0 : 1;
    const bob = (Math.sin(t * (0.62 + index * 0.11) + phase) * 0.055 + Math.sin(t * (0.23 + index * 0.05) + phase * 2) * 0.025) * still;
    const dx = Math.sin(t * (0.17 + index * 0.04) + phase) * 0.04 * still;
    const dz = Math.cos(t * (0.21 + index * 0.03) + phase) * 0.04 * still;
    const up = lift.step(active && !isDog ? 0.1 : 0, stiff * damp, dt);
    // hovered, it comes a little toward her
    toCam.copy(state.camera.position).sub(homeV).setY(0).normalize().multiplyScalar(isDog ? 0 : 0.14 * h);
    // the whole ring may be turning a little under her sweep (it springs back): turn home with it
    const ringTurn = giftRing.spin;
    const cs = Math.cos(ringTurn);
    const sn = Math.sin(ringTurn);
    tmp.set(homeV.x * cs + homeV.z * sn, (isDog ? floorY : homeV.y) + bob + up, -homeV.x * sn + homeV.z * cs);
    tmp.x += dx + toCam.x;
    tmp.z += dz + toCam.z;
    // her hand brushing past: it gives a few centimetres the way she pushed, then comes back
    const free = !disabled && !opening && !reducedMotion && !isDog;
    if (free && roomHand.on > 0.02) {
      const d = handNear(shove.at.copy(tmp), shove.hp);
      if (d < 0.6) {
        const f = (1 - d / 0.6) ** 2 * Math.min(roomHand.speed, 4) * roomHand.on;
        const ax = tmp.x - shove.hp.x;
        const az = tmp.z - shove.hp.z;
        const l = Math.hypot(ax, az) || 1;
        // a light thing gives more than a heavy one (the same weight that drives its lid)
        const give = (heavy ? 0.5 : 0.8) * f * dt;
        shove.x.v += (ax / l) * give;
        shove.z.v += (az / l) * give;
        tiltZ.v -= (ax / l) * give * 6;
        tiltX.v += (az / l) * give * 6;
        // a real push passes the lean on round the ring, and counts toward a sweep
        if (f > 0.2 && t - shove.lastPush > 0.25) {
          shove.lastPush = t;
          giftRing.waves.push({ id: giftRing.nextId++, at: t, from: index, strength: Math.min(1, f * 0.5), side: Math.sign(roomHand.wind) || 1 });
          if (giftRing.waves.length > 24) giftRing.waves.shift();
          giftRing.touched.push({ i: index, t });
        }
      }
    }
    // a lean arriving from a neighbour: 80 ms a step round the ring, 0.6 as strong each step
    if (free)
      for (const w of giftRing.waves) {
        if (w.from === index || shove.seen.has(w.id)) continue;
        const n = giftRing.count;
        const k = Math.min(Math.abs(index - w.from), n - Math.abs(index - w.from));
        if (t < w.at + 0.08 * k) continue;
        shove.seen.add(w.id);
        if (t > w.at + 0.08 * k + 0.5) continue;
        tiltZ.v += w.side * w.strength * Math.pow(0.6, k) * 0.9;
      }
    tmp.x += shove.x.step(0, stiff * 0.9, dt);
    tmp.z += shove.z.step(0, stiff * 0.9, dt);
    tmp.lerp(showV, isDog ? 0 : e);
    r.position.copy(tmp);
    // a gentle squash-and-rise "breath" when the opening begins
    const kick = Math.sin(Math.min(1, o * 3) * Math.PI) * 0.035 * (reducedMotion ? 0 : 1);
    // another gift is in the spotlight: this one steps back a little, out of its way
    const back = recede.step(disabled && !opening && !isDog ? 1 : 0, 5, dt);
    r.position.y -= back * 0.06;
    r.scale.setScalar(size * (isDog ? 1 : 1 + kick + e * 0.12 - back * 0.07));

    // the product shot: the pedestal rises in under it (a sprung scale, a slow turn), and its
    // own colour washes in behind it — the room falls away without going dark or white
    const st = stage.step(opening && !isDog ? THREE.MathUtils.smoothstep(o, 0.08, 0.7) : 0, 9, dt);
    if (pedestal.current) {
      const ps = Math.max(0.0001, st);
      pedestal.current.scale.set(ps, ps, ps);
      pedestal.current.visible = st > 0.002;
      pedestal.current.rotation.y = t * 0.35;
    }
    if (wash.current) {
      const m = wash.current.material as THREE.SpriteMaterial;
      m.opacity = THREE.MathUtils.clamp(st, 0, 1) * 0.8;
      wash.current.visible = m.opacity > 0.003;
      // behind the gift, as seen from the camera
      toCam.copy(r.position).sub(state.camera.position).normalize();
      wash.current.position.copy(r.position).addScaledVector(toCam, 1.7);
      wash.current.scale.setScalar(7.5);
    }
    if (titleCard.current) {
      const tc = titleCard.current;
      const k = titleIn.step(opening && !isDog ? THREE.MathUtils.smoothstep(o, 0.3, 0.95) : 0, 5.5, dt);
      const m = tc.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.clamp(k, 0, 1) * 0.36;
      tc.visible = m.opacity > 0.003;
      if (tc.visible) {
        // between the wash and the gift, facing the camera; it rises into place as it comes
        // in and fits the frame's width (on a phone it nearly spans it)
        const behind = 1.25;
        tc.position.copy(r.position).addScaledVector(toCam, behind);
        const cam = state.camera as THREE.PerspectiveCamera;
        const dist = cam.position.distanceTo(tc.position);
        const viewW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
        const w = Math.min(3.8, viewW * 0.9) * (1.04 - 0.04 * k);
        tc.scale.set(w, w, 1);
        tc.position.y += 0.3 - (1 - k) * 0.22;
        tc.quaternion.copy(cam.quaternion);
      }
    }
    if (backlight.current) {
      const m = backlight.current.material as THREE.SpriteMaterial;
      m.opacity = THREE.MathUtils.clamp(st, 0, 1) * 0.42;
      backlight.current.visible = m.opacity > 0.003;
      backlight.current.position.copy(r.position).addScaledVector(toCam, 0.8);
      backlight.current.scale.setScalar(2.2 + st * 0.5);
    }

    // idle sway; turns toward her hand when hovered; squares up to the camera while opening
    const idleY = reducedMotion ? 0 : Math.sin(t * (0.3 + index * 0.07) + phase) * (isDog ? 0.12 : 0.3);
    s.rotation.y = THREE.MathUtils.lerp(s.rotation.y, opening ? face : restFacing + idleY * (1 - h), Math.min(1, dt * 3));
    const wob = still * (1 - h);
    s.rotation.x = isDog ? 0 : tiltX.step(opening ? 0.18 * (1 - e) + 0.12 : 0.1 + Math.sin(t * (0.37 + index * 0.06) + phase) * 0.05 * wob + aim.current.y * 0.16 * h, stiff * 0.62, dt);
    s.rotation.z = isDog ? 0 : tiltZ.step(opening ? 0 : Math.sin(t * (0.29 + index * 0.05) + phase * 1.3) * 0.05 * wob - aim.current.x * 0.16 * h, stiff * 0.62, dt);

    if (glow.current) {
      const m = glow.current.material as THREE.SpriteMaterial;
      const base = opened ? 0.08 : 0.14;
      // light gathers round it first (the pause), then flares as it opens
      // (capped: the opening is lit by its pedestal and the colour behind it, never a white flare)
      const target = base + h * 0.16 + THREE.MathUtils.smoothstep(o, 0.0, 0.2) * 0.18 * (isDog ? 0.3 : 1) + THREE.MathUtils.smoothstep(o, 0.45, 1) * (isDog ? 0.12 : 0.1);
      m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
      glow.current.scale.setScalar(1.5 + h * 0.4 + THREE.MathUtils.smoothstep(o, 0.5, 1) * 0.8);
    }

    // contact shadow: tighter and darker close to the floor, soft and faint as it rises
    if (shadow.current) {
      const height = isDog ? 0 : Math.max(0, r.position.y - floorY);
      shadow.current.position.set(r.position.x, floorY + 0.005, r.position.z);
      shadow.current.scale.setScalar(size * (isDog ? 0.85 : 0.9 + height * 0.35));
      (shadow.current.material as THREE.MeshBasicMaterial).opacity = (0.7 / (1 + height * 0.9)) * (1 - e * 0.6);
    }

    // labels of gifts on the far side of the ring step back
    if (label.current) {
      toCam.copy(state.camera.position).setY(0).normalize();
      const front = toCam.dot(tmp.set(Math.sin(facing), 0, Math.cos(facing)));
      const behind = front < -0.35;
      label.current.style.opacity = String(behind && !active ? 0 : THREE.MathUtils.clamp(0.35 + (front + 0.3) * 0.9, 0.25, 1));
      label.current.classList.toggle('is-behind', behind);
    }

    // (the puppy decides for itself when the letter has been delivered — see `delivered`)
    if (opening && o >= 1 && !notified.current && !isDog) {
      notified.current = true;
      onOpened(gift.id);
    }
  });

  const delivered = () => {
    if (notified.current) return;
    notified.current = true;
    onOpened(gift.id);
  };

  // The gift's invisible hit area is generous. If the pointer only passes through that empty
  // air and lands on one of the room's hidden moments behind it (the cake, the sign), the
  // touch belongs to that — the gift steps aside.
  const passThrough = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const own = (o: THREE.Object3D | null) => {
      for (let x = o; x; x = x.parent) if (x === spin.current) return true;
      return false;
    };
    const moment = (o: THREE.Object3D | null) => {
      for (let x = o; x; x = x.parent) if (x.userData.moment) return true;
      return false;
    };
    const touchesBody = e.intersections.some((i) => own(i.object) && (i.object as THREE.Mesh).isMesh && !i.object.userData.giftHit);
    return !touchesBody && e.intersections.some((i) => moment(i.object));
  };

  /**
   * Opening is a gesture, not a button (storyboard C): she presses and the lid lifts under
   * her finger, the light inside leaks out, and it opens when she has lifted it far enough.
   * Letting go early lets it fall shut with a soft knock. A quick tap still works — it just
   * finishes the lift by itself, so the thing always has weight.
   */
  const press = (e: ThreeEvent<PointerEvent>) => {
    if (passThrough(e)) return;
    e.stopPropagation();
    if (disabled) return;
    held.current = true;
    pressedAt.current = performance.now();
  };
  const letGo = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    // a quick tap is a tap (it finishes the lift by itself); anything past a third of the
    // way is a decision. Only a press that stops in between lets the lid fall back.
    const quick = performance.now() - pressedAt.current < 260;
    if (quick || hold.current > 0.35) {
      finish.current = true; // carry the lift the rest of the way, then it opens
    } else if (hold.current > 0.06) {
      sound.thump(0.35); // it falls shut again
    }
  }, []);
  useEffect(() => {
    window.addEventListener('pointerup', letGo);
    window.addEventListener('pointercancel', letGo);
    return () => {
      window.removeEventListener('pointerup', letGo);
      window.removeEventListener('pointercancel', letGo);
    };
  }, [letGo]);

  useEffect(() => {
    if (disabled) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
  }, [hovered, disabled]);

  const number = String(index + 1).padStart(2, '0');

  return (
    <>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[home[0], floorY + 0.005, home[2]]} renderOrder={-1}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshBasicMaterial map={getShadowTexture()} color="#000000" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {!isDog && (
        <sprite ref={wash} visible={false} renderOrder={-2}>
          <spriteMaterial map={getGlowTexture()} color={washColor} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </sprite>
      )}
      {!isDog && (
        <sprite ref={backlight} visible={false} renderOrder={-1}>
          <spriteMaterial map={getGlowTexture()} color={backColor} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      )}
      {!isDog && <ShotTitle ref={titleCard} title={gift.title} subtitle={gift.subtitle} />}
      <group ref={root} position={home}>
        <Glow ref={glow} color={gift.tint} size={1.5} opacity={0.14} position={isDog ? [0, 0.55, 0] : undefined} />
        {!isDog && (
          <group ref={pedestal} position={[0, -0.5, 0]} visible={false}>
            {/* a dark lacquered disc, a fine champagne ring round its edge, a pool of light on it */}
            <mesh>
              <cylinderGeometry args={[0.46, 0.43, 0.04, 48]} />
              <meshBasicMaterial color="#3b1720" />
            </mesh>
            <mesh position={[0, 0.021, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.452, 0.006, 6, 64]} />
              <meshBasicMaterial color="#e9c79e" />
            </mesh>
            <mesh position={[0, -0.021, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.432, 0.004, 6, 64]} />
              <meshBasicMaterial color="#a8705a" />
            </mesh>
            <mesh position={[0, 0.022, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial map={getGlowTexture()} color={gift.tint} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
            {/* the light falling from below onto the floor of the room */}
            <mesh position={[0, -0.12, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[1.6, 1.6]} />
              <meshBasicMaterial map={getGlowTexture()} color={gift.tint} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
          </group>
        )}
        <group
          ref={spin}
          onPointerDown={press}
          onPointerOver={(e) => {
            if (passThrough(e)) return;
            e.stopPropagation();
            if (disabled) return;
            setHovered(true);
            if (hoverFx) sound.hover(gift.id);
          }}
          onPointerMove={(e) => {
            if (!hoverFx || !root.current) return;
            // where on the gift the pointer rests, -1..1 — it leans toward it
            const local = root.current.worldToLocal(e.point.clone());
            aim.current = { x: THREE.MathUtils.clamp(local.x / 0.5, -1, 1), y: THREE.MathUtils.clamp(local.y / 0.5, -1, 1) };
          }}
          onPointerOut={() => {
            setHovered(false);
            aim.current = { x: 0, y: 0 };
            sound.hoverEnd(gift.id);
          }}
        >
          <GiftBody
            gift={gift}
            progress={progress}
            hold={hold}
            hover={hover}
            glass={glass}
            aim={aim}
            reducedMotion={reducedMotion}
            opening={opening}
            onDelivered={delivered}
          />
          {/* generous invisible hit area — easier to tap on phones; it reaches down over the
              gift's label too, so tapping the name opens it as well */}
          <mesh position={isDog ? [0, 0.52, 0.02] : [0, -0.14, 0]} scale={isDog ? [0.62, 0.95, 0.95] : [1, 1.35, 1]} userData={{ giftHit: true }}>
            <sphereGeometry args={[0.6, 12, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
        {hoverFx && !reducedMotion && <HoverSparkles on={hover} />}
        {!opening && !hideLabel && (
          <ScreenLabel
            position={[0, isDog ? -0.34 : -0.7, 0]}
            labelRef={label}
            className={`gift-label${active ? ' is-active' : ''}${opened ? ' is-opened' : ''}${quiet ? ' is-quiet' : ''}`}
            num={opened ? '✓' : number}
            title={gift.title}
          />
        )}
      </group>
    </>
  );
}
