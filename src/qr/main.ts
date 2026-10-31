/**
 * The QR card — open /qr.html, then print it or download the PNG / SVG.
 * The URL comes ONLY from birthdayConfig.siteUrl (through `qrModules()` in code.ts, the one
 * place the code is made — the page, the PNG, the SVG and the print sheet all draw from it).
 *
 * Scannability rules (code.ts): dark on light ≥ 7:1, error correction H, a clean quiet zone of
 * 4 modules, NOTHING drawn over the code or its quiet zone, the code always flat and square.
 * All the depth lives around it: four planes — the night (stars, champagne bokeh), the heart
 * of light, the plate the code sits on, and a little foreground dust — that move apart under
 * her pointer or the phone's tilt (≤ 6°). The plate only ever slides, never tilts.
 */
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/be-vietnam-pro/400.css';
import './qr.css';
import { INK, PAPER, QUIET, codeSvg, contrast, drawCode, modulesPath, qrModules } from './code';
import { drawHeart, makeHeart, type HeartPoint } from './heart';

/** Timings of the way in (s). Why: the light gathers first (the heart is the welcome), the
 *  plate condenses out of that light, and the code is the last thing — the reason she came. */
const T = { gather: 2.6, plateAt: 1.9, plate: 1.0, codeAt: 2.7, code: 0.6 };
/** Parallax, px per unit of pointer (−1…1), per plane; the heart also turns ≤ 6° */
const DEPTH = { sky: 7, heart: 13, plate: 4, edge: -3, dust: 24, turn: 0.1 };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = innerWidth < 640;

