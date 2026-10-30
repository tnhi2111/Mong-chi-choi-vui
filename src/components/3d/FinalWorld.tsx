import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SURPRISE_PHASES, type FinalePhase } from '../../types';
import { MemoryCelestial, type MemoryCelestialHandle } from './MemoryCelestial';
import { ParticleField } from './ParticleField';
import { CameraRig, rebaseCamera } from './CameraRig';
import { sprite } from './spriteFlight';
import { finaleArrivalScript } from './spriteScripts';
import { usePointerOrbit } from '../../hooks/usePointerOrbit';
import { Glow } from './Glow';
import { FinalGift } from './FinalGift';
import { finaleLights } from './sceneStore';
import { useDive } from '../../hooks/useDive';

interface Props {
  phase: FinalePhase;
  photos: string[];
  onFormed: () => void;
  reducedMotion: boolean;
  glass: boolean;
  particleFactor: number;
  portrait: boolean;
  heartPoints: number;
  /** Back to the room: the camera dives into the orb. */
  leaving?: boolean;
}

/** The height the finale's orb hangs at (shared with `frame` below). */
const frameHeartY = (portrait: boolean) => (portrait ? 0.55 : 0.42);

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Timeline (seconds). Reduced motion compresses everything. */
function timing(reduced: boolean) {
  return reduced
    ? { drift: 0.2, gather: 1.2, formed: 1.6 }
    : { drift: 1.6, gather: 3.6, formed: 5.6 };
}

