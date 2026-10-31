/**
 * Z1 — the owner's own way through, on the PRODUCTION build (npm run build && npm run preview):
 * open the page → touch the heart three times → the password → the light's tour into the room →
 * turn the ring by dragging → touch a gift in 3D → close its page → touch the cake (its moment)
 * → leave it → touch the cake again. No ?reset shortcut into the room, no resumed visit. At every
 * step: a screenshot and where the cake's table stands against the floor.
 *
 *   node scripts/qa-owner-path.mjs [--gpu] [--size=1920x1080] [--mobile] [--url=…]
 * Shots: qa-output/owner-path-<size>/NN-step.png. Exit 1 if the table is ever off the floor,
 * the cake off the table, or the table not seen in the cake moment.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { enterRoom, support, measure } from './lib/cake-seg.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/owner-path-${W}x${H}${mobile ? 'm' : ''}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
const p = await ctx.newPage();
const problems = [];
p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && m.text().includes('[room]') && problems.push(m.text()));
let n = 0;
const step = async (name, { cake = false } = {}) => {
  const s = await p.evaluate(support);
  const tag = `${String(++n).padStart(2, '0')}-${name}`;
  await p.screenshot({ path: `${out}/${tag}.png` });
  const line = { step: tag, ...s };
  if (s.error) problems.push(`${tag}: ${s.error}`);
  else {
    if (Math.abs(s.footOnFloor) > 0.01) problems.push(`${tag}: the table's foot is ${s.footOnFloor} m off the floor`);
    if (s.gap === null || Math.abs(s.gap) > 0.02) problems.push(`${tag}: the cake is not on its table (gap ${s.gap})`);
  }
  if (cake) {
    const m = await p.evaluate(measure, {});
    Object.assign(line, { floor: +(m.floor * 100).toFixed(1), tablePct: +(m.tableShare * 100).toFixed(1), hidden: m.hidden });
    if (m.floor > 0.25) problems.push(`${tag}: floor is ${(m.floor * 100).toFixed(1)} % of the frame`);
    if (m.tableShare < 0.08) problems.push(`${tag}: the table is only ${(m.tableShare * 100).toFixed(1)} % of the frame`);
    if (m.hidden) problems.push(`${tag}: ${m.hidden} cake/table px hidden`);
  }
  console.log(JSON.stringify(line));
};
/** where a thing of the scene is on screen (its bounds' centre) */
const onScreen = (pick) =>
  p.evaluate((pick) => {
    const T = window.__THREE;
    let o = null;
    window.__scene.traverse((x) => {
      if (o) return;
      if (pick === 'cake' ? x.isMesh && x.userData.frame === 'cake' && x.geometry?.attributes?.aKind : x.name === pick) o = x;
    });
    if (!o) return null;
    const v = new T.Box3().setFromObject(o).getCenter(new T.Vector3()).project(window.__camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, in: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 };
  }, pick);
const tap = (x, y) => (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));

await enterRoom(p, { url, W, H, mobile, ledIn: true, password, debug: false });
await step('room-after-tour');
// turn the ring by hand
if (!mobile) {
  await p.mouse.move(W * 0.7, H * 0.55);
  await p.mouse.down();
  await p.mouse.move(W * 0.35, H * 0.55, { steps: 25 });
  await p.mouse.up();
} else {
  // (a touch drag)
  const cdp = await ctx.newCDPSession(p);
  const pt = (x) => [{ x, y: H * 0.55 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(W * 0.8) });
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(W * (0.8 - i * 0.03)) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
await p.waitForTimeout(2500);
await step('ring-turned');
// a gift, touched in 3D (the first one that is on screen), its page, closed
let opened = false;
for (const id of ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day']) {
  const g = await onScreen(`gift:${id}`);
  if (!g?.in) continue;
  await tap(g.x, g.y);
  try {
    await p.locator('.leaf.is-inked').waitFor({ timeout: 16000 });
    opened = true;
    break;
  } catch {
    /* the touch fell on something else: try the next */
  }
}
if (!opened) {
  await p.locator('.gift-nav__btn').first().click();
  await p.locator('.leaf.is-inked').waitFor({ timeout: 16000 });
}
await p.waitForTimeout(1500);
await step('gift-page');
await p.keyboard.press('Escape');
await p.waitForTimeout(4500);
await step('gift-closed');
// the cake, touched for real
for (let round = 1; round <= 2; round++) {
  let c = await onScreen('cake');
  if (!c?.in) {
    // (turn the world until the cake is in view)
    for (let i = 0; i < 6 && !c?.in; i++) {
      await p.mouse.move(W * 0.6, H * 0.5);
      await p.mouse.down();
      await p.mouse.move(W * 0.4, H * 0.5, { steps: 10 });
      await p.mouse.up();
      await p.waitForTimeout(1200);
      c = await onScreen('cake');
    }
  }
  if (!c?.in) {
    problems.push(`round ${round}: the cake never came into view`);
    break;
  }
  await tap(c.x, c.y);
  await p.waitForTimeout(5500);
  await step(`cake-moment-${round}`, { cake: true });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(3500);
  await step(`cake-left-${round}`);
}
await browser.close();
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ on her way through, the cake stands on its table at every step');
process.exit(problems.length ? 1 : 0);
