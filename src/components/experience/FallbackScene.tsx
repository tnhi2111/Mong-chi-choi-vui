import { useEffect } from 'react';
import type { Gift } from '../../data/gifts';
import type { FinalePhase, Stage } from '../../types';

interface Props {
  stage: Stage;
  gifts: Gift[];
  opened: string[];
  openingId: string | null;
  allOpened: boolean;
  onGiftSelect: (id: string) => void;
  onGiftOpened: (id: string) => void;
  finalePhase: FinalePhase;
  onFinaleFormed: () => void;
  pulseKey: number;
  reducedMotion: boolean;
}

/**
 * 2D version of the scenes for devices without WebGL. Same story, same
 * interactions — hearts and gifts drawn with CSS instead of 3D.
 */
export function FallbackScene({
  stage,
  gifts,
  opened,
  openingId,
  allOpened,
  onGiftSelect,
  onGiftOpened,
  finalePhase,
  onFinaleFormed,
  pulseKey,
  reducedMotion,
}: Props) {
  useEffect(() => {
    if (!openingId) return;
    const id = setTimeout(() => onGiftOpened(openingId), reducedMotion ? 150 : 900);
    return () => clearTimeout(id);
  }, [openingId, onGiftOpened, reducedMotion]);

  useEffect(() => {
    if (stage !== 'final') return;
    const id = setTimeout(onFinaleFormed, reducedMotion ? 300 : 2600);
    return () => clearTimeout(id);
  }, [stage, onFinaleFormed, reducedMotion]);

  if (stage === 'room') {
    const n = gifts.length;
    return (
      <div className="fallback fallback--room" aria-hidden="true">
        <span key={pulseKey} className={`css-orb css-orb--center${allOpened ? ' is-awake' : ''}`} />
        {gifts.map((g, i) => {
          const a = Math.PI / 2 + (i / n) * Math.PI * 2; // same layout as the 3D room: first gift on top
          const style = {
            left: `${50 + Math.cos(a) * 34}%`,
            top: `${44 - Math.sin(a) * 26}%`,
            ['--tint' as string]: g.tint,
            animationDelay: `${i * 0.4}s`,
          };
          return (
            <span
              key={g.id}
              className={`css-gift${opened.includes(g.id) ? ' is-opened' : ''}${openingId === g.id ? ' is-opening' : ''}`}
              style={style}
              onClick={() => onGiftSelect(g.id)}
            />
          );
        })}
      </div>
    );
  }

  if (stage === 'final') {
    return (
      <div className="fallback fallback--final" aria-hidden="true">
        <span className={`css-orb css-orb--big${finalePhase !== 'gather' ? ' is-awake' : ''}`} />
      </div>
    );
  }

  if (stage === 'gate' || stage === 'welcome') {
    return (
      <div className="fallback" aria-hidden="true">
        <span className="css-heart css-heart--small" />
      </div>
    );
  }

  return null; // intro: the heart is the tappable button in IntroOverlay
}
