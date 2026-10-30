/**
 * End-to-end walk through the whole experience with Playwright.
 *
 *   npm run build && npm run preview   (in one terminal)
 *   npm run qa -- --url=http://localhost:4173/ --size=1440x900
 *   npm run qa -- --size=390x844 --mobile
 *
 * Screenshots land in qa-output/<size>/. Exits non-zero on console errors,
 * failed requests, horizontal overflow, or any broken step.
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
// --reduced asks the browser for reduced motion; the site only calms down if it honours
// that (birthday.ts motion.respectReducedMotion) — otherwise it must behave as normal
const honoursReduced = /respectReducedMotion:\s*true/.test(readFileSync('src/config/birthday.ts', 'utf8'));
const reducedRequested = !!args.reduced;
const reduced = reducedRequested && honoursReduced;
// read the real password from the config, so the test never goes stale
const configured = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1];
const password = args.password ?? configured ?? '01/01/2000';
const out = `qa-output/${w}x${h}${mobile ? '-touch' : ''}${reducedRequested ? '-reduced' : ''}${args.nogl ? '-nogl' : ''}`;
mkdirSync(out, { recursive: true });

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find(
  (p) => p && existsSync(p),
);

const browser = await chromium.launch({
  executablePath: exe,
  args: [
    ...(args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
    '--autoplay-policy=user-gesture-required',
  ],
});
const context = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: reducedRequested ? 'reduce' : 'no-preference',
});
const page = await context.newPage();

const problems = [];
const log = (...m) => console.log('•', ...m);
page.on('console', (msg) => {
  const t = msg.text();
  // headless Chrome has no real audio device; the app already goes silent when that happens
  if (msg.type() === 'error' && !/AudioContext encountered an error from the audio device/.test(t)) problems.push(`console.error: ${t}`);
  else if (msg.type() === 'warning' && !/GPU stall|GL Driver Message|swiftshader|Automatic fallback to software WebGL/i.test(t))
    console.log('  [warn]', t.slice(0, 200));
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => !r.url().includes('our-song') && problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('our-song')) problems.push(`HTTP ${r.status()}: ${r.url()}`);
});

const requested = [];
page.on('request', (r) => requested.push(r.url()));

let shot = 0;
const snap = async (name) => {
  const file = `${out}/${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('shot', file);
};
const overflow = async (where) => {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sheet: (() => {
      const s = document.querySelector('.sheet__scroll');
      return s ? s.scrollWidth - s.clientWidth : 0;
    })(),
  }));
  if (o.sw > o.iw + 1 || o.sheet > 1) problems.push(`horizontal overflow at ${where}: ${JSON.stringify(o)}`);
};
const tap = async (x, y) => (mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const fps = async (ms = 2000) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < ms) requestAnimationFrame(f);
          else res(Math.round((n * 1000) / ms));
        };
        requestAnimationFrame(f);
      }),
    ms,
  );

try {
  await page.goto(`${url}?reset${args.nogl ? '&nogl' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const hasCanvas = await page.locator('canvas').count();
  const early = requested.filter((u) => /memories\//.test(u));
  if (early.length) problems.push(`memory photos loaded before any gift was opened: ${early.join(', ')}`);
  log('requests on first load:', requested.length);
  log('canvas present:', hasCanvas > 0);
  await snap('intro');
  await page.waitForTimeout(4000);
  await snap('intro-hint');

  // Stage 2: tap the heart three times (centre of the screen)
  for (let i = 0; i < 3; i++) {
    if (args.nogl || !hasCanvas) await page.locator('.heart-hit').click();
    else await tap(w / 2, h / 2);
    // the first touch gathers the light into a heart (~3.2 s) before it can beat
    await page.waitForTimeout(i === 0 && !args.nogl && hasCanvas ? (reduced ? 1600 : 3900) : 900);
    if (i === 0) await snap('intro-gathered');
    if (i === 1) await snap('intro-tap2');
  }
  await page.waitForTimeout(400);
  await snap('intro-unlocked');

  // Stage 3: gate
  await page.locator('#bday').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await snap('gate');
  await page.locator('#bday').fill('12/12/1999');
  await page.locator('.gate__submit').click();
  await page.waitForTimeout(700);
  const msg = await page.locator('#gate-msg').innerText();
  log('wrong-password message:', JSON.stringify(msg));
  if (!msg.trim()) problems.push('no error message after wrong password');
  await snap('gate-wrong');
  await page.locator('#bday').fill('');
  await page.locator('#bday').pressSequentially(password.replace(/\D/g, ''), { delay: 30 });
  log('masked value:', await page.locator('#bday').inputValue());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2600);

  // Welcome
  await page.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(5200);
  await snap('welcome');
  await overflow('welcome');
  await page.getByRole('button', { name: 'Step inside' }).click();
  await page.waitForTimeout(3500);
  await snap('room');
  await overflow('room');
  if (!args.nogl) log('room fps (swiftshader, informative only):', await fps());

  const giftButtons = page.locator('.gift-nav__btn');
  const n = await giftButtons.count();
  log('gifts:', n);

  for (let i = 0; i < n; i++) {
    // First gift: click the 3D object itself (just above its floating label).
    if (i === 0 && !args.nogl && hasCanvas) {
      const label = page.locator('.gift-label').first();
      // the camera pulls back out of the orb on arrival (slowly without a GPU): wait until
      // the gift has stopped moving on screen before aiming at it
      let box = await label.boundingBox();
      for (let k = 0; k < 60; k++) {
        await page.waitForTimeout(500);
        const next = await label.boundingBox();
        const still = box && next && Math.abs(next.x - box.x) < 2 && Math.abs(next.y - box.y) < 2;
        box = next;
        if (still) break;
      }
      if (box) {
        if (!mobile) {
          await page.mouse.move(box.x + box.width / 2, box.y - 30);
          await page.waitForTimeout(600);
          await snap('room-hover');
        }
        await tap(box.x + box.width / 2, box.y - 30);
      }
      await page.waitForTimeout(400);
      if (!(await page.locator('.room-ui.is-busy').count())) {
        problems.push('clicking the 3D gift did not start opening; falling back to nav button');
        await giftButtons.nth(i).click();
      }
    } else {
      await giftButtons.nth(i).click();
    }
    await page.waitForTimeout(700);
    if (i === 0) await snap('gift-opening');
    await page.locator('.sheet').waitFor({ timeout: 15000 }); // each opening is 5–6.5 s now (motion.gift.open)
    await page.waitForTimeout(1300);
    const isLetter = await page.locator('.sheet--letter').count();
    await snap(isLetter ? 'letter-typing' : `memory-${i + 1}`);
    await overflow(`gift ${i + 1}`);
    if (isLetter) {
      // with reduced motion the whole letter is already there — no skip button
      const skip = page.getByRole('button', { name: 'Show all' });
      if (reduced) {
        if (await skip.count()) problems.push('reduced motion: letter still typing');
      } else if (await skip.isVisible()) await skip.click({ timeout: 3000 }).catch(() => {}); // may finish typing first
      await page.waitForTimeout(1500);
      await snap('letter-full');
      await page.locator('.sheet__scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(900);
      await snap('letter-end');
    } else {
      await page.locator('.sheet__scroll').evaluate((el) => el.scrollBy(0, el.clientHeight * 0.9));
      await page.waitForTimeout(1100);
      if (i === 0 || i === 1) await snap(`memory-${i + 1}-scrolled`);
      await page.locator('.sheet__scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(1100);
      if (i === 1) await snap(`memory-${i + 1}-end`);
    }
    // close: alternate Escape and the button to test both
    if (i % 2) await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForTimeout(1600);
    if ((await page.locator('.sheet').count()) > 0) problems.push(`sheet did not close for gift ${i + 1}`);
  }

  await page.waitForTimeout(800);
  await snap('room-all-opened');
  await page.getByRole('button', { name: 'Come closer' }).click();
  await page.waitForTimeout(reduced ? 1500 : 2200);
  await snap('final-gathering');
  await page.waitForTimeout(2000);
  await snap('final-gathering-2');
  await page.getByRole('button', { name: 'One more thing…' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(4000);
  await snap('final-formed');
  await overflow('final');
  await page.getByRole('button', { name: 'One more thing…' }).click();
  await page.waitForTimeout(8500);
  await snap('final-secret');

  // Reload: progress should be remembered (room, not intro)
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const resumed = await page.locator('.gift-nav').count();
  log('resumed straight into the room:', resumed > 0);
  if (!resumed) problems.push('progress was not restored on reload');
  await snap('reload-resume');
} catch (e) {
  problems.push(`step failed: ${e.message.split('\n')[0]}`);
  await snap('failure').catch(() => {});
}

await browser.close();
if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log('\n✓ all steps passed');
