import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { ScreenLabel } from './ScreenLabel';
import { motion as MOTION } from '../../config/motion';
import { publishGiftMark } from '../../lib/giftMark';
import { ShotTitle } from './ShotTitle';
import * as THREE from 'three';
import { endScene, pace } from '../../lib/pace';
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
import { PaperCarrier, newCarrierPose, type CarrierPose } from './PaperCarrier';
import { CondenseMotes, newCondenseUniforms } from './CondenseMotes';
import { carrier, leafRect } from '../../lib/carrier';

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
      // (the box below the lid too: in this space it runs down to y −0.54)
      r.box = new THREE.Box3(new THREE.Vector3(-0.335, -0.6, -0.335), new THREE.Vector3(0.335, 0.072, 0.335));
      // the band's width stays across its run (lying on the lid, then hanging down the front)
      const across = new THREE.Vector3(1, 0, -side * 0.35).normalize();
      return { rope: r, side: across, tube: new RopeTube(n, 0.04, { flat: true, thick: 0.004 }) };
    };
    // long enough to run over the lid's front edge and hang a little down the front — a tail
    // that stops on the lid read as two sticks from a low angle
    return [make(-0.02, 0.46, -1), make(0.03, 0.4, 1)];
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
    for (const { rope, tube, side } of sim) {
      if (near) rope.nudge(rope.get(rope.n - 1, _hp), _push, 0.4);
      rope.step(dt, wind);
      tube.update(rope, undefined, side);
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
/** The journal: how many loose pages flick past, the star's trail, the dotted journey. */
const PAGES = 7;
const TRAIL = 9;
const JOURNEY: [number, number][] = Array.from({ length: 22 }, (_, j) => {
  const u = j / 21;
  return [-0.17 + u * 0.34, Math.sin(u * Math.PI * 2.2) * 0.07 + (u - 0.5) * 0.05];
});
/** The music box's tune: [where in the opening it plays, pentatonic step]. */
const MUSIC_NOTES: [number, number][] = [
  // (Q: the tune makes the letter — it begins as soon as the lid is up)
  [0.22, 4],
  [0.29, 6],
  [0.36, 8],
  [0.43, 6],
  [0.5, 4],
  [0.57, 1],
  [0.64, 4],
  [0.72, 6],
];
/** How long a steady press takes to lift a lid all the way (seconds). */
const HOLD_SECS = 0.7;

/**
 * Real time → how far the opening has got (storyboard I). Not a straight line: the thing
 * settles on its light, HOLDS ITS BREATH (the plateau at 0.14 — where Gift3D already waits
 * with the light gathering), then its mechanism works, and what is inside comes to her
 * slowest of all. The numbers are fractions of the gift's own duration.
 */
const OPEN_KEYS: [number, number][] = [
  [0, 0],
  [0.07, 0.1],
  // the held breath: ~0.15 s of a 3 s opening (K3: the owner found it slow — felt, not waited on)
  [0.12, 0.1],
  [0.8, 0.8],
  [1, 1],
];

/**
 * K — the sheet each gift lets out, which becomes its memory page (see `PaperCarrier`).
 * `appear`: it is there (in the gift) from this point of the opening; `fly`: it leaves for
 * her and squares up to the screen; `unfold`: it opens out on the way. Fractions of the
 * opening (for the puppy: of its own flight, `motion.gift.carry.dogSecs`).
 */
const CARRY: Record<Gift['shape'], { mode: 'tri' | 'half' | 'roll' | 'page'; appear: number; fly: [number, number]; unfold: [number, number] }> = {
  box: { mode: 'half', appear: 0.3, fly: [0.48, 1], unfold: [0, 0] },
  capsule: { mode: 'roll', appear: 0.36, fly: [0.46, 1], unfold: [0, 0] },
  star: { mode: 'page', appear: 0.5, fly: [0.55, 1], unfold: [0, 0] },
  // (Q: no flight — the sheet condenses out of the tune's light where it will float)
  orb: { mode: 'tri', appear: 0.86, fly: [0, 0.0001], unfold: [0, 0] },
  envelope: { mode: 'tri', appear: 0, fly: [0, 1], unfold: [0, 0] },
};
function openWarp(u: number): number {
  const x = THREE.MathUtils.clamp(u, 0, 1);
  for (let i = 1; i < OPEN_KEYS.length; i++) {
    const [ax, ay] = OPEN_KEYS[i - 1];
    const [bx, by] = OPEN_KEYS[i];
    if (x <= bx) {
      const k = bx > ax ? (x - ax) / (bx - ax) : 1;
      // (the last stretch keeps its speed: the sheet is still coming when the page takes it)
      const last = i === OPEN_KEYS.length - 1;
      return ay + (by - ay) * (last ? k * k * (2 - k) : k * k * (3 - 2 * k));
    }
  }
  return 1;
}
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
  markRef,
  carrying,
}: {
  /** The thing the memory page opens out of (the note, the page, the letter…), if not the gift itself. */
  markRef: { current: THREE.Object3D | null };
  /** K: the sheet that came out is flying (the gift's own paper steps aside for it). */
  carrying: { current: CarrierPose };
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
  /** Box 01: its four walls (hinged at the base) and the little pictures that rise out of it. */
  const walls = useRef<(THREE.Group | null)[]>([]);
  const photos = useRef<(THREE.Group | null)[]>([]);
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
  /** Storyboard I: what each gift lets out — the bottle's note, the journal's star and its
   *  trail and journey, the music box's notes. */
  const note = useRef<THREE.Group>(null);
  const scroll = useRef<THREE.Group>(null);
  const roll = useRef<THREE.Group>(null);
  const twineRing = useRef<THREE.Group>(null);
  const flyStar = useRef<THREE.Group>(null);
  const trail = useRef<(THREE.Mesh | null)[]>([]);
  const journey = useRef<(THREE.Mesh | null)[]>([]);
  const coverStar = useRef<THREE.Mesh>(null);
  const pageTop = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Group>(null);
  /** K: where the sheet comes from, in each gift (a plane facing +z, `userData.carryW` wide). */
  const boxSheet = useRef<THREE.Group>(null);
  const noteSheet = useRef<THREE.Group>(null);
  const pageSheet = useRef<THREE.Group>(null);
  const mouthSheet = useRef<THREE.Group>(null);
  const noteFx = useRef<{ mote: THREE.Mesh | null; ring: THREE.Mesh | null }[]>([]);
  const noteAt = useRef<number[]>([]);
  /** Sounds and moments that happen once per opening. */
  const fired = useRef(new Set<string>());
  const mats = useGiftMaterials(gift, glass);
  // the little pictures in box 01: two tints of the gift's own colour, never words
  const tintSoft = useMemo(() => new THREE.Color(gift.tint).lerp(new THREE.Color('#f6e3dc'), 0.55), [gift.tint]);
  const tintDeep = useMemo(() => new THREE.Color(gift.tint).lerp(new THREE.Color('#4a1d2a'), 0.35), [gift.tint]);
  const star = useMemo(() => (gift.shape === 'star' ? starGeometry() : null), [gift.shape]);
  const bottle = useMemo(() => (gift.shape === 'capsule' ? bottleGeometry() : null), [gift.shape]);
  useEffect(
    () => () => {
      star?.dispose();
      bottle?.dispose();
    },
    [star, bottle],
  );

  // every opening starts from the beginning: its sounds and moments can happen again
  useEffect(() => {
    if (!opening) {
      fired.current.clear();
      noteAt.current = [];
    }
  }, [opening]);
  // the memory page opens out of the thing that came out (Gift3D reads it)
  useEffect(() => {
    if (gift.shape === 'envelope') return; // (the puppy sets it: the letter, once it is out)
    markRef.current =
      gift.shape === 'box' ? boxSheet.current : gift.shape === 'capsule' ? noteSheet.current : gift.shape === 'star' ? pageSheet.current : mouthSheet.current;
  });
  const noteMats = useMemo(
    () =>
      gift.shape === 'orb'
        ? MUSIC_NOTES.map(() => ({
            mote: new THREE.MeshBasicMaterial({ color: '#ffe1bf', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
            ring: new THREE.MeshBasicMaterial({ color: '#f2a6b6', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
          }))
        : [],
    [gift.shape],
  );
  useEffect(() => () => noteMats.forEach((m) => (m.mote.dispose(), m.ring.dispose())), [noteMats]);
  const glowMats = useMemo(
    () => ({
      gold: new THREE.MeshBasicMaterial({ color: '#f4cf8a', toneMapped: false }),
      spark: new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      ink: new THREE.MeshBasicMaterial({ color: '#8a2a3e' }),
      paper: new THREE.MeshBasicMaterial({ color: '#d8c6a6', side: THREE.DoubleSide }),
      page: new THREE.MeshBasicMaterial({ color: '#cdb99c' }),
    }),
    [],
  );
  useEffect(() => () => Object.values(glowMats).forEach((m) => m.dispose()), [glowMats]);

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
    const once = (key: string, at: number, fn: () => void) => {
      if (opening && o >= at && !fired.current.has(key)) {
        fired.current.add(key);
        fn();
      }
    };
    const ss = THREE.MathUtils.smoothstep;
    switch (gift.shape) {
      case 'box': {
        // Storyboard I.1 — the box opens the way a gift box does when it is made to be
        // opened: the lid pops and swings away, then the four walls, hinged at the base,
        // fall open like petals (slowly, each a beat after the one before), and what was
        // inside rises out on a spiral. Nothing flashes: the light is the box's own.
        const lidK = THREE.MathUtils.smoothstep(o, 0.08, 0.34);
        if (lid.current) {
          // it pops, swings back over its hinge and hangs down behind the box — out of the
          // way of what is about to rise, instead of standing up in front of it
          // it pops, then is LIFTED OFF — up and away over the back, tipping a little the
          // way a lid does in a hand — and leaves the frame before the walls fall
          const pop = THREE.MathUtils.smoothstep(o, 0.06, 0.14);
          const off = lidK * lidK;
          lid.current.rotation.x = -lidK * 0.55 - lift * 0.22;
          lid.current.position.y = 0.24 + pop * 0.05 + off * 1.9 + lift * 0.035;
          lid.current.position.z = -0.33 - off * 0.7;
        }
        once('satin', 0.06, () => sound.satin());
        walls.current.forEach((w, i) => {
          if (!w) return;
          // (the walls start while the lid is still going: nothing waits for anything)
          once(`wall${i}`, 0.18 + i * 0.03, () => sound.hinge());
          const k = THREE.MathUtils.smoothstep(o, 0.16 + i * 0.03, 0.5 + i * 0.03);
          // a petal does not drop flat: it opens to ~70°, and settles there with a breath
          w.rotation.x = k * 1.22 + Math.sin(t * 1.4 + i) * 0.015 * k;
        });
        const up = THREE.MathUtils.smoothstep(o, 0.26, 0.8);
        // the pictures rise on a spiral, then part to either side to make way for the letter
        const part = THREE.MathUtils.smoothstep(o, 0.62, 1);
        photos.current.forEach((g, j) => {
          if (!g) return;
          const e = THREE.MathUtils.clamp(up * 1.3 - j * 0.08, 0, 1);
          const a = j * 1.2566 + e * 2.4 + t * 0.15 * e;
          const r = 0.06 + 0.42 * e + part * 0.5;
          g.position.set(Math.sin(a) * r + (j % 2 ? 1 : -1) * part * 0.35, -0.1 + e * (0.62 + j * 0.09), Math.cos(a) * r * (1 - part * 0.7) + 0.06 * e);
          g.rotation.set(-0.15 * e, a * 0.25 + Math.sin(t * 0.8 + j) * 0.08, Math.sin(t + j * 2) * 0.06);
          g.scale.setScalar(Math.max(0.0001, e * e * (3 - 2 * e)));
        });
        // the little brass tag swings on its thread — a touch more when her hand is near
        if (tag.current) tag.current.rotation.z = Math.sin(t * 1.3 * motion + 0.6) * (0.05 + h * 0.12) * motion + open * 0.4;
        break;
      }
      case 'capsule': {
        // Storyboard I.2 — the twine loosens, the cork works free and pops (slowly), the
        // rolled note rises out of the neck, unrolls in the air and grows into the page; the
        // glass, emptied, thins into light.
        const loose = ss(o, 0.06, 0.18);
        if (twineRing.current) {
          twineRing.current.position.y = -loose * 0.03;
          twineRing.current.scale.setScalar(1 + loose * 0.16);
        }
        once('cork', 0.14, () => sound.cork());
        if (cork.current) {
          const pop = ss(o, 0.14, 0.3);
          cork.current.position.y = 0.3 + pop * 0.34 + lift * 0.04 + Math.sin(t * 40) * 0.003 * h * (1 - pop);
          cork.current.rotation.z = pop * 1.2 + lift * 0.12;
          cork.current.position.x = pop * 0.2;
        }
        const rise = ss(o, 0.24, 0.4);
        const unroll = 0;
        const grow = 0;
        once('unroll', 0.5, () => sound.paper(1));
        if (note.current) {
          // (from `appear` on, the sheet itself carries on — the rolled note steps aside)
          note.current.visible = !carrying.current.show;
          // out of the neck, straightening upright as it comes (it lay at a slant inside)
          note.current.position.set(unroll * -0.12, -0.03 + rise * 0.62, rise * 0.06);
          note.current.rotation.set(0.2 * (1 - rise), 0, 0.42 * (1 - rise) - 0.16 * rise);
          note.current.scale.setScalar(1 + grow * 0.8);
        }
        if (scroll.current) {
          scroll.current.scale.x = Math.max(0.001, unroll);
          scroll.current.visible = unroll > 0.002;
        }
        if (roll.current) roll.current.position.x = unroll * 0.26;
        const glassMat = mats.main as THREE.MeshPhysicalMaterial;
        glassMat.opacity = 0.26 * (1 - 0.32 * unroll);
        break;
      }
      case 'star': {
        // Storyboard I.3 — the gilt star on the cover lifts off and rises with a trail of
        // gold; the cover opens, the ribbon marker lifts; the pages flick past fast, then
        // slower and slower; a dotted "journey" draws itself across the open page.
        const starK = ss(o, 0.08, 0.42);
        once('star', 0.08, () => sound.comb(4));
        if (coverStar.current) coverStar.current.visible = starK < 0.02;
        const starAt = (k: number, out: THREE.Vector3) => {
          const a = k * 4.2;
          return out.set(0.02 + Math.sin(a) * 0.12 * k, 0.046 + k * 0.62, Math.cos(a) * 0.08 * k - k * 0.06);
        };
        if (flyStar.current) {
          flyStar.current.visible = starK > 0.02;
          starAt(starK, flyStar.current.position);
          flyStar.current.rotation.set(-Math.PI / 2 + starK * 1.4, starK * 6, 0.08);
        }
        trail.current.forEach((m, j) => {
          if (!m) return;
          const k = Math.max(0, starK - (j + 1) * 0.045);
          m.visible = starK > 0.02 && k > 0 && starK < 0.995;
          starAt(k, m.position);
          m.scale.setScalar((1 - j / TRAIL) * 0.7);
        });
        const coverK = ss(o, 0.12, 0.3);
        if (cover.current) cover.current.rotation.z = coverK * 2.5 + lift * 0.3 + h * 0.06 * (1 - coverK);
        once('pages', 0.26, () => sound.paper(PAGES, 80));
        pages.current.forEach((pg, i) => {
          if (!pg) return;
          // a flick: the first pages go fast, each one after takes longer to turn
          const f = i / (PAGES - 1);
          const a0 = 0.26 + 0.22 * Math.pow(f, 1.7);
          const d = ss(o, a0, a0 + 0.05 + 0.1 * f);
          pg.rotation.z = d * (2.42 - i * 0.03) + Math.sin(t * 3 + i) * 0.02 * h;
          // a real page bends as it turns: its free half lags behind
          const bend = pg.children[1] as THREE.Object3D | undefined;
          if (bend) bend.rotation.z = -Math.sin(d * Math.PI) * 0.5;
        });
        const path = ss(o, 0.36, 0.52);
        // the right-hand page lifts off and becomes her page: the book keeps an empty spread
        if (pageTop.current) pageTop.current.visible = !carrying.current.show;
        journey.current.forEach((m, j) => {
          if (!m) return;
          const k = THREE.MathUtils.clamp(path * JOURNEY.length - j, 0, 1);
          m.scale.setScalar(Math.max(0.0001, k));
        });
        if (ribbonTail.current) ribbonTail.current.rotation.x = Math.sin(t * 0.9 * motion) * 0.12 * motion - coverK * 0.7;
        break;
      }
      case 'orb': {
        // the music box: the lid lifts (quickly — the mechanism keeps its pace), the little
        // heart rises on its spindle and turns, the drum turns and the comb plays
        const lidUp = ss(o, 0.08, 0.3);
        if (lid.current) lid.current.rotation.x = -lidUp * 1.75 - lift * 0.3;
        if (figure.current) {
          figure.current.position.y = -0.075 + lidUp * 0.24; // tucked under the lid until it opens
          figure.current.rotation.y = t * 1.6 * lidUp;
        }
        if (key.current) key.current.rotation.x = t * (0.25 * motion + lidUp * 2.4);
        if (drum.current) drum.current.rotation.x = t * lidUp * 3;
        // Storyboard I.4 — every note the comb plays lets a mote of light go up, and leaves a
        // ripple running out across the velvet
        MUSIC_NOTES.forEach(([at, pitch], n) => {
          once(`note${n}`, at, () => {
            sound.comb(pitch);
            plucked.current[Math.min(COMB_TEETH - 1, Math.max(0, pitch + 2))] = t;
            noteAt.current[n] = t;
          });
          const fx = noteFx.current[n];
          const m = noteMats[n];
          if (!fx || !m) return;
          const since = noteAt.current[n] === undefined ? -1 : t - noteAt.current[n];
          const live = since >= 0 && since < 2.4;
          if (fx.mote) {
            fx.mote.visible = live;
            fx.mote.position.set(0.1 - 0.05 + (n % 5) * 0.025, 0.09 + since * 0.22, -0.01 + Math.sin(since * 3 + n) * 0.02);
            m.mote.opacity = live ? Math.min(1, since * 6) * Math.exp(-since * 1.1) * 0.9 : 0;
          }
          if (fx.ring) {
            fx.ring.visible = live;
            const r = 0.01 + since * 0.11;
            fx.ring.scale.set(r, r, r);
            m.ring.opacity = live ? Math.exp(-since * 2.2) * 0.55 : 0;
          }
        });
        // each plucked tooth rings: a fast, decaying shiver at its free end
        teeth.current.forEach((m, i) => {
          if (!m) return;
          const since = t - (plucked.current[i] ?? -99);
          m.rotation.x = since < 1.5 ? Math.sin(since * 95) * 0.09 * Math.exp(-since * 5) * motion : 0;
        });
        break;
      }
    }
    if (light.current) {
      // a warm breath of light from inside — it shows the inside, it doesn't blind
      // (the open box shows its pale inside walls to the light: much less of it there, or
      //  the inside of the box was the one white thing on the screen)
      const inner = gift.shape === 'box' ? 0.05 : 0.32;
      (light.current.material as THREE.SpriteMaterial).opacity = open * inner + lift * 0.12;
      light.current.scale.setScalar(0.4 + open * (gift.shape === 'box' ? 0.5 : 0.9));
      light.current.position.y = (gift.shape === 'capsule' ? 0.3 : 0.1) + open * 0.4;
    }
    // warm the surface a touch when she hovers, and flare as it opens
    if (gift.shape !== 'capsule') mats.main.emissiveIntensity = h * 0.12 + open * (gift.shape === 'box' ? 0.06 : 0.3);
  });

  switch (gift.shape) {
    case 'box':
      return (
        <group>
          {/* the base, and four walls hinged at their foot (they fall open like petals) */}
          <RoundedBox args={[0.6, 0.03, 0.6]} position={[0, -0.225, 0]} radius={0.012} smoothness={3} material={mats.main} />
          <mesh position={[0, -0.209, 0]} rotation-x={-Math.PI / 2} material={mats.ribbon}>
            <planeGeometry args={[0.57, 0.57]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation-y={(i * Math.PI) / 2}>
              <group ref={(g) => void (walls.current[i] = g)} position={[0, -0.24, 0.285]}>
                <group position={[0, 0.24, 0]}>
                  <RoundedBox args={[0.6, 0.48, 0.03]} radius={0.012} smoothness={3} material={mats.main} />
                  {/* lined inside in the ribbon's wine satin, as a good gift box is: when the
                      walls fall the inside is a colour, not a pale wall burning white */}
                  <mesh position={[0, 0, -0.0165]} rotation-y={Math.PI} material={mats.ribbon}>
                    <planeGeometry args={[0.57, 0.45]} />
                  </mesh>
                  {/* a band of cream paper under the satin on two sides: wrapped by hand */}
                  {i % 2 === 0 && (
                    <mesh material={mats.paper} position={[0.004, 0, 0.0012]}>
                      <boxGeometry args={[0.22, 0.482, 0.031]} />
                    </mesh>
                  )}
                  <mesh material={mats.ribbon} position={[0, 0, 0.002]}>
                    <boxGeometry args={[0.1, 0.485, 0.033]} />
                  </mesh>
                </group>
              </group>
            </group>
          ))}
          {/* what was inside: little pictures (blank — they are an image of memories, not
              content), tucked in the box until the walls fall, then rising on a spiral */}
          {[0, 1, 2, 3, 4].map((j) => (
            <group key={j} ref={(g) => void (photos.current[j] = g)} scale={0.0001}>
              <mesh material={mats.paper}>
                <boxGeometry args={[0.17, 0.135, 0.004]} />
              </mesh>
              <mesh position={[0, 0.008, 0.0025]}>
                <planeGeometry args={[0.145, 0.092]} />
                <meshBasicMaterial color={j % 2 ? tintSoft : tintDeep} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* K: the letter that waits under the pictures, folded once (the sheet flies from here) */}
          <group ref={boxSheet} position={[0, -0.18, 0.02]} rotation-x={-Math.PI / 2} userData={{ carryW: 0.34 }} />
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
          {/* the rolled note: it rises out of the neck and unrolls in the air (the paper
              stays blank — it is an image of a letter, the words are on the page) */}
          <group ref={note} position={[0, -0.03, 0]} rotation={[0.2, 0, 0.42]} userData={{ markR: 0.2 }}>
            <group ref={scroll} scale-x={0.001} visible={false}>
              <mesh position={[0.13, 0, 0]} material={glowMats.paper}>
                <boxGeometry args={[0.26, 0.2, 0.0016]} />
              </mesh>
            </group>
            {/* K: the scroll itself, as a sheet rolled round its top (its width runs along the roll) */}
            <group ref={noteSheet} position={[0, 0, 0.03]} rotation-z={Math.PI / 2} userData={{ carryW: 0.2 }} />
            <group ref={roll}>
              <mesh material={mats.paper}>
                <cylinderGeometry args={[0.035, 0.035, 0.22, 18]} />
              </mesh>
              <mesh material={mats.ribbon}>
                <cylinderGeometry args={[0.037, 0.037, 0.02, 18]} />
              </mesh>
            </group>
          </group>
          <group ref={twineRing}>
            {[0.2, 0.215].map((y, i) => (
              <mesh key={i} position={[0, y, 0]} rotation-x={Math.PI / 2} material={mats.twine}>
                <torusGeometry args={[0.06, 0.006, 6, 24]} />
              </mesh>
            ))}
          </group>
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
          {/* loose pages, turning after the cover — a flick, fast then slow; each in two
              halves so it bends as it turns */}
          {Array.from({ length: PAGES }, (_, i) => (
            <group key={i} ref={(g) => void (g && (pages.current[i] = g))} position={[-0.22, 0.027 + i * 0.0006, 0]}>
              <mesh position={[0.11, 0, 0]} material={mats.paper}>
                <boxGeometry args={[0.22, 0.002, 0.315]} />
              </mesh>
              <group position={[0.22, 0, 0]}>
                <mesh position={[0.105, 0, 0]} material={mats.paper}>
                  <boxGeometry args={[0.21, 0.002, 0.315]} />
                </mesh>
              </group>
            </group>
          ))}
          {/* the open page: a dotted journey draws itself across it (only a line, no words) */}
          <group ref={pageTop} position={[0, 0.03, 0]} userData={{ markR: 0.24 }}>
            {/* K: the open right-hand page is the sheet that comes to her */}
            <group ref={pageSheet} position={[0.0, 0.001, 0]} rotation-x={-Math.PI / 2} userData={{ carryW: 0.3 }} />
            {/* the open page the journey is drawn on (under the loose pages until they turn) */}
            <mesh position={[0, -0.0038, 0]} rotation-x={-Math.PI / 2} material={glowMats.page}>
              <planeGeometry args={[0.42, 0.3]} />
            </mesh>
            {JOURNEY.map(([x, z], j) => (
              <mesh key={j} ref={(m) => void (journey.current[j] = m)} position={[x, 0.0015, z]} scale={0.0001} material={glowMats.ink}>
                <sphereGeometry args={[0.0085, 6, 4]} />
              </mesh>
            ))}
          </group>
          {/* the gilt star, lifted off the cover, and the trail of gold it leaves */}
          <group ref={flyStar} visible={false}>
            <mesh geometry={star!} scale={[0.32, 0.32, 0.12]} material={glowMats.gold} />
          </group>
          {Array.from({ length: TRAIL }, (_, j) => (
            <mesh key={j} ref={(m) => void (trail.current[j] = m)} visible={false} material={glowMats.spark}>
              <sphereGeometry args={[0.012, 6, 4]} />
            </mesh>
          ))}
          <group ref={cover} position={[-0.23, 0.034, 0]}>
            <group position={[0.23, 0, 0]}>
              <mesh material={mats.main}>
                <boxGeometry args={[0.46, 0.014, 0.34]} />
              </mesh>
              <mesh ref={coverStar} geometry={star!} position={[0.02, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0.08]} scale={[0.32, 0.32, 0.12]} material={mats.metal} />
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
          {/* the mouth of the box (the page opens out of its velvet), and what each note
              lets go: a mote of light rising, a ripple across the velvet */}
          <group ref={mouth} position={[0, 0.11, 0]} userData={{ markR: 0.22 }}>
            {/* K: a paper folded in three, tucked in the lid: it springs out of the velvet */}
            <group ref={mouthSheet} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} userData={{ carryW: 0.3 }} />
          </group>
          {noteMats.map((m, n) => (
            <group key={n}>
              <mesh ref={(x) => void ((noteFx.current[n] ??= { mote: null, ring: null }).mote = x)} visible={false} material={m.mote}>
                <sphereGeometry args={[0.009, 8, 6]} />
              </mesh>
              <mesh
                ref={(x) => void ((noteFx.current[n] ??= { mote: null, ring: null }).ring = x)}
                visible={false}
                position={[-0.06 + (n % 4) * 0.04, 0.103, 0.02 - (n % 3) * 0.03]}
                rotation-x={-Math.PI / 2}
                material={m.ring}
              >
                <ringGeometry args={[0.85, 1, 32]} />
              </mesh>
            </group>
          ))}
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
      return <LetterDog opening={opening} hover={hover} aim={aim} mats={mats} reducedMotion={reducedMotion} onDelivered={onDelivered} markRef={markRef} carrying={carrying} />;
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
  /** How long THIS gift takes to open, and the clock of it. */
  const openSecs = reducedMotion ? MOTION.gift.quick : (MOTION.gift.open as Record<string, number>)[gift.shape] ?? 5.2;
  const clockOpen = useRef(0);
  const markAt = useMemo(() => new THREE.Vector3(), []);
  const markObj = useRef<THREE.Object3D | null>(null);
  const markUp = useMemo(() => new THREE.Vector3(), []);
  // K: the sheet that flies to her and becomes the page
  const carry = CARRY[gift.shape];
  const pose = useRef<CarrierPose>(newCarrierPose());
  const dogFly = useRef(0);
  /** P: the letter's own phases once it has flown out: waiting to be touched, then opening */
  const letter = useRef({ phase: 'none' as 'none' | 'wait' | 'open', wait: 0, t: 0, warm: 0 });
  const fired2 = useRef(new Set<string>());
  // Q: the music box's light, which condenses into its letter
  const condense = useMemo(() => newCondenseUniforms(), []);
  const noteSecs = useMemo(
    () =>
      MUSIC_NOTES.map(([at]) => {
        // when, in seconds of the opening, the progress passes this note (the warp's inverse)
        let x = 0;
        while (x < 1 && openWarp(x) < at) x += 0.002;
        return x * openSecs;
      }),
    [openSecs],
  );
  const cv = useMemo(
    () => ({
      sp: new THREE.Vector3(),
      sq: new THREE.Quaternion(),
      ss: new THREE.Vector3(1, 1, 1),
      tp: new THREE.Vector3(),
      tq: new THREE.Quaternion(),
      ray: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      tilt: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -MOTION.gift.carry.tilt),
      hoverTilt: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.08),
      hp: new THREE.Vector3(),
      hq: new THREE.Quaternion(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      sway: new THREE.Quaternion(),
      srcW: 0.3,
      seen: false,
    }),
    [],
  );
  const [aspect, setAspect] = useState(() => {
    const r = leafRect(window.innerWidth, window.innerHeight);
    return r.width / r.height;
  });
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

    // timing runs on real time (not frames), so a slow phone opens just as quickly
    const real = Math.min(rawDt, 0.25);
    if (opening) {
      clockOpen.current = Math.min(openSecs, clockOpen.current + real * pace.rate);
      progress.current = openWarp(clockOpen.current / openSecs);
    } else if (clockOpen.current > 0 && letter.current.t <= 0) {
      // closing: the same curve, run backwards — what came out goes back in, the walls rise,
      // the lid comes down — a little quicker than it opened
      clockOpen.current = Math.max(0, clockOpen.current - real * 1.8);
      progress.current = openWarp(clockOpen.current / openSecs);
    } else {
      progress.current = Math.max(0, progress.current - real * 1.6);
    }
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
        // (0.8 gave ~1.5 cm at a brisk sweep: under notice on a phone. ~4–5 cm reads as a touch)
        const give = (heavy ? 1.25 : 2.0) * f * dt;
        shove.x.v += (ax / l) * give;
        shove.z.v += (az / l) * give;
        tiltZ.v -= (ax / l) * give * 3.2;
        tiltX.v += (az / l) * give * 3.2;
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
      m.opacity = THREE.MathUtils.clamp(st, 0, 1) * 0.42 * (gift.shape === 'box' ? 0.55 : 1);
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
    // Where this gift is on the screen, so the memory page can open OUT of it instead of
    // sliding over it (storyboard I: the same element, carried from the world into the page).
    if (opening && o > 0.5) {
      // (the thing that came out, if the gift says so — the note, the page, the letter)
      const from = markObj.current;
      const half = from ? Math.max(0.12, (from.userData.markR as number) ?? 0.2) * size : size * (isDog ? 0.75 : 0.62) * (1 + e * 0.12);
      if (from) from.getWorldPosition(markAt);
      else r.getWorldPosition(markAt);
      markUp.copy(markAt).setY(markAt.y + half);
      markAt.project(state.camera);
      const w = state.size.width;
      const hgt = state.size.height;
      // the thing's own radius in screen px, from a point one radius above it
      markUp.project(state.camera);
      const px = Math.max(40, Math.abs(markUp.y - markAt.y) * 0.5 * hgt);
      publishGiftMark({ x: (markAt.x * 0.5 + 0.5) * w, y: (-markAt.y * 0.5 + 0.5) * hgt, width: px * 2, height: px * 2, tint: gift.tint });
    }

    // K / P: the sheet. Its flight is a function of the opening's progress (from where it
    // would be in the gift to where it floats in front of her), so closing runs it back; then
    // it WAITS, floating, until she touches it (P), and opens slowly on its own clock.
    {
      const p = pose.current;
      const L = MOTION.letter;
      const lt = letter.current;
      const src = markObj.current;
      if (src) {
        src.updateWorldMatrix(true, false);
        src.matrixWorld.decompose(cv.sp, cv.sq, cv.ss);
        cv.srcW = ((src.userData.carryW as number) ?? 0.3) * cv.ss.x;
        cv.seen = true;
      }
      // the puppy's letter runs on its own clock once it is out of the envelope (and, when
      // she closes the page, only flies back once the letter has folded itself up again)
      if (isDog) {
        const out = opening && !!src;
        if (out || lt.t <= 0) dogFly.current = THREE.MathUtils.clamp(dogFly.current + ((out ? 1 : -1.4) * real * pace.rate) / MOTION.gift.carry.dogSecs, 0, 1);
      }
      const u = isDog ? dogFly.current : o;
      const air = gift.shape === 'orb';
      if (air) cv.seen = true;
      const show = !reducedMotion && cv.seen && (isDog ? dogFly.current > 0 : (opening || clockOpen.current > 0) && o >= carry.appear);
      p.show = show;
      // P: the letter's own phases. Real seconds — her tap to open must not hurry it.
      const flown = isDog ? dogFly.current >= 1 : o >= 1;
      if (show && opening && flown) {
        if (lt.phase === 'none') {
          lt.phase = 'wait';
          lt.wait = 0;
          carrier.requestOpen = false;
          endScene(`gift:${gift.id}`);
        }
        if (lt.phase === 'wait') {
          lt.wait += real;
          const held = (window as unknown as { __letterHold?: boolean }).__letterHold;
          if ((carrier.requestOpen || lt.wait > L.autoOpen) && !held) {
            lt.phase = 'open';
            carrier.requestOpen = false;
            sound.paper(3, 420);
          }
        }
        if (lt.phase === 'open') lt.t = Math.min(L.open, lt.t + real);
      } else if (!opening) {
        lt.t = Math.max(0, lt.t - real * 1.6);
        if (lt.t <= 0) lt.phase = 'none';
      }
      // (only the gift that is opening speaks for the sheet — the other four would say "no")
      const mine = opening || clockOpen.current > 0 || dogFly.current > 0;
      if (mine) carrier.waiting = show && opening && lt.phase === 'wait';
      lt.warm += ((mine && carrier.hover && carrier.waiting ? 1 : 0) - lt.warm) * (1 - Math.exp(-dt * 6));
      const busy = opening || clockOpen.current > 0;
      if (air && !busy) condense.uOn.value = 0;
      if (show || (air && busy && !reducedMotion)) {
        const cam = state.camera as THREE.PerspectiveCamera;
        const W = state.size.width;
        const H = state.size.height;
        const lr = leafRect(W, H);
        const asp = lr.width / lr.height;
        if (Math.abs(asp - aspect) > 0.002) setAspect(asp);
        const C = MOTION.gift.carry;
        cv.ray.set(((lr.left + lr.width / 2) / W) * 2 - 1, -((lr.top + lr.height / 2) / H) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
        cam.getWorldDirection(cv.fwd);
        const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const along = (d: number, out: THREE.Vector3) => out.copy(cam.position).addScaledVector(cv.ray, d / Math.max(0.2, cv.ray.dot(cv.fwd)));
        // where it floats while it waits, and where the page takes it over (K's handoff pose)
        along(L.hoverDist, cv.hp);
        // (a little above the middle, so the gift it came out of still shows below it)
        cv.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        cv.hp.addScaledVector(cv.up, (air ? L.hoverRiseAir : L.hoverRise) * 2 * L.hoverDist * tanV);
        along(C.dist, cv.tp);
        const hH = ((lr.height * L.hoverSize) / H) * 2 * L.hoverDist * tanV;
        const tH = ((lr.height * C.hand) / H) * 2 * C.dist * tanV;
        cv.tq.copy(cam.quaternion).multiply(cv.tilt);
        cv.hq.copy(cam.quaternion).multiply(cv.hoverTilt);
        // Q: the music box's sheet comes from nowhere but its own place in the air
        if (air) {
          cv.sp.copy(cv.hp);
          cv.sq.copy(cv.hq);
          cv.srcW = hH * asp;
          // its light: out of the box's mouth, onto the sheet's shape, note by note
          condense.uT.value = clockOpen.current;
          if (markObj.current) markObj.current.getWorldPosition(condense.uFrom.value);
          condense.uSheet.value.compose(cv.hp, cv.hq, cv.ss.set(hH * asp, hH, hH));
          condense.uNotes.value = noteSecs;
          condense.uAspect.value = asp;
          condense.uOn.value = 1;
          condense.uReveal.value = THREE.MathUtils.smoothstep(o, carry.appear, 1);
        }
        // 1. the flight out of the gift (it arrives slowing, to float)
        const fk = THREE.MathUtils.smoothstep(u, carry.fly[0], carry.fly[1]);
        const e = fk * fk * (3 - 2 * fk);
        // 2. the opening (P1): from its float to the handoff, the creases a beat apart
        const k = lt.t / L.open;
        const go = THREE.MathUtils.smoothstep(k, 0.08, 0.88);
        const move = go * go * (3 - 2 * go);
        const crease = (t: number) => {
          // eased in and out, with a long tail (it settles, it does not stop)
          const x = THREE.MathUtils.clamp(t / L.crease, 0, 1);
          return 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(x, 0.78));
        };
        const ta = lt.t - 0.18;
        const fA = 1 - crease(ta);
        const fB = 1 - crease(ta - L.creaseLag);
        p.fold = carry.mode === 'tri' ? fA : fA;
        p.foldB = fB;
        // it bows as it opens, then lies flat with one small bounce
        const flatAt = 0.18 + L.creaseLag + L.crease;
        const since = lt.t - flatAt;
        p.curl = since < 0 ? Math.sin(Math.PI * Math.min(1, Math.max(0, ta) / (L.crease + L.creaseLag))) * 0.45 : -0.28 * Math.exp(-since * 5) * Math.sin(since * 11);
        // where it is
        p.pos.lerpVectors(cv.sp, cv.hp, e);
        p.pos.y += Math.sin(Math.PI * e) * C.arc;
        p.quat.slerpQuaternions(cv.sq, cv.hq, e);
        p.height = THREE.MathUtils.lerp(cv.srcW / asp, hH, e);
        if (lt.t > 0) {
          p.pos.lerp(cv.tp, move);
          p.quat.slerp(cv.tq, move);
          p.height = THREE.MathUtils.lerp(hH, tH, move);
        }
        // its float (P1): a slow bob, a little sway, lifting toward her hand — fading out as it opens
        const idle = e * (1 - THREE.MathUtils.smoothstep(k, 0, 0.5));
        const tt = state.clock.elapsedTime;
        cv.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        p.pos.addScaledVector(cv.up, (Math.sin(tt * Math.PI * 2 * L.bobHz) * L.bobAmp + lt.warm * 0.04) * p.height * idle);
        cv.sway.setFromAxisAngle(cv.fwd, THREE.MathUtils.degToRad(L.swayDeg) * Math.sin(tt * 0.9) * idle);
        p.quat.premultiply(cv.sway);
        cv.sway.setFromAxisAngle(cv.right.set(1, 0, 0).applyQuaternion(cam.quaternion), THREE.MathUtils.degToRad(L.swayDeg) * 0.6 * Math.sin(tt * 0.7 + 1) * idle);
        p.quat.premultiply(cv.sway);
        p.height *= 1 + 0.03 * lt.warm * idle;
        p.flutter = Math.sin(Math.PI * e) * (1 - e * 0.5);
        // the magic, gone by the handoff: air at its edges, gold at its rim (breathing — "touch
        // me"), its edge, the motes round it; motes fall from it while it opens
        const fade = 1 - THREE.MathUtils.smoothstep(k, 0.45, 0.85);
        const breath = 0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * 0.45);
        p.wind = e * fade;
        p.rim = e * fade * (0.45 + 0.35 * breath * (lt.phase === 'wait' ? 1 : 0) + 0.4 * lt.warm);
        p.edge = e * (1 - THREE.MathUtils.smoothstep(k, 0.6, 0.9));
        p.warm = lt.warm;
        p.motes = idle;
        p.reveal = air ? THREE.MathUtils.smoothstep(o, carry.appear, 1) : 1;
        p.fall = Math.sin(Math.PI * THREE.MathUtils.smoothstep(k, 0.05, 0.9)) * fade;
        if (fk > 0 && !fired2.current.has('out')) {
          fired2.current.add('out');
          sound.paper(1);
        }
      } else fired2.current.delete('out');
      if (opening || clockOpen.current > 0 || dogFly.current > 0) {
        carrier.live = show;
        carrier.fold = carry.mode;
      }
      // the page takes over once the letter has opened (P) — at once without a sheet
      const done = reducedMotion || !cv.seen ? (isDog ? false : o >= 1) : lt.t >= L.open;
      if (opening && done && !notified.current) {
        if (isDog) delivered();
        else {
          notified.current = true;
          onOpened(gift.id);
        }
      }
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
      {!reducedMotion && <PaperCarrier pose={pose} mode={carry.mode} aspect={aspect} />}
      {!reducedMotion && gift.shape === 'orb' && <CondenseMotes uniforms={condense} />}
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
            carrying={pose}
            markRef={markObj}
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
