import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sprite } from './spriteFlight';

/**
 * A thing in the room that is NOT THERE until the light has flown past it (storyboard H).
 *
 * The room's surfaces are discarded in their own shaders; everything that stands in the
 * room is a group of its own, so it waits here instead: scale 0 (not drawn at all, the
 * owner's "trống nghĩa là không vẽ") until the leader comes round to its angle, then it
 * arrives in its own way (`mode`):
 *  • `grow` — it swells into place about its own foot, with a little overshoot;
 *  • `drop` — a seed of it falls out of the air and blooms into the thing (the gifts);
 *  • `rise` — it builds upward from where it stands (the cake, from its table);
 *  • `pop`  — it is simply there (the candle flames, which catch).
 *
 * It scales about `pivot` — where the thing stands, in the coordinates of the group this
 * gate sits in — never about the middle of the room (that pulled things in from the centre).
 * `at` (world x/z) only decides WHEN: the angle the leader must reach.
 */
export type BuildMode = 'grow' | 'drop' | 'rise' | 'pop';

export function BuildGate({
  at,
  pivot,
  children,
  seed = 0,
  grow = 0.55,
  last = false,
  angle: angleAt,
  mode = 'grow',
}: {
  at: [number, number];
  /** Where it scales from, in its parent's space (defaults to `at` on the ground plane y = 0). */
  pivot?: [number, number, number];
  children: ReactNode;
  seed?: number;
  grow?: number;
  /** Wait for the whole flight instead of the angle (the orb the leader becomes). */
  last?: boolean;
  /** Or wait for a given angle of the sweep. */
  angle?: number;
  mode?: BuildMode;
}) {
  const g = useRef<THREE.Group>(null);
  // -1 until the first frame: it then takes whatever the flight says, so a thing is never
  // drawn for a frame before the light reaches it (and a resumed visit is simply there)
  const k = useRef(-1);
  const angle = last ? Math.PI + 0.7 : (angleAt ?? Math.atan2(at[0], -at[1]));
  const pv = pivot ?? [at[0], 0, at[1]];

  useFrame((_, rawDt) => {
    const o = g.current;
    if (!o) return;
    const dt = Math.min(rawDt, 0.05);
    const want = sprite.builtAt(angle + seed);
    if (k.current < 0 || mode === 'pop') k.current = want;
    // it arrives in `grow` seconds, never faster than the light that woke it
    else k.current += (want - k.current) * (1 - Math.exp(-dt / Math.max(0.05, grow * 0.35)));
    const e = THREE.MathUtils.clamp(k.current, 0, 1);
    const ss = THREE.MathUtils.smoothstep;
    // (Scale, never `visible`: three skips an invisible object when it compiles the room, and
    //  hiding things left their shaders to compile mid-tour. At 1e-5 nothing covers a pixel.)
    const tiny = 1e-5;
    o.position.set(pv[0], pv[1], pv[2]);
    if (mode === 'drop') {
      // a seed: small, falling out of the air; it lands, then blooms into the thing
      const fall = ss(e, 0, 0.6);
      const bloom = ss(e, 0.45, 1);
      o.position.y += (1 - fall) * (1 - fall) * 1.7;
      o.scale.setScalar(e < 0.002 ? tiny : 0.12 + 0.88 * bloom * (1.05 - 0.05 * bloom));
    } else if (mode === 'rise') {
      // up from where it stands: height first, then it fills out
      o.scale.set(Math.max(tiny, ss(e, 0, 0.45)), Math.max(tiny, e), Math.max(tiny, ss(e, 0, 0.45)));
    } else {
      const s = e < 1 ? e * (1.06 - 0.06 * e) : 1;
      o.scale.setScalar(Math.max(tiny, s));
    }
  });

  // the inner group undoes the pivot, so its children keep their own coordinates
  // (tagged so a QA script can count how much of the room is drawn)
  return (
    <group ref={g} userData={{ buildGate: true, pivot: pv }}>
      <group position={[-pv[0], -pv[1], -pv[2]]}>{children}</group>
    </group>
  );
}
