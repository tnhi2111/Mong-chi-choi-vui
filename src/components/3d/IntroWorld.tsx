import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Stage } from '../../types';
import { Heart3D } from './Heart3D';
import { ParticleField } from './ParticleField';
import { CameraRig } from './CameraRig';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { useDive } from '../../hooks/useDive';
import { motion as MOTION } from '../../config/motion';
import { pace, sceneWait } from '../../lib/pace';
import { HeartVortex } from './HeartVortex';
import { LightDog } from './LightDog';
import { heartTipY } from './heartShape';
import { birthdayConfig } from '../../config/birthday';
import { sprite } from './spriteFlight';
import { screenStroke, writeScript, leaveHeartScript } from './spriteScripts';
import { gateMarks } from '../../lib/gateMarks';

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
const heartAt = new THREE.Vector3();

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
  // QA hook (?debug): where the heart of light is, so a script can touch it where it
  // really is — at some window sizes the centre of the screen is not on it
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return;
    Object.assign(window, { __heart: holder.current, __orbit: orbit });
  });

  /**
   * The third touch, in three beats (see `reference/STORYBOARD.md` A and `motion.unlock`):
   * `hold` — the heart draws breath; `open` — its light spirals out and the camera leans
   * into the core; `settle` — the heart shrinks and drifts to the place it keeps on the
   * password screen, so the card condenses under a heart that is already there.
   */
  const [unlockPhase, setUnlockPhase] = useState<'none' | 'hold' | 'open' | 'settle'>('none');
  useEffect(() => {
    if (!unlocked) {
      setUnlockPhase('none');
      return;
    }
    const U = MOTION.unlock;
    const rel = reducedMotion ? U.quick.release : U.release;
    const settleAt = (U.anticipate + rel) * 1000;
    setUnlockPhase('hold');
    // scene time (lib/pace): a touch hurries it, a repeat is shorter
    let alive = true;
    void sceneWait(U.anticipate * 1000).then(() => alive && setUnlockPhase((p) => (p === 'hold' ? 'open' : p)));
    void sceneWait(settleAt).then(() => alive && setUnlockPhase('settle'));
    return () => {
      alive = false;
    };
  }, [unlocked, reducedMotion]);
  const settling = unlockPhase === 'settle';

  const short = useThree((st) => st.size.height < 680 && !portrait);
  const gatePos: [number, number, number] = [0, portrait ? 1.55 : 1.2, -1.2];
  const heartPos: [number, number, number] =
    stage === 'intro'
      ? settling
        ? gatePos // it goes to meet the card a beat before the card arrives
        : heartPoints > 0
          ? [0, portrait ? 0.75 : 0.62, 0] // lifted: the ring of words sits beneath it
          : [0, portrait ? 0.15 : 0.1, 0]
      : stage === 'gate'
        ? gatePos
        : // (a short landscape window: the welcome's lines reach higher — lift the heart clear)
          [0, portrait ? 1.7 : short ? 1.85 : 1.35, -1.6];
  const heartScale = stage !== 'intro' || settling ? 0.55 : 0.98 + charge * 0.14 + (unlocked ? 0.06 : 0);

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
  // each beat draws the camera a little closer, the last one most of all; while the heart
  // is open the camera leans into the core, so the light passes around her view
  const camZ =
    stage === 'intro'
      ? settling
        ? 6.6 * dist
        : (6.4 - charge * 0.9 - (unlocked ? 0.5 : 0)) * dist * (unlockPhase === 'open' ? 1 - MOTION.unlock.push : 1)
      : 6.6 * dist;
  if (stage !== 'intro') orbit.tZoom = 1;

  /**
   * While the heart is open the camera arcs round it (≈41°) and cranes down from above —
   * the one moment the hero is seen from a moving point of view, so the light reads as a
   * thing with volume instead of a picture. The ring of words below passes across the lens
   * on the way down, which is where the parallax comes from.
   */
  const arcing = unlockPhase === 'open' || unlockPhase === 'hold';
  const arcFrom = useRef(0);
  useEffect(() => {
    if (!arcing || reducedMotion) return;
    arcFrom.current = orbit.tYaw;
    const U = MOTION.unlock;
    let raf = 0;
    let last = performance.now();
    let el = 0;
    const span = (U.anticipate + U.release) * 1000;
    const step = () => {
      const now = performance.now();
      el += (now - last) * pace.rate;
      last = now;
      const k = Math.min(1, el / span);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // in-out: it leans away and settles
      orbit.tYaw = arcFrom.current + U.arc * e;
      orbit.tPitch = U.craneUp * Math.sin(Math.PI * e); // up, then back down to her eye line
      orbit.lastInput = performance.now();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [arcing, reducedMotion, orbit]);

  // when the light gathers, the camera glides round to meet the heart face to face
  const gathering = awake && stage === 'intro';
  useEffect(() => {
    if (!gathering) return;
    orbit.steerYaw(0);
    orbit.tPitch = 0;
    orbit.lastInput = performance.now();
  }, [gathering, orbit]);

  // Storyboard D3.1: when the card is laid out, the light sprite leaves the heart and draws
  // its frame (PasswordGate draws the same line, at the same speed, in SVG).
  const drawnCard = useRef(-1);
  useFrame(({ camera, size }, dt) => {
    orbit.step(Math.min(dt, 0.05));
    if (stage === 'gate' && !reducedMotion && gateMarks.marks && gateMarks.version !== drawnCard.current && holder.current) {
      drawnCard.current = gateMarks.version;
      holder.current.getWorldPosition(heartAt);
      const cam = camera as THREE.PerspectiveCamera;
      // the writing hangs at the heart's distance, so the light writes at the heart's depth
      const depth = cam.position.distanceTo(heartAt);
      const m = gateMarks.marks;
      sprite.play(
        writeScript(heartAt, screenStroke(m.write, cam, size, depth, 14, -6), screenStroke(m.line, cam, size, depth, 4)),
        heartAt,
      );
    }
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
  // two beats: a small step back with the lens narrowing (the breath in), then the dive
  const divePhase = useDive(leaving && stage !== 'intro');
  // Storyboard D3.2: stepping inside, the light sprite leaves the heart and the camera runs
  // after it into a spiral corridor of light; the room picks the story up on the other side
  // (RoomWorld continues the same flight). Reduced motion keeps the plain dive.
  const flying = !reducedMotion && divePhase === 'dive';
  useEffect(() => {
    if (!flying || !holder.current) return;
    holder.current.getWorldPosition(heartAt);
    sprite.play(leaveHeartScript(heartAt, () => false), heartAt);
  }, [flying]);
  const dive = divePhase === 'dive' && !flying;
  const pull = divePhase === 'pull';
  const restY = heartPoints > 0 && stage === 'intro' && !settling ? 1.25 : 0.15;
  const camPos: [number, number, number] = dive
    ? [0, heartPos[1] + 0.06, heartPos[2] + 1.15]
    : pull
      ? [0, restY + 0.04, camZ * 1.045]
      : [0, restY, camZ];
  const camLook: [number, number, number] = dive
    ? [heartPos[0], heartPos[1], heartPos[2]]
    : [0, stage === 'intro' && !settling ? (heartPoints > 0 ? -0.05 : 0) : 0.35, 0];

  return (
    <>
      <CameraRig
        position={camPos}
        lookAt={camLook}
        parallax={reducedMotion || dive || unlockPhase !== 'none' ? 0 : 0.22}
        speed={dive ? 1.35 : pull ? 2.2 : unlockPhase === 'open' ? 1.5 : settling ? 1.0 : stage === 'intro' ? 1.1 : 1.5}
        fov={dive ? 52 : pull ? 36 : unlockPhase === 'open' ? 40 - MOTION.unlock.lensIn : 40}
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
          opening={unlocked && stage === 'intro'}
          // the shrink to its place on the password screen is a move, not a snap
          scaleSpeed={settling ? 2.4 : 10}
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
            visible={stage === 'intro' && !settling}
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
