import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { Heart3D } from './Heart3D';
import { Gift3D } from './Gift3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { getFloorTexture, getShadowTexture } from './glowTexture';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { hoverLight } from './sceneStore';
import { RoomSet } from './RoomSet';

interface Props {
  gifts: Gift[];
  opened: string[];
  openingId: string | null;
  focusId: string | null;
  allOpened: boolean;
  pulseKey: number;
  paused: boolean;
  onSelect: (id: string) => void;
  onOpened: (id: string) => void;
  onHeartTap: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
  hoverFx: boolean;
  heartPoints: number;
}

const FLOOR_Y = -0.95;

/**
 * The gifts stand on a ring around the heart, on a real floor. From the default
 * view it reads like the familiar ellipse; drag and it turns out to be a place
 * you can walk around.
 */
function layout(n: number, rx: number, rz: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2; // gift 1 in front, then around to the right
    const y = 0.05 + Math.sin(i * 2.3) * 0.12;
    return { pos: [Math.sin(a) * rx, y, Math.cos(a) * rz] as [number, number, number], angle: a };
  });
}

/** Shared with the shader pre-warm, so the room's first frame never stalls. */
export function createFloorMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: '#2a0f17',
    roughness: 0.5,
    metalness: 0.1,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
    alphaMap: getFloorTexture(),
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.6,
  });
}

