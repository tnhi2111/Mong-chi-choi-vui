/**
 * AA1 — the HAPPY BIRTHDAY installation sits balanced in its alcove, measured on screen in the
 * sign's moment. The installation = an ID render of its letters, arch and posies (cables and
 * bulbs left out); "the foot of the posies" = the lowest row where the satin mask is still a
 * bloom, not a ribbon. The alcove = its outline on the curved wall, projected.
 *   centre (arch apex ↔ posies' foot) within 3 % of the alcove's height from its visual
 *   centre (52 % up from its foot); the gaps above and below within 20 % of each other; left
 *   and right within 5 %; its width 60–68 % of the alcove's. And the room's title never lies
 *   over the lettering while it is shown (in the room and in the moment).
 *
 *   node scripts/qa-sign-layout.mjs [--gpu] [--sizes=1440x900,1920x1080,390x844m]
 * Shots: qa-output/sign-layout-<size>.png
 */
import { chromium } from 'playwright-core';
import { existsSync, writeFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const sizes = arg('sizes', '1440x900,1920x1080,390x844m').split(',');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ALL = ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'];
const problems = [];

/** In the page: the installation's masks and the alcove's outline, in screen px. */
function layout() {
  const T = window.__THREE;
  const gl = window.__gl;
  const scene = window.__scene;
  const cam = window.__camera;
  let root = null;
  scene.traverse((o) => { if (!root && o.userData.signPart) root = o; });
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const all = [];
  scene.traverse((o) => (o.isMesh || o.isPoints || o.isSprite || o.isLine) && shown(o) && all.push(o));
  const inSign = (o) => { for (let x = o; x; x = x.parent) if (x === root) return true; return false; };
  // the installation's solid parts: letters (aOrder), metal arch/ties, satin posies — no cables
  // (a few vertices each), no light (points, additive halos/rims, the halo plane)
  const part = (o) => o.isMesh && inSign(o) && o.material?.colorWrite !== false && o.material?.blending !== T.AdditiveBlending && !o.material?.transparent && o.geometry.attributes.position.count > 12;
  const satin = (o) => part(o) && !!o.geometry.attributes.aColor && !o.geometry.attributes.aOrder;
  const size = gl.getDrawingBufferSize(new T.Vector2());
  const w = size.x;
  const h = size.y;
  const rt = new T.WebGLRenderTarget(w, h, { samples: 0 });
  const flat = new T.MeshBasicMaterial({ color: 0xff0000, toneMapped: false, side: T.DoubleSide });
  const saved = all.map((o) => [o, o.material, o.visible]);
  const bg = scene.background;
  scene.background = null;
  const read = (pick, colour) => {
    flat.color.setHex(colour);
    for (const [o, m] of saved) {
      o.visible = pick(o);
      if (o.visible) o.material = flat;
      else o.material = m;
    }
    const px = new Uint8Array(w * h * 4);
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
    return px;
  };
  const A = read(part, 0xff0000);
  const S = read(satin, 0x0000ff);
  // (only the flat colours count: saturated light — a flame, a bulb — is not the sign)
  const isA = (i) => A[i * 4] === 255 && A[i * 4 + 1] === 0 && A[i * 4 + 2] === 0;
  const isS = (i) => S[i * 4] === 0 && S[i * 4 + 1] === 0 && S[i * 4 + 2] === 255;
  for (const [o, m, v] of saved) {
    o.material = m;
    o.visible = v;
  }
  scene.background = bg;
  gl.setRenderTarget(null);
  rt.dispose();
  flat.dispose();
  const box = [w, h, -1, -1];
  for (let i = 0; i < w * h; i++) {
    if (!isA(i)) continue;
    const x = i % w;
    const y = h - 1 - Math.floor(i / w);
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  // the posies' foot: the lowest row where the satin is wider than a ribbon
  const rows = new Array(h).fill(0);
  for (let i = 0; i < w * h; i++) if (isS(i)) rows[h - 1 - Math.floor(i / w)]++;
  const widest = Math.max(...rows);
  let foot = -1;
  for (let y = h - 1; y >= 0; y--) if (rows[y] > widest * 0.35) { foot = y; break; }
  // the alcove, projected (its sides at mid height, its apex, its foot under the apex)
  const a = window.__alcove;
  const P = (sw, hh) => {
    const ang = sw / a.wallR;
    const v = new T.Vector3(Math.sin(ang) * a.wallR, a.floorY + hh, -Math.cos(ang) * a.wallR).project(cam);
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  };
  const mid = a.side / 2;
  const alc = { left: P(-a.halfWidth, mid)[0], right: P(a.halfWidth, mid)[0], top: P(0, a.top)[1], bottom: P(0, 0)[1] };
  // the room's title, if it is shown, and where the lettering is
  const head = document.querySelector('.room-ui__head');
  const hs = head && getComputedStyle(head);
  const headOn = head && hs.filter !== 'opacity(0)' && +hs.opacity > 0.05 && hs.visibility !== 'hidden';
  const dpr = w / innerWidth;
  const r = head?.getBoundingClientRect();
  let png = null;
  if (window.__dumpMask) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const im = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const o = ((h - 1 - Math.floor(i / w)) * w + (i % w)) * 4;
      im.data[o] = isA(i) ? 255 : 0;
      im.data[o + 1] = isS(i) ? 255 : 0;
      im.data[o + 3] = 255;
    }
    cv.getContext('2d').putImageData(im, 0, 0);
    png = cv.toDataURL();
  }
  return { w, h, box, foot, alc, png, head: headOn ? [r.left * dpr, r.top * dpr, r.right * dpr, r.bottom * dpr] : null };
}

