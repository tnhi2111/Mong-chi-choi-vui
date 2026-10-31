/**
 * W3 — the cake moment is idempotent: open it again and again (leaving by Escape, by a wish —
 * a touch that blows the candles out — and by a touch elsewhere) and the cake looks the same
 * every time. Openings 1, 2, 3 and 5 are compared on the SCREEN (Playwright screenshots) over
 * the cake's own pixels (its mask, drawn alone into a render target):
 *  • mean luminance of the cake within ±5 % of the first opening, and of the room around it;
 *  • its luminance histogram (16 bins) differs by ≤ 5 % (half the L1 distance);
 *  • < 1 % of the cake's pixels burnt (any channel ≥ 250) — the pixels its own candle flames
 *    and sparkles light are left out of that count: a flame is meant to be bright.
 *
 *   node scripts/qa-cake-repeat.mjs [--gpu] [--size=1440x900] [--mobile]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/cake-repeat-${W}x${H}${mobile ? 'm' : ''}`;
mkdirSync(out, { recursive: true });
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('qa-seeded')) return;
  sessionStorage.setItem('qa-seeded', '1');
  sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() }));
});
const p = await ctx.newPage();
const problems = [];
p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
await p.waitForTimeout(3000);
// the moment waits for its words (motion.moment.textAfter) and the camera to settle
const settle = gpu ? 5000 : 9000;

/** Where the cake is on screen right now (its centre), and whether it is in the frame. */
const cakePx = () =>
  p.evaluate(() => {
    let mesh = null;
    window.__scene.traverse((o) => { if (!mesh && o.isMesh && o.userData.frame === 'cake' && o.geometry?.attributes?.aKind) mesh = o; });
    mesh.updateWorldMatrix(true, false);
    const v = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(window.__camera);
    return { x: Math.round((v.x * 0.5 + 0.5) * innerWidth), y: Math.round((-v.y * 0.5 + 0.5) * innerHeight), in: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 };
  });
const tap = (x, y) => (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));

/** The cake's mask (the cake mesh alone, drawn into a render target) — 1 where it lights a pixel. */
const cakeMask = () =>
  p.evaluate(() => {
    const T = window.__THREE;
    const gl = window.__gl;
    const scene = window.__scene;
    const cam = window.__camera;
    const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    const all = [];
    scene.traverse((o) => (o.isMesh || o.isPoints || o.isSprite || o.isLine) && shown(o) && all.push(o));
    const cake = all.filter((o) => o.isMesh && o.geometry?.attributes?.aKind);
    const others = all.filter((o) => !cake.includes(o));
    const size = gl.getDrawingBufferSize(new T.Vector2());
    const rt = new T.WebGLRenderTarget(size.x, size.y);
    const prev = gl.getRenderTarget();
    const bg = scene.background;
    scene.background = null;
    others.forEach((o) => (o.visible = false));
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    const px = new Uint8Array(size.x * size.y * 4);
    gl.readRenderTargetPixels(rt, 0, 0, size.x, size.y, px);
    // the candle flames and sparkles (points on the cake): they are meant to be bright — their
    // pixels are left out of the "burnt" count (not out of the brightness comparison)
    const inCake = (o) => { for (let p = o; p; p = p.parent) if (p.userData.cakePart) return true; return false; };
    const lights = all.filter((o) => o.isPoints && inCake(o));
    cake.forEach((o) => (o.visible = false));
    lights.forEach((o) => (o.visible = true));
    gl.clear();
    gl.render(scene, cam);
    const fl = new Uint8Array(size.x * size.y * 4);
    gl.readRenderTargetPixels(rt, 0, 0, size.x, size.y, fl);
    cake.forEach((o) => (o.visible = true));
    others.forEach((o) => (o.visible = true));
    scene.background = bg;
    gl.setRenderTarget(prev);
    rt.dispose();
    // flipped to screen rows, as one string of 0/1 per pixel
    // 1 = the cake, 2 = the cake under its own flames' light (2 px around them)
    const m = new Uint8Array(size.x * size.y);
    const lit = new Uint8Array(size.x * size.y);
    for (let i = 0; i < size.x * size.y; i++) {
      const k = i * 4;
      const at = (size.y - 1 - Math.floor(i / size.x)) * size.x + (i % size.x);
      if (Math.max(px[k], px[k + 1], px[k + 2]) > 20) m[at] = 1;
      if (Math.max(fl[k], fl[k + 1], fl[k + 2]) > 12) lit[at] = 1;
    }
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      const x = i % size.x;
      const y = Math.floor(i / size.x);
      for (let dy = -2; dy <= 2 && m[i] === 1; dy++) for (let dx = -2; dx <= 2; dx++) if (lit[(y + dy) * size.x + x + dx]) { m[i] = 2; break; }
    }
    window.__cakeMask = { w: size.x, h: size.y, m };
    return { w: size.x, h: size.y, n: m.reduce((a, b) => a + b, 0) };
  });