/** A dark, faintly glossy floor that fades into the dark — and the soft ring the gifts stand on. */
function Floor({ rx, rz }: { rx: number; rz: number }) {
  // a unit ring, stretched to the (possibly oval) path the gifts stand on
  const ring = useMemo(() => new THREE.RingGeometry(1 - 0.012 / rx, 1 + 0.012 / rx, 160), [rx]);
  useEffect(() => () => ring.dispose(), [ring]);
  // (the floor itself — wood, rug, candlelight — is drawn by RoomSet)
  return (
    <group position={[0, FLOOR_Y, 0]}>
      <mesh geometry={ring} rotation-x={-Math.PI / 2} position-y={0.004} scale={[rx, rz, 1]}>
        <meshBasicMaterial color="#f1c9d2" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the heart's own shadow */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} renderOrder={-1}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial map={getShadowTexture()} color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Stage 4: the little room — a heart in the middle, memories standing around it. */
export function RoomWorld({
  gifts,
  opened,
  openingId,
  focusId,
  allOpened,
  pulseKey,
  paused,
  onSelect,
  onOpened,
  onHeartTap,
  reducedMotion,
  glass,
  particleFactor,
  portrait,
  hoverFx,
  heartPoints,
}: Props) {
  // on a tall phone screen the ring stretches in depth, which the raised camera turns into height
  const rx = portrait ? 1.45 : 3.1;
  const rz = portrait ? 2.5 : 3.1;
  const ring = useMemo(() => layout(gifts.length, rx, rz), [gifts.length, rx, rz]);
  const opening = openingId !== null;
  const openIndex = gifts.findIndex((g) => g.id === openingId);

  const orbit = usePointerOrbit({
    enabled: !opening && !paused,
    sensitivity: 0.005,
    pitch: portrait ? [-0.45, 0.25] : [-0.25, 0.6],
    zoom: [0.78, 1.3],
    friction: 2.2,
  });

  // opening a gift: swing round to face it and push in; closing: pull back out
  useEffect(() => {
    if (openIndex < 0) return;
    // the letter-carrying puppy performs where it stands: the camera stays (unless it is
    // round the back of the room, where she couldn't see it — then turn just enough)
    if (gifts[openIndex]?.shape === 'envelope') {
      const facing = Math.cos(orbit.yaw + ring[openIndex].angle);
      if (facing > 0.2) return;
    }
    orbit.steerYaw(-ring[openIndex].angle);
    orbit.tPitch = 0;
    orbit.tZoom = 1;
  }, [openIndex, orbit, ring]);

  // the room slowly steadies itself after being turned, but keeps the angle she chose
  useFrame((_, dt) => {
    orbit.step(Math.min(dt, 0.05));
    if (!orbit.dragging && orbit.idle() > 5) {
      orbit.tPitch += (0 - orbit.tPitch) * (1 - Math.exp(-dt * 0.4));
      // left alone, the room keeps turning slowly — but holds still while a gift opens or is read
      if (!opening && !paused && !reducedMotion && !hoverId) orbit.tYaw += Math.min(dt, 0.05) * 0.05;
    }
  });

  const [hoverId, setHoverId] = useState<string | null>(null);
  const onHover = useCallback((id: string, on: boolean) => {
    setHoverId((cur) => (on ? id : cur === id ? null : cur));
  }, []);
  const hoverIndex = gifts.findIndex((g) => g.id === hoverId);
  const hoverTarget = useMemo(() => {
    if (hoverIndex < 0 || opening) return null;
    const { pos, angle } = ring[hoverIndex];
    // just above and in front of the gift, on the camera side
    return new THREE.Vector3(pos[0] + Math.sin(angle) * 0.7, pos[1] + 0.8, pos[2] + Math.cos(angle) * 0.7);
  }, [hoverIndex, ring, opening]);

  useEffect(() => {
    hoverLight.target = hoverTarget;
  }, [hoverTarget]);
  useEffect(
    () => () => {
      hoverLight.target = null;
    },
    [],
  );

  const showcase = useMemo(
    () =>
      ring.map(({ pos, angle }, i) => {
        const out = portrait ? 0.9 : 1.1;
        // the letter-carrying puppy walks up to her on the floor; the gifts rise into the air
        const y = gifts[i]?.shape === 'envelope' ? FLOOR_Y : 0.45;
        return [pos[0] + Math.sin(angle) * out, y, pos[2] + Math.cos(angle) * out] as [number, number, number];
      }),
    [ring, portrait, gifts],
  );

  // Framing: a raised three-quarter view that shows the floor and the whole ring.
  const base = portrait
    ? { pos: [0, 6.9, 7.4] as [number, number, number], look: [0, -0.45, 0.35] as [number, number, number], fov: 50 }
    : { pos: [0, 3.0, 8.4] as [number, number, number], look: [0, -0.5, 0] as [number, number, number], fov: 40 };
  let camPos = base.pos;
  let camLook = base.look;
  if (opening && openIndex >= 0 && gifts[openIndex]?.shape !== 'envelope') {
    // frame the rising gift from straight in front, closer. The offset is given
    // un-rotated: the orbit yaw (steered to the gift's angle) swings it round.
    // (the letter-carrying puppy is excluded above: it performs where it stands)
    const [sx, sy, sz] = showcase[openIndex];
    camLook = [sx, sy, sz];
    // step back to frame it — but never through the wall of the room behind her
    const back = Math.min(portrait ? 5.2 : 4.5, 8.1 - Math.hypot(sx, sz));
    camPos = [sx, sy + 1.0, sz + back];
  }

  return (
    <>
      <CameraRig
        position={camPos}
        lookAt={camLook}
        parallax={reducedMotion || opening ? 0 : 0.25}
        speed={opening ? 1.6 : 1.1}
        fov={base.fov}
        orbit={orbit}
        orbitCamera
        fit={portrait ? (yaw) => 1 + 0.42 * Math.sin(yaw) ** 2 : undefined}
      />
      <RoomSet
        floorY={FLOOR_Y}
        rx={rx}
        rz={rz}
        heart={allOpened ? 1 : 0.35 + (opened.length / gifts.length) * 0.5}
        reducedMotion={reducedMotion}
        hoverFx={hoverFx}
        portrait={portrait}
      />
      <Floor rx={rx} rz={rz} />
      <group position={[0, 0.3, 0]}>
        <Heart3D
          pulseKey={pulseKey}
          charge={allOpened ? 1 : 0.25 + (opened.length / gifts.length) * 0.5}
          interactive={allOpened && !opening && !paused}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={portrait ? 0.62 : 0.78}
          halo={allOpened ? 1.4 : 1}
          particles={heartPoints}
        />
      </group>
      {gifts.map((g, i) => (
        <Gift3D
          key={g.id}
          gift={g}
          index={i}
          home={ring[i].pos}
          facing={ring[i].angle}
          showcase={showcase[i]}
          floorY={FLOOR_Y}
          size={portrait ? 0.95 : 1}
          opened={opened.includes(g.id)}
          opening={openingId === g.id}
          disabled={opening || paused}
          focused={focusId === g.id}
          quiet={allOpened}
          glass={glass}
          reducedMotion={reducedMotion}
          hoverFx={hoverFx}
          onSelect={onSelect}
          onOpened={onOpened}
          onHover={onHover}
        />
      ))}
      <ParticleField
        count={Math.round(600 * particleFactor)}
        radius={11}
        innerRadius={2.5}
        burstKey={pulseKey}
        intensity={0.45 + (opened.length / gifts.length) * 0.3}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
