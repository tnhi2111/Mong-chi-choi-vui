import { useMemo, type CSSProperties } from 'react';
import { giftMark } from '../lib/giftMark';
import { motion } from '../config/motion';

/**
 * The memory page opens out of the thing that came out of the gift (storyboard I).
 *
 * Gift3D leaves the object's place and size on screen in `giftMark`; this turns it into the
 * four insets the page's `clip-path` starts from, so the page is uncovered from exactly
 * where the object was and grows to fill the screen. Nothing slides over anything.
 *
 * With no mark (the keyboard path, a memory opened again from the medallions) it simply
 * fades, which is what it always did.
 */
export function useGiftOrigin(): { style: CSSProperties; className: string } {
  return useMemo(() => {
    const at = giftMark.at;
    if (!at || typeof window === 'undefined') return { style: {}, className: '' };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const half = Math.max(48, Math.min(at.width, at.height) * 0.5);
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    return {
      className: ' from-gift',
      style: {
        '--clip-top': `${clamp(at.y - half, h)}px`,
        '--clip-right': `${clamp(w - (at.x + half), w)}px`,
        '--clip-bottom': `${clamp(h - (at.y + half), h)}px`,
        '--clip-left': `${clamp(at.x - half, w)}px`,
        '--page-ms': `${motion.gift.pageMs}ms`,
        '--close-ms': `${motion.gift.closeMs}ms`,
        '--tint': at.tint,
      } as CSSProperties,
    };
  }, []);
}
