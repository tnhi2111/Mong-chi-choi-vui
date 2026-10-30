import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { checkBirthdayPassword } from '../../lib/password';
import { motion } from '../../config/motion';
import { publishGateMarks } from '../../lib/gateMarks';
import { story } from '../../lib/story';

interface Props {
  onSuccess: () => void;
  onFail?: () => void;
  /** The light writes the words first (storyboard G); without it they simply fade in. */
  draw?: boolean;
}

/** How many digits the date takes (DD MM YYYY) — one slot, one star. */
const SLOTS = 8;

/** Auto-inserts slashes while she types digits only (numeric keyboards have no "/"). */
function softMask(raw: string): string {
  // Our own auto-slashes sit after exactly 2 and 2 digits. Anything else means
  // she typed her own separators (e.g. 1/1/2000 or 01-01-2000) — respect that.
  const auto = /^[\d/]*$/.test(raw) && raw.split('/').slice(0, -1).every((p) => p.length === 2);
  if (!auto) return raw.slice(0, 12);
  const d = raw.replace(/\//g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * The password screen (storyboard G). There is no card: the words are written by the light
 * that just left the heart, and what she types is a thin rule with eight slots of starlight
 * above it. Every digit lands as a star falling from the heart.
 *
 * The real `<input>` is still there and still focusable — the rule and the stars are a
 * drawing of it, not a replacement (a screen reader hears the label and the message).
 */
export function PasswordGate({ onSuccess, onFail, draw = false }: Props) {
  const cfg = birthdayConfig.gate;
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(0);
  const [ok, setOk] = useState(false);
  /** 'none' → the light has not arrived yet; 'words' → it is writing; 'line' → the rule; 'done'. */
  const [wrote, setWrote] = useState<'none' | 'words' | 'line' | 'done'>(draw ? 'none' : 'done');
  const input = useRef<HTMLInputElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  /** Stars that have fallen into their slots: one per digit, keyed so each falls once. */
  const [stars, setStars] = useState(0);

  // tell the 3D world where to write (and re-tell it when the window changes shape)
  useLayoutEffect(() => {
    if (!draw) return;
    const publish = () => {
      const w = words.current?.getBoundingClientRect();
      const r = rule.current?.getBoundingClientRect();
      if (!w || !r) return;
      publishGateMarks({
        write: { left: w.left + w.width * 0.06, right: w.right - w.width * 0.06, top: w.top + w.height * 0.52 },
        line: { left: r.left, right: r.right, top: r.top + r.height * 0.5 },
      });
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      publishGateMarks(null);
    };
  }, [draw]);

  // the writing follows the stroke: the world tells us when the light reaches each part
  useEffect(() => {
    if (!draw) return;
    let alive = true;
    void story.wait('gate-stroke').then(() => alive && setWrote('words'));
    void story.wait('gate-line').then(() => alive && setWrote((w) => (w === 'done' ? w : 'line')));
    void story.wait('gate-home').then(() => alive && setWrote('done'));
    return () => {
      alive = false;
    };
  }, [draw]);

  useEffect(() => {
    // focus as soon as the light has reached the words — she can type while it finishes
    // writing them, and a keyboard never has to wait for a flight to end
    let alive = true;
    const take = () => alive && input.current?.focus({ preventScroll: true });
    if (!draw) {
      const id = setTimeout(take, 900);
      return () => {
        alive = false;
        clearTimeout(id);
      };
    }
    void story.wait('gate-stroke').then(() => alive && setTimeout(take, 250));
    // …and whatever happens to the flight, she can type after a second and a half
    const safety = setTimeout(take, 1600);
    return () => {
      alive = false;
      clearTimeout(safety);
    };
  }, [draw]);

  const digits = value.replace(/\D/g, '').length;
  useEffect(() => setStars(digits), [digits]);

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (ok) return;
      if (checkBirthdayPassword(value, birthdayConfig.birthdayPassword)) {
        setOk(true);
        input.current?.blur();
        onSuccess();
      } else {
        setTries((t) => t + 1);
        setShake((s) => s + 1);
        onFail?.();
      }
    },
    [ok, value, onSuccess, onFail],
  );

  const message = tries > 0 ? cfg.wrong[Math.min(tries - 1, cfg.wrong.length - 1)] : '';
  const vars = {
    '--write-ms': `${motion.sprite.card.write * 1000}ms`,
    '--line-ms': `${motion.sprite.card.line * 1000}ms`,
    '--card-ms': `${motion.unlock.cardMs}ms`,
    '--stagger': `${motion.unlock.cardStaggerMs}ms`,
    '--spark-ms': `${motion.unlock.sparkMs}ms`,
    '--gather-ms': `${motion.enterRoom.gatherMs}ms`,
  } as CSSProperties;

  return (
    <div className="layer gate">
      <form
        className={`gate__card${draw ? ' is-written' : ' is-plain'}${ok ? ' is-ok' : ''}`}
        style={vars}
        onSubmit={submit}
        noValidate
        data-wrote={wrote}
      >
        <div ref={words} className="gate__words">
          <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
            {cfg.subtitle}
          </p>
          <h1 className="title gate__title" style={{ '--i': 1 } as CSSProperties}>
            {cfg.title}
          </h1>
        </div>
        <label htmlFor="bday" className="sr-only">
          {cfg.inputLabel}
        </label>
        <div key={shake} ref={rule} className={`gate__field${shake ? ' shake' : ''}`}>
          {/* the slots: one star per digit of the date, lit as she types */}
          <span className="gate__slots" aria-hidden="true">
            {Array.from({ length: SLOTS }, (_, i) => (
              <span key={i} className={`gate__slot${i < stars ? ' is-lit' : ''}`} data-gap={i === 2 || i === 4 ? '' : undefined}>
                <i />
              </span>
            ))}
          </span>
          <input
            ref={input}
            id="bday"
            name="birthday"
            className="gate__input"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={cfg.inputPlaceholder}
            value={value}
            onChange={(e) => setValue(softMask(e.target.value))}
            aria-invalid={tries > 0 && !ok}
            aria-describedby="gate-msg"
            disabled={ok}
          />
          <button className="gate__submit" type="submit" aria-label={cfg.button} disabled={ok || !value.trim()}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p id="gate-msg" className="gate__msg" role="status" aria-live="polite">
          {ok ? '❤' : message}
        </p>
      </form>
    </div>
  );
}
