import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sprite } from './spriteFlight';

/**
 * A thing in the room that is NOT THERE until the light has flown past it (storyboard H).
 *
 * The room's surfaces are discarded in their own shaders; everything that stands in the
 * room — the gifts, the cake, the sign, the balloons, the candles, the puppy — is a group
 * of its own, so it waits here instead: scale 0 (not drawn at all, the owner's "trống
 * nghĩa là không vẽ") until the leader comes round to its angle, then it grows into place
 * with a little overshoot, the way a thing set down settles.
 *
 * `at` is where it stands (world x/z). `seed` staggers two things at the same angle.
 */
export function BuildGate({
  at,
  children,
  seed = 0,
  grow = 0.55,
  last = false,
  angle: angleAt,
}: {
  at: [number, number];
  children: ReactNode;
  seed?: number;
  grow?: number;
  /** Wait for the whole flight instead of the angle (the orb the leader becomes). */
  last?: boolean;
  /** Or wait for a given angle of the sweep (the flames: the room's warmth, near the end). */
  angle?: number;
}) {
  const g = useRef<THREE.Group>(null);
  // -1 until the first frame: it then takes whatever the flight says, so a thing is never
  // drawn for a frame before the light reaches it (and a resumed visit is simply there)
  const k = useRef(-1);
  const angle = last ? Math.PI + 0.7 : (angleAt ?? Math.atan2(at[0], -at[1]));

  useFrame((_, rawDt) => {
    const o = g.current;
    if (!o) return;
    const dt = Math.min(rawDt, 0.05);
    const want = sprite.builtAt(angle + seed);
    if (k.current < 0) k.current = want;
    // it arrives in `grow` seconds, never faster than the light that woke it
    else k.current += (want - k.current) * (1 - Math.exp(-dt / Math.max(0.05, grow * 0.35)));
    const e = THREE.MathUtils.clamp(k.current, 0, 1);
    // a touch of overshoot at the end: it settles instead of stopping dead
    const s = e < 1 ? e * (1.06 - 0.06 * e) : 1;
    // Scale, not `visible`: three skips an invisible object when it compiles the room, so
    // hiding things this way left their shaders to compile mid-tour (1.3 s of a frozen main
    // thread, caught by qa:perf). At this scale nothing of it covers a pixel.
    o.scale.setScalar(Math.max(1e-5, s));
  });

  // (tagged so a QA script can count how much of the room is drawn)
  return (
    <group ref={g} userData={{ buildGate: true }}>
      {children}
    </group>
  );
}
