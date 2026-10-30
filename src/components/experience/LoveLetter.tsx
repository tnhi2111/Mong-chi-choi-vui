import { useEffect, useMemo, useState } from 'react';
import { useGiftOrigin } from '../../hooks/useGiftOrigin';
import { useLeaf } from '../../hooks/useLeaf';
import { motion } from '../../config/motion';
import { birthdayConfig } from '../../config/birthday';
import { fill } from '../../lib/text';
import { useDialog } from '../ui/useDialog';
import { LightSeq, LightText } from '../ui/LightText';

interface Props {
  onClose: () => void;
  reducedMotion: boolean;
  /** The letter's page is folding back into the letter. */
  closing?: boolean;
}

/**
 * The letter: paper, words arriving at a reading pace (P3) — each line as long as it takes
 * to read, the paragraphs one after another — in gilt ink. A touch on a line still arriving
 * brings it in quicker; "Show all" brings everything at once. The words are real text.
 */
export default function LoveLetter({ onClose, reducedMotion, closing = false }: Props) {
  const cfg = birthdayConfig.letter;
  const dialog = useDialog<HTMLDivElement>(onClose);
  const paragraphs = useMemo(() => cfg.paragraphs.map(fill), [cfg.paragraphs]);

  // the letter's page opens out of the letter itself (storyboard I)
  const from = useGiftOrigin();
  // K: the letter page IS the letter that flew out of the envelope
  const leaf = useLeaf(closing, reducedMotion);

  // greeting, the paragraphs, the closing and the name: one after another
  const seq = useMemo(() => {
    const s = new LightSeq();
    s.count = paragraphs.length + 3;
    return s;
  }, [paragraphs.length]);
  const [done, setDone] = useState(reducedMotion);
  useEffect(() => {
    seq.onDone = () => setDone(true);
    if (seq.done) setDone(true);
  }, [seq]);

  return (
    <div
      ref={dialog}
      className={`sheet sheet--letter${leaf.carried ? ' is-carried' : from.className}${closing ? ' is-closing' : ''}`}
      style={{ ...from.style, ['--page-ms' as string]: `${motion.gift.pageMs}ms`, ['--close-ms' as string]: `${motion.gift.closeMs}ms` }}
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
          <button type="button" className="btn btn--quiet" onClick={() => seq.skip()}>
            Show all
          </button>
        )}
      </div>

      <div ref={leaf.ref} className={leaf.className} style={leaf.style} data-fold={leaf.fold}>
      <div className="sheet__scroll leaf__scroll">
        <article className="letter leaf__ink">
          <LightText as="p" id="letter-greeting" className="letter__greeting" text={fill(cfg.greeting)} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={0} />

          <div className="letter__body">
            {paragraphs.map((p, i) => (
              <LightText key={i} className="letter__p" text={p} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={i + 1} />
            ))}
          </div>

          <footer className="letter__sign is-on">
            <LightText text={fill(cfg.closing)} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={paragraphs.length + 1} />
            <LightText className="letter__name" text={fill(cfg.signature)} variant="ink" pace="reading" ready={leaf.inked} seq={seq} seqIndex={paragraphs.length + 2} />
          </footer>
        </article>

        <div className={`memory__end${done ? ' is-on' : ''}`}>
          <button type="button" className="btn" onClick={onClose}>
            Back to our room
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
