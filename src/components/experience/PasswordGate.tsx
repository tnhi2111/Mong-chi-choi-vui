import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { checkBirthdayPassword } from '../../lib/password';
import { motion } from '../../config/motion';

interface Props {
  onSuccess: () => void;
  onFail?: () => void;
}

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

export function PasswordGate({ onSuccess, onFail }: Props) {
  const cfg = birthdayConfig.gate;
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(0);
  const [ok, setOk] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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
  } as CSSProperties;

  return (
    <div className="layer gate">
      <form className={`gate__card condense${ok ? ' is-ok' : ''}`} style={condense} onSubmit={submit} noValidate>
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
