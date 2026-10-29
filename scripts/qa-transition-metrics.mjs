/**
 * Measures every change of world, two ways:
 *   1. frame timing — a requestAnimationFrame logger runs in the page through the transition
 *      (no screenshots in this pass: they would stall the page and lie about the timing);
 *   2. film — a strip of frames through the same transition, saved for review; then
 *      `scripts/frame-stats.py` reads their brightness (a black or white cover shows as a
 *      frame that is mostly near-black / near-white).
 *
 *   npm run build && npm run preview
 *   node scripts/qa-transition-metrics.mjs --gpu [--size=1280x800] [--quality=medium] [--only=b,c]
 *
 * Scenarios: a gate → welcome · b welcome → room · c room → finale · d finale → room ·
 *            e room → a gift's product shot → its memory page.
 * Frames: qa-output/tm-WxH/<scenario>-NN.png · timing: printed + qa-output/tm-WxH/timing.json
 * Exits 1 on page errors.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const base = args.url ?? 'http://localhost:4173/';
const [W, H] = String(args.size ?? '1280x800').split('x').map(Number);
const quality = args.quality ?? 'medium';
const only = args.only ? String(args.only).split(',') : null;
const out = `qa-output/tm-${W}x${H}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const giftIds = [...readFileSync('src/data/gifts.ts', 'utf8').matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
const exe = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
const timing = {};

async function page(seed) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/AudioContext|our-song/.test(m.text()) && problems.push(`console.error: ${m.text().slice(0, 200)}`));
  if (seed) {
    await p.addInitScript((s) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ ...s, at: Date.now() }));
    }, seed);
  }
  await p.goto(`${base}?quality=${quality}${seed ? '' : '&reset'}`);
  await p.waitForSelector('canvas');
  return p;
}

/** Start logging frames; returns a function that stops and summarises them. */
async function frames(p) {
  await p.evaluate(() => {
    const w = window;
    w.__ft = [];
    w.__ftOn = true;
    const tick = (t) => {
      w.__ft.push(t);
      if (w.__ftOn) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return async () => {
    const ts = await p.evaluate(() => {
      window.__ftOn = false;
      return window.__ft;
    });
    const d = ts.slice(1).map((t, i) => t - ts[i]);
    const sorted = [...d].sort((a, b) => a - b);
    const long = d.map((x, i) => ({ at: Math.round(ts[i + 1] - ts[0]), ms: Math.round(x) })).filter((x) => x.ms > 50);
    return {
      frames: d.length,
      p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] ?? 0),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
      over50: long,
    };
  };
}

async function film(p, name, n, every) {
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    await p.screenshot({ path: `${out}/${name}-${String(i).padStart(2, '0')}.png` });
    const left = every - (Date.now() - t0);
    if (left > 0) await p.waitForTimeout(left);
  }
}

/** Run a scenario twice: once timed (no screenshots), once filmed. */
async function scenario(name, setup, trigger, { span = 5000, shots = 24, every = 160 } = {}) {
  if (only && !only.includes(name)) return;
  // timing pass
  {
    const p = await page(setup.seed);
    await setup.ready(p);
    const stop = await frames(p);
    await trigger(p);
    await p.waitForTimeout(span);
    timing[name] = await stop();
    await p.context().close();
  }
  // film pass
  {
    const p = await page(setup.seed);
    await setup.ready(p);
    await p.screenshot({ path: `${out}/${name}-before.png` });
    await trigger(p);
    await film(p, name, shots, every);
    await p.context().close();
  }
  const t = timing[name];
  console.log(`• ${name}: ${t.frames} frames, p50 ${t.p50} ms, p95 ${t.p95} ms, max ${t.max} ms, >50 ms: ${t.over50.map((x) => `${x.ms}@${x.at}`).join(' ') || 'none'}`);
}

const toGate = async (p) => {
  await p.waitForTimeout(3500);
  for (let i = 0; i < 3; i++) {
    await p.mouse.click(W / 2, H / 2);
    await p.waitForTimeout(i === 0 ? 6000 : 1500);
  }
  await p.locator('.gate__input').waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
};
const toWelcome = async (p) => {
  await toGate(p);
  await p.locator('.gate__input').pressSequentially(password.replace(/\D/g, ''));
  await p.keyboard.press('Enter');
  await p.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(6000);
};
const inRoom = (opened) => ({
  seed: { unlocked: true, opened, finaleSeen: false },
  ready: async (p) => {
    await p.locator('.gift-nav__btn').first().waitFor({ timeout: 30000 });
    await p.waitForFunction(() => document.querySelector('.iris')?.getAttribute('data-on') !== 'true', null, { timeout: 20000 });
    await p.waitForTimeout(4500);
  },
});

await scenario(
  'a',
  { ready: async (p) => { await toGate(p); await p.locator('.gate__input').pressSequentially(password.replace(/\D/g, '')); } },
  (p) => p.keyboard.press('Enter'),
  { span: 3500, shots: 18, every: 160 },
);
await scenario('b', { ready: toWelcome }, (p) => p.getByRole('button', { name: 'Step inside' }).click(), { span: 6000, shots: 30, every: 160 });
await scenario('c', inRoom(giftIds), (p) => p.locator('.room-ui__cta').click(), { span: 5000, shots: 28, every: 160 });
await scenario(
  'd',
  {
    seed: { unlocked: true, opened: giftIds, finaleSeen: false },
    ready: async (p) => {
      await inRoom(giftIds).ready(p);
      await p.locator('.room-ui__cta').click();
      await p.getByRole('button', { name: 'One more thing…' }).waitFor({ timeout: 30000 });
      await p.waitForTimeout(3000);
      await p.getByRole('button', { name: 'One more thing…' }).click();
      await p.getByRole('button', { name: 'Back to our room' }).waitFor({ state: 'visible', timeout: 15000 });
      await p.waitForTimeout(2500);
    },
  },
  (p) => p.getByRole('button', { name: 'Back to our room' }).click(),
  { span: 6000, shots: 30, every: 160 },
);
await scenario('e', inRoom([]), (p) => p.locator('.gift-nav__btn').first().click(), { span: 5000, shots: 28, every: 160 });

writeFileSync(`${out}/timing.json`, JSON.stringify(timing, null, 2));
await browser.close();
if (problems.length) {
  console.log('✗', [...new Set(problems)].join('\n  - '));
  process.exit(1);
}
console.log(`✓ frames in ${out}/ — run: python scripts/frame-stats.py ${out}`);
