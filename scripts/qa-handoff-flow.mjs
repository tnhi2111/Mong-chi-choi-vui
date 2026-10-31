/**
 * W2 — one touch, one slow, soft movement from the gift to the page. For each gift:
 *
 *  1. RECORD (no screenshots — they stall frames): every animation frame in the page, the 3D
 *     sheet's four corners on screen (`__carrier.quad`), the page's corners (its matrix3d),
 *     when it is handed over and when its words start, and the sheet shader's uniforms.
 *     Judged:
 *      • the flight (sheet on screen → handed over) lasts 3.2–4.6 s;
 *      • touch → first words starting 4.5–6.8 s (the first line reads ≈ 1 s later: ~5.5–7 s);
 *      • it never stands still: from 0.35 s after it appears (it lifts off slowly) until it
 *        lies flat (85 % of the flight) its centre never slows under 5 % of its top speed;
 *        then it comes in slowly, but no 150 ms pass without movement before the words start;
 *      • (the puppy performs its delivery first: its touch → words is reported, ≤ 8.5 s);
 *      • the handoff: the page's first frame lies on the sheet's last corners (≤ 2 px), and
 *        the speed carries on (0.4–2.5 × across the cut);
 *      • no fold: the sheet's surface is rebuilt from the recorded uniforms (a mirror of
 *        PaperCarrier's vertex shader) on its 24 × 48 grid; no two neighbouring normals
 *        are more than 25° apart, at any recorded frame.
 *  2. FILM (separate run): ≥ 16 frames from the touch to the page, timestamps in the names.
 *
 *   node scripts/qa-handoff-flow.mjs [--gpu] [--size=1440x900] [--mobile] [--only=1,2,3,4,5] [--nofilm]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const film = !process.argv.includes('--nofilm');
const only = arg('only', '1,2,3,4,5').split(',').map(Number);
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/handoff-flow-${W}x${H}${mobile ? 'm' : ''}`;
mkdirSync(out, { recursive: true });
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const problems = [];
const notes = [];
const summary = [];

async function room() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
  await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(2500);
  return { ctx, p };
}

/** In the page: record every frame until the page has been still for a while. */
function startRecording() {
  const rec = [];
  window.__rec = rec;
  const t0 = performance.now();
  let mat = null;
  const leafQuad = () => {
    const el = document.querySelector('.leaf');
    if (!el) return null;
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const m = /matrix3d\(([^)]+)\)/.exec(el.style.transform);
    const pts = [[0, 0], [w, 0], [w, h], [0, h]];
    if (!m) return pts.map(([x, y]) => [left + x, top + y]);
    const a = m[1].split(',').map(Number);
    return pts.map(([x, y]) => {
      const X = a[0] * x + a[4] * y + a[12];
      const Y = a[1] * x + a[5] * y + a[13];
      const Wh = a[3] * x + a[7] * y + a[15];
      return [left + X / Wh, top + Y / Wh];
    });
  };
  const tick = () => {
    const c = window.__carrier;
    if (!mat) window.__scene?.traverse((o) => { if (!mat && o.material?.uniforms?.uFoldB && o.material.uniforms.uMode) mat = o.material; });
    const u = mat?.uniforms;
    rec.push({
      t: performance.now() - t0,
      live: !!c?.live,
      handed: !!c?.handed,
      quad: c?.quad ? c.quad.map(([x, y]) => [x, y]) : null,
      leaf: leafQuad(),
      inked: !!document.querySelector('.leaf.is-inked'),
      u: u ? { fold: u.uFold.value, foldB: u.uFoldB.value, mode: u.uMode.value, aspect: u.uAspect.value, flutter: u.uFlutter.value, wind: u.uWind.value, curl: u.uCurl.value, time: u.uTime.value } : null,
    });
    if (performance.now() - t0 < 14000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** A mirror of PaperCarrier's vertex shader: the sheet's local surface for these uniforms. */
function surface(u, nx = 24, ny = 48) {
  const pts = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const px = i / nx - 0.5;
      const py = 0.5 - j / ny;
      let x = px;
      let y = py;
      let z = 0;
      if (u.mode > 0.5 && u.mode < 2.5) {
        const k = u.fold * (5.2 + 0.8 * u.foldB);
        const yy = py + 0.12 * u.fold;
        if (k > 1e-3) {
          y = Math.sin(yy * k) / k - 0.12 * u.fold;
          z = (1 - Math.cos(yy * k)) / k;
        }
      } else if (u.mode > 2.5 && u.mode < 3.5) {
        const s = py + 0.5;
        const lu = 1 - u.fold;
        if (s > lu) {
          const r = 0.07 / Math.max(u.aspect, 0.4);
          const phi = (s - lu) / r;
          const rr = r * (1 + phi * 0.012);
          y = lu - 0.5 + rr * Math.sin(phi);
          z = rr * (1 - Math.cos(phi));
        }
      } else if (u.mode > 3.5) {
        const uu = px + 0.5;
        z = u.fold * 0.22 * uu * uu;
        x -= u.fold * 0.06 * uu * uu;
      }
      const tail = 0.35 + 0.65 * smooth(0.3, -0.5, py);
      z += u.flutter * 0.022 * tail * Math.sin(py * 5 - u.time * 2.1 + px * 1.5) * (0.7 + 0.3 * Math.sin(px * 3 + u.time * 1.3));
      const edgeK = smooth(0.28, 0.5, Math.max(Math.abs(px), Math.abs(y)));
      z += u.wind * edgeK * (0.012 * Math.sin(px * 9 + u.time * 3.7) * Math.sin(y * 7 + u.time * 2.9) + 0.008 * Math.sin(u.time * 1.9 + px * 3 + y * 2));
      z += u.curl * 0.05 * (1 - 4 * y * y) * (1 - 1.6 * px * px);
      // (the mesh is scaled to height × aspect by height)
      pts.push([x * u.aspect, y, z]);
    }
  return { pts, nx, ny };
}
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** The largest angle (deg) between the normals of two neighbouring cells of the surface. */
function maxBend(u) {
  const { pts, nx, ny } = surface(u);
  const P = (i, j) => pts[j * (nx + 1) + i];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
  const N = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) N.push(norm(cross(sub(P(i + 1, j), P(i, j)), sub(P(i, j + 1), P(i, j)))));
  const n = (i, j) => N[j * nx + i];
  let worst = 0;
  const ang = (a, b) => (Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) worst = Math.max(worst, ang(n(i, j), n(i + 1, j)));
      if (j + 1 < ny) worst = Math.max(worst, ang(n(i, j), n(i, j + 1)));
    }
  return worst;
}
const centre = (q) => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];

