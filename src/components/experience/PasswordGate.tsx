import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { checkBirthdayPassword } from '../../lib/password';
import { motion } from '../../config/motion';
import { publishGateRect } from '../../lib/gateRect';

interface Props {
  onSuccess: () => void;
  onFail?: () => void;
  /** The light sprite draws the card's frame first (storyboard D3.1); the writing condenses after. */
  draw?: boolean;
}

/** How far the drawn frame stands off the writing (px), and its corner radius. */
const FRAME_PAD = 22;
const FRAME_R = 26;

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

export function PasswordGate({ onSuccess, onFail, draw = false }: Props) {
  const cfg = birthdayConfig.gate;
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(0);
  const [ok, setOk] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // the frame: measured once the card is laid out, published for the light to fly along
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!draw || !form.current) return;
    const r = form.current.getBoundingClientRect();
    const w = r.width + FRAME_PAD * 2;
    const h = r.height + FRAME_PAD * 2;
    setFrame({ w, h });
    publishGateRect({ left: r.left - FRAME_PAD, top: r.top - FRAME_PAD, width: w, height: h, radius: FRAME_R });
    return () => publishGateRect(null);
  }, [draw]);

  useEffect(() => {
    const id = setTimeout(() => input.current?.focus({ preventScroll: true }), 900);
    return () => clearTimeout(id);
  }, []);

  const submit = (e: FormEvent) => {
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
  };

  const message = tries > 0 ? cfg.wrong[Math.min(tries - 1, cfg.wrong.length - 1)] : '';

  // The card is made of the heart's light: it condenses out of a blur, line after line
  // (durations in src/config/motion.ts).
  const condense = {
    '--card-ms': `${motion.unlock.cardMs}ms`,
    '--stagger': `${motion.unlock.cardStaggerMs}ms`,
    '--gather-ms': `${motion.enterRoom.gatherMs}ms`,
    '--leave-ms': `${motion.sprite.card.leave * 1000}ms`,
    '--draw-ms': `${motion.sprite.card.draw * 1000}ms`,
  } as CSSProperties;
  // the outline, from the top centre clockwise — the same way and speed the light flies it
  const framePath = frame
    ? (() => {
        const { w, h } = frame;
        const r = Math.min(FRAME_R, w / 2, h / 2);
        return `M ${w / 2} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
      })()
    : '';

  return (
    <div className="layer gate">
      <form ref={form} className={`gate__card condense${draw ? ' draws' : ''}${ok ? ' is-ok' : ''}`} style={condense} onSubmit={submit} noValidate>
        {draw && frame && (
          <svg
            className="gate__frame"
            width={frame.w}
            height={frame.h}
            viewBox={`-1 -1 ${frame.w + 2} ${frame.h + 2}`}
            style={{ left: -FRAME_PAD - 1, top: -FRAME_PAD - 1 }}
            aria-hidden="true"
          >
            <path d={framePath} pathLength={1} />
          </svg>
        )}
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {cfg.subtitle}
        </p>
        <h1 className="title gate__title" style={{ '--i': 1 } as CSSProperties}>
          {cfg.title}
        </h1>
        <label htmlFor="bday" className="sr-only">
          {cfg.inputLabel}
        </label>
        <div key={shake} className={`gate__field${shake ? ' shake' : ''}`} style={{ '--i': 2 } as CSSProperties}>
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
        <p id="gate-msg" className="gate__msg" role="status" aria-live="polite" style={{ '--i': 3 } as CSSProperties}>
          {ok ? '❤' : message}
        </p>
      </form>
    </div>
  );
}
