/**
 * Films every change of world as strips of frames, to judge the transitions by eye:
 *   a: password accepted → welcome      b: "Step inside" → room (dive into the heart, iris,
 *   the camera pulling back out of the orb)      c: room → finale (dive into the orb)
 *
 *   npm run build && npm run preview
 *   node scripts/qa-transitions.mjs [--gpu] [--size=800x500]
 *
 * Frames land in qa-output/transitions-WxH/. Without a GPU the 3D runs at a few fps while
 * CSS (the iris) runs in real time — read timing only from a --gpu run.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const url = args.url ?? 'http://localhost:4173/';
const [W, H] = String(args.size ?? '800x500').split('x').map(Number);
const out = `qa-output/transitions-${W}x${H}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const giftIds = [...readFileSync('src/data/gifts.ts', 'utf8').matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
const exe = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => p && existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
const watch = (page) => {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/AudioContext/.test(m.text()) && problems.push(`console.error: ${m.text()}`));
};
const film = async (page, name, n, every) => {
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, '0')}.png` });
    const left = every - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
  }
  console.log('• filmed', name);
};

// a + b: from the first touch to the room
{
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  watch(page);
  await page.goto(`${url}?reset&debug`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(W / 2, H / 2);
    await page.waitForTimeout(i === 0 ? 6000 : 1500);
  }
  await page.locator('.gate__input').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.fill('.gate__input', password);
  await page.locator('.gate__submit').click();
  await film(page, 'a-gate-to-welcome', 10, 400);
  const step = page.locator('.welcome .btn');
  await step.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await step.click();
  await film(page, 'b-into-room', 22, 300);
  await page.close();
}

// c: every memory opened → "come closer" → the finale
{
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((ids) => {
    if (sessionStorage.getItem('qa-seeded')) return;
    sessionStorage.setItem('qa-seeded', '1');
    sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: ids, finaleSeen: false, at: Date.now() }));
  }, giftIds);
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${url}?debug`);
  const cta = page.locator('.room-ui__cta');
  await cta.waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await cta.click();
  await film(page, 'c-room-to-finale', 18, 350);
}

await browser.close();
if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✓ no errors');