for (const n of only) {
  // ── 1. record ──
  {
    const { ctx, p } = await room();
    await p.evaluate(startRecording);
    await p.locator('.gift-nav__btn').nth(n - 1).click();
    await p.waitForTimeout(13500);
    const rec = await p.evaluate(() => window.__rec);
    await ctx.close();
    writeFileSync(`${out}/g${n}-record.json`, JSON.stringify(rec));
    // the frames: the sheet while it flies, then the page
    const tShow = rec.find((r) => r.live && r.quad)?.t;
    const iHand = rec.findIndex((r) => r.handed);
    const tHand = iHand >= 0 ? rec[iHand].t : undefined;
    const tInk = rec.find((r) => r.inked)?.t;
    const g = { gift: n };
    if (tShow === undefined || tHand === undefined) {
      problems.push(`gift ${n}: the sheet never ${tShow === undefined ? 'appeared' : 'reached the page'}`);
      summary.push(g);
      continue;
    }
    g.flightS = +((tHand - tShow) / 1000).toFixed(2);
    g.touchToWordsS = tInk ? +(tInk / 1000).toFixed(2) : null;
    if (g.flightS < 3.2 || g.flightS > 4.6) problems.push(`gift ${n}: the flight takes ${g.flightS} s (3.2–4.6)`);
    if (!tInk) problems.push(`gift ${n}: the words never start`);
    // (the puppy first performs its delivery — the letter dropped, the seal cracked, the letter
    //  slid out — before its sheet can fly: a known, reported deviation, not hidden)
    else if (n === 5 && g.touchToWordsS <= 8.5) notes.push(`gift 5 (the puppy): touch → words in ${g.touchToWordsS} s — its delivery performance comes first`);
    else if (g.touchToWordsS < 4.5 || g.touchToWordsS > 6.8) problems.push(`gift ${n}: touch → words in ${g.touchToWordsS} s (4.5–6.8)`);
    // the path of its centre: the sheet before the handoff, the page after
    const path = rec
      .map((r) => ({ t: r.t, q: r.handed ? r.leaf : r.live ? r.quad : null, handed: r.handed }))
      .filter((r) => r.q && r.t >= tShow);
    const speed = [];
    for (let i = 1; i < path.length; i++) {
      const dt = (path[i].t - path[i - 1].t) / 1000;
      if (dt <= 0) continue;
      const a = centre(path[i - 1].q);
      const b = centre(path[i].q);
      // (size counts as movement too: the sheet grows as it comes)
      const s0 = Math.hypot(path[i - 1].q[1][0] - path[i - 1].q[0][0], path[i - 1].q[1][1] - path[i - 1].q[0][1]);
      const s1 = Math.hypot(path[i].q[1][0] - path[i].q[0][0], path[i].q[1][1] - path[i].q[0][1]);
      speed.push({ t: path[i].t, v: (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.abs(s1 - s0) * 0.5) / dt, handed: path[i].handed, dt });
    }
    // smoothed over ~100 ms (a single late frame is not a stop)
    const sm = speed.map((s, i) => {
      const win = speed.filter((x) => Math.abs(x.t - s.t) <= 50);
      return { ...s, v: win.reduce((a, x) => a + x.v, 0) / win.length };
    });
    const peak = Math.max(...sm.map((s) => s.v));
    // it settles once it lies flat (85 % of the flight): until then it never slows under 5 % of
    // its top speed; after that it may come in very slowly (the brief asks for it) — but it
    // never freezes: no 150 ms without movement until the words start
    const tFlat = tShow + (tHand - tShow) * (0.85 / 0.92);
    const flying = sm.filter((s) => s.t > tShow + 350 && s.t < tFlat);
    const slow = flying.filter((s) => s.v < peak * 0.05);
    g.peakPxS = Math.round(peak);
    g.slowestPct = +((Math.min(...flying.map((s) => s.v)) / peak) * 100).toFixed(1);
    if (slow.length) problems.push(`gift ${n}: it nearly stops (${slow.length} frames under 5 % of its top speed, first at ${Math.round(slow[0].t - tShow)} ms into the flight)`);
    let still = 0;
    let longest = 0;
    for (const s of speed.filter((x) => x.t > tShow + 350 && x.t < (tInk ?? tHand + 700))) {
      still = s.v < 0.5 ? still + s.dt * 1000 : 0;
      longest = Math.max(longest, still);
    }
    g.longestStillMs = Math.round(longest);
    if (longest >= 150) problems.push(`gift ${n}: it stands still for ${Math.round(longest)} ms before the words come`);
    // the handoff
    const before = rec[iHand - 1];
    const first = rec[iHand];
    if (before?.quad && first?.leaf) {
      const err = Math.max(...first.leaf.map(([x, y], i) => Math.hypot(x - before.quad[i][0], y - before.quad[i][1])));
      // (the sheet moved on during that one frame: compare with its corners in the handoff frame)
      const errNow = first.quad ? Math.max(...first.leaf.map(([x, y], i) => Math.hypot(x - first.quad[i][0], y - first.quad[i][1]))) : err;
      g.handoffPx = +Math.min(err, errNow).toFixed(2);
      if (g.handoffPx > 2) problems.push(`gift ${n}: the page lands ${g.handoffPx} px off the sheet`);
    }
    const vb = sm.filter((s) => !s.handed && s.t <= tHand).slice(-3);
    const va = sm.filter((s) => s.handed && s.t > tHand).slice(0, 3);
    if (vb.length && va.length) {
      const r = va.reduce((a, x) => a + x.v, 0) / va.length / (vb.reduce((a, x) => a + x.v, 0) / vb.length);
      g.speedAcrossCut = +r.toFixed(2);
      g.handSpeedPct = +((vb[vb.length - 1].v / peak) * 100).toFixed(1);
      if (r < 0.4 || r > 2.5) problems.push(`gift ${n}: the speed jumps ×${r.toFixed(2)} at the handoff`);
    }
    // no fold, at any frame
    let bend = 0;
    for (const r of rec) if (r.u && r.live && !r.handed) bend = Math.max(bend, maxBend(r.u));
    g.maxBendDeg = +bend.toFixed(1);
    if (bend > 25) problems.push(`gift ${n}: the sheet bends ${bend.toFixed(1)}° between neighbouring cells — a fold`);
    summary.push(g);
    console.log(JSON.stringify(g));
  }

  // ── 2. film ──
  if (film) {
    const { ctx, p } = await room();
    const dir = `${out}/g${n}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // (a screencast: the compositor's own frames, without stalling the page as screenshots do;
    //  every 3rd frame is kept, with its time since the touch in the name)
    const cdp = await ctx.newCDPSession(p);
    let t0 = 0;
    let i = 0;
    let k = 0;
    cdp.on('Page.screencastFrame', (f) => {
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (!t0 || k++ % 3) return;
      const ms = Math.round(f.metadata.timestamp * 1000 - t0);
      if (ms >= 0) writeFileSync(`${dir}/f-${String(i++).padStart(3, '0')}_${String(ms).padStart(5, '0')}ms.jpg`, Buffer.from(f.data, 'base64'));
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: W, maxHeight: H });
    t0 = Date.now();
    await p.locator('.gift-nav__btn').nth(n - 1).click();
    await p.locator('.leaf.is-inked').waitFor({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1800);
    await cdp.send('Page.stopScreencast').catch(() => {});
    if (i < 16) problems.push(`gift ${n}: only ${i} frames filmed`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
notes.forEach((x) => console.log('⚠ ' + x));
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ every gift lets its page float out in one soft movement');
process.exit(problems.length ? 1 : 0);
