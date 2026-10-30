import { useEffect, useRef } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';
import { LightText } from '../ui/LightText';

export function Welcome({ onEnter, leaving = false }: { onEnter: () => void; leaving?: boolean }) {
  const { lines, button } = birthdayConfig.welcome;
  const btn = useRef<HTMLButtonElement>(null);
  const step = 1.1;

  useEffect(() => {
    const id = setTimeout(() => btn.current?.focus({ preventScroll: true }), (lines.length * step + 0.8) * 1000);
    return () => clearTimeout(id);
  }, [lines.length]);

  return (
    <div className="layer welcome" data-leaving={leaving}>
      <div className="welcome__text">
        {/* L: the heart's light writes each line, word by word */}
        {lines.map((l, i) => (
          <LightText key={i} text={fill(l)} className={i === 0 ? 'display welcome__hi' : 'whisper'} delay={0.4 + i * step} variant={i === 0 ? 'bloom' : 'condense'} />
        ))}
      </div>
      <button
        ref={btn}
        type="button"
        className="btn rise"
        style={{ animationDelay: `${0.6 + lines.length * step}s` }}
        onClick={onEnter}
        disabled={leaving}
      >
        {button}
      </button>
    </div>
  );
}
