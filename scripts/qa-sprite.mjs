/**
 * Films the light sprite's flights (storyboard D) on a VIRTUAL clock, so the result is the
 * real timing even on a machine that renders two frames a second (no GPU):
 * Playwright's fake clock owns requestAnimationFrame, setTimeout and performance.now — every
 * step advances exactly `--step` ms of story time and the frame is grabbed over CDP.
 * (CSS animations still run on the wall clock: the card's SVG frame and the iris are the only
 * CSS parts of these shots.)
 *
 *   npm run build && npm run preview
 *   node scripts/qa-sprite.mjs [--size=1280x800] [--only=a,b,c] [--step=33] [--every=200] [--gpu]
 *
 *  a  third touch → the sprite leaves the heart and draws the password card
 *  b  "Step inside" → corridor → tour of the room → into the orb
 *  c  "Come closer" → out of the orb, through the arched window → the finale's sky
 *  d  her hand sweeps across every gift (mouse moves stepped with the clock); e = the settle
 *     (`--log` prints the ring's spin, waves and touches during the sweep)
 *
 * Frames: qa-output/sprite-WxH/<scenario>-<ms>.png (ms = story time since the trigger).
 * Exits 1 on page errors.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const base = args.url ?? 'http://localhost:4173/';
const [W, H] = String(args.size ?? '1280x800').split('x').map(Number);
const only = args.only ? String(args.only).split(',') : null;
const STEP = Number(args.step ?? 33);
const EVERY = Number(args.every ?? 200);
const quality = args.quality ?? 'medium';
const out = `qa-output/sprite-${W}x${H}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const giftIds = [...readFileSync('src/data/gifts.ts', 'utf8').matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
const exe = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];

async function open(seed, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (seed)
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ ...s, at: Date.now() }));
    }, seed);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/AudioContext|our-song/.test(m.text()) && problems.push(`console.error: ${m.text().slice(0, 200)}`));
  // paused: story time moves only when this script says so
  await p.clock.install({ time: Date.now() });
  await p.clock.pauseAt(Date.now() + 1000);
  await p.goto(`${base}?debug&quality=${quality}${seed ? '' : '&reset'}${extra}`);
  const cdp = await ctx.newCDPSession(p);
  return { p, cdp, ctx };
}

/** Advance story time by `ms`, one frame at a time. */
async function run(p, ms) {
  for (let t = 0; t < ms; t += STEP) await p.clock.runFor(STEP);
}

async function grab(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(data, 'base64'));
}

/** Film `span` ms of story time from now, a frame every EVERY ms. */
async function film({ p, cdp }, name, span) {
  for (let t = 0; t <= span; t += EVERY) {
    await grab(cdp, `${out}/${name}-${String(t).padStart(5, '0')}.png`);
    if (args.log)
      console.log(
        name,
        t,
        await p.evaluate(() => {
          const s = window.__sprite;
          const c = window.__camera;
          const f = (v) => (v ? [v.x, v.y, v.z].map((n) => n.toFixed(2)).join(',') : '-');
          return s ? `play=${s.playing} mode=${s.cam.mode} w=${s.cam.weight.x.toFixed(2)} leader=${f(s.leader)} cam=${f(c?.position)} stage=${document.querySelector('main')?.dataset.stage} busy=${!!document.querySelector('.room-ui.is-busy')} navOff=${document.querySelectorAll('.gift-nav__btn[disabled]').length} moment=${document.body.dataset.moment ?? ''}` : 'no sprite';
        }),
      );
    await run(p, EVERY);
  }
  console.log(`• filmed ${name}: ${Math.floor(span / EVERY) + 1} frames over ${span} ms`);
}

async function until(p, fn, max = 30000) {
  for (let t = 0; t < max; t += 250) {
    if (await p.evaluate(fn).catch(() => false)) return true;
    await run(p, 250);
  }
  throw new Error(`timed out waiting for ${fn}`);
}

const want = (n) => !only || only.includes(n);

