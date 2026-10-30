/**
 * Visual inspection of the hero objects: the heart from several angles, hover,
 * heartbeat, then the gift room (orbit, hover, opening) and the finale.
 *
 *   npm run qa:visual -- --url=http://localhost:4173/ [--size=1440x900] [--mobile] [--only=heart]
 *
 * Screenshots land in qa-output/visual-<size>/. Uses the real GPU when available
 * (--gpu) so materials look like they will for her; falls back to SwiftShader.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const url = args.url ?? 'http://localhost:4173/';
const [w, h] = String(args.size ?? '1440x900').split('x').map(Number);
const mobile = !!args.mobile;
const only = args.only;
const out = `qa-output/visual-${w}x${h}${mobile ? '-touch' : ''}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => {
  // headless Chrome has no real audio device; the app already goes silent when that happens
  if (m.type() === 'error' && !/AudioContext encountered an error from the audio device/.test(m.text())) problems.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let n = 0;
const snap = async (name) => {
  const file = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('• shot', file);
};
const tap = (x, y) => (mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
/**
 * Touch the heart of light where it really is: the hit area is a 3D object, and after the
 * world has been turned (or on a short window) it is not at the centre of the screen.
 * `?debug` exposes the group it hangs in; falls back to the centre if it is not there.
 */
const heartAt = () =>
  page.evaluate(() => {
    const h = window.__heart;
    const cam = window.__camera;
    if (!h || !cam) return null;
    h.updateWorldMatrix(true, false);
    const p = h.getWorldPosition(h.position.clone());
    p.project(cam);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  });
const heartLabel = () => page.getAttribute('.heart-hit', 'aria-label');
const tapHeart = async () => {
  const before = await heartLabel();
  // Aim at the light itself, walking down from where the heart hangs: before it has
  // gathered, the light is the ring BENEATH that point, and the world may still be
  // drifting home after a turn — so re-aim on every try.
  for (const dy of [0, 80, 160, 240, 0]) {
    const at = await heartAt();
    const x = at ? at.x : w / 2;
    const y = (at ? at.y : h / 2) + dy;
    if (process.env.QA_DEBUG) console.log('  tapHeart try', { x: Math.round(x), y: Math.round(y) });
    await tap(x, y);
    await page.waitForTimeout(400);
    if ((await heartLabel()) !== before) return;
  }
  problems.push(`the heart did not take a touch (${before})`);
};
/** A slow drag that stops before release (no fling), so the pose stays put for the shot. */
const drag = async (x, y, dx, dy, steps = 24) => {
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    const pt = (px, py) => [{ x: px, y: py }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps, y + (dy * i) / steps) });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
};

try {
  await page.goto(`${url}?reset&debug`, { waitUntil: 'networkidle' });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('• renderer:', renderer);
  await page.waitForTimeout(3500);
  // before the first touch: only scattered light (the heart of light), or the heart (glass style)
  await snap('dormant');
  // turning before the first touch: the whole world must turn as one (no second ring left behind)
  await drag(w * 0.7, h * 0.3, -w * 0.35, 0);
  await page.waitForTimeout(700);
  await snap('dormant-orbit');
  await drag(w * 0.7, h * 0.3, -w * 0.35, 40);
  await page.waitForTimeout(700);
  await snap('dormant-orbit-2');
  await page.waitForTimeout(2000);
  // first touch: the light gathers into a heart (~3.2 s), the sky wakes, the cat forms
  await tapHeart();
  await page.waitForTimeout(1300);
  await snap('gathering');
  await page.waitForTimeout(2800);
  await snap('heart-front');

  // turn the heart: ~0.006 rad per px
  await drag(w / 2 - 130, h / 2 + 200, 262, 0);
  await page.waitForTimeout(900);
  await snap('heart-90');
  await drag(w / 2 - 130, h / 2 + 200, 262, 0);
  await page.waitForTimeout(900);
  await snap('heart-180');
  await drag(w / 2, h / 2 + 200, 0, -160);
  await page.waitForTimeout(900);
  await snap('heart-top');
  // let it drift home (and the cat finish gathering)
  await page.waitForTimeout(7000);
  await snap('heart-home');

  if (!mobile) {
    await page.mouse.move(w / 2 - 60, h / 2 - 140, { steps: 12 });
    await page.waitForTimeout(1200);
    await snap('heart-hover-left');
    await page.mouse.move(w / 2 + 70, h / 2 - 90, { steps: 12 });
    await page.waitForTimeout(1200);
    await snap('heart-hover-right');
  }
  await tapHeart();
  await page.waitForTimeout(300);
  await snap('heart-beat-peak');
  await page.waitForTimeout(900);
  await snap('heart-after-beat');
  if (only === 'heart') throw 'done';

  await tapHeart();
  await page.locator('#bday').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.locator('#bday').pressSequentially(password.replace(/\D/g, ''), { delay: 20 });
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(5500);
  await page.getByRole('button', { name: 'Step inside' }).click();
  await page.waitForTimeout(2200);
  await snap('room-arrive');
  await page.waitForTimeout(1800);
  await snap('room');
  await drag(w * 0.85, h * 0.3, -w * 0.45, 0);
  await page.waitForTimeout(1200);
  await snap('room-orbit-left');
  await drag(w * 0.85, h * 0.3, -w * 0.45, 60);
  await page.waitForTimeout(1200);
  await snap('room-orbit-more');
  await page.waitForTimeout(6000);
  await snap('room-settled');
  const label = page.locator('.gift-label').first();
  const box = await label.boundingBox();
  if (box && !mobile) {
    await page.mouse.move(box.x + box.width / 2, box.y - 35, { steps: 10 });
    await page.waitForTimeout(1200);
    await snap('gift-hover');
  }
  if (box) await tap(box.x + box.width / 2, box.y - 35);
  await page.waitForTimeout(450);
  await snap('gift-opening-1');
  await page.waitForTimeout(450);
  await snap('gift-opening-2');
  await page.locator('.sheet').waitFor({ timeout: 15000 }); // each opening is 5–6.5 s now (motion.gift.open)
  await page.waitForTimeout(1200);
  await snap('memory');
} catch (e) {
  if (e !== 'done') problems.push(`step failed: ${String(e.message ?? e).split('\n')[0]}`);
}
await browser.close();
if (problems.length) {
  console.log(`✗ ${problems.length} problem(s):`);
  problems.forEach((p) => console.log('  -', p));
  process.exit(1);
}
console.log('✓ visual pass done');
