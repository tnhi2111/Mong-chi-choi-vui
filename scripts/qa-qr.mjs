/**
 * The QR card must always scan, and point at birthdayConfig.siteUrl.
 *   npm run qa:qr -- [--url=http://localhost:4173/] [--gpu]
 *
 * 1. The exported PNG (dark and light ground) decodes at 300, 600 and 2048 px wide, turned
 *    0°, 15° and 45°, and slightly blurred (jsQR — a decoder, not a phone camera).
 * 2. The exported SVG and the print sheet decode too.
 * 3. Ink on paper: contrast ≥ 7 : 1.
 * 4. On the live page, over several frames of the animation (with the pointer moving), every
 *    pixel of the code + its quiet zone is ink or paper — no light, dust, glow or shadow on it.
 * 5. The page itself (a screenshot of the card) decodes, on a desktop and a phone.
 * Shots in qa-output/qr/.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const base = args.url ?? 'http://localhost:4173/';
const expected = /siteUrl:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1];
mkdirSync('qa-output/qr', { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: args.gpu !== undefined ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const problems = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) problems.push(msg);
};

/** Decode (jsQR, in the page) an image (data URL), resized to `w` px wide, turned `deg`, blurred `blur` px. */
const decodeIn = (page, src, w, deg = 0, blur = 0, ground = '#777') =>
  page.evaluate(
    async ({ src, w, deg, blur, ground }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const R = Math.ceil(Math.hypot(w, h)) + 40;
      const c = document.createElement('canvas');
      c.width = c.height = R;
      const g = c.getContext('2d');
      g.fillStyle = ground;
      g.fillRect(0, 0, R, R);
      g.translate(R / 2, R / 2);
      g.rotate((deg * Math.PI) / 180);
      if (blur) g.filter = `blur(${blur}px)`;
      g.drawImage(img, -w / 2, -h / 2, w, h);
      const d = g.getImageData(0, 0, R, R);
      // (decoded here, in the page: shipping the pixels to node runs it out of memory)
      return window.jsQR(d.data, R, R, { inversionAttempts: 'dontInvert' })?.data ?? null;
    },
    { src, w, deg, blur, ground },
  );
const decodes = (d) => d;
const withDecoder = (page) => page.addScriptTag({ path: 'node_modules/jsqr/dist/jsQR.js' });

// ── 1–3: the exports ────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('qr.html', base).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__qr);
  await withDecoder(page);
  const c = await page.evaluate(() => window.__qr.contrast());
  ok(c >= 7, `ink on paper contrast ${c.toFixed(1)} : 1 (≥ 7)`);
  for (const ground of ['dark', 'light']) {
    const png = await page.evaluate((g) => window.__qr.png(g, 2048), ground);
    writeFileSync(`qa-output/qr/export-${ground}.png`, Buffer.from(png.split(',')[1], 'base64'));
    const dims = await page.evaluate(async (s) => {
      const i = new Image();
      i.src = s;
      await i.decode();
      return [i.naturalWidth, i.naturalHeight];
    }, png);
    ok(dims[0] >= 2048, `PNG (${ground}) is ${dims[0]}×${dims[1]} px`);
    for (const w of [300, 600, 2048])
      for (const deg of [0, 15, 45]) {
        const got = decodes(await decodeIn(page, png, w, deg, 0, ground === 'dark' ? '#e8e8e8' : '#333'));
        ok(got === expected, `PNG ${ground} ${w}px ${deg}° decodes`);
      }
    ok(decodes(await decodeIn(page, png, 600, 0, 1.2)) === expected, `PNG ${ground} 600px blurred decodes`);
  }
  for (const ground of ['dark', 'light']) {
    const svg = await page.evaluate((g) => window.__qr.svg(g), ground);
    writeFileSync(`qa-output/qr/export-${ground}.svg`, svg);
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    ok(decodes(await decodeIn(page, src, 900)) === expected, `SVG (${ground}) decodes`);
  }
  // the print sheet
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  const printShot = await page.screenshot({ fullPage: true, path: 'qa-output/qr/print.png' });
  ok(decodes(await decodeIn(page, 'data:image/png;base64,' + printShot.toString('base64'), 1280)) === expected, 'print sheet decodes');
  const mm = await page.evaluate(() => {
    const r = document.querySelector('.qr-print__code svg').getBoundingClientRect();
    return r.width / (96 / 25.4);
  });
  ok(mm >= 30, `printed code is ${mm.toFixed(0)} mm wide (≥ 30 mm)`);
  if (errors.length) ok(false, 'page errors: ' + errors.join('; '));
  await page.close();
}

// ── 4–5: the live page ──────────────────────────────────────────────────────
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('qr.html', base).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3600);
  await withDecoder(page);
  // several frames, the pointer moving (parallax, dust, the heart all moving)
  let dirty = 0;
  let checked = 0;
  for (let f = 0; f < 6; f++) {
    if (!mobile) await page.mouse.move(w * (0.15 + f * 0.14), h * (0.2 + (f % 3) * 0.25));
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => window.__qr.codeRect());
    const shot = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
    if (f === 0) writeFileSync(`qa-output/qr/code-region-${w}.png`, shot);
    const px = await page.evaluate(async (b64) => {
      const i = new Image();
      i.src = 'data:image/png;base64,' + b64;
      await i.decode();
      const c = document.createElement('canvas');
      c.width = i.naturalWidth;
      c.height = i.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(i, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      // ink #2a1118, paper #fffaf6: every pixel must be one or the other (or the edge
      // between two modules: a mix of exactly those two)
      const ink = [42, 17, 24];
      const paper = [255, 250, 246];
      let bad = 0;
      for (let i2 = 0; i2 < d.length; i2 += 4) {
        const p = [d[i2], d[i2 + 1], d[i2 + 2]];
        // distance from the segment ink–paper in colour space
        const t = Math.max(0, Math.min(1, ((p[0] - ink[0]) * (paper[0] - ink[0]) + (p[1] - ink[1]) * (paper[1] - ink[1]) + (p[2] - ink[2]) * (paper[2] - ink[2])) / ((paper[0] - ink[0]) ** 2 + (paper[1] - ink[1]) ** 2 + (paper[2] - ink[2]) ** 2)));
        const q = ink.map((v, k) => v + (paper[k] - v) * t);
        if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 12) bad++;
      }
      return { bad, total: d.length / 4 };
    }, shot.toString('base64'));
    dirty += px.bad;
    checked += px.total;
  }
  ok(dirty === 0, `${w}px: no effect pixel on the code or its quiet zone (${dirty} of ${checked} over 6 frames)`);
  const card = (await page.locator('.qr-plate').screenshot({ path: `qa-output/qr/card-${w}.png` })).toString('base64');
  ok(decodes(await decodeIn(page, 'data:image/png;base64,' + card, mobile ? 560 : 400)) === expected, `${w}px: the card on screen decodes`);
  await page.screenshot({ path: `qa-output/qr/qr-${w}.png` });
  if (errors.length) ok(false, `${w}px page errors: ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `\n✗ ${problems.length} problem(s)` : '\n✓ the QR card scans everywhere');
process.exit(problems.length ? 1 : 0);
