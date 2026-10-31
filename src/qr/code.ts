/**
 * The ONE place the QR code is made. The page, the SVG, the PNG and the print sheet all draw
 * from `qrModules()`, so they can never disagree. The URL comes only from
 * birthdayConfig.siteUrl.
 *
 * Scannability rules (never break them): dark modules on a light ground (contrast ≥ 7 : 1),
 * error correction H, a clean quiet zone of `QUIET` modules on every side, nothing drawn over
 * the code or its quiet zone, and the code always flat and square to the viewer.
 */
import QRCode from 'qrcode';
import { birthdayConfig } from '../config/birthday';

export const INK = '#2a1118';
export const PAPER = '#fffaf6';
/** Quiet zone, in modules (the standard asks for 4). */
export const QUIET = 4;

export interface Modules {
  /** modules per side, without the quiet zone */
  size: number;
  /** true = dark */
  dark: (x: number, y: number) => boolean;
  url: string;
}

let cache: Modules | null = null;
export function qrModules(): Modules {
  if (cache) return cache;
  const url = birthdayConfig.siteUrl;
  const q = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const size = q.modules.size;
  const data = q.modules.data;
  cache = { size, dark: (x, y) => !!data[y * size + x], url };
  return cache;
}

/** One SVG path of every dark module, in module units, offset by the quiet zone. */
export function modulesPath(m = qrModules()): string {
  let d = '';
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.dark(x, y)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < m.size && m.dark(x + run, y)) run++;
      d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return d;
}

/** The code with its quiet zone as a self-contained SVG (exact vector modules). */
export function codeSvg(px?: number): string {
  const m = qrModules();
  const n = m.size + QUIET * 2;
  const wh = px ? ` width="${px}" height="${px}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${wh} shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="${PAPER}"/><path d="${modulesPath(m)}" fill="${INK}"/></svg>`;
}

/**
 * Draws the code (with its quiet zone) on a 2D canvas at an integer module size, so every
 * module is a whole number of pixels — sharp, never interpolated. Returns the side in px.
 */
export function drawCode(g: CanvasRenderingContext2D, x0: number, y0: number, modulePx: number): number {
  const m = qrModules();
  const mp = Math.max(1, Math.floor(modulePx));
  const n = m.size + QUIET * 2;
  const X = Math.round(x0);
  const Y = Math.round(y0);
  g.save();
  g.imageSmoothingEnabled = false;
  g.fillStyle = PAPER;
  g.fillRect(X, Y, n * mp, n * mp);
  g.fillStyle = INK;
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) if (m.dark(x, y)) g.fillRect(X + (x + QUIET) * mp, Y + (y + QUIET) * mp, mp, mp);
  g.restore();
  return n * mp;
}

/** WCAG contrast of the ink on the paper (≥ 7 is required). */
export function contrast(a = INK, b = PAPER): number {
  const lum = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
