/**
 * Back to the room after the finale (owner's bug report J1: the room came back empty —
 * no gifts, no cake, only the furniture and the five ticks).
 *
 * Seeds a visit with every gift open, walks room → finale → (secret, or the whole surprise
 * the first time) → "Back to our room", `--times` times, and checks that the room is whole:
 * every build gate at full scale, the room's surfaces built (the light's sweep complete),
 * the room group visible, the cake / sign / balloons / gifts drawn, the WebGL context alive.
 *
 *   node scripts/qa-return.mjs [--gpu] [--size=1440x900] [--times=2]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const times = Number(arg('times', '2'));
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/return-${W}x${H}`;
mkdirSync(out, { recursive: true });

const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] : ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('qa-seeded')) return;
  sessionStorage.setItem('qa-seeded', '1');
  sessionStorage.setItem(
    'love-story:v2',
    JSON.stringify({ unlocked: true, opened: ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'], finaleSeen: false, at: Date.now() }),
  );
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (/CONTEXT_LOST|context lost/i.test(t)) errors.push('webgl context lost');
  if (m.type() === 'error' && !/AudioContext|favicon|audio\//.test(t)) errors.push('console ' + t.slice(0, 200));
});

/** What of the room is drawn right now. */
const roomState = () =>
  page.evaluate(() => {
    let gates = 0;
    let open = 0;
    let hidden = 0;
    const names = {};
    window.__scene?.traverse((o) => {
      if (o.userData?.buildGate) {
        gates++;
        if (o.scale.x > 0.99 && o.scale.y > 0.99) open++;
      }
      if (o.userData?.roomPart) {
        // drawn = visible all the way up and not scaled away
        let v = true;
        for (let p = o; p; p = p.parent) if (!p.visible || p.scale.x < 0.01) v = false;
        names[o.userData.roomPart] = (names[o.userData.roomPart] ?? 0) + (v ? 1 : 0);
        if (!v) hidden++;
      }
    });
    const build = window.__sprite?.debugBuild?.() ?? null;
    const lost = (() => {
      const c = document.querySelector('canvas');
      const gl = c?.getContext('webgl2');
      return gl ? gl.isContextLost() : null;
    })();
    return { gates, open, hidden, parts: names, build, lost, nogl: !!document.querySelector('.css-orb') };
  });

const cta = page.locator('.room-ui__cta');
const back = page.getByRole('button', { name: 'Back to our room' });
const finalePhase = () => page.evaluate(() => document.querySelector('.finale')?.getAttribute('data-phase') ?? null);

await page.goto(`${url}?debug`, { waitUntil: 'networkidle' });
await cta.waitFor({ timeout: 40000 });
await page.waitForTimeout(3500);
const first = await roomState();
console.log('room at first:', JSON.stringify(first));
await page.screenshot({ path: `${out}/0-room.png` });

const fails = [];
const check = (s, tag) => {
  if (s.lost) fails.push(`${tag}: WebGL context lost`);
  if (s.nogl) fails.push(`${tag}: fell back to the no-WebGL orb`);
  if (s.gates === 0) fails.push(`${tag}: no room in the scene`);
  else if (s.open < s.gates) fails.push(`${tag}: ${s.gates - s.open} of ${s.gates} things still not built`);
  if (s.hidden > 0) fails.push(`${tag}: ${s.hidden} room parts hidden ${JSON.stringify(s.parts)}`);
  if (s.build && !s.build.active) fails.push(`${tag}: the room is waiting for a light that is not flying (reach ${s.build.reach})`);
};
check(first, 'first');

for (let i = 1; i <= times; i++) {
  await cta.click();
  const more = page.getByRole('button', { name: 'One more thing…' });
  await more.waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  await more.click();
  // the first finale runs the surprise to its end ("There's more?"); later ones stop at the secret
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    if (await back.isVisible().catch(() => false)) break;
    const ph = await finalePhase();
    if (ph === 'question' || ph === 'sure') {
      const m = page.getByRole('button', { name: 'There’s more?' });
      if (await m.isVisible().catch(() => false)) await m.click().catch(() => {});
    }
    await page.waitForTimeout(500);
  }
  console.log(`finale ${i}: phase`, await finalePhase());
  await back.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await back.click();
  await cta.waitFor({ timeout: 40000 });
  await page.waitForTimeout(5000);
  const s = await roomState();
  console.log(`back ${i}:`, JSON.stringify(s));
  await page.screenshot({ path: `${out}/${i}-back.png` });
  check(s, `back ${i}`);
}

await browser.close();
const all = [...fails, ...errors];
console.log(all.length ? '✗ ' + all.join('\n✗ ') : '✓ the room comes back whole');
process.exit(all.length ? 1 : 0);
