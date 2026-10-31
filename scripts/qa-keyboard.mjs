/**
 * Keyboard-only walk through the whole story (no mouse, no touch).
 *   npm run qa:keyboard -- --url=http://localhost:4173/
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const url = args.url ?? 'http://localhost:4173/';
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1];
const out = 'qa-output/keyboard';
mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));

// (--gpu: the real GPU; without it swiftshader renders ~2 fps and the story's 3D clock crawls)
const browser = await chromium.launch({ executablePath: exe, args: process.argv.includes('--gpu') ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const focused = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"` : 'none';
  });
const tabTo = async (predicate, max = 20) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focused();
    if (predicate(f)) return f;
  }
  throw new Error('could not reach target with Tab');
};
let n = 0;
const snap = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });

try {
  await page.goto(`${url}?reset`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log('•', await tabTo((f) => f.includes('heart-hit')));
  await snap('heart-focus');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
  }
  await page.locator('#bday').waitFor({ timeout: 8000 });
  // the light writes the words before the field takes focus — wait for the caret, not a guess
  await page.waitForFunction(() => document.activeElement?.id === 'bday', null, { timeout: 15000 });
  console.log('• gate focus:', await focused());
  await page.keyboard.type(password.replace(/\D/g, ''));
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(6500);
  console.log('• welcome focus:', await focused());
  await snap('welcome-focus');
  await page.keyboard.press('Enter');
  // the room is shown once it has compiled (the iris opens then) — wait for that, not a guess
  await page.locator('.gift-nav__btn').first().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.iris')?.getAttribute('data-on') === 'false', null, { timeout: 20000 });
  // the room is hers once the gift buttons answer again (the way in holds them while the
  // light is still landing)
  await page.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2800);

  const count = await page.locator('.gift-nav__btn').count();
  for (let i = 0; i < count; i++) {
    const f = await tabTo((x) => x.includes('gift-nav__btn') && x.includes(`"0${i + 1}`));
    if (i === 0) {
      console.log('•', f);
      await snap('gift-focus');
    }
    await page.keyboard.press('Enter');
    // V: one touch — the sheet flies to her and becomes the page by itself
    await page.locator('.sheet').waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    const inSheet = await page.evaluate(() => !!document.activeElement?.closest('.sheet'));
    if (!inSheet) problems.push(`focus not moved into the sheet for gift ${i + 1}`);
    // Tab should stay inside the dialog
    for (let k = 0; k < 6; k++) await page.keyboard.press('Tab');
    const stillIn = await page.evaluate(() => !!document.activeElement?.closest('.sheet'));
    if (!stillIn) problems.push(`focus escaped the sheet for gift ${i + 1}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1300);
  }
  const f = await tabTo((x) => x.includes('Come closer'));
  console.log('•', f);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'One more thing…' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(4200);
  console.log('• finale focus:', await focused());
  await snap('finale-focus');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  await snap('secret');
  // the final surprise: it starts by itself; the answers are reachable from the keyboard
  await page.waitForFunction(() => document.querySelector('.finale')?.getAttribute('data-phase') === 'question', null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  const q = await focused();
  console.log('• surprise question focus:', q);
  if (!q.includes('I think so')) problems.push('the first answer is not focused when the question appears');
  await page.keyboard.press('Tab');
  const f2 = await focused();
  if (!f2.includes('more?')) problems.push(`Tab did not reach the second answer (got ${f2})`);
  await snap('surprise-question');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.finale')?.getAttribute('data-phase') === 'reveal', null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('.finale')?.getAttribute('data-phase') === 'waiting', null, { timeout: 15000 });
  await page.waitForTimeout(9000);
  console.log('• waiting focus:', await focused());
  await snap('surprise-waiting');
} catch (e) {
  problems.push(`step failed: ${e.message.split('\n')[0]}`);
  await snap('failure');
}
await browser.close();
if (problems.length) {
  console.log('✗', problems.join('\n  - '));
  process.exit(1);
}
console.log('✓ keyboard walk passed');
