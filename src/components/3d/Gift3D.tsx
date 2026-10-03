import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useShader } from './useShader';
import type { Gift } from '../../data/gifts';
import { Glow } from './Glow';
import { getHeartGeometry } from './heartShape';
import { getPaperTexture, getShadowTexture } from './glowTexture';
import { Spring } from './CameraRig';
import { sound } from '../../lib/audio';
import { LetterDog } from './LetterDog';

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
};

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
      return { main, ribbon };
    }
    case 'capsule':
    case 'orb':
      return { main: glassShell() };
    case 'star': {
      const main = surface({
        color: new THREE.Color('#f2c7ae').lerp(tint, 0.3),
        metalness: 0.92,
        roughness: 0.24,
        clearcoat: 0.5,
        clearcoatRoughness: 0.08,
        emissive: tint,
      });
      return { main };
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

function GiftBody({
  gift,
  progress,
  hover,
  glass,
  aim,
  reducedMotion,
  opening,
  onDelivered,
}: {
  gift: Gift;
  progress: Progress;
  hover: Progress;
  glass: boolean;
  aim: { current: { x: number; y: number } };
  reducedMotion: boolean;
  opening: boolean;
  onDelivered: () => void;
}) {
  const lid = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.Sprite>(null);
  const mats = useGiftMaterials(gift, glass);
  const star = useMemo(() => (gift.shape === 'star' ? starGeometry() : null), [gift.shape]);

  useEffect(
    () => () => {
      star?.dispose();
    },
    [star],
  );

  useFrame((state) => {
    const o = progress.current;
    const h = hover.current;
    const open = THREE.MathUtils.smoothstep(o, 0.4, 0.85);
    if (lid.current) {
      if (gift.shape === 'box') {
        lid.current.rotation.x = -open * 1.35;
        lid.current.position.y = 0.24 + open * 0.1;
      }
      if (gift.shape === 'envelope') lid.current.rotation.x = open * Math.PI * 0.92;
    }
    if (light.current) {
      (light.current.material as THREE.SpriteMaterial).opacity = open * 0.95;
      light.current.scale.setScalar(0.4 + open * 1.6);
      light.current.position.y = 0.1 + open * 0.4;
    }
    if (core.current) {
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.2);
      (core.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.2 + h * 0.2 + open * 0.3;
      const base = (core.current.userData.base as number | undefined) ?? (core.current.userData.base = core.current.scale.x);
      core.current.scale.setScalar(base * (1 + open * 0.5 + h * 0.08));
    }
    // warm the surface a touch when she hovers, and flare as it opens
    if (mats.main.emissiveIntensity !== undefined && gift.shape !== 'capsule' && gift.shape !== 'orb') {
      mats.main.emissiveIntensity = h * 0.12 + open * 0.3;
    }
  });

  switch (gift.shape) {
    case 'box':
      return (
        <group>
          <RoundedBox args={[0.6, 0.48, 0.6]} radius={0.035} smoothness={4} material={mats.main} />
          <mesh material={mats.ribbon}>
            <boxGeometry args={[0.1, 0.485, 0.605]} />
          </mesh>
          <mesh material={mats.ribbon}>
            <boxGeometry args={[0.605, 0.485, 0.1]} />
          </mesh>
          <Glow ref={light} color="#fff1ee" size={0.4} opacity={0} />
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
              <mesh position={[-0.075, 0.105, 0]} rotation={[0, 0, 0.55]} scale={[1, 0.75, 1.5]} material={mats.ribbon}>
                <torusGeometry args={[0.075, 0.024, 12, 28]} />
              </mesh>
              <mesh position={[0.075, 0.105, 0]} rotation={[0, 0, -0.55]} scale={[1, 0.75, 1.5]} material={mats.ribbon}>
                <torusGeometry args={[0.075, 0.024, 12, 28]} />
              </mesh>
              <mesh position={[0, 0.09, 0]} material={mats.ribbon}>
                <sphereGeometry args={[0.035, 16, 12]} />
              </mesh>
            </group>
          </group>
        </group>
      );
    case 'capsule':
      return (
        <group rotation={[0, 0, 0.5]}>
          <mesh material={mats.main}>
            <capsuleGeometry args={[0.2, 0.42, 12, 32]} />
          </mesh>
          <mesh ref={core} geometry={getHeartGeometry('low')} scale={0.13}>
            <meshBasicMaterial color="#ffd0da" transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'star':
      return (
        <group>
          <mesh geometry={star!} material={mats.main} />
          <mesh ref={core} position={[0, 0, 0.13]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial color="#fff6ea" transparent opacity={0.7} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'orb':
      return (
        <group>
          <mesh material={mats.main}>
            <sphereGeometry args={[0.32, 48, 32]} />
          </mesh>
          <mesh ref={core}>
            <sphereGeometry args={[0.085, 24, 16]} />
            <meshBasicMaterial color="#fbe2ff" transparent opacity={0.7} toneMapped={false} />
          </mesh>
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
    <points ref={pts} geometry={geo} frustumCulled={false} material={sparkMat} />
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
  const label = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const hover = useRef(0);
  const lift = useMemo(() => new Spring(0), []);
  const tiltX = useMemo(() => new Spring(0), []);
  const tiltZ = useMemo(() => new Spring(0), []);
  const aim = useRef({ x: 0, y: 0 });
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
  const restFacing = face * 0.45;

  useEffect(() => {
    if (!opening) notified.current = false;
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
    const o = progress.current;
    const e = o * o * (3 - 2 * o);
    hover.current += ((active ? 1 : 0) - hover.current) * (1 - Math.exp(-dt * 6));
    const h = hover.current;

    // floating at home; lifts a little when hovered; rises toward the camera while opening
    // (the letter-carrying puppy stands on the floor: it doesn't float or lift)
    const bob = reducedMotion || isDog ? 0 : Math.sin(t * 0.9 + phase) * 0.06;
    const up = lift.step(active && !isDog ? 0.16 : 0, 9, dt);
    tmp.copy(homeV).setY((isDog ? floorY : homeV.y) + bob + up).lerp(showV, isDog ? 0 : e);
    r.position.copy(tmp);
    // a gentle squash-and-rise "breath" when the opening begins
    const kick = Math.sin(Math.min(1, o * 3) * Math.PI) * 0.06 * (reducedMotion ? 0 : 1);
    r.scale.setScalar(size * (isDog ? 1 : 1 + kick + e * 0.12));

    // idle sway; turns toward her hand when hovered; squares up to the camera while opening
    const idleY = reducedMotion ? 0 : Math.sin(t * 0.45 + phase) * (isDog ? 0.12 : 0.35);
    s.rotation.y = THREE.MathUtils.lerp(s.rotation.y, opening ? face : restFacing + idleY * (1 - h), Math.min(1, dt * 3));
    s.rotation.x = isDog ? 0 : tiltX.step(opening ? 0.18 * (1 - e) + 0.12 : 0.1 + aim.current.y * 0.22 * h, 7, dt);
    s.rotation.z = isDog ? 0 : tiltZ.step(opening ? 0 : -aim.current.x * 0.22 * h, 7, dt);

    if (glow.current) {
      const m = glow.current.material as THREE.SpriteMaterial;
      const base = opened ? 0.08 : 0.14;
      const target = base + h * 0.22 + THREE.MathUtils.smoothstep(o, 0.45, 1) * (isDog ? 0.12 : 1.1);
      m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
      glow.current.scale.setScalar(1.5 + h * 0.4 + THREE.MathUtils.smoothstep(o, 0.5, 1) * 4);
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

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (disabled || e.delta > 8) return;
    onSelect(gift.id);
  };

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
      <group ref={root} position={home}>
        <Glow ref={glow} color={gift.tint} size={1.5} opacity={0.14} position={isDog ? [0, 0.55, 0] : undefined} />
        <group
          ref={spin}
          onClick={click}
          onPointerOver={(e) => {
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
            hover={hover}
            glass={glass}
            aim={aim}
            reducedMotion={reducedMotion}
            opening={opening}
            onDelivered={delivered}
          />
          {/* generous invisible hit area — easier to tap on phones; it reaches down over the
              gift's label too, so tapping the name opens it as well */}
          <mesh position={isDog ? [0, 0.52, 0.02] : [0, -0.14, 0]} scale={isDog ? [0.62, 0.95, 0.95] : [1, 1.35, 1]}>
            <sphereGeometry args={[0.6, 12, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
        {hoverFx && !reducedMotion && <HoverSparkles on={hover} />}
        {!opening && (
          <Html center position={[0, isDog ? -0.34 : -0.7, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
            <div ref={label} className={`gift-label${active ? ' is-active' : ''}${opened ? ' is-opened' : ''}${quiet ? ' is-quiet' : ''}`}>
              <span className="gift-label__num">{opened ? '✓' : number}</span>
              <span className="gift-label__title">{gift.title}</span>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}