const judge = (tag, L, inMoment) => {
  const [x0, y0, x1] = L.box;
  const out = {};
  const hit = L.head && x0 < L.head[2] && x1 > L.head[0] && y0 < L.head[3] && L.foot > L.head[1];
  if (hit) problems.push(`${tag}: the room's title lies over the sign`);
  out.titleOverSign = !!hit;
  if (!inMoment) return out;
  const A = L.alc;
  const H = A.bottom - A.top;
  const W = A.right - A.left;
  const centre = (y0 + L.foot) / 2;
  // (the visual centre: 52 % up — the low end of 52–55 %, where the gaps can still match)
  const visual = A.bottom - 0.52 * H;
  out.centreOffPct = +(((centre - visual) / H) * 100).toFixed(1);
  const above = y0 - A.top;
  const below = A.bottom - L.foot;
  out.gapsPx = [Math.round(above), Math.round(below)];
  out.gapDiffPct = +((Math.abs(above - below) / Math.max(above, below)) * 100).toFixed(1);
  const left = x0 - A.left;
  const right = A.right - x1;
  out.sideDiffPct = +((Math.abs(left - right) / Math.max(left, right)) * 100).toFixed(1);
  out.widthPct = +(((x1 - x0) / W) * 100).toFixed(1);
  if (Math.abs(out.centreOffPct) > 3) problems.push(`${tag}: its centre is ${out.centreOffPct} % of the alcove's height off its visual centre`);
  if (out.gapDiffPct > 20) problems.push(`${tag}: the gaps above/below differ ${out.gapDiffPct} % (${out.gapsPx})`);
  if (out.sideDiffPct > 5) problems.push(`${tag}: the sides differ ${out.sideDiffPct} %`);
  if (out.widthPct < 60 || out.widthPct > 68) problems.push(`${tag}: it is ${out.widthPct} % of the alcove's width`);
  return out;
};

for (const sz of sizes) {
  const mobile = sz.endsWith('m');
  const [W, H] = sz.replace('m', '').split('x').map(Number);
  for (const opened of [[], ALL]) {
    const tag = `${sz}${opened.length ? ' all-open' : ''}`;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript((opened) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened, finaleSeen: opened.length === 5, at: Date.now() }));
    }, opened);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${tag}: pageerror ${e.message}`));
    await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
    await p.locator(opened.length ? '.room-ui__cta' : '.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(3500);
    // the room: the title may be shown, never over the sign
    for (const yaw of [0, 0.4, -0.4]) {
      await p.evaluate((y) => window.__orbit && (window.__orbit.tYaw = y), yaw);
      await p.waitForTimeout(1500);
      judge(`${tag} room yaw ${yaw}`, await p.evaluate(layout), false);
    }
    if (process.argv.includes('--mask')) await p.evaluate(() => (window.__dumpMask = true));
    await p.evaluate(() => window.__moment('sign'));
    await p.waitForTimeout(6500);
    const L = await p.evaluate(layout);
    if (process.argv.includes('--raw')) console.log(tag, JSON.stringify({ box: L.box, foot: L.foot, alc: L.alc, w: L.w }));
    if (L.png) writeFileSync(`qa-output/sign-mask-${sz}${opened.length ? '-open' : ''}.png`, Buffer.from(L.png.split(',')[1], 'base64'));
    const r = judge(`${tag} moment`, L, true);
    if (!opened.length) await p.screenshot({ path: `qa-output/sign-layout-${sz}.png` });
    console.log(tag, JSON.stringify(r));
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ the sign sits balanced in its alcove, and the room\'s title never lies over it');
process.exit(problems.length ? 1 : 0);
