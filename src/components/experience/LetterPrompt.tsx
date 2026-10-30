import { useEffect, useRef, useState } from 'react';
import { carrier } from '../../lib/carrier';

/**
 * P — the letter floats in front of her and waits to be touched. This is its handle in the
 * page: an invisible button laid over the floating sheet (its four corners on screen), so a
 * tap or a click on the paper, or Enter / Space from the keyboard, opens it — and a screen
 * reader hears what it is. Focus comes to it when the letter starts to wait.
 */
export function LetterPrompt() {
  const btn = useRef<HTMLButtonElement>(null);
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const w = carrier.waiting && !!carrier.quad;
      if (w !== onRef.current) {
        onRef.current = w;
        setOn(w);
        if (!w) carrier.hover = false;
      }
      const el = btn.current;
      if (w && el && carrier.quad) {
        const xs = carrier.quad.map((p) => p[0]);
        const ys = carrier.quad.map((p) => p[1]);
        const pad = 14;
        el.style.left = `${Math.min(...xs) - pad}px`;
        el.style.top = `${Math.min(...ys) - pad}px`;
        el.style.width = `${Math.max(...xs) - Math.min(...xs) + pad * 2}px`;
        el.style.height = `${Math.max(...ys) - Math.min(...ys) + pad * 2}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      carrier.hover = false;
    };
  }, []);
  useEffect(() => {
    if (on) btn.current?.focus({ preventScroll: true });
  }, [on]);
  return (
    <button
      ref={btn}
      type="button"
      className="letter-prompt"
      data-on={on}
      tabIndex={on ? 0 : -1}
      aria-hidden={!on || undefined}
      aria-label="Open the letter"
      onClick={() => (carrier.requestOpen = true)}
      onPointerEnter={() => (carrier.hover = true)}
      onPointerLeave={() => (carrier.hover = false)}
      onFocus={() => (carrier.hover = true)}
      onBlur={() => (carrier.hover = false)}
    />
  );
}