const SCAN = 'Scan me ❤';
const LINE = 'Something special is waiting for you…';
const EYEBROW = 'for you — and only you';
/** the 2D heart outline (400 × 400 artboard), for the print sheet's engraving */
const HEART2D =
  'M200 368C84 292 22 226 22 150 22 90 66 44 124 44 158 44 186 62 200 90 214 62 242 44 276 44 334 44 378 90 378 150 378 226 316 292 200 368Z';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function render() {
  const root = document.getElementById('qr-root')!;
  const url = qrModules().url;

  // ── the scene ─────────────────────────────────────────────────────────────
  const scene = el('div', 'qr-scene');
  const sky = el('canvas', 'qr-layer qr-layer--sky') as HTMLCanvasElement;
  const heartC = el('canvas', 'qr-layer qr-layer--heart') as HTMLCanvasElement;
  const stage = el('div', 'qr-stage');
  const plate = el(
    'div',
    'qr-plate',
    `<div class="qr-plate__shadow" aria-hidden="true"></div>
     <div class="qr-plate__edge" aria-hidden="true"></div>
     <div class="qr-plate__face">
       <div class="qr-plate__code">${codeSvg()}</div>
       <p class="qr-plate__scan">${SCAN}</p>
     </div>`,
  );
  stage.append(plate);
  const dust = el('canvas', 'qr-layer qr-layer--dust') as HTMLCanvasElement;
  scene.append(sky, heartC, dust);

  const copy = el(
    'section',
    'qr-copy',
    `<p class="qr-copy__eyebrow">${EYEBROW}</p>
     <p class="qr-copy__line">${LINE}</p>
     <div class="qr-copy__actions no-print">
       <button type="button" data-act="png">Download PNG</button>
       <label class="qr-copy__ground"><input type="checkbox" data-act="light"> light background</label>
       <button type="button" data-act="svg">Download SVG</button>
       <button type="button" data-act="print">Print</button>
     </div>
     <p class="qr-copy__url no-print">Points to: <code></code><br/><small>Change it in <code>src/config/birthday.ts → siteUrl</code></small></p>`,
  );
  copy.querySelector('.qr-copy__url code')!.textContent = url;

  // the print sheet: its own design for paper (cream, little ink, a still engraved heart)
  const sheet = el(
    'div',
    'qr-print',
    `<svg class="qr-print__heart" viewBox="0 0 400 400" aria-hidden="true">
       <path d="${HEART2D}" fill="none" stroke="#9c4a5e" stroke-width="2.2"/>
       <path d="${HEART2D}" fill="none" stroke="#c98d9a" stroke-width="0.9" transform="translate(200 206) scale(.93) translate(-200 -206)"/>
       <path d="${HEART2D}" fill="none" stroke="#c98d9a" stroke-width="0.8" stroke-dasharray="0.5 7" stroke-linecap="round" transform="translate(200 206) scale(.86) translate(-200 -206)"/>
     </svg>
     <div class="qr-print__code">${codeSvg()}</div>
     <p class="qr-print__scan">${SCAN}</p>
     <p class="qr-print__line">${LINE}</p>`,
  );
  // the night and the heart are the room the card stands in (fixed, the whole screen); the
  // card and its words stand in front, in the page
  const front = el('div', 'qr-front');
  front.append(stage, copy);
  root.append(scene, front, sheet);

  // ── sizes ─────────────────────────────────────────────────────────────────
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const fit = () => {
    W = scene.clientWidth;
    H = scene.clientHeight;
    // the code at a WHOLE number of px per module (crisp at any size, never resampled)
    const n = qrModules().size + QUIET * 2;
    const box = plate.querySelector('.qr-plate__code') as HTMLElement;
    // (on a phone the card is smaller, so the heart reads round it)
    const want = Math.min(260, innerWidth * 0.46);
    const mod = Math.max(2, Math.floor((want * dpr) / n));
    box.style.width = `${(mod * n) / dpr}px`;
    for (const c of [sky, heartC, dust]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
  };
  fit();
  window.addEventListener('resize', () => {
    fit();
    if (reduce) frame(performance.now());
  });

  // ── the night: stars and champagne bokeh (drawn each frame, cheap) ────────
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: phone ? 90 : 170 }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.1, p: rnd() * 6 }));
  const bokeh = Array.from({ length: phone ? 9 : 14 }, () => ({ x: rnd(), y: rnd(), r: 24 + rnd() * 70, p: rnd() * 6, a: 0.05 + rnd() * 0.08 }));
  const motes = Array.from({ length: phone ? 14 : 24 }, () => ({ x: rnd(), y: rnd(), r: 1.4 + rnd() * 2.6, v: 0.004 + rnd() * 0.008, p: rnd() * 6 }));
  const heart: HeartPoint[] = makeHeart(phone ? 1700 : 3600);

  // ── her pointer / the phone's tilt → parallax ─────────────────────────────
  const aim = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e: PointerEvent) => {
    aim.tx = (e.clientX / innerWidth) * 2 - 1;
    aim.ty = (e.clientY / innerHeight) * 2 - 1;
  });
  window.addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    aim.tx = Math.max(-1, Math.min(1, e.gamma / 25));
    aim.ty = Math.max(-1, Math.min(1, (e.beta - 40) / 25));
  });

  // ── the way in (a touch brings it to its end) ─────────────────────────────
  let t0 = performance.now() - (reduce ? 1e6 : 0);
  window.addEventListener('pointerdown', () => {
    const t = (performance.now() - t0) / 1000;
    if (t < T.codeAt + T.code) t0 = performance.now() - (T.codeAt + T.code) * 1000;
  });

  /** the plate's rect on screen, grown by a margin: nothing of the dust may enter it */
  const keepOut = () => {
    const r = plate.getBoundingClientRect();
    const m = 18;
    return { x0: r.left - m, y0: r.top - m, x1: r.right + m, y1: r.bottom + m };
  };

  const ss = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };

  function frame(now: number) {
    const t = (now - t0) / 1000;
    aim.x += (aim.tx - aim.x) * 0.05;
    aim.y += (aim.ty - aim.y) * 0.05;
    const ax = reduce ? 0 : aim.x;
    const ay = reduce ? 0 : aim.y;

    // planes slide apart (the plate only slides: the code stays flat and square)
    sky.style.transform = `translate3d(${-ax * DEPTH.sky}px, ${-ay * DEPTH.sky}px, 0)`;
    heartC.style.transform = `translate3d(${-ax * DEPTH.heart}px, ${-ay * DEPTH.heart}px, 0)`;
    stage.style.transform = `translate3d(${ax * DEPTH.plate}px, ${ay * DEPTH.plate}px, 0)`;
    plate.style.setProperty('--edge-x', `${ax * DEPTH.edge}px`);
    plate.style.setProperty('--edge-y', `${ay * DEPTH.edge}px`);
    dust.style.transform = `translate3d(${ax * DEPTH.dust}px, ${ay * DEPTH.dust}px, 0)`;

    // the plate condenses out of the light, then the code
    const pk = ss(T.plateAt, T.plateAt + T.plate, t);
    const ck = ss(T.codeAt, T.codeAt + T.code, t);
    plate.style.setProperty('--condense', pk.toFixed(3));
    plate.style.setProperty('--code', ck.toFixed(3));
    plate.classList.toggle('is-ready', ck >= 1);

    // the night
    const gs = sky.getContext('2d')!;
    gs.setTransform(dpr, 0, 0, dpr, 0, 0);
    gs.clearRect(0, 0, W, H);
    const bg = gs.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#3a1220');
    bg.addColorStop(0.55, '#1c0910');
    bg.addColorStop(1, '#0b0507');
    gs.fillStyle = bg;
    gs.fillRect(0, 0, W, H);
    gs.globalCompositeOperation = 'lighter';
    for (const b of bokeh) {
      const a = b.a * (0.7 + 0.3 * Math.sin(t * 0.4 + b.p));
      const gr = gs.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r);
      gr.addColorStop(0, `rgba(240,206,160,${a})`);
      gr.addColorStop(0.7, `rgba(240,206,160,${a * 0.6})`);
      gr.addColorStop(1, 'rgba(240,206,160,0)');
      gs.fillStyle = gr;
      gs.fillRect(b.x * W - b.r, b.y * H - b.r, b.r * 2, b.r * 2);
    }
    for (const st of stars) {
      gs.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + st.p);
      gs.fillStyle = '#fbe9dc';
      gs.beginPath();
      gs.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      gs.fill();
    }
    gs.globalAlpha = 1;
    gs.globalCompositeOperation = 'source-over';

    // the heart, behind the plate (the plate's face covers whatever lies behind the code)
    const gh = heartC.getContext('2d')!;
    gh.setTransform(1, 0, 0, 1, 0, 0);
    gh.clearRect(0, 0, heartC.width, heartC.height);
    const pr = plate.getBoundingClientRect();
    const sceneR = scene.getBoundingClientRect();
    const hs = Math.min(W * 1.05, H * 0.74, pr.width * 2.15);
    drawHeart(gh, heart, {
      cx: (pr.left + pr.width / 2 - sceneR.left) * dpr,
      cy: (pr.top + pr.height * 0.5 - sceneR.top) * dpr,
      size: hs * dpr,
      t,
      gather: reduce ? 1 : ss(0, T.gather, t),
      yaw: ax * DEPTH.turn,
      pitch: ay * DEPTH.turn * 0.6,
      dpr,
      still: reduce,
    });

    // foreground dust — never over the plate (the code and its quiet zone are inside it)
    const gd = dust.getContext('2d')!;
    gd.setTransform(dpr, 0, 0, dpr, 0, 0);
    gd.clearRect(0, 0, W, H);
    const ko = keepOut();
    gd.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const y = ((m.y - t * m.v) % 1 + 1) % 1;
      const x = m.x + Math.sin(t * 0.3 + m.p) * 0.02;
      const X = x * W + ax * DEPTH.dust;
      const Y = y * H + ay * DEPTH.dust;
      const R = m.r * 3.2;
      // (on screen the dust layer is shifted by its parallax; test the real place)
      if (X + R > ko.x0 - sceneR.left && X - R < ko.x1 - sceneR.left && Y + R > ko.y0 - sceneR.top && Y - R < ko.y1 - sceneR.top) continue;
      const gr = gd.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
      const a = (0.25 + 0.2 * Math.sin(t + m.p)) * ss(0.5, 2, t);
      gr.addColorStop(0, `rgba(255,226,190,${a})`);
      gr.addColorStop(1, 'rgba(255,226,190,0)');
      gd.fillStyle = gr;
      gd.fillRect(x * W - R, y * H - R, R * 2, R * 2);
    }
    gd.globalCompositeOperation = 'source-over';
  }

  // run while she looks; rest while the tab is hidden; reduced motion: one still frame
  let raf = 0;
  const loop = (now: number) => {
    frame(now);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (reduce) frame(performance.now());
    else raf = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? cancelAnimationFrame(raf) : start()));
  void document.fonts.ready.then(start);
  start();

  // ── outputs (one generator for all three) ─────────────────────────────────
  const download = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  };
  const lightGround = () => (copy.querySelector('[data-act="light"]') as HTMLInputElement).checked;
  copy.querySelector('[data-act="png"]')!.addEventListener('click', async () => download(await posterPng(lightGround() ? 'light' : 'dark', 2048), 'scan-me.png'));
  copy.querySelector('[data-act="svg"]')!.addEventListener('click', () => {
    const href = URL.createObjectURL(new Blob([posterSvg(lightGround() ? 'light' : 'dark')], { type: 'image/svg+xml' }));
    download(href, 'scan-me.svg');
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  copy.querySelector('[data-act="print"]')!.addEventListener('click', () => window.print());

  // QA hooks (scripts/qa-qr.mjs)
  Object.assign(window, {
    __qr: {
      png: posterPng,
      svg: posterSvg,
      contrast: () => contrast(),
      /** the code + its quiet zone on screen (nothing may be drawn there) */
      codeRect: () => {
        const r = plate.querySelector('.qr-plate__code')!.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      },
      skip: () => (t0 = performance.now() - 1e6),
    },
  });
}

/**
 * The poster as a PNG, `width` px wide (2048 by default; 4:5): the night (or a cream ground),
 * the heart of light as a still, the plate and the code at a WHOLE number of pixels per module.
 */
async function posterPng(ground: 'dark' | 'light' = 'dark', width = 2048): Promise<string> {
  await document.fonts.ready;
  const Wp = width;
  const Hp = Math.round(width * 1.25);
  const c = document.createElement('canvas');
  c.width = Wp;
  c.height = Hp;
  const g = c.getContext('2d')!;
  const dark = ground === 'dark';
  const bg = g.createRadialGradient(Wp / 2, Hp * 0.42, 0, Wp / 2, Hp * 0.42, Hp * 0.75);
  if (dark) {
    bg.addColorStop(0, '#3a1220');
    bg.addColorStop(0.55, '#1c0910');
    bg.addColorStop(1, '#0b0507');
  } else {
    bg.addColorStop(0, '#fbf1ea');
    bg.addColorStop(1, '#efe0d6');
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, Wp, Hp);
  // the heart (a still frame of the same heart)
  const plateW = Wp * 0.46;
  const cx = Wp / 2;
  const plateY = Hp * 0.24;
  const m = qrModules();
  const n = m.size + QUIET * 2;
  const mod = Math.floor((plateW * 0.84) / n);
  const code = mod * n;
  const pad = Math.round((plateW - code) / 2);
  const plateH = code + pad * 2 + Math.round(Wp * 0.07);
  const pts = makeHeart(4200, 7);
  if (dark) drawHeart(g, pts, { cx, cy: plateY + plateH * 0.44, size: plateW * 1.85, t: 1.2, gather: 1, still: true, dpr: 1 });
  else {
    // (on a light ground the light would vanish: an engraved heart in rose ink instead)
    const p = new Path2D(HEART2D);
    g.save();
    const k = (plateW * 1.9) / 400;
    g.translate(cx - 200 * k, plateY + plateH * 0.44 - 215 * k);
    g.scale(k, k);
    g.strokeStyle = '#b8697b';
    g.lineWidth = 2.4;
    g.stroke(p);
    g.globalAlpha = 0.55;
    g.translate(200, 206);
    g.scale(0.93, 0.93);
    g.translate(-200, -206);
    g.lineWidth = 1;
    g.stroke(p);
    g.restore();
  }
  // the plate: its shadow, its edge (thickness), a dark gap ring, the light face, a rose rim
  const px = Math.round(cx - plateW / 2);
  const py = Math.round(plateY);
  const r = Math.round(Wp * 0.022);
  const rr = (x: number, y: number, w: number, h: number, rad: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, rad);
  };
  g.save();
  g.shadowColor = dark ? 'rgba(0,0,0,0.6)' : 'rgba(80,30,40,0.25)';
  g.shadowBlur = Wp * 0.04;
  g.shadowOffsetY = Wp * 0.018;
  rr(px, py + Wp * 0.008, plateW, plateH, r);
  g.fillStyle = dark ? '#c9b2a6' : '#d9c6bb';
  g.fill();
  g.restore();
  rr(px - Wp * 0.006, py - Wp * 0.006, plateW + Wp * 0.012, plateH + Wp * 0.012, r + Wp * 0.006);
  g.strokeStyle = dark ? 'rgba(10,3,6,0.9)' : 'rgba(120,60,70,0.25)';
  g.lineWidth = Wp * 0.004;
  g.stroke();
  rr(px, py, plateW, plateH, r);
  const face = g.createLinearGradient(px, py, px, py + plateH);
  face.addColorStop(0, '#fffdf9');
  face.addColorStop(1, '#f6ece4');
  g.fillStyle = face;
  g.fill();
  g.strokeStyle = 'rgba(232,140,160,0.75)';
  g.lineWidth = Wp * 0.0025;
  g.stroke();
  // the code, flat, on a clean paper square (its quiet zone included), whole-pixel modules
  drawCode(g, cx - code / 2, py + pad, mod);
  // the words
  g.textAlign = 'center';
  g.fillStyle = '#7a3546';
  g.font = `italic ${Math.round(Wp * 0.034)}px "Cormorant Garamond", Georgia, serif`;
  g.fillText(SCAN, cx, py + pad + code + Wp * 0.048);
  g.fillStyle = dark ? 'rgba(246,236,231,0.86)' : '#5b2433';
  g.font = `italic ${Math.round(Wp * 0.036)}px "Cormorant Garamond", Georgia, serif`;
  g.fillText(LINE, cx, Hp * 0.84);
  g.fillStyle = dark ? 'rgba(246,236,231,0.55)' : 'rgba(91,36,51,0.7)';
  g.font = `${Math.round(Wp * 0.012)}px "Be Vietnam Pro", system-ui, sans-serif`;
  g.letterSpacing = `${Math.round(Wp * 0.004)}px`;
  g.fillText(EYEBROW.toUpperCase(), cx, Hp * 0.15);
  return c.toDataURL('image/png');
}

