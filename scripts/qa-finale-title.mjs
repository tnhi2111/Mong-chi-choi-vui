/**
 * AA2 — the finale's title reads exactly `birthdayConfig.final.title` ("Happy Birthday, chị
 * giáo") followed by its heart, in Cormorant with its Vietnamese marks (no fallback font), on
 * one balanced line or two — never a single word alone on the last line, the heart right after
 * the last word.
 *
 *   node scripts/qa-finale-title.mjs [--gpu] [--sizes=1440x900,1920x1080,390x844m]
 * Shots: qa-output/finale-title-<size>.png
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const sizes = arg('sizes', '1440x900,1920x1080,390x844m').split(',');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const want = /final:\s*\{[\s\S]*?title:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1];
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ALL = ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'];
const problems = [];
if (want !== 'Happy Birthday, chị giáo') problems.push(`birthdayConfig.final.title is "${want}"`);

for (const sz of sizes) {
  const mobile = sz.endsWith('m');
  const [W, H] = sz.replace('m', '').split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.addInitScript((opened) => {
    if (sessionStorage.getItem('qa-seeded')) return;
    sessionStorage.setItem('qa-seeded', '1');
    sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened, finaleSeen: false, at: Date.now() }));
  }, ALL);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${sz}: pageerror ${e.message}`));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.locator('.room-ui__cta').waitFor({ timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.locator('.room-ui__cta').click();
  await p.locator('.finale__title').waitFor({ timeout: 40000 });
  // (the light writes it, then the real words take over)
  await p.waitForTimeout(4500);
  const r = await p.evaluate(async () => {
    const h = document.querySelector('.finale__title');
    const heart = h.querySelector('.finale__heart');
    const words = [...h.querySelectorAll('.lt__w')];
    const text = words.map((w) => w.textContent.trim()).join(' ');
    const lines = new Map();
    for (const w of words) {
      const top = Math.round(w.getBoundingClientRect().top / 4);
      lines.set(top, (lines.get(top) ?? 0) + 1);
    }
    const last = words[words.length - 1].getBoundingClientRect();
    const hr = heart.getBoundingClientRect();
    const cs = getComputedStyle(words[0]);
    await document.fonts.ready;
    // the font that really draws "chị giáo": Cormorant must hold those glyphs (its Vietnamese
    // subset is loaded), and a canvas in that font must differ from the fallback
    const fam = cs.fontFamily;
    const loaded = document.fonts.check(`${cs.fontWeight} ${cs.fontSize} "Cormorant Garamond"`, 'chị giáo');
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontWeight} 64px "Cormorant Garamond", serif`;
    const a = c.measureText('chị giáo').width;
    c.font = `${cs.fontWeight} 64px serif`;
    const b = c.measureText('chị giáo').width;
    return { text, fam, loaded, differsFromFallback: Math.abs(a - b) > 1, lines: [...lines.values()], heartGap: hr.left - last.right, heartSameLine: Math.abs(hr.top + hr.height / 2 - (last.top + last.height / 2)) < last.height * 0.6, inFrame: h.getBoundingClientRect().right <= innerWidth && h.getBoundingClientRect().left >= 0 };
  });
  await p.screenshot({ path: `qa-output/finale-title-${sz}.png` });
  console.log(sz, JSON.stringify(r));
  if (r.text !== want) problems.push(`${sz}: the title reads "${r.text}"`);
  if (!r.fam.includes('Cormorant') || !r.loaded || !r.differsFromFallback) problems.push(`${sz}: "chị giáo" is not drawn in Cormorant (${r.fam}, loaded ${r.loaded})`);
  if (r.lines.length > 1 && r.lines[r.lines.length - 1] < 2) problems.push(`${sz}: a single word alone on the last line (${r.lines.join('/')})`);
  if (!r.heartSameLine || r.heartGap > 40 || r.heartGap < -2) problems.push(`${sz}: the heart is not right after the last word (gap ${r.heartGap.toFixed(0)} px)`);
  if (!r.inFrame) problems.push(`${sz}: the title runs out of the screen`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? '✗ ' + problems.join('\n✗ ') : `✓ the finale reads "${want} ❤" in Cormorant, balanced, at every size`);
process.exit(problems.length ? 1 : 0);
