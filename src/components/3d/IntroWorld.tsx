import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Stage } from '../../types';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { HeartVortex } from './HeartVortex';
import { LightDog } from './LightDog';
import { heartTipY } from './heartShape';
import { birthdayConfig } from '../../config/birthday';

interface Props {
  stage: Stage;
  taps: number;
  tapsNeeded: number;
  pulseKey: number;
  onHeartTap: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
  heartPoints: number;
  /** Stepping inside: the camera dives into the heart (the room opens out of its orb). */
  leaving?: boolean;
}

const target = new THREE.Vector3();

/** Stage 1–3: the lone heart in the dark, then the gate and the welcome. */
export function IntroWorld({
  stage,
  taps,
  tapsNeeded,
  pulseKey,
  onHeartTap,
  reducedMotion,
  glass,
  particleFactor,
  portrait,
  heartPoints,
  leaving = false,
}: Props) {
  const holder = useRef<THREE.Group>(null);
  const charge = stage === 'intro' ? Math.min(1, taps / tapsNeeded) : 1;
  const unlocked = stage === 'intro' && taps >= tapsNeeded;
  // Dragging turns the camera around the whole scene — heart, ring, sky and the
  // little companion all move together (only while the heart is the whole scene).
  const orbit = usePointerOrbit({ enabled: stage === 'intro', sensitivity: 0.005, pitch: [-0.55, 0.75], zoom: [0.82, 1.2], friction: 2.2 });

  const short = useThree((st) => st.size.height < 680 && !portrait);
  const heartPos: [number, number, number] =
    stage === 'intro'
      ? heartPoints > 0
        ? [0, portrait ? 0.75 : 0.62, 0] // lifted: the ring of words sits beneath it
        : [0, portrait ? 0.15 : 0.1, 0]
      : stage === 'gate'
        ? [0, portrait ? 1.55 : 1.2, -1.2]
        : // (a short landscape window: the welcome's lines reach higher — lift the heart clear)
          [0, portrait ? 1.7 : short ? 1.85 : 1.35, -1.6];
  const heartScale = stage === 'intro' ? 0.98 + charge * 0.14 + (unlocked ? 0.06 : 0) : 0.55;

  // The heart of light begins scattered: the first touch gathers it.
  const lightHeart = heartPoints > 0;
  const awake = stage !== 'intro' || taps >= 1;
  const [formed, setFormed] = useState(!lightHeart);
  const ready = formed || !awake; // touches go to the heart only before gathering, or once it is whole
  const drop = portrait ? 0.5 : 0.45;
  const ringR = portrait ? 1.05 : 1.3;
  const tip = heartTipY() * heartScale;
  // where the scattered light waits, in the heart's own space (it scales with the heart)
  const ring = useMemo(() => ({ y: (tip - drop) / heartScale, radius: (ringR * 0.9) / heartScale, tilt: 0 }), [tip, drop, ringR, heartScale]);

  const dist = portrait ? 1.3 : 1;
  // each beat draws the camera a little closer, the last one most of all
  const camZ = stage === 'intro' ? (6.4 - charge * 0.9 - (unlocked ? 0.5 : 0)) * dist : 6.6 * dist;
  if (stage !== 'intro') orbit.tZoom = 1;

  // when the light gathers, the camera glides round to meet the heart face to face
  const gathering = awake && stage === 'intro';
  useEffect(() => {
    if (!gathering) return;
    orbit.steerYaw(0);
    orbit.tPitch = 0;
    orbit.lastInput = performance.now();
  }, [gathering, orbit]);

  useFrame((_, dt) => {
    orbit.step(Math.min(dt, 0.05));
    if (stage !== 'intro') {
      // the gate and the welcome are read head-on: glide back to the front
      const home = Math.round(orbit.tYaw / (Math.PI * 2)) * Math.PI * 2;
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 1.5);
      orbit.tYaw += (home - orbit.tYaw) * k;
      orbit.tPitch += (0 - orbit.tPitch) * k;
    } else if (!orbit.dragging && orbit.idle() > 6 && !reducedMotion && (formed || !awake)) {
      // left alone, the world keeps turning very slowly on its own
      orbit.tYaw += Math.min(dt, 0.05) * 0.06;
      orbit.tPitch += (0 - orbit.tPitch) * (1 - Math.exp(-Math.min(dt, 0.05) * 0.4));
    }
    const h = holder.current;
    if (!h) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 1.8);
    h.position.lerp(target.set(...heartPos), k);
  });

  // Stepping inside: the camera turns its eyes up to the heart and dives into it, the lens
  // widening a little as it goes — the room will open out of the light it dives into.
  // (The heart's points and shell fade right in front of the camera: no flash.)
  const dive = leaving && stage !== 'intro';
  const camPos: [number, number, number] = dive
    ? [0, heartPos[1] + 0.06, heartPos[2] + 1.15]
    : [0, heartPoints > 0 && stage === 'intro' ? 1.25 : 0.15, camZ];
  const camLook: [number, number, number] = dive
    ? [heartPos[0], heartPos[1], heartPos[2]]
    : [0, stage === 'intro' ? (heartPoints > 0 ? -0.05 : 0) : 0.35, 0];

  return (
    <>
      <CameraRig
        position={camPos}
        lookAt={camLook}
        parallax={reducedMotion || dive ? 0 : 0.22}
        speed={dive ? 1.35 : stage === 'intro' ? 1.1 : 1.5}
        fov={dive ? 52 : 40}
        orbit={orbit}
        orbitCamera
      />
      <group ref={holder}>
        <Heart3D
          // the first touch gathers the light; the heart beats from the second on
          pulseKey={lightHeart && taps < 2 ? 0 : pulseKey}
          charge={charge}
          interactive={stage === 'intro' && !unlocked && ready}
          onTap={onHeartTap}
          reducedMotion={reducedMotion}
          glass={glass}
          scale={heartScale}
          halo={stage === 'intro' ? 1 : 0.8}
          particles={heartPoints}
          assembled={awake}
          onAssembled={() => setFormed(true)}
          ring={ring}
        />
        {heartPoints > 0 && (
          <HeartVortex
            tipY={tip}
            drop={drop}
            radius={ringR}
            drip={formed}
            reveal={awake}
            words={birthdayConfig.heart.words}
            visible={stage === 'intro'}
            density={Math.max(0.35, heartPoints / 9000)}
            reducedMotion={reducedMotion}
          />
        )}
        {heartPoints > 0 && stage === 'intro' && !unlocked && ready && (
          // The heart of light has gaps, and the stream and ring beneath it belong to it too:
          // an invisible ball around the whole figure makes it answer a touch from any angle
          // the world has been turned to. (A tap on the heart itself is handled by the heart.)
          <mesh
            position={[0, -0.3, 0]}
            scale={[portrait ? 1.35 : 1.6, 1.75, portrait ? 1.35 : 1.6]}
            onClick={(e) => {
              // this ball is big: on a wide screen it overlaps the puppy — a touch that
              // also lands on the puppy is the puppy's, so let it through to it
              if (e.intersections.some((h) => h.object.userData.dogHit)) return;
              e.stopPropagation();
              if (e.delta > 8 || orbit.travel > 10) return;
              onHeartTap();
            }}
          >
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
      {lightHeart && (
        // a little golden puppy of light beside the heart, waving hello
        <LightDog
          awake={awake}
          visible={stage === 'intro'}
          position={portrait ? [-0.6, 2.05, -0.5] : [2.6, -0.5, -0.2]}
          facing={portrait ? 0.25 : -0.35}
          scale={portrait ? 0.68 : 1.55}
          density={Math.max(0.4, heartPoints / 9000)}
          reducedMotion={reducedMotion}
          portrait={portrait}
          interactive={stage === 'intro' && formed}
          orbit={orbit}
        />
      )}
      <ParticleField
        count={Math.round(700 * particleFactor)}
        radius={10}
        innerRadius={1.8}
        burstKey={pulseKey}
        burstDelay={reducedMotion ? 0 : 0.26}
        intensity={stage === 'intro' ? (awake ? 0.55 + charge * 0.3 : 0.22) : 0.5}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