/** The poster as an SVG: the same layout, the code as exact vector modules. */
function posterSvg(ground: 'dark' | 'light' = 'dark'): string {
  const m = qrModules();
  const n = m.size + QUIET * 2;
  const Wp = 1000;
  const Hp = 1250;
  const dark = ground === 'dark';
  const plateW = 460;
  const code = 386;
  const mod = code / n;
  const pad = (plateW - code) / 2;
  const plateH = code + pad * 2 + 70;
  const px = (Wp - plateW) / 2;
  const py = 300;
  const k = (plateW * 1.9) / 400;
  const hx = Wp / 2 - 200 * k;
  const hy = py + plateH * 0.44 - 215 * k;
  // a few hundred motes of the still heart, as circles (vector light)
  const pts = makeHeart(700, 7);
  const scale = (plateW * 1.85) / 2.3;
  const motes = pts
    .map((p) => {
      const x = Wp / 2 + p.x * scale;
      const y = py + plateH * 0.44 - (p.y - 0.12) * scale;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(p.shell ? 2.2 : 1.6).toFixed(1)}" fill="${p.hue < 0.6 ? '#f6a8ba' : '#ffd2aa'}" fill-opacity="${p.shell ? 0.75 : 0.35}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wp} ${Hp}" width="${Wp}" height="${Hp}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">${dark ? '<stop offset="0" stop-color="#3a1220"/><stop offset=".55" stop-color="#1c0910"/><stop offset="1" stop-color="#0b0507"/>' : '<stop offset="0" stop-color="#fbf1ea"/><stop offset="1" stop-color="#efe0d6"/>'}</radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d66884" stop-opacity="${dark ? 0.35 : 0.12}"/><stop offset="1" stop-color="#5a1428" stop-opacity="0"/></radialGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#f6ece4"/></linearGradient>
  </defs>
  <rect width="${Wp}" height="${Hp}" fill="url(#bg)"/>
  <circle cx="${Wp / 2}" cy="${py + plateH * 0.44}" r="${plateW * 0.95}" fill="url(#halo)"/>
  ${dark ? `<g>${motes}</g>` : ''}
  <path d="${HEART2D}" transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)}) scale(${k.toFixed(4)})" fill="none" stroke="${dark ? '#f1b3c2' : '#b8697b'}" stroke-opacity="${dark ? 0.35 : 1}" stroke-width="${(2.2 / k).toFixed(2)}"/>
  <rect x="${px}" y="${py + 8}" width="${plateW}" height="${plateH}" rx="22" fill="${dark ? '#c9b2a6' : '#d9c6bb'}"/>
  <rect x="${px - 6}" y="${py - 6}" width="${plateW + 12}" height="${plateH + 12}" rx="28" fill="none" stroke="${dark ? '#0a0306' : '#784046'}" stroke-opacity="${dark ? 0.9 : 0.25}" stroke-width="4"/>
  <rect x="${px}" y="${py}" width="${plateW}" height="${plateH}" rx="22" fill="url(#face)" stroke="#e88ca0" stroke-opacity=".75" stroke-width="2.5"/>
  <g transform="translate(${Wp / 2 - code / 2} ${py + pad}) scale(${mod})" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${PAPER}"/><path d="${modulesPath(m)}" fill="${INK}"/></g>
  <text x="${Wp / 2}" y="${py + pad + code + 48}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="34" fill="#7a3546">${SCAN}</text>
  <text x="${Wp / 2}" y="${Hp * 0.84}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="36" fill="${dark ? '#f6ece7' : '#5b2433'}" fill-opacity="${dark ? 0.86 : 1}">${LINE}</text>
  <text x="${Wp / 2}" y="${Hp * 0.15}" text-anchor="middle" font-family="Be Vietnam Pro, system-ui, sans-serif" font-size="12" letter-spacing="4" fill="${dark ? '#f6ece7' : '#5b2433'}" fill-opacity=".6">${EYEBROW.toUpperCase()}</text>
</svg>`;
}

render();