if (want('a') || want('b')) {
  const s = await open(null);
  const { p } = s;
  await until(p, () => !!document.querySelector('canvas'));
  // the boot veil first; then each touch must count (the heart answers only once it has
  // gathered) — touch again until the count moves
  await until(p, () => document.querySelector('.boot')?.getAttribute('data-on') === 'false');
  const taps = () => p.evaluate(() => {
    const l = document.querySelector('[aria-label^="Touch the glowing heart"], [aria-label="The heart is open"]')?.getAttribute('aria-label') ?? '';
    return l.includes('open') ? 3 : Number(/\((\d) of/.exec(l)?.[1] ?? 0);
  });
  for (let i = 1; i <= 3; i++) {
    for (let k = 0; k < 40 && (await taps()) < i; k++) {
      await p.mouse.click(W / 2, H / 2);
      if ((await taps()) < i) await run(p, 500);
    }
    if (i < 3) await run(p, i === 1 ? 4500 : 900);
  }
  if (want('a')) await film(s, 'a', 4400);
  else await run(p, 4400);
  await until(p, () => !!document.querySelector('.gate__input'));
  await run(p, 1500);
  if (want('b')) {
    await p.locator('.gate__input').pressSequentially(password.replace(/\D/g, ''));
    await p.keyboard.press('Enter');
    await until(p, () => [...document.querySelectorAll('button')].some((b) => /step inside/i.test(b.textContent ?? '')));
    await run(p, 7000);
    // (a DOM click: Playwright's actionability checks wait on rAF, which the fake clock owns)
    await p.evaluate(() => document.querySelector('.welcome .btn')?.click());
    await film(s, 'b', 9000);
  }
  await s.ctx.close();
}

if (want('c')) {
  const s = await open({ unlocked: true, opened: giftIds, finaleSeen: false });
  const { p } = s;
  await until(p, () => !!document.querySelector('.room-ui__cta'));
  await run(p, 6000);
  await p.evaluate(() => document.querySelector('.room-ui__cta')?.click());
  await film(s, 'c', 6600);
  await s.ctx.close();
}

// d: her hand sweeps across the gifts (storyboard F) — mouse moves stepped with the clock
if (want('d')) {
  const s = await open({ unlocked: true, opened: [], finaleSeen: false });
  const { p, cdp } = s;
  await until(p, () => !!document.querySelector('.gift-nav__btn'));
  await until(p, () => document.querySelectorAll('.gift-label').length >= 3, 60000);
  await run(p, 5000);
  // the gifts' labels (plain DOM) tell where they are on screen: sweep a little above them
  const pts = await p.evaluate(() =>
    [...document.querySelectorAll('.gift-label')].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top - 40];
    }),
  );
  pts.sort((a, b) => a[0] - b[0]);
  console.log('gift screen points', JSON.stringify(pts.map((q) => q.map(Math.round))));
  // through every gift, left to right, a little past each end (one stroke, ~0.6 s)
  const path = [[pts[0][0] - 60, pts[0][1]], ...pts, [pts[pts.length - 1][0] + 60, pts[pts.length - 1][1]]];
  const at = (k) => {
    const f = k * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const u = f - i;
    return [path[i][0] + (path[i + 1][0] - path[i][0]) * u, path[i][1] + (path[i + 1][1] - path[i][1]) * u];
  };
  await p.mouse.move(...path[0]);
  await run(p, 300);
  let t = 0;
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    await p.mouse.move(...at(k));
    await run(p, 33);
    if (args.log && i % 3 === 0) console.log('sweep', i, await p.evaluate(() => { const r = window.__giftRing; return r ? `spin=${r.spin.toFixed(3)} vel=${r.spinVel.toFixed(3)} waves=${r.waves.length} touched=${r.touched.length}` : '-'; }));
    if (i % 3 === 0) {
      await grab(cdp, `${out}/d-${String(t).padStart(5, '0')}.png`);
    }
    t += 33;
  }
  // …and how everything settles after her hand has gone (s from the end of the sweep)
  await film(s, 'e', 2400);
  await s.ctx.close();
}

await browser.close();
if (problems.length) {
  console.log('✗', [...new Set(problems)].join('\n  - '));
  process.exit(1);
}
console.log(`✓ frames in ${out}/`);
