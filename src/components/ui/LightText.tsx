import { createElement, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { motion } from '../../config/motion';
import { lightOrigin } from '../../lib/lightOrigin';

/**
 * L — words that arrive as light (one motion language for every line on the site).
 *
 * The words are ordinary text in the DOM — read by screen readers, selectable, copyable —
 * each wrapped in a span. What makes them arrive is drawn over them on one shared canvas
 * (`LightTextLayer`): the shape of every word is sampled from a canvas in the word's own
 * computed font, at the word's own place on screen, and motes of light make that shape
 * before the real word takes over from them.
 *
 *  • `condense` — the motes fly in from the hero (`lightOrigin`: the heart / the orb), each
 *    word a beat after the last, a pen of light running along the line ahead of them;
 *  • `ink`      — on paper: the motes come off the pen itself, a short way (memory pages);
 *  • `bloom`    — the word blooms warm where it stands and lets fall a few sparks;
 *  • `constellation` — a few stars per word, joined one by one into the line, then the
 *    words sharpen out of them; `leaving` scatters them back into stars.
 * Reduced motion: the words simply fade in. Timings: `motion.lightText`.
 */
export type LightVariant = 'condense' | 'ink' | 'bloom' | 'constellation';

interface Props {
  text: string;
  as?: 'p' | 'h1' | 'h2' | 'span' | 'div';
  className?: string;
  id?: string;
  style?: CSSProperties;
  /** seconds before it starts */
  delay?: number;
  variant?: LightVariant;
  /** it is going: the words scatter into stars and fade */
  leaving?: boolean;
  /** false holds it (e.g. a page still straightening); it starts when this turns true */
  ready?: boolean;
  /** called once per word as it lands (e.g. a note of the music box) */
  onWord?: (i: number) => void;
  /**
   * P3 — `reading`: each visual line takes clamp(base + chars × perChar, min, max) s, lines
   * `gap` apart (motion.reading); `words`: a beat per word (the default).
   */
  pace?: 'words' | 'reading';
  /** P3 — paragraphs in turn: this one starts when the one before it (in `seq`) has ended */
  seq?: LightSeq;
  seqIndex?: number;
}

/**
 * P3 — a page's paragraphs, one after another: each LightText in it starts when the one
 * before has finished (plus `reading.para` of rest), whatever its length turns out to be on
 * this screen. `skip()` brings every one in at once (the letter's "Show all").
 */
export class LightSeq {
  private ends = new Map<number, number>();
  private waiting = new Map<number, ((t: number) => void)[]>();
  private skipped = new Set<() => void>();
  done = false;
  onDone?: () => void;
  count = 0;
  /** when paragraph `i` may start (performance.now() ms) */
  startAt(i: number): Promise<number> {
    if (i === 0) return Promise.resolve(performance.now());
    const e = this.ends.get(i - 1);
    if (e !== undefined) return Promise.resolve(e);
    return new Promise((res) => this.waiting.set(i - 1, [...(this.waiting.get(i - 1) ?? []), res]));
  }
  finish(i: number, at: number) {
    this.ends.set(i, at);
    this.waiting.get(i)?.forEach((r) => r(at));
    this.waiting.delete(i);
    if (i === this.count - 1) {
      const left = Math.max(0, at - performance.now());
      window.setTimeout(() => {
        this.done = true;
        this.onDone?.();
      }, left);
    }
  }
  onSkip(fn: () => void) {
    this.skipped.add(fn);
    return () => this.skipped.delete(fn);
  }
  skip() {
    this.skipped.forEach((f) => f());
  }
}

type Mote = {
  sx: number; sy: number; cx: number; cy: number; tx: number; ty: number;
  t0: number; dur: number; hold: number; fade: number; size: number; hue: number; fall?: number;
};
type Line = { a: [number, number]; b: [number, number]; t0: number; dur: number; fade: number };
type Pen = { path: { x: number; y: number; t: number }[]; end: number };
type Group = { motes: Mote[]; lines: Line[]; pens: Pen[]; until: number; ink?: boolean; ff?: number; speed?: number };
const groups = new Set<Group>();
let wake: (() => void) | null = null;

const reduced = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-reduce');

/** The glyph points of a word, where it is on screen (px). */
function sampleWord(el: HTMLElement, word: string, step: number): [number, number][] {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return [];
  const cs = getComputedStyle(el);
  const c = document.createElement('canvas');
  const w = Math.ceil(r.width) + 8;
  const h = Math.ceil(r.height) + 8;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing);
  if (!Number.isNaN(ls)) (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${ls}px`;
  const m = ctx.measureText(word);
  const asc = m.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8;
  const desc = m.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.2;
  const base = (r.height - (asc + desc)) / 2 + asc;
  ctx.fillStyle = '#fff';
  ctx.fillText(cs.textTransform === 'uppercase' ? word.toUpperCase() : word, 4, base + 4);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const jx = x + (Math.random() - 0.5) * step * 0.6;
      const jy = y + (Math.random() - 0.5) * step * 0.6;
      const ix = Math.min(w - 1, Math.max(0, Math.round(jx)));
      const iy = Math.min(h - 1, Math.max(0, Math.round(jy)));
      if (data[(iy * w + ix) * 4 + 3] > 120) pts.push([r.left + jx - 4, r.top + jy - 4]);
    }
  return pts;
}

/** A few well-spread points of a word (farthest-point picking): the stars it is drawn from. */
function stars(pts: [number, number][], n: number): [number, number][] {
  if (pts.length <= n) return pts;
  const out: [number, number][] = [pts[Math.floor(Math.random() * pts.length)]];
  while (out.length < n) {
    let best = pts[0];
    let bd = -1;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      let d = Infinity;
      for (const q of out) d = Math.min(d, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    out.push(best);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function LightText({ text, as = 'p', className = '', id, style, delay = 0, variant = 'condense', leaving = false, ready = true, onWord, pace = 'words', seq, seqIndex = 0 }: Props) {
  const root = useRef<HTMLElement>(null);
  const started = useRef(false);
  const words = text.split(/(\s+)/);
  const onWordRef = useRef(onWord);
  onWordRef.current = onWord;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    el.classList.remove('is-run');
  }, [text]);

  useEffect(() => {
    const el = root.current;
    if (!el || !ready || started.current) return;
    started.current = true;
    const L = motion.lightText;
    const timers: number[] = [];
    const go = () => {
      const spans = Array.from(el.querySelectorAll<HTMLElement>('.lt__w'));
      if (reduced()) {
        spans.forEach((s) => (s.style.animationDelay = '0ms'));
        el.classList.add('is-run', 'is-plain');
        seq?.finish(seqIndex, performance.now());
        return;
      }
      const now = performance.now();
      // when each word begins (ms from now): a beat per word, or (P3) at reading pace
      const starts: number[] = spans.map((_, i) => i * L.stagger * 1000);
      if (pace === 'reading') {
        const R = motion.reading;
        let cursor = 0;
        let i = 0;
        while (i < spans.length) {
          const top = spans[i].getBoundingClientRect().top;
          const line: number[] = [];
          while (i < spans.length && Math.abs(spans[i].getBoundingClientRect().top - top) < 4) line.push(i++);
          const chars = line.reduce((n, j) => n + (spans[j].textContent?.length ?? 0) + 1, 0);
          const dur = Math.min(R.max, Math.max(R.min, R.base + chars * R.perChar)) * 1000;
          let before = 0;
          for (const j of line) {
            starts[j] = cursor + (before / chars) * dur;
            before += (spans[j].textContent?.length ?? 0) + 1;
          }
          cursor += dur + R.gap * 1000;
        }
      }
      const motes: Mote[] = [];
      const lines: Line[] = [];
      const pen: Pen = { path: [], end: 0 };
      const ox = lightOrigin.set ? lightOrigin.x : window.innerWidth / 2;
      const oy = lightOrigin.set ? lightOrigin.y : window.innerHeight * 0.4;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 20;
      const step = Math.max(1.6, fs / (variant === 'bloom' ? 11 : 14));
      const budget = Math.round(L.maxMotes * (window.innerWidth < 600 ? 0.6 : 1));
      const sampled = spans.map((s, i) => ({ s, i, pts: sampleWord(s, s.textContent ?? '', step) }));
      const lands: number[] = [];
      const total = sampled.reduce((n, w) => n + w.pts.length, 0) || 1;
      const keep = Math.min(1, budget / total);
      let prevStar: [number, number] | null = null;
      sampled.forEach(({ s, i, pts }) => {
        const r = s.getBoundingClientRect();
        // when this word lands (ms from now)
        const start = starts[i];
        const flight = (variant === 'condense' ? L.flight : variant === 'ink' ? L.flight * 0.45 : variant === 'constellation' ? L.flight * 1.2 : 0.15) * 1000;
        const land = start + flight;
        lands[i] = land;
        s.style.animationDelay = `${Math.round(land - (variant === 'constellation' ? 120 : 60))}ms`;
        pen.path.push({ x: r.left - 2, y: r.top + r.height * 0.62, t: now + start + flight * 0.55 });
        pen.path.push({ x: r.right + 2, y: r.top + r.height * 0.62, t: now + land + L.stagger * 600 });
        timers.push(window.setTimeout(() => onWordRef.current?.(i), land));
        if (variant === 'constellation') {
          const st = stars(pts, Math.max(3, Math.min(7, Math.round(r.width / (fs * 0.55)))));
          st.forEach((p, k) => {
            const t0 = now + start + (k / st.length) * flight * 0.8;
            motes.push({ sx: p[0], sy: p[1], cx: p[0], cy: p[1], tx: p[0], ty: p[1], t0, dur: 1, hold: flight * 0.8 + 500, fade: 700, size: 2.2 + Math.random() * 1.4, hue: 0 });
            const from: [number, number] | null = k === 0 ? prevStar : st[k - 1];
            if (from) lines.push({ a: from, b: p, t0, dur: 220, fade: 900 });
          });
          prevStar = st[st.length - 1] ?? prevStar;
          return;
        }
        for (const p of pts) {
          if (Math.random() > keep) continue;
          if (variant === 'bloom') {
            motes.push({ sx: p[0], sy: p[1], cx: p[0], cy: p[1], tx: p[0], ty: p[1], t0: now + start + Math.random() * 120, dur: 1, hold: 160, fade: 520, size: 1 + Math.random() * 1.3, hue: 0.3 });
            continue;
          }
          const sx = variant === 'ink' ? r.left + (Math.random() - 0.3) * 24 : ox + (Math.random() - 0.5) * L.spread;
          const sy = variant === 'ink' ? r.top + r.height * 0.6 + (Math.random() - 0.5) * 16 : oy + (Math.random() - 0.5) * L.spread;
          const mx = (sx + p[0]) / 2;
          const my = (sy + p[1]) / 2;
          const bend = (Math.random() - 0.5) * (variant === 'ink' ? 30 : L.bend);
          motes.push({
            sx, sy,
            cx: mx - (p[1] - sy) * 0.15 + bend,
            cy: my + (p[0] - sx) * 0.15 - Math.abs(bend) * 0.5,
            tx: p[0], ty: p[1],
            t0: now + start + Math.random() * flight * 0.3,
            dur: flight * (0.65 + Math.random() * 0.35),
            hold: L.hold * 1000 * (0.5 + Math.random()),
            fade: L.fade * 1000,
            size: 0.8 + Math.random() * 1.2,
            hue: Math.random(),
          });
        }
        // a few sparks drop from a word as it blooms
        if (variant === 'bloom')
          for (let k = 0; k < L.sparks; k++) {
            const p = pts[Math.floor(Math.random() * pts.length)];
            if (!p) break;
            motes.push({ sx: p[0], sy: p[1], cx: p[0], cy: p[1], tx: p[0], ty: p[1], t0: now + start + 120 + Math.random() * 300, dur: 1, hold: 0, fade: 1100, size: 1.4 + Math.random(), hue: 0.1, fall: 40 + Math.random() * 70 });
          }
      });
      pen.end = (pen.path[pen.path.length - 1]?.t ?? now) + 200;
      const until = Math.max(pen.end, ...motes.map((m) => m.t0 + m.dur + m.hold + m.fade), ...lines.map((l) => l.t0 + l.dur + l.fade + 1200)) + 50;
      // (on paper the light is gilt ink: drawn over the paper, not added to it — light on cream vanishes)
      const group = { motes, lines, pens: variant === 'bloom' ? [] : [pen], until, ink: variant === 'ink' } as Group;
      groups.add(group);
      el.classList.add('is-run');
      wake?.();
      const lastLand = Math.max(0, ...lands);
      seq?.finish(seqIndex, now + lastLand + motion.reading.para * 1000);
      // P3: a touch on words still arriving brings them in quicker (never a cut)
      const fastForward = (f: number) => {
        if (group.ff !== undefined) return;
        const t = performance.now();
        const elapsed = t - now;
        if (elapsed > lastLand) return;
        group.ff = t;
        group.speed = f;
        group.until = t + (group.until - t) / f;
        spans.forEach((s, j) => {
          const land = lands[j];
          if (land === undefined || land <= elapsed) return;
          s.style.animationDelay = `${Math.round(elapsed + (land - elapsed) / f - 60)}ms`;
        });
      };
      ffRef.current = fastForward;
      if (seq) unskip.push(seq.onSkip(() => fastForward(40)));
    };
    const unskip: (() => void)[] = [];
    const begin = (at: number) => {
      const t = window.setTimeout(() => void (document.fonts?.ready ?? Promise.resolve()).then(go), Math.max(0, at - performance.now()) + delay * 1000);
      timers.push(t);
    };
    if (seq) void seq.startAt(seqIndex).then(begin);
    else begin(performance.now());
    return () => {
      timers.forEach(clearTimeout);
      unskip.forEach((f) => f());
    };
  }, [ready, delay, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const ffRef = useRef<((f: number) => void) | null>(null);

  // leaving: the words scatter back into stars
  useEffect(() => {
    const el = root.current;
    if (!leaving || !el || reduced()) return;
    const now = performance.now();
    const motes: Mote[] = [];
    el.querySelectorAll<HTMLElement>('.lt__w').forEach((s) => {
      const pts = sampleWord(s, s.textContent ?? '', 4);
      for (const p of pts) {
        if (Math.random() > 0.35) continue;
        const dx = (Math.random() - 0.5) * 40;
        const dy = -20 - Math.random() * 60;
        motes.push({ sx: p[0], sy: p[1], cx: p[0] + dx * 0.5, cy: p[1] + dy * 0.3, tx: p[0] + dx, ty: p[1] + dy, t0: now + Math.random() * 300, dur: 1400, hold: 0, fade: 700, size: 0.8 + Math.random() * 1.6, hue: 0 });
      }
    });
    groups.add({ motes, lines: [], pens: [], until: now + 2600 });
    el.classList.add('is-leaving');
    wake?.();
  }, [leaving]);

  return createElement(
    as,
    { ref: root, id, style, className: `lt lt--${variant} ${className}`, onClick: () => ffRef.current?.(motion.reading.fastForward) },
    words.map((w, i) => (/^\s+$/.test(w) ? w : w ? <span key={i} className="lt__w">{w}</span> : null)),
  );
}

/** The one canvas every LightText draws its light on (mounted once, over the page). */
export function LightTextLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => {
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
    };
    size();
    window.addEventListener('resize', size);
    // one soft round mote, drawn once
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const d = dot.getContext('2d')!;
    const g = d.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,248,236,1)');
    g.addColorStop(0.25, 'rgba(255,214,170,0.75)');
    g.addColorStop(1, 'rgba(255,160,150,0)');
    d.fillStyle = g;
    d.fillRect(0, 0, 32, 32);
    // the same mote as gilt ink, for words written on paper
    const inkDot = document.createElement('canvas');
    inkDot.width = inkDot.height = 32;
    const di = inkDot.getContext('2d')!;
    const gi = di.createRadialGradient(16, 16, 0, 16, 16, 16);
    gi.addColorStop(0, 'rgba(176,118,58,0.95)');
    gi.addColorStop(0.35, 'rgba(196,140,80,0.55)');
    gi.addColorStop(1, 'rgba(210,160,110,0)');
    di.fillStyle = gi;
    di.fillRect(0, 0, 32, 32);
    let raf = 0;
    let running = false;
    const frame = (t: number) => {
      let now = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const real = now;
      for (const gr of groups) {
        now = gr.ff !== undefined ? gr.ff + (real - gr.ff) * (gr.speed ?? 1) : real;
        if (real > gr.until) {
          groups.delete(gr);
          continue;
        }
        ctx.globalCompositeOperation = gr.ink ? 'source-over' : 'lighter';
        const sprite = gr.ink ? inkDot : dot;
        for (const l of gr.lines) {
          const k = Math.min(1, Math.max(0, (now - l.t0) / l.dur));
          if (k <= 0) continue;
          const a = 1 - Math.min(1, Math.max(0, (now - l.t0 - l.dur - 900) / l.fade));
          if (a <= 0) continue;
          ctx.strokeStyle = `rgba(255,220,190,${0.32 * a})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(l.a[0], l.a[1]);
          ctx.lineTo(l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k);
          ctx.stroke();
        }
        for (const m of gr.motes) {
          const u = (now - m.t0) / m.dur;
          if (u < 0) continue;
          const k = Math.min(1, u);
          const e = 1 - Math.pow(1 - k, 3);
          const iv = 1 - e;
          let x = iv * iv * m.sx + 2 * iv * e * m.cx + e * e * m.tx;
          let y = iv * iv * m.sy + 2 * iv * e * m.cy + e * e * m.ty;
          const after = now - m.t0 - m.dur;
          let a = k < 1 ? 0.35 + 0.65 * k : after < m.hold ? 1 : 1 - (after - m.hold) / m.fade;
          if (m.fall) {
            const s = Math.max(0, after) / 1000;
            y += m.fall * s * s * 2;
            x += Math.sin(s * 6 + m.sx) * 3;
          }
          if (a <= 0) continue;
          a = Math.min(1, a);
          const r = m.size * (k < 1 ? 1.6 - 0.6 * k : 1) * 2.4;
          ctx.globalAlpha = a * 0.9;
          ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        }
        for (const p of gr.pens) {
          const P = p.path;
          if (!P.length || now < P[0].t || now > p.end) continue;
          let j = 1;
          while (j < P.length && P[j].t < now) j++;
          const A = P[Math.min(j - 1, P.length - 1)];
          const B = P[Math.min(j, P.length - 1)];
          const k = B.t > A.t ? Math.min(1, (now - A.t) / (B.t - A.t)) : 1;
          const x = A.x + (B.x - A.x) * k;
          const y = A.y + (B.y - A.y) * k;
          const fade = Math.min(1, (p.end - now) / 200);
          ctx.globalAlpha = 0.95 * fade;
          ctx.drawImage(sprite, x - 9, y - 9, 18, 18);
          ctx.globalAlpha = 0.5 * fade;
          ctx.drawImage(sprite, x - 22, y - 5, 18, 10);
        }
      }
      ctx.globalAlpha = 1;
      if (groups.size) raf = requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, c.width, c.height);
        running = false;
      }
    };
    wake = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    if (groups.size) wake();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      wake = null;
    };
  }, []);
  return <canvas ref={ref} className="light-text-layer" aria-hidden="true" />;
}
