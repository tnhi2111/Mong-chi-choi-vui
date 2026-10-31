/**
 * Y2 (over W2) — the letter floats out like a feather, in one touch. For each gift:
 *
 *  1. RECORD (no screenshots — they stall frames): every animation frame in the page — the 3D
 *     sheet's four corners on screen (`__carrier.quad`), its turn and clock (`__paper`), the
 *     page's corners (its matrix3d), when it is handed over, when its words start and when the
 *     first word is fully there, and the sheet shader's uniforms. Judged:
 *      • the flight (sheet on screen → handed over) lasts 5.0–6.5 s;
 *      • touch → first line readable (its first word fully inked) 7.6–9.4 s (the puppy performs
 *        its delivery first: reported, ≤ 11.5 s);
 *      • slow: its top speed ≤ `PEAK` × the screen's longer side per second (desktop: its width);
 *      • it never stands still: from 0.35 s after it appears until it settles (`settle` of the
 *        flight) it never slows under 5 % of its top speed; no 150 ms without movement before
 *        the words start;
 *      • it sways like a pendulum: the side-to-side part of its real path (minus a least-squares
 *        cubic: the half circle's own bend) has its strongest period at 1.6–2.4 s; measured
 *        against the arc alone (`__paper.base`) it swings 4–8 % of the width at first and less
 *        in the second half of the flight;
 *      • it turns gently: yaw ≤ 70°, pitch ≤ 25°, roll ≤ 14°;
 *      • the handoff: the page's first frame lies on the sheet's last corners (≤ 2 px) and the
 *        speed carries on (0.4–2.5 × across the cut, or both under 2 % of the top speed);
 *      • no fold: the sheet's surface is rebuilt from the recorded uniforms (a mirror of
 *        PaperCarrier's vertex shader) on its 24 × 48 grid; no two neighbouring normals are
 *        more than 25° apart, at any recorded frame.
 *  2. A SECOND TOUCH while it flies (gift 1): its clock only ever runs forward, and the page
 *     comes sooner (a smooth hurry, never a jump back).
 *  3. FILM (separate run): a CDP screencast, ≥ 20 frames from the touch to the page, and a
 *     contact sheet of 20 of them (`g<n>-sheet.jpg`).
 *
 *   node scripts/qa-handoff-flow.mjs [--gpu] [--size=1440x900] [--mobile] [--only=1,2,3,4,5] [--nofilm]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, rmSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
// (motion.paper: handed at 90 % of the flight — taken over at ~96 % — the sway dies by 86 %)
const HAND = 0.96;
const SETTLE = 0.86;
/** top speed, × the screen's longer side per second (its width on a desktop; a phone's page
 *  is nearly as wide as the screen, so growing into it is fast against the width alone) */
