import { useEffect, useMemo, useRef } from 'react';
import { useGiftOrigin } from '../../hooks/useGiftOrigin';
import { useLeaf } from '../../hooks/useLeaf';
import { motion } from '../../config/motion';
import type { Gift } from '../../data/gifts';
import { assetUrl } from '../../lib/text';
import { Reveal } from '../ui/Reveal';
import { useDialog } from '../ui/useDialog';
import { Timeline } from './Timeline';
import { LightSeq, LightText } from '../ui/LightText';
import { sound } from '../../lib/audio';

interface Props {
  gift: Gift;
  index: number;
  onClose: () => void;
  /** The page is folding back into the gift it came out of. */
  closing?: boolean;
  reducedMotion?: boolean;
}

/** A memory, opened: title, date, photo, message, timeline, polaroids, note. */
export default function MemoryView({ gift, index, onClose, closing = false, reducedMotion = false }: Props) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  const scroller = useRef<HTMLDivElement>(null);
  const number = String(index + 1).padStart(2, '0');
  const meta = [gift.date, gift.location].filter(Boolean).join(' · ');
  // the page opens out of the thing that came out of the gift (storyboard I)
  const from = useGiftOrigin();
  // K: the page's paper IS the sheet that flew out of the gift (it takes over from it)
  const leaf = useLeaf(closing, reducedMotion);
  // P3: the title, its date and the message, one after another at a reading pace
  const lines = [gift.title, meta, gift.message].filter(Boolean) as string[];
  const seq = useMemo(() => {
    const s = new LightSeq();
    s.count = lines.length;
    return s;
  }, [lines.length]);
  const at = (t: string | undefined) => (t ? lines.indexOf(t) : -1);
  // Q: the music box's page is written on the last notes of its tune — each line begins on
  // a note (a gentle cadence; the reading pace is not forced to keep time)
  useEffect(() => {
    if (!leaf.inked || gift.shape !== 'orb' || reducedMotion) return;
    const cadence = [6, 4, 1, 4, 6];
    const ids: number[] = [];
    let alive = true;
    lines.forEach((_, i) =>
      void seq.startAt(i).then((at) => {
        if (alive) ids.push(window.setTimeout(() => sound.comb(cadence[i % cadence.length]), Math.max(0, at - performance.now()) + 40));
      }),
    );
    return () => {
      alive = false;
      ids.forEach(clearTimeout);
    };
  }, [leaf.inked, gift.shape, reducedMotion, seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={dialog}
      className={`sheet${leaf.carried ? ' is-carried' : from.className}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-title"
      style={{
        ...from.style,
        ['--tint' as string]: gift.tint,
        ['--page-ms' as string]: `${motion.gift.pageMs}ms`,
        ['--close-ms' as string]: `${motion.gift.closeMs}ms`,
      }}
    >
      <div className="sheet__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose} data-autofocus>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Back
        </button>
      </div>

      <div ref={leaf.ref} className={leaf.className} style={leaf.style} data-fold={leaf.fold} data-shape={gift.shape}>
      <div ref={scroller} className="sheet__scroll leaf__scroll">
        <article className="memory leaf__ink">
          <header className="memory__head rise" style={{ animationDelay: '0.15s' }}>
            {/* the journal's gilt star flew up to the top of its page (K2.3) */}
            {gift.shape === 'star' && (
              <span className="memory__star" aria-hidden="true">
                ✦
              </span>
            )}
            <p className="eyebrow">
              {number}
              {gift.subtitle ? ` — ${gift.subtitle}` : ''}
            </p>
            <LightText as="h2" id="memory-title" className="display" text={gift.title} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={at(gift.title)} />
            {meta && <LightText className="memory__meta" text={meta} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={at(meta)} />}
          </header>

          {gift.coverImage && (
            <figure className="memory__cover rise" style={{ animationDelay: '0.35s' }}>
              <img src={assetUrl(gift.coverImage.src)} alt={gift.coverImage.alt} decoding="async" />
            </figure>
          )}

          {gift.message && (
            <LightText className="memory__message whisper" text={gift.message} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={at(gift.message)} />
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
    </div>
  );
}
