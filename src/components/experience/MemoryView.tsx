import { useRef } from 'react';
import { useGiftOrigin } from '../../hooks/useGiftOrigin';
import type { Gift } from '../../data/gifts';
import { assetUrl } from '../../lib/text';
import { Reveal } from '../ui/Reveal';
import { useDialog } from '../ui/useDialog';
import { Timeline } from './Timeline';

interface Props {
  gift: Gift;
  index: number;
  onClose: () => void;
  /** The page is folding back into the gift it came out of. */
  closing?: boolean;
}

/** A memory, opened: title, date, photo, message, timeline, polaroids, note. */
export default function MemoryView({ gift, index, onClose, closing = false }: Props) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  const scroller = useRef<HTMLDivElement>(null);
  const number = String(index + 1).padStart(2, '0');
  const meta = [gift.date, gift.location].filter(Boolean).join(' · ');
  // the page opens out of the thing that came out of the gift (storyboard I)
  const from = useGiftOrigin();

  return (
    <div
      ref={dialog}
      className={`sheet${from.className}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-title"
      style={{ ...from.style, ['--tint' as string]: gift.tint }}
    >
      <div className="sheet__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose} data-autofocus>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Back
        </button>
      </div>

      <div ref={scroller} className="sheet__scroll">
        <article className="memory">
          <header className="memory__head rise" style={{ animationDelay: '0.15s' }}>
            <p className="eyebrow">
              {number}
              {gift.subtitle ? ` — ${gift.subtitle}` : ''}
            </p>
            <h2 id="memory-title" className="display">
              {gift.title}
            </h2>
            {meta && <p className="memory__meta">{meta}</p>}
          </header>

          {gift.coverImage && (
            <figure className="memory__cover rise" style={{ animationDelay: '0.35s' }}>
              <img src={assetUrl(gift.coverImage.src)} alt={gift.coverImage.alt} decoding="async" />
            </figure>
          )}

          {gift.message && (
            <p className="memory__message whisper rise" style={{ animationDelay: '0.55s' }}>
              {gift.message}
            </p>
          )}

          {gift.timeline && gift.timeline.length > 0 && (
            <section className="memory__section" aria-label="Timeline">
              <Timeline items={gift.timeline} root={scroller} />
            </section>
          )}

          {gift.photos && gift.photos.length > 0 && (
            <section className="memory__section polaroids" aria-label="Photos">
              {gift.photos.map((p, i) => (
                <Reveal
                  key={i}
                  as="figure"
                  root={scroller}
                  className="polaroid"
                  style={{ ['--r' as string]: `${[-3, 2.5, -1.5, 3][i % 4]}deg` }}
                >
                  <img src={assetUrl(p.src)} alt={p.alt} loading="lazy" decoding="async" />
                  {p.caption && <figcaption>{p.caption}</figcaption>}
                </Reveal>
              ))}
            </section>
          )}

          {gift.note && (
            <Reveal root={scroller} className="memory__section">
              <aside className="note">
                <p>{gift.note}</p>
              </aside>
            </Reveal>
          )}

          <div className="memory__end">
            <span className="memory__end-heart" aria-hidden="true">
              ♡
            </span>
            <button type="button" className="btn" onClick={onClose}>
              Back to our room
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
