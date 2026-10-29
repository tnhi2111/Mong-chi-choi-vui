import { useEffect, useRef } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';

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
        {lines.map((l, i) => (
          <p
            key={i}
            className={`rise ${i === 0 ? 'display welcome__hi' : 'whisper'}`}
            style={{ animationDelay: `${0.4 + i * step}s` }}
          >
            {fill(l)}
          </p>
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
