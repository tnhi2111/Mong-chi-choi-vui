/**
 * K — the sheet that comes out of a gift IS the memory page (storyboard K).
 *
 * A gift lets out a small flat sheet in 3D (the "carrier": a letter, a scroll, a page, a
 * folded note). It flies toward her and squares up to the screen; every frame it is drawn,
 * the 3D side writes the four corners it covers on screen (`quad`). When the memory page
 * mounts, its paper (`.leaf`) starts EXACTLY on those corners — a CSS `matrix3d` homography
 * maps the page's own rectangle onto the quad, so it is warped by the same perspective — the
 * 3D sheet stops drawing (`handed`), and the corners glide to the page's own place.
 * Closing runs it back: the page shrinks onto the (live) quad, then the 3D sheet takes over.
 *
 * Why a homography and not drei's `<Html transform>`: four projected corners are the whole
 * truth of where the sheet is on screen; mapping a rectangle onto them is exact by
 * construction (sub-pixel), while a CSS3D copy of the camera drifts with lens and DPR — and
 * the page stays an ordinary dialog in the DOM (scrolling, focus trap, screen readers).
 *
 * No three.js here: the page's main chunk imports it.
 */
export type Pt = [number, number];
/** Screen px, clockwise from the top left: TL, TR, BR, BL. */
export type Quad = [Pt, Pt, Pt, Pt];

export const carrier = {
  /** Where the 3D sheet is on screen (updated on every frame it is rendered). */
  quad: null as Quad | null,
  /** A sheet is out (in flight, or held for a page). */
  live: false,
  /** The page has taken over: the 3D sheet draws nothing (it still reports its quad). */
  handed: false,
  /** How the sheet is folded, so the page can keep its creases (CSS `data-fold`). */
  fold: 'none' as 'none' | 'tri' | 'half' | 'roll' | 'page',
  /** P: the sheet floats in front of her, waiting to be touched (the DOM prompt shows). */
  waiting: false,
  /** P: she touched it (or pressed Enter / Space on the prompt): open it now. */
  requestOpen: false,
  /** P: her pointer is on it (it lifts a little and warms). */
  hover: false,
};

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __carrier: carrier });
}

/** The page's paper on a screen of this size (px). The DOM lays the leaf out with exactly this. */
export function leafRect(w: number, h: number) {
  const top = w < 600 ? 62 : 72;
  const bottom = w < 600 ? 14 : 24;
  const side = w < 600 ? 12 : 32;
  const width = Math.min(w - side * 2, 720);
  return { left: (w - width) / 2, top, width, height: Math.max(200, h - top - bottom) };
}

export function rectQuad(r: { left: number; top: number; width: number; height: number }): Quad {
  return [
    [r.left, r.top],
    [r.left + r.width, r.top],
    [r.left + r.width, r.top + r.height],
    [r.left, r.top + r.height],
  ];
}

export function lerpQuad(a: Quad, b: Quad, k: number): Quad {
  return a.map(([x, y], i) => [x + (b[i][0] - x) * k, y + (b[i][1] - y) * k]) as Quad;
}

/**
 * The CSS `matrix3d` that maps an element's own box (0,0)–(w,h) onto `q`, with the
 * element laid out at (ox, oy) and `transform-origin: 0 0` (Heckbert's square → quad).
 */
export function quadMatrix(w: number, h: number, q: Quad, ox = 0, oy = 0): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q.map(([x, y]) => [x - ox, y - oy]);
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let hh = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    hh = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  // from the unit square to the element's own box
  const A = a / w;
  const D = d / w;
  const G = g / w;
  const B = b / h;
  const E = e / h;
  const H = hh / h;
  return `matrix3d(${A},${D},0,${G},${B},${E},0,${H},0,0,1,0,${x0},${y0},0,1)`;
}

/** Where a point of the element's box lands under that mapping (QA: the ≤ 2 px check). */
export function mapPoint(w: number, h: number, q: Quad, u: number, v: number): Pt {
  const m = quadMatrix(w, h, q).slice(9, -1).split(',').map(Number);
  const x = u * w;
  const y = v * h;
  const W = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / W, (m[1] * x + m[5] * y + m[13]) / W];
}
