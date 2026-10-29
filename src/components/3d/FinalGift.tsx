import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { surface } from './Gift3D';
import { getGlowTexture } from './glowTexture';

/*
 * The last gift of the finale — the one that "can't be opened through a screen".
 * A small box in deep wine paper, tied with champagne satin: flat ribbon bands, a bow of
 * two loops and a knot, two notched tails that stir a little. It never opens.
 *
 * All surfaces go through Gift3D's `surface()` (the one shared, pre-warmed lit program).
 * It is mounted with the finale (at a speck's size) so its shader is ready long before
 * it is needed; `appear` (0 hidden · ~0.4 a first glimpse · 1 there) brings it in.
 */

/** A flat satin loop: an elliptical band rx × ry, `t` thick, `w` wide (along z). */
function loopGeometry(rx: number, ry: number, t: number, w: number) {
  const ring = new THREE.Shape().absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  ring.holes.push(new THREE.Path().absellipse(0, 0, rx - t, ry - t, 0, Math.PI * 2, true, 0));
  const g = new THREE.ExtrudeGeometry(ring, { depth: w, bevelEnabled: false, curveSegments: 36 });
  g.translate(0, 0, -w / 2);
  g.computeVertexNormals();
  return g;
}

/** A ribbon tail: a flat strip with a swallow-tail notch, softly curled at the end. */
function tailGeometry(w: number, len: number, t: number) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w / 2 + 0.004, -len);
  sh.lineTo(0, -len + w * 0.5);
  sh.lineTo(-w / 2 - 0.004, -len);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) / len) ** 2 * 0.02);
  g.computeVertexNormals();
  return g;
}

export function createFinalGiftMaterials() {
  return {
    paper: surface({ color: '#5a1626', roughness: 0.58, sheen: 0.5, sheenRoughness: 0.55, sheenColor: '#d98a96', clearcoat: 0.12, clearcoatRoughness: 0.5, bumpScale: 1.1, emissive: new THREE.Color('#ffb48a') }),
    satin: surface({ color: '#d8b47c', roughness: 0.3, metalness: 0.15, sheen: 1, sheenRoughness: 0.25, sheenColor: '#fff0d6', clearcoat: 0.25, clearcoatRoughness: 0.3, bumpScale: 0.05 }),
    card: surface({ color: '#f1e5d3', roughness: 0.85, sheen: 0.2, sheenRoughness: 0.9, bumpScale: 0.8 }),
  };
}

const W = 0.5; // the box (lid slightly larger)
const H = 0.4;

export function FinalGift({ appear, reducedMotion }: { appear: { current: number }; reducedMotion: boolean }) {
  const mats = useMemo(createFinalGiftMaterials, []);
  const geo = useMemo(() => ({ loop: loopGeometry(0.075, 0.042, 0.004, 0.034), knot: loopGeometry(0.022, 0.018, 0.005, 0.038), tail: tailGeometry(0.034, 0.17, 0.004) }), []);
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(geo).forEach((g) => g.dispose());
    },
    [mats, geo],
  );
  const holder = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const tails = useRef<THREE.Group[]>([]);
  const pool = useRef<THREE.Mesh>(null);
  const a = useRef(0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const motion = reducedMotion ? 0.3 : 1;
    // a soft spring toward where the story wants it
    a.current += (appear.current - a.current) * (1 - Math.exp(-dt * (reducedMotion ? 6 : 2.2)));
    const v = a.current;
    const g = holder.current;
    if (g) {
      // grows out of the light with the slightest overshoot, settling as it lands
      const s = Math.max(0.0001, v * (1 + Math.sin(Math.min(1, v) * Math.PI) * 0.06));
      g.scale.setScalar(s);
      g.position.y = (1 - v) * 0.3 + Math.sin(t * 0.8) * 0.01 * motion * v;
    }
    if (box.current) {
      // it turns to her, then barely moves: a slow breath of a turn
      box.current.rotation.y = -0.42 + (1 - v) * 0.9 + Math.sin(t * 0.42) * 0.1 * motion;
      box.current.rotation.x = Math.sin(t * 0.31) * 0.015 * motion;
    }
    // the ribbon's tails stir as if in a faint draught
    tails.current.forEach((tl, i) => {
      if (tl) tl.rotation.x = 0.35 + Math.sin(t * (0.9 + i * 0.23) + i * 1.7) * 0.06 * motion;
    });
    // its light on the "floor" beneath — a reflection, never a flare
    if (pool.current) (pool.current.material as THREE.MeshBasicMaterial).opacity = 0.22 * Math.min(1, v * 1.2);
    // a warm breath of light in the paper, only as it arrives
    mats.paper.emissiveIntensity = Math.max(0, Math.sin(Math.min(1, v) * Math.PI)) * 0.04;
  });

  return (
    <group ref={holder} scale={0.0001}>
      <mesh ref={pool} rotation-x={-Math.PI / 2} position-y={-H / 2 - 0.12} raycast={() => null}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial map={getGlowTexture()} color="#e7a989" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <group ref={box}>
        {/* the box and its lid */}
        <RoundedBox args={[W, H, W]} radius={0.025} smoothness={4} material={mats.paper} />
        <RoundedBox args={[W + 0.03, 0.1, W + 0.03]} radius={0.022} smoothness={4} position-y={H / 2 - 0.035} material={mats.paper} />
        {/* the satin bands, crossing over the lid and down every side */}
        <mesh material={mats.satin}>
          <boxGeometry args={[0.07, H + 0.006, W + 0.036]} />
        </mesh>
        <mesh material={mats.satin}>
          <boxGeometry args={[W + 0.036, H + 0.006, 0.07]} />
        </mesh>
        {/* the bow: two loops, one a little larger, the knot a touch off centre */}
        <group position={[0.006, H / 2 + 0.03, 0]} rotation-y={0.2}>
          <mesh geometry={geo.loop} material={mats.satin} position={[-0.07, 0.028, 0]} rotation={[0, 0.25, 0.42]} />
          <mesh geometry={geo.loop} material={mats.satin} position={[0.066, 0.024, 0]} rotation={[0, -0.25, -0.48]} scale={0.93} />
          <mesh geometry={geo.knot} material={mats.satin} position={[0, 0.012, 0]} />
          {[-1, 1].map((sd, i) => (
            <group key={sd} ref={(g) => void (g && (tails.current[i] = g))} position={[sd * 0.012, 0.004, 0.012]} rotation={[0.35, sd * 0.35, sd * 0.4]}>
              <mesh geometry={geo.tail} material={mats.satin} rotation-x={-Math.PI / 2} />
            </group>
          ))}
        </group>
        {/* a small blank card tucked under the ribbon: there is nothing to read — it's for her hands */}
        <mesh material={mats.card} position={[0.13, -0.02, W / 2 + 0.02]} rotation={[0, 0, -0.08]}>
          <boxGeometry args={[0.12, 0.075, 0.003]} />
        </mesh>
      </group>
    </group>
  );
}