/** Statistics of a screenshot over the mask (the cake) and outside it (the room). */
const stats = (png) =>
  p.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = new OffscreenCanvas(img.width, img.height);
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height).data;
    const { w, m } = window.__cakeMask;
    const hist = new Array(16).fill(0);
    let n = 0, sum = 0, burnt = 0, rn = 0, rsum = 0;
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const k = (y * img.width + x) * 4;
        const L = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        if (m[y * w + x]) {
          n++;
          sum += L;
          hist[Math.min(15, Math.floor(L / 16))]++;
          if (m[y * w + x] === 1 && (d[k] >= 250 || d[k + 1] >= 250 || d[k + 2] >= 250)) burnt++;
        } else {
          rn++;
          rsum += L;
        }
      }
    return { n, mean: sum / Math.max(1, n), burnt: burnt / Math.max(1, n), room: rsum / Math.max(1, rn), hist: hist.map((v) => v / Math.max(1, n)) };
  }, png.toString('base64'));

const leaves = ['esc', 'wish', 'esc', 'outside', 'wish'];
const shots = {};
for (let i = 1; i <= 5; i++) {
  const c = await cakePx();
  if (c.in) await tap(c.x, c.y);
  else await p.evaluate(() => window.__moment('cake'));
  await p.waitForTimeout(settle);
  // (the candles may be relighting after a wish — wait until they are lit again)
  await p.waitForTimeout(i > 1 && leaves[i - 2] === 'wish' ? 1500 : 0);
  await cakeMask();
  const png = await p.screenshot({ path: `${out}/open-${i}.png` });
  shots[i] = await stats(png);
  console.log(`open ${i} (${c.in ? 'touched' : 'hook'})`, JSON.stringify({ px: shots[i].n, mean: +shots[i].mean.toFixed(1), burnt: +(shots[i].burnt * 100).toFixed(2) + '%', room: +shots[i].room.toFixed(1) }), '→ leave by', leaves[i - 1]);
  const how = leaves[i - 1];
  if (how === 'esc') await p.keyboard.press('Escape');
  else if (how === 'wish') {
    const k = await cakePx();
    await tap(k.x, k.y);
  } else await tap(8, H - 8);
  await p.waitForTimeout(how === 'wish' ? 4200 : 2800);
}
await browser.close();

const first = shots[1];
if (first.n < 2000) problems.push(`the cake covers only ${first.n} px at the first opening — the test cannot judge it`);
for (const i of [1, 2, 3, 5]) {
  const s = shots[i];
  if (s.burnt >= 0.01) problems.push(`open ${i}: ${(s.burnt * 100).toFixed(2)} % of the cake is burnt white`);
  if (i === 1) continue;
  const dMean = Math.abs(s.mean - first.mean) / first.mean;
  const dRoom = Math.abs(s.room - first.room) / Math.max(1, first.room);
  const dHist = s.hist.reduce((a, v, k) => a + Math.abs(v - first.hist[k]), 0) / 2;
  console.log(`open ${i} vs 1: cake mean ${(dMean * 100).toFixed(1)} %, histogram ${(dHist * 100).toFixed(1)} %, room ${(dRoom * 100).toFixed(1)} %`);
  if (dMean > 0.05) problems.push(`open ${i}: the cake is ${(dMean * 100).toFixed(1)} % ${s.mean > first.mean ? 'brighter' : 'darker'} than the first time`);
  if (dHist > 0.05) problems.push(`open ${i}: the cake's tones moved ${(dHist * 100).toFixed(1)} % from the first time`);
  if (dRoom > 0.05) problems.push(`open ${i}: the room round it is ${(dRoom * 100).toFixed(1)} % ${s.room > first.room ? 'brighter' : 'darker'} than the first time`);
}
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ the cake looks the same every time it is opened');
process.exit(problems.length ? 1 : 0);