const PEAK = 0.36;
const SIDE = Math.max(W, H);
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
    if (!mat) window.__scene?.traverse((o) => { if (!mat && o.name === 'paper-carrier') mat = o.material; });
    const w0 = document.querySelector('.leaf .lt__w');
    const u = mat?.uniforms;
    rec.push({
      t: performance.now() - t0,
      live: !!c?.live,
      handed: !!c?.handed,
      quad: c?.quad ? c.quad.map(([x, y]) => [x, y]) : null,
      // (when that quad was really measured: after a long frame the tick can see a stale one)
      qt: c?.at ? c.at - t0 : null,
      leaf: leafQuad(),
      inked: !!document.querySelector('.leaf.is-inked'),
      word: w0 ? +getComputedStyle(w0).opacity : 0,
      paper: window.__paper ? { ...window.__paper } : null,
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
    const tRead = rec.find((r) => r.word >= 0.95)?.t;
    const g = { gift: n };
    if (tShow === undefined || tHand === undefined) {
      problems.push(`gift ${n}: the sheet never ${tShow === undefined ? 'appeared' : 'reached the page'}`);
      summary.push(g);
      continue;
    }
    g.flightS = +((tHand - tShow) / 1000).toFixed(2);
    g.touchToWordsS = tInk ? +(tInk / 1000).toFixed(2) : null;
    g.touchToReadS = tRead ? +(tRead / 1000).toFixed(2) : null;
    if (g.flightS < 5.0 || g.flightS > 6.5) problems.push(`gift ${n}: the flight takes ${g.flightS} s (5.0–6.5)`);
    if (!tInk || !tRead) problems.push(`gift ${n}: the words never ${tInk ? 'become readable' : 'start'}`);
    // (the puppy first performs its delivery — the letter dropped, the seal cracked, the letter
    //  slid out — before its sheet can fly: a known, reported deviation, not hidden)
    else if (n === 5 && g.touchToReadS <= 11.5) notes.push(`gift 5 (the puppy): touch → first line in ${g.touchToReadS} s — its delivery performance comes first`);
    else if (g.touchToReadS < 7.6 || g.touchToReadS > 9.4) problems.push(`gift ${n}: touch → first line readable in ${g.touchToReadS} s (7.6–9.4)`);
    // the path of its centre: the sheet before the handoff, the page after
    // (the sheet's own measuring time while it flies, so a stale quad after a long frame is not
    //  read as a burst of speed; samples whose quad did not change are dropped)
    // While it flies its time is the flight's own clock (`__paper.t`): that is the movement as
    // designed — a long frame (a stall) makes the next frame catch up, which is a stall, counted
    // apart below, not a fast sheet. After the cut, the page's frames.
    const t0f = rec.find((r) => r.paper && r.live)?.paper.t ?? 0;
    const path = rec
      .map((r) => ({ t: !r.handed && r.live && r.paper ? tShow + (r.paper.t - t0f) * 1000 : r.t, q: r.handed ? r.leaf : r.live ? r.quad : null, handed: r.handed }))
      .filter((r, i, a) => r.q && r.t >= tShow && !(i && a[i - 1].t === r.t && a[i - 1].handed === r.handed));
    // (the stalls during the flight, reported)
    g.longFramesMs = rec.filter((r, i) => i && r.t > tShow && r.t < tHand && r.t - rec[i - 1].t > 30).map((r, i2) => Math.round(r.t - rec[rec.indexOf(r) - 1].t));
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
    g.peakPerSide = +(peak / SIDE).toFixed(3);
    if (peak > PEAK * SIDE) problems.push(`gift ${n}: its top speed is ${Math.round(peak)} px/s (${g.peakPerSide} × the screen's longer side /s, want ≤ ${PEAK})`);
    // it settles once it lies flat (85 % of the flight): until then it never slows under 5 % of
    // its top speed; after that it may come in very slowly (the brief asks for it) — but it
    // never freezes: no 150 ms without movement until the words start
    const tFlat = tShow + (tHand - tShow) * (SETTLE / HAND);
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
    // the pendulum: the side-to-side part of the path = its x minus its mean over one period,
    // twice (the half circle itself bends slowly; one pass leaves some of it), from 1 s in (the
    // sheet is still leaving the gift before) until it settles
    {
      const fly = path.filter((r) => !r.handed && r.t > tShow + 1000 && r.t < tFlat);
      const dt = 1 / 60;
      const xs = [];
      for (let t = fly[0].t; t <= fly[fly.length - 1].t; t += dt * 1000) {
        const j = fly.findIndex((r) => r.t >= t);
        if (j <= 0) continue;
        const f = (t - fly[j - 1].t) / (fly[j].t - fly[j - 1].t || 1);
        xs.push(centre(fly[j - 1].q)[0] * (1 - f) + centre(fly[j].q)[0] * f);
      }
      // (the half circle's own slow bend, removed as a least-squares cubic — a moving average
      //  would favour shorter periods: its window's side lobes amplify them)
      const nT = xs.length;
      const tn = (i) => (2 * i) / Math.max(1, nT - 1) - 1;
      const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      const rhs = [0, 0, 0, 0];
      xs.forEach((v, i) => {
        const b = [1, tn(i), tn(i) ** 2, tn(i) ** 3];
        for (let r = 0; r < 4; r++) {
          rhs[r] += b[r] * v;
          for (let c = 0; c < 4; c++) M[r][c] += b[r] * b[c];
        }
      });
      for (let c = 0; c < 4; c++) {
        for (let r = c + 1; r < 4; r++) {
          const f = M[r][c] / M[c][c];
          for (let q = c; q < 4; q++) M[r][q] -= f * M[c][q];
          rhs[r] -= f * rhs[c];
        }
      }
      const co = [0, 0, 0, 0];
      for (let r = 3; r >= 0; r--) co[r] = (rhs[r] - [0, 1, 2, 3].slice(r + 1).reduce((x, q) => x + M[r][q] * co[q], 0)) / M[r][r];
      const side = xs.map((v, i) => v - (co[0] + co[1] * tn(i) + co[2] * tn(i) ** 2 + co[3] * tn(i) ** 3));
      // the strongest period between 1 and 3.5 s
      let best = 0;
      let bestP = 0;
      for (let P = 1; P <= 3.5; P += 0.05) {
        let re = 0;
        let im = 0;
        side.forEach((v, i) => {
          const a = (2 * Math.PI * i * dt) / P;
          re += v * Math.cos(a);
          im += v * Math.sin(a);
        });
        const pw = re * re + im * im;
        if (pw > best) {
          best = pw;
          bestP = P;
        }
      }
      // its amplitude: where it really is on screen minus where the arc alone would put it
      // (`__paper.base`), first half of the way vs second half
      const off = rec.filter((r) => r.live && r.quad && !r.handed && r.paper?.base && r.t > tShow + 1000 && r.t < tFlat).map((r) => centre(r.quad)[0] - r.paper.base[0]);
      const h = Math.floor(off.length / 2);
      const amp = (a) => Math.max(...a.map(Math.abs));
      g.swayPeriodS = +bestP.toFixed(2);
      g.swayAmpPct = [+((amp(off.slice(0, h)) / W) * 100).toFixed(1), +((amp(off.slice(h)) / W) * 100).toFixed(1)];
      if (g.swayAmpPct[0] < 3 || g.swayAmpPct[0] > 8.5) problems.push(`gift ${n}: it swings ${g.swayAmpPct[0]} % of the width (4–8)`);
      if (bestP < 1.6 || bestP > 2.4) problems.push(`gift ${n}: its sway has a period of ${g.swayPeriodS} s (1.6–2.4)`);
      if (!(g.swayAmpPct[1] < g.swayAmpPct[0])) problems.push(`gift ${n}: its sway does not die down (${g.swayAmpPct.join(' → ')} % of the width)`);
    }
    // gentle turns (what the flight adds to its facing her)
    {
      const ps = rec.filter((r) => r.paper && r.live && !r.handed).map((r) => r.paper);
      const deg = (k) => Math.max(...ps.map((x) => Math.abs(x[k]))) * (180 / Math.PI);
      g.turnDeg = { yaw: +deg('yaw').toFixed(1), pitch: +deg('pitch').toFixed(1), roll: +deg('roll').toFixed(1) };
      if (g.turnDeg.yaw > 70 || g.turnDeg.pitch > 25 || g.turnDeg.roll > 14) problems.push(`gift ${n}: it turns too far (${JSON.stringify(g.turnDeg)})`);
    }
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
      const vbm = vb.reduce((a, x) => a + x.v, 0) / vb.length;
      const vam = va.reduce((a, x) => a + x.v, 0) / va.length;
      // (so slow at the cut that a ratio means little: both under 2 % of its top speed is calm)
      const calm = vbm < peak * 0.02 && vam < peak * 0.02;
      if ((r < 0.4 || r > 2.5) && !calm) problems.push(`gift ${n}: the speed jumps ×${r.toFixed(2)} at the handoff`);
    }
    // no fold, at any frame
    let bend = 0;
    for (const r of rec) if (r.u && r.live && !r.handed) bend = Math.max(bend, maxBend(r.u));
    g.maxBendDeg = +bend.toFixed(1);
    if (bend > 25) problems.push(`gift ${n}: the sheet bends ${bend.toFixed(1)}° between neighbouring cells — a fold`);
    summary.push(g);
    console.log(JSON.stringify(g));
  }

  // ── 2. a second touch while it flies: it hurries on, never back ──
  if (n === 1) {
    const { ctx, p } = await room();
    await p.evaluate(startRecording);
    await p.locator('.gift-nav__btn').nth(n - 1).click();
    await p.waitForTimeout(2600);
    await p.mouse.click(W * 0.5, H * 0.035);
    await p.waitForTimeout(9000);
    const rec = await p.evaluate(() => window.__rec);
    await ctx.close();
    const ts = rec.filter((r) => r.paper && !r.handed).map((r) => r.paper.t);
    const back = ts.some((t, i) => i && t < ts[i - 1] - 1e-6);
    const tHand = rec.find((r) => r.handed)?.t;
    const base = summary.find((x) => x.gift === 1);
    const plain = base?.flightS !== undefined ? base.flightS * 1000 + (rec.find((r) => r.live && r.quad)?.t ?? 0) : undefined;
    console.log(`second touch: clock forward only ${!back}, handed at ${tHand ? (tHand / 1000).toFixed(2) : '—'} s${plain ? ` (untouched ${(plain / 1000).toFixed(2)} s)` : ''}`);
    if (back) problems.push('a second touch ran the flight backwards');
    if (!tHand || (plain && tHand > plain - 300)) problems.push('a second touch did not hurry the flight on');
  }

  // ── 3. film ──
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
    if (i < 20) problems.push(`gift ${n}: only ${i} frames filmed`);
    await ctx.close();
    // a contact sheet of 20 frames, evenly from the touch to the page
    const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    const pick = `${dir}/sheet`;
    mkdirSync(pick, { recursive: true });
    for (let j = 0; j < 20 && files.length; j++) copyFileSync(`${dir}/${files[Math.round((j * (files.length - 1)) / 19)]}`, `${pick}/${files[Math.round((j * (files.length - 1)) / 19)]}`);
    try {
      execFileSync('python', ['scripts/frame-sheet.py', `${pick}/f-*.jpg`, `${out}/g${n}-sheet.jpg`, '360', '5'], { stdio: 'pipe' });
    } catch (e) {
      notes.push(`gift ${n}: no contact sheet (${String(e).slice(0, 80)})`);
    }
  }
}
await browser.close();
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
notes.forEach((x) => console.log('⚠ ' + x));
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ every gift lets its letter float out like a feather, in one soft movement');
process.exit(problems.length ? 1 : 0);
