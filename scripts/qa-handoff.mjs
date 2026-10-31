/**
 * K — the sheet that flies out of a gift IS the memory page. For each gift:
 *  1. films the opening → page → closing with real timestamps in the file names
 *     (qa-output/handoff-WxH/gN/…) and a contact sheet;
 *  2. measures the handoff: with `__leafHold` the page stays on the sheet's corners; one
 *     shot with the page (3D sheet hidden), one with the 3D sheet (page hidden); the paper's
 *     four corners are found in both (scripts/handoff-corners.py) and compared (≤ 2 px).
 *
 *   node scripts/qa-handoff.mjs [--gpu] [--size=1440x900] [--mobile] [--only=1,2,3,4,5] [--nofilm]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const film = !process.argv.includes('--nofilm');
const only = arg('only', '1,2,3,4,5').split(',').map(Number);
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/handoff-${W}x${H}${mobile ? 'm' : ''}`;
mkdirSync(out, { recursive: true });
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const py = process.env.PYTHON ?? 'python';
const problems = [];
const results = [];

async function room() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  p.on('console', (m) => /CONTEXT_LOST/i.test(m.text()) && problems.push('webgl context lost'));
  await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
  await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 40000 });
  await p.waitForTimeout(2500);
  return { ctx, p };
}

for (const n of only) {
  // ── 1. the film ──
  if (film) {
    const { ctx, p } = await room();
    const dir = `${out}/g${n}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    let i = 0;
    const shot = async (tag) => p.screenshot({ path: `${dir}/f-${String(i++).padStart(2, '0')}_${String(Date.now() - t0).padStart(5, '0')}ms-${tag}.png` });
    await p.locator('.gift-nav__btn').nth(n - 1).click();
    let straight = null;
    while (Date.now() - t0 < 16000) {
      await shot('open');
      const st = await p.evaluate(() => ({ leaf: !!document.querySelector('.leaf'), inked: !!document.querySelector('.leaf.is-inked'), wait: !!window.__carrier?.waiting }));

      if (st.inked && straight === null) straight = Date.now() - t0;
      if (straight !== null && Date.now() - t0 > straight + 700) break;
    }
    results.push({ gift: n, straightMs: straight });
    if (straight === null) problems.push(`gift ${n}: the page never stood straight`);
    await p.waitForTimeout(400);
    await shot('page');
    const tc = Date.now();
    await p.locator('.sheet__bar .btn').first().click();
    while (Date.now() - tc < 2600) await shot('close');
    await ctx.close();
    try {
      execFileSync(py, ['scripts/frame-sheet.py', `${dir}/f-*.png`, `${dir}/_sheet.jpg`], { stdio: 'inherit' });
    } catch {}
  }

  // ── 2. the handoff, measured ──
  {
    const { ctx, p } = await room();
    await p.evaluate(() => (window.__leafHold = true));
    await p.locator('.gift-nav__btn').nth(n - 1).click();
    await p.locator('.leaf').waitFor({ timeout: 15000 });
    await p.waitForTimeout(250);
    const quad = await p.evaluate(() => window.__carrier?.quad);
    const a = `${out}/hand-${n}-page.png`;
    const b = `${out}/hand-${n}-sheet.png`;
    // the page's dark is still coming in: hide it in both shots so only the paper differs
    await p.addStyleTag({ content: '.sheet::before, .sheet__bar { display: none !important; }' });
    await p.waitForTimeout(600);
    await p.waitForTimeout(80);
    await p.screenshot({ path: a });
    await p.evaluate(() => {
      document.querySelector('.leaf').style.visibility = 'hidden';
      window.__carrier.handed = false;
    });
    await p.waitForTimeout(250);
    await p.screenshot({ path: b });
    await ctx.close();
    try {
      const res = execFileSync(py, ['scripts/handoff-corners.py', a, b, JSON.stringify(quad)]).toString().trim();
      console.log(`gift ${n}:`, res);
      const err = Number(/max (\S+) px/.exec(res)?.[1] ?? NaN);
      results.push({ gift: n, handoffErrPx: err });
      if (!(err <= 2)) problems.push(`gift ${n}: the page lands ${err} px off the sheet`);
    } catch (e) {
      problems.push(`gift ${n}: could not measure the handoff (${String(e).slice(0, 120)})`);
    }
  }
}

await browser.close();
console.log(JSON.stringify(results));
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ every page takes over from its sheet');
process.exit(problems.length ? 1 : 0);
