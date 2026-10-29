import { useEffect, useRef, useState } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { daysTogether, fill } from '../../lib/text';
import type { FinalePhase } from '../../types';

interface Props {
  phase: FinalePhase;
  onOneMore: () => void;
  onBackToRoom: () => void;
  onReplay: () => void;
  /** the final surprise: her two answers */
  onChooseDone: () => void;
  onChooseMore: () => void;
}

type Choice = 'done' | 'more' | null;

/** Words for the finale; the 3D world does the rest. */
export default function FinalReveal({ phase, onOneMore, onBackToRoom, onReplay, onChooseDone, onChooseMore }: Props) {
  const cfg = birthdayConfig.final;
  const sp = birthdayConfig.surprise;
  const days = daysTogether(birthdayConfig.togetherSince);
  const more = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const sureMore = useRef<HTMLButtonElement>(null);
  // when the answers are gone, keep her place: focus moves to the words themselves
  const words = useRef<HTMLDivElement>(null);
  // the answer she picked: it lights, the other steps back, then the story moves on
  const [chosen, setChosen] = useState<Choice>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (pending.current && clearTimeout(pending.current)), []);
  useEffect(() => setChosen(null), [phase]);

  useEffect(() => {
    const focusLater = (el: { current: HTMLButtonElement | null }, ms: number) => {
      const id = setTimeout(() => el.current?.focus({ preventScroll: true }), ms);
      return () => clearTimeout(id);
    };
    if (phase === 'formed') return focusLater(more, 3600);
    if (phase === 'question') return focusLater(firstChoice, 2400);
    if (phase === 'sure') return focusLater(sureMore, 2600);
    if (phase === 'reveal' || phase === 'waiting') words.current?.focus({ preventScroll: true });
  }, [phase]);

  const choose = (c: Exclude<Choice, null>) => {
    if (chosen) return; // one answer only
    setChosen(c);
    pending.current = setTimeout(c === 'done' ? onChooseDone : onChooseMore, 520);
  };

  return (
    <div className="layer finale" aria-live="polite" data-phase={phase}>
      {phase === 'formed' && (
        <div className="finale__block" key="formed">
          <h1 className="display finale__title rise" style={{ animationDelay: '0.3s' }}>
            {fill(cfg.title)} <span className="finale__heart">❤</span>
          </h1>
          <p className="finale__message rise" style={{ animationDelay: '1.3s' }}>
            {fill(cfg.message)}
          </p>
          {days !== null && (
            <p className="eyebrow rise" style={{ animationDelay: '2.1s' }}>
              {days.toLocaleString('vi-VN')} days together — and counting
            </p>
          )}
          <button
            ref={more}
            type="button"
            className="btn rise"
            style={{ animationDelay: '2.9s' }}
            onClick={onOneMore}
          >
            {cfg.oneMoreThing}
          </button>
        </div>
      )}

      {/* the last words — they stay a moment, then step back as the world grows still */}
      {(phase === 'secret' || phase === 'quiet') && (
        <div className={`finale__block finale__block--secret${phase === 'quiet' ? ' is-leaving' : ''}`} key="secret" aria-hidden={phase === 'quiet' || undefined}>
          {cfg.secretMessage.map((line, i) => (
            <p
              key={i}
              className={`rise ${i === 0 ? 'title' : 'whisper finale__line'}`}
              style={{ animationDelay: `${0.8 + i * 1.6}s` }}
            >
              {fill(line)}
            </p>
          ))}
          <p className="finale__sign rise" style={{ animationDelay: `${0.8 + cfg.secretMessage.length * 1.6}s` }}>
            {fill(cfg.signature)}
          </p>
          <div className="finale__actions rise" style={{ animationDelay: `${1.8 + cfg.secretMessage.length * 1.6}s` }}>
            <button type="button" className="btn btn--quiet" onClick={onBackToRoom} tabIndex={phase === 'quiet' ? -1 : undefined}>
              Back to our room
            </button>
            <button type="button" className="btn btn--quiet" onClick={onReplay} tabIndex={phase === 'quiet' ? -1 : undefined}>
              From the beginning
            </button>
          </div>
        </div>
      )}

      {/* ── the final surprise ───────────────────────────────────────── */}
      {phase === 'question' && (
        <div className="finale__block surprise" key="question" data-chosen={chosen ?? undefined}>
          <h2 className="surprise__question surprise__ink" style={{ ['--d' as string]: '0.2s' }}>
            {sp.question}
          </h2>
          <div className="surprise__choices rise" style={{ animationDelay: '1.5s' }} role="group" aria-label={sp.question}>
            <button
              ref={firstChoice}
              type="button"
              className="surprise__choice"
              data-selected={chosen === 'done' || undefined}
              aria-pressed={chosen === 'done'}
              disabled={!!chosen && chosen !== 'done'}
              onClick={() => choose('done')}
            >
              {sp.choiceDone}
            </button>
            <button
              type="button"
              className="surprise__choice surprise__choice--more"
              data-selected={chosen === 'more' || undefined}
              aria-pressed={chosen === 'more'}
              disabled={!!chosen && chosen !== 'more'}
              onClick={() => choose('more')}
            >
              {sp.choiceMore}
            </button>
          </div>
        </div>
      )}

      {phase === 'sure' && (
        <div className="finale__block surprise" key="sure" data-chosen={chosen ?? undefined}>
          <h2 className="surprise__question surprise__question--sure surprise__ink" style={{ ['--d' as string]: '0.15s' }}>
            {sp.sure}
          </h2>
          <p className="surprise__hint rise" style={{ animationDelay: '1.1s' }}>
            {sp.sureHint}
          </p>
          <div className="surprise__choices rise" style={{ animationDelay: '2.1s' }}>
            <button
              ref={sureMore}
              type="button"
              className="surprise__choice surprise__choice--more"
              data-selected={chosen === 'more' || undefined}
              aria-pressed={chosen === 'more'}
              onClick={() => choose('more')}
            >
              {sp.choiceMore}
            </button>
          </div>
        </div>
      )}

      {phase === 'reveal' && (
        <div ref={words} tabIndex={-1} className="finale__block surprise surprise--reveal" key="reveal">
          <p className="surprise__line surprise__ink surprise__line--first" style={{ ['--d' as string]: '1.9s' }}>
            {sp.reveal[0]}
          </p>
          <p className="surprise__line surprise__ink surprise__line--first" style={{ ['--d' as string]: '3.0s' }}>
            {sp.reveal[1]}
          </p>
          <p className="surprise__look surprise__ink" style={{ ['--d' as string]: '6.4s' }}>
            {sp.lookAround}
          </p>
        </div>
      )}

      {phase === 'waiting' && (
        <div ref={words} tabIndex={-1} className="finale__block surprise surprise--final" key="waiting">
          {sp.finalMessage.map((line, i) => {
            const last = i === sp.finalMessage.length - 1;
            return (
              <p
                key={i}
                className={`surprise__ink ${last ? 'surprise__sign' : i === 0 ? 'surprise__lead' : 'surprise__para'}`}
                style={{ ['--d' as string]: `${0.6 + i * 1.5 + (last ? 0.6 : 0)}s` }}
              >
                {fill(line)}
              </p>
            );
          })}
          <button
            type="button"
            className="btn btn--quiet surprise__back rise"
            style={{ animationDelay: `${2.4 + sp.finalMessage.length * 1.5}s` }}
            onClick={onBackToRoom}
          >
            Back to our room
          </button>
        </div>
      )}
    </div>
  );
}