/* ── Memory photos drifting in and dissolving into the little universe ─── */
function MemoryFragments({
  urls,
  clock,
  t,
  ringX,
  ringY,
}: {
  urls: string[];
  clock: { current: number };
  t: ReturnType<typeof timing>;
  ringX: number;
  ringY: number;
}) {
  const [textures, setTextures] = useState<THREE.Texture[]>([]);
  const refs = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    const loaded: THREE.Texture[] = [];
    Promise.all(
      urls.map(
        (u) =>
          new Promise<THREE.Texture | null>((res) =>
            loader.load(
              u,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                loaded.push(tex);
                res(tex);
              },
              undefined,
              () => res(null),
            ),
          ),
      ),
    ).then((all) => {
      if (alive) setTextures(all.filter((x): x is THREE.Texture => !!x));
    });
    return () => {
      alive = false;
      loaded.forEach((x) => x.dispose());
    };
  }, [urls]);

  const starts = useMemo(
    () =>
      textures.map((_, i) => {
        const a = (i / Math.max(1, textures.length)) * Math.PI * 2 + 0.4;
        return new THREE.Vector3(Math.cos(a) * ringX, Math.sin(a) * ringY, (i % 2) * 0.5 - 0.2);
      }),
    [textures, ringX, ringY],
  );

  useFrame(() => {
    const T = clock.current;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const appear = THREE.MathUtils.smoothstep(T, 0.2 + i * 0.15, 1.2 + i * 0.15);
      const local = THREE.MathUtils.clamp((T - t.drift - 0.2 - i * 0.12) / (t.gather * 0.75), 0, 1);
      const e = easeInOut(local);
      m.position.copy(starts[i]).multiplyScalar(1 - e);
      m.position.y += Math.sin(T * 0.8 + i) * 0.06 * (1 - e);
      m.rotation.z = Math.sin(i * 1.3) * 0.18 * (1 - e) + e * 1.2;
      m.scale.setScalar(Math.max(0.0001, 1 - e * 0.9));
      const o = appear * (1 - THREE.MathUtils.smoothstep(e, 0.55, 0.95));
      m.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o);
      m.visible = o > 0.01;
    });
  });

  return (
    <>
      {textures.map((tex, i) => {
        const img = tex.image as { width: number; height: number };
        const aspect = img && img.height ? img.width / img.height : 0.8;
        const h = 0.78;
        const w = h * aspect;
        return (
          <group key={i} ref={(el) => void (refs.current[i] = el)} position={starts[i]} visible={false}>
            {/* polaroid frame */}
            <mesh position={[0, -0.05, -0.002]}>
              <planeGeometry args={[w + 0.1, h + 0.22]} />
              <meshBasicMaterial color="#f7efe7" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={tex} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Stage 5: the finale. */
export function FinalWorld({ phase, photos, onFormed, reducedMotion, particleFactor, portrait, heartPoints, leaving = false }: Props) {
  const clock = useRef(0);
  const orb = useRef<MemoryCelestialHandle>(null);
  const gathered = useRef({ current: 0 }).current;
  // "one more thing": one slow wave of light runs out of the little universe
  useEffect(() => {
    if (phase === 'secret') orb.current?.wave();
  }, [phase]);
  const formed = useRef(false);
  const [burst, setBurst] = useState(0);
  const group = useRef<THREE.Group>(null);
  const coreGlow = useRef<THREE.Sprite>(null);
  const t = useMemo(() => timing(reducedMotion), [reducedMotion]);

  /**
   * Storyboard D3.3, the far side of the window: she arrives here following the light sprite
   * through the glass. The finale is moved under the camera so its orb lies straight ahead
   * along the way she is looking (nothing in view turns), the flock spreads into this sky as
   * stars, and the leader flies on into the orb — which then gathers as before.
   */
  const arrived = useRef(false);
  useFrame(({ camera }) => {
    if (arrived.current) return;
    arrived.current = true;
    if (reducedMotion || !sprite.playing) return;
    const orbAt = new THREE.Vector3(0, frameHeartY(portrait), 0);
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const D = portrait ? 12 : 9.8;
    const offset = orbAt.clone().addScaledVector(look, -D).sub(camera.position);
    rebaseCamera(camera, offset);
    sprite.rebase(offset);
    sprite.continueWith(finaleArrivalScript(orbAt, sprite.leader.clone()));
  });
  const [isFormed, setIsFormed] = useState(false);

  // ── the final surprise ──
  const surprise = SURPRISE_PHASES.includes(phase);
  const revealed = phase === 'reveal' || phase === 'waiting';
  // where the last gift waits: below the orb, a step toward her
  const giftLocal = useMemo(() => new THREE.Vector3(0, portrait ? -2.05 : -1.8, portrait ? 0.8 : 1.0), [portrait]);
  const giftAppear = useRef({ current: 0 }).current;
  const beacon = useRef<THREE.Sprite>(null);
  const giftGroup = useRef<THREE.Group>(null);
  const quietAt = useRef(-1);
  const giftWorld = useMemo(() => new THREE.Vector3(), []);
  useEffect(
    () => () => {
      finaleLights.gift = null;
      finaleLights.hush = 0;
    },
    [],
  );

  // the finale can be walked around too: drag turns the camera round the whole scene
  const orbit = usePointerOrbit({ enabled: true, sensitivity: 0.005, pitch: [-0.45, 0.6], zoom: [0.85, 1.2], friction: 2.2 });

  useFrame((_, dt) => {
    orbit.step(Math.min(dt, 0.05));
    if (surprise) {
      // the world grows still: no more slow turning; it eases back to face her
      if (!orbit.dragging && orbit.idle() > 1.5) {
        const kk = 1 - Math.exp(-Math.min(dt, 0.05) * 0.6);
        orbit.tYaw += (Math.round(orbit.tYaw / (Math.PI * 2)) * Math.PI * 2 - orbit.tYaw) * kk;
        orbit.tPitch += (0 - orbit.tPitch) * kk;
      }
    } else if (!orbit.dragging && orbit.idle() > 6 && !reducedMotion) {
      // left alone, the world keeps turning slowly
      orbit.tYaw += Math.min(dt, 0.05) * 0.06;
      orbit.tPitch += (0 - orbit.tPitch) * (1 - Math.exp(-Math.min(dt, 0.05) * 0.4));
    }
    // real time, but ignore huge gaps (tab in background). If the page already
    // moved on (very slow device → safety timeout), hurry the formation along.
    const hurry = phase !== 'gather' && !formed.current ? 4 : 1;
    clock.current += Math.min(dt, 0.12) * hurry;
    const T = clock.current;
    if (!formed.current && T >= t.formed) {
      formed.current = true;
      setIsFormed(true);
      setBurst((b) => b + 1);
      onFormed();
    }
    // the surprise: a single light leaves the orb and settles below it; the gift grows there
    if (surprise && quietAt.current < 0) quietAt.current = T;
    const q = quietAt.current < 0 ? 0 : THREE.MathUtils.smoothstep(T - quietAt.current, 0.4, reducedMotion ? 1.2 : 3.4);
    giftAppear.current = revealed ? 1 : phase === 'sure' ? 0.38 : 0;
    if (beacon.current) {
      const b = beacon.current;
      b.position.set(Math.sin(q * Math.PI) * 0.25, giftLocal.y * q + 0.05, giftLocal.z * q);
      const m = b.material as THREE.SpriteMaterial;
      const pulse = phase === 'sure' ? 0.15 * (0.5 + 0.5 * Math.sin(T * 2.4)) : 0;
      const target = !surprise ? 0 : revealed ? 0.1 : 0.42 + pulse;
      m.opacity += (target - m.opacity) * (1 - Math.exp(-Math.min(dt, 0.05) * 2));
      b.scale.setScalar(0.55 + (revealed ? 0.6 : 0) + pulse);
    }
    finaleLights.hush += ((surprise ? (revealed ? 1 : 0.55) : 0) - finaleLights.hush) * (1 - Math.exp(-Math.min(dt, 0.05) * 1.2));
    if (revealed && giftGroup.current) finaleLights.gift = giftGroup.current.getWorldPosition(giftWorld);
    else finaleLights.gift = null;

    // the scattered light gathers into the orb while the photos drift in
    gathered.current = THREE.MathUtils.smoothstep(T, t.drift * 0.5, t.formed);
    if (coreGlow.current) {
      // a soft warm atmosphere round it — never a white blob
      const m = coreGlow.current.material as THREE.SpriteMaterial;
      const swell = formed.current ? Math.max(0, 1 - (T - t.formed) * 0.6) : 0;
      m.opacity = (gathered.current * 0.07 + swell * 0.06 + (phase === 'secret' ? 0.03 : 0)) * (1 - finaleLights.hush * 0.6);
      coreGlow.current.scale.setScalar(4.2 + swell * 1.2);
    }
  });

  // Frame the heart in the upper part of the screen, leaving the lower part for words.
  const frame = portrait
    ? { gather: 12, formed: 11.2, secret: 12.4, look: -1.05, lookSecret: -1.5, heartY: 0.55 }
    : { gather: 8.6, formed: 9.6, secret: 10.6, look: -0.62, lookSecret: -0.95, heartY: 0.42 };
  const camZ = !isFormed ? frame.gather : phase === 'secret' ? frame.secret : frame.formed;
  const lookY = phase === 'secret' ? frame.lookSecret : frame.look;
  // the surprise's camera: first a slow dolly down toward the light below the orb, then —
  // when she asks for more — a gentle move to the gift (the orb stays above, as a backdrop)
  const gy = frame.heartY + giftLocal.y;
  const gz = giftLocal.z;
  let camPos: [number, number, number] = [0, lookY, camZ];
  let camLook: [number, number, number] = [0, lookY, 0];
  if (phase === 'waiting') {
    // the last words need the lower half: the gift rises to the upper third, a little farther
    camPos = portrait ? [0.2, gy + 1.15, gz + 7.4] : [0.35, gy + 0.95, gz + 5.3];
    camLook = portrait ? [0, gy - 1.75, gz] : [0, gy - 0.98, gz];
  } else if (revealed) {
    camPos = portrait ? [0.2, gy + 0.95, gz + 5.8] : [0.35, gy + 0.72, gz + 3.9];
    camLook = portrait ? [0, gy - 0.95, gz] : [0, gy - 0.38, gz];
  } else if (surprise) {
    camPos = portrait ? [0, -1.75, 11.4] : [0, -1.15, 9.3];
    camLook = portrait ? [0, -1.75, 0] : [0, -1.15, 0];
  }

  // leaving is told in two beats: the step back, then the dive into the orb (see useDive)
  const divePhase = useDive(leaving);
  const dive = divePhase === 'dive';
  const pullBack = divePhase === 'pull';

  return (
    <>
      <CameraRig
        // back to the room: a small step back (the breath in), then dive into the orb
        // (the room opens out of its own)
        position={dive ? [0, frame.heartY + 0.2, 3.1] : pullBack ? [camPos[0], camPos[1], camPos[2] * 1.045] : camPos}
        lookAt={dive ? [0, frame.heartY, 0] : camLook}
        parallax={reducedMotion || leaving ? 0 : surprise ? 0.12 : 0.35}
        speed={dive ? 1.35 : pullBack ? 2.2 : surprise ? 0.38 : isFormed ? 0.45 : 0.6}
        fov={dive ? 52 : pullBack ? 37 : 40}
        orbit={orbit}
        orbitCamera
      />
      <group ref={group} position={[0, frame.heartY, 0]}>
        <Glow ref={coreGlow} color="#c9858f" size={4.2} opacity={0} />
        {/* their little universe: touch it for its constellations, touch it again once calm */}
        <MemoryCelestial
          ref={orb}
          count={heartPoints}
          scale={portrait ? 1.05 : 1.35}
          assemble={gathered}
          charge={surprise ? 0.35 : phase === 'secret' ? 0.9 : isFormed ? 0.7 : 0.4}
          interactive={isFormed && !surprise}
          hush={revealed}
          reducedMotion={reducedMotion}
        />
        {/* the final surprise: the light that leaves the orb, and the gift that grows from it */}
        <Glow ref={beacon} color="#f2c29a" size={0.55} opacity={0} />
        <group ref={giftGroup} position={giftLocal} scale={portrait ? 0.9 : 1}>
          <FinalGift appear={giftAppear} reducedMotion={reducedMotion} />
        </group>
        <MemoryFragments urls={photos} clock={clock} t={t} ringX={portrait ? 1.3 : 2.9} ringY={portrait ? 2.0 : 1.3} />
      </group>
      <ParticleField
        count={Math.round(800 * particleFactor)}
        radius={14}
        innerRadius={4}
        burstKey={burst + (phase === 'secret' ? 1 : 0)}
        intensity={surprise ? 0.3 : isFormed ? 0.9 : 0.5}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
