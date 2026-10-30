import { useEffect, useMemo, useState } from 'react';
import { useGiftOrigin } from '../../hooks/useGiftOrigin';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';
import { useDialog } from '../ui/useDialog';

interface Props {
  onClose: () => void;
  reducedMotion: boolean;
}

const CHARS_PER_SECOND = 52;

/** The letter: paper, handwriting-ish, words arriving at a readable pace (skippable). */
export default function LoveLetter({ onClose, reducedMotion }: Props) {
  const cfg = birthdayConfig.letter;
  const dialog = useDialog<HTMLDivElement>(onClose);
  const paragraphs = useMemo(() => cfg.paragraphs.map(fill), [cfg.paragraphs]);
  const total = useMemo(() => paragraphs.reduce((n, p) => n + p.length, 0), [paragraphs]);
  const [shown, setShown] = useState(reducedMotion ? total : 0);
  const done = shown >= total;

  useEffect(() => {
    if (done) return;
    let raf = 0;
    let last = performance.now();
    const startDelay = 900;
    const begin = last + startDelay;
    let acc = 0;
    const tick = (now: number) => {
      if (now >= begin) {
        acc += ((now - last) / 1000) * CHARS_PER_SECOND;
        const whole = Math.floor(acc);
        if (whole > 0) {
          acc -= whole;
          setShown((s) => Math.min(total, s + whole));
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, total]);

  // the letter's page opens out of the letter itself (storyboard I)
  const from = useGiftOrigin();

  // slice the running character count across paragraphs
  let budget = shown;
  const visible = paragraphs.map((p) => {
    const take = Math.max(0, Math.min(p.length, budget));
    budget -= p.length;
    return p.slice(0, take);
  });
  const typingIndex = visible.findIndex((v, i) => v.length < paragraphs[i].length);

  return (
    <div
      ref={dialog}
      className={`sheet sheet--letter${from.className}`}
      style={from.style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="letter-greeting"
    >
      <div className="sheet__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose} data-autofocus>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Back
        </button>
        {!done && (
          <button type="button" className="btn btn--quiet" onClick={() => setShown(total)}>
            Show all
          </button>
        )}
      </div>

      <div className="sheet__scroll">
        <article className="letter rise" style={{ animationDelay: '0.2s' }}>
          <p id="letter-greeting" className="letter__greeting">
            {fill(cfg.greeting)}
          </p>

          {/* screen readers get the whole letter at once */}
          <div className="sr-only">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="letter__body" aria-hidden="true">
            {paragraphs.map((p, i) => (
              <p key={i} className="letter__p">
                <span>{visible[i]}</span>
                {i === typingIndex && <span className="letter__caret" />}
                {/* reserve the paragraph's final height so the page doesn't jump */}
                <span className="letter__ghost">{p.slice(visible[i].length)}</span>
              </p>
            ))}
          </div>

          <footer className={`letter__sign${done ? ' is-on' : ''}`}>
            <p>{fill(cfg.closing)}</p>
            <p className="letter__name">{fill(cfg.signature)}</p>
          </footer>
        </article>

        <div className={`memory__end${done ? ' is-on' : ''}`}>
          <button type="button" className="btn" onClick={onClose}>
            Back to our room
          </button>
        </div>
      </div>
    </div>
  );
}
