import { useEffect, useState } from 'react';

/**
 * The two beats of leaving a world.
 *
 * Nothing in the reference videos starts moving from standing still: the change announces
 * itself first (a seed of light, a small step back) and only then does the camera go. So a
 * dive is told in two beats — `pull`: the camera steps back a few per cent and the lens
 * narrows a touch (the breath in); `dive`: it goes into the hero light (the breath out).
 *
 * `pullMs` matches the delay App keeps between `leaving` and closing the iris, so the step
 * back is over before the screen begins to close.
 */
export type DivePhase = 'idle' | 'pull' | 'dive';

export function useDive(leaving: boolean, pullMs = 190): DivePhase {
  const [phase, setPhase] = useState<DivePhase>('idle');
  useEffect(() => {
    if (!leaving) {
      setPhase('idle');
      return;
    }
    setPhase('pull');
    const id = setTimeout(() => setPhase('dive'), pullMs);
    return () => clearTimeout(id);
  }, [leaving, pullMs]);
  return phase;
}
