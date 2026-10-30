import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { carrier, leafRect, lerpQuad, quadMatrix, rectQuad, type Quad } from '../lib/carrier';
import { motion } from '../config/motion';

/**
 * K — the memory page's paper (`.leaf`) takes over from the sheet that flew out of the gift.
 *
 * On mount, if a sheet is out (`carrier.live`), the leaf is laid on its four corners on
 * screen with a `matrix3d` (exact by construction), the 3D sheet stops drawing in the same
 * breath (`carrier.handed`), and the corners glide to the leaf's own place over
 * `motion.gift.pageMs`; only then do its words come (`inked`). Closing runs it back onto the
 * sheet's live corners, and hands the sheet its drawing back just before the page goes.
 *
 * Without a sheet (reduced motion, the keyboard opening a memory again, no WebGL) it is an
 * ordinary page that fades in, as it always was.
 */
export function useLeaf(closing: boolean, reducedMotion: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState(() => leafRect(window.innerWidth, window.innerHeight));
  const [inked, setInked] = useState(false);
  const [carried] = useState(() => !reducedMotion && carrier.live && !!carrier.quad);
  const raf = useRef(0);

  useEffect(() => {
    const on = () => setRect(leafRect(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // the handoff: before the first paint, so there is never a frame with neither sheet
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !carried || !carrier.quad) {
      setInked(true);
      return;
    }
    const r = leafRect(window.innerWidth, window.innerHeight);
    const from = carrier.quad.map(([x, y]) => [x, y]) as Quad;
    const to = rectQuad(r);
    el.style.transformOrigin = '0 0';
    el.style.transform = quadMatrix(r.width, r.height, from, r.left, r.top);
    carrier.handed = true;
    // QA (?debug): window.__leafHold = true keeps the page on the sheet's corners (no glide)
    if ((window as unknown as { __leafHold?: boolean }).__leafHold) return () => void (carrier.handed = false);
    const t0 = performance.now();
    const dur = motion.gift.pageMs;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      // (P: the sheet has come to rest, open, before the handoff — so the page starts from
      // still and settles: eased in and out, never a kick)
      const e = k * k * k * (k * (k * 6 - 15) + 10);
      el.style.transform = quadMatrix(r.width, r.height, lerpQuad(from, to, e), r.left, r.top);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else {
        el.style.transform = '';
        setInked(true);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      carrier.handed = false;
    };
  }, [carried]);

  // closing: the words go first, then the page folds back onto the sheet in the world
  useEffect(() => {
    if (!closing) return;
    setInked(false);
    const el = ref.current;
    if (!el || !carried) return;
    cancelAnimationFrame(raf.current);
    const r = leafRect(window.innerWidth, window.innerHeight);
    const from = rectQuad(r);
    const t0 = performance.now();
    const dur = motion.gift.closeMs * 0.85;
    const words = 140;
    el.style.transformOrigin = '0 0';
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, now - t0 - words) / (dur - words));
      const e = k * k * (3 - 2 * k);
      const to = carrier.quad ?? from;
      el.style.transform = quadMatrix(r.width, r.height, lerpQuad(from, to, e), r.left, r.top);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else {
        // the sheet draws again where the page now lies, and the page lets go of the screen
        carrier.handed = false;
        el.style.visibility = 'hidden';
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [closing, carried]);

  const style: CSSProperties = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  return {
    ref,
    style,
    inked,
    carried,
    className: `leaf${carried ? ' is-carried' : ''}${inked ? ' is-inked' : ''}`,
    fold: carried ? carrier.fold : 'none',
  };
}
