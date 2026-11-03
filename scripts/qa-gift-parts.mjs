/**
 * Z2 — every moving part of a gift's opening stays inside the frame. For each gift (and a few
 * turns of the ring), every frame of the opening until its page arrives: the screen box of the
 * gift's own meshes (the box's lid on its own; for the others the whole gift — the flying
 * letter sheet and its trail are left out) must keep ≥ 3 % from every edge, and must not
 * touch the room's title ("A little room for two") or the gift buttons while those are shown.
 * The view is turned first (`__orbit.tYaw`, `--turns`), as when she drags the world round.
 * 12 frames of each opening are saved (qa-output/gift-parts-<size>/g<n>-*.png).
 *
 *   node scripts/qa-gift-parts.mjs [--gpu] [--sizes=1440x900,1920x1080,390x844m] [--only=1,2,3,4,5] [--turns=0,120,240]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const sizes = arg('sizes', '1440x900,1920x1080,390x844m').split(',');
const only = arg('only', '1,2,3,4,5').split(',').map(Number);
const turns = arg('turns', '0,120,240').split(',').map(Number);
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const IDS = ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'];
const MARGIN = 0.03;
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const problems = [];

/** In the page: record the parts' screen boxes every frame (and the HUD's rects). */
function record([id, lidOnly]) {
  const T = window.__THREE;
  let root = null;
  window.__scene.traverse((o) => { if (!root && o.name === `gift:${id}`) root = o; });
  const rec = [];
  window.__parts = rec;
  const t0 = performance.now();
  const v = new T.Vector3();
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const boxOf = (target, skip) => {
    const cam = window.__camera;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    target?.traverse((o) => {
      if (skip && (o === skip || (() => { for (let x = o; x; x = x.parent) if (x === skip) return true; return false; })())) return;
      if (!o.isMesh || !shown(o) || o.material?.colorWrite === false) return;
      if (o.name === 'paper-carrier' || o.material?.uniforms?.uGhost) return; // (the letter flies by design)
      if (o.material?.transparent && (o.material.opacity ?? 1) < 0.05) return;
      if (o.material?.blending === T.AdditiveBlending) return; // (light, not a part)
      if (o.userData.giftHit) return;
      o.geometry.computeBoundingBox?.();
      const bb = o.geometry.boundingBox;
      if (!bb) return;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).project(cam);
        if (v.z > 1) continue;
        const x = (v.x * 0.5 + 0.5) * innerWidth;
        const y = (-v.y * 0.5 + 0.5) * innerHeight;
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    });
    return box;
  };
  const lid = root.getObjectByName('gift-lid');
  // (the thing itself — not its product-shot pedestal, glow or backdrop, which are made to be
  //  wide; the flying letter and its trail are left out above)
  const thing = root.getObjectByName('gift-body') ?? root;
  const tick = () => {
    // the parts judged (the lid alone for the box, else the whole thing), and its body
    const box = boxOf(lidOnly ? lid : thing, null);
    const body = boxOf(thing, lidOnly ? lid : null);
    // (shown = its own opacity × its fading filter ≥ 0.5: the room's UI fades out over 0.5 s as
    //  an opening starts)
    const seen = (e) => {
      let k = 1;
      for (let x = e; x && x.nodeType === 1; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
        k *= +cs.opacity;
        const m = /opacity\(([\d.]+)\)/.exec(cs.filter);
        if (m) k *= +m[1];
      }
      return k;
    };
    const hud = [...document.querySelectorAll('.room-ui__title, .gift-nav')].filter((e) => seen(e) >= 0.5).map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    rec.push({ t: performance.now() - t0, box, body, hud, page: !!document.querySelector('.leaf') });
    if (!document.querySelector('.leaf.is-inked') && performance.now() - t0 < 14000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

for (const sz of sizes) {
  const mobile = sz.endsWith('m');
  const [W, H] = sz.replace('m', '').split('x').map(Number);
  const out = `qa-output/gift-parts-${sz}`;
  mkdirSync(out, { recursive: true });
  for (const n of only)
    for (const turn of turns) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(() => sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() })));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => problems.push(`${sz}: pageerror ${e.message}`));
      await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
      await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
      // (a turn of her view, as when she drags the world round before touching — the ring's own
      //  QA turn moves the gifts without the opening camera knowing)
      await p.evaluate((a) => { if (window.__orbit) window.__orbit.tYaw = a; }, (turn * Math.PI) / 180);
      await p.waitForTimeout(2500);
      const lidOnly = n === 1;
      await p.evaluate(record, [IDS[n - 1], lidOnly]);
      await p.locator('.gift-nav__btn').nth(n - 1).click();
      // 12 frames of the opening (first turn only)
      if (turn === turns[0]) for (let f = 0; f < 12; f++) {
        await p.waitForTimeout(330);
        await p.screenshot({ path: `${out}/g${n}-${String(f).padStart(2, '0')}.png` });
      }
      await p.locator('.leaf.is-inked').waitFor({ timeout: 16000 }).catch(() => {});
      const rec = await p.evaluate(() => window.__parts);
      await ctx.close();
      writeFileSync(`${out}/g${n}-turn${turn}.json`, JSON.stringify(rec));
      let worst = 1;
      let hits = 0;
      // (judged in the frames where the gift's body is wholly inside the frame: while the camera
      //  turns to a gift at the ring's edge the whole gift passes the screen's edge — that is the
      //  camera, not a part flying out)
      const inside = (b) => b[0] >= 0 && b[1] >= 0 && b[2] <= W && b[3] <= H;
      for (const r of rec) {
        if (r.page || !Number.isFinite(r.box[0])) continue;
        // (for the box: its body without the lid; for the others the whole thing at its
        //  frame's first framing — it must not leave the frame once it has been in it)
        if (lidOnly && (!Number.isFinite(r.body[0]) || !inside(r.body))) continue;
        // (the others: once the camera has come to the gift — ~1 s at the gift camera's pace)
        if (!lidOnly && r.t < 1500) continue;
        const [x0, y0, x1, y1] = r.box;
        const m = Math.min(x0 / W, y0 / H, (W - x1) / W, (H - y1) / H);
        // (the lid may never come nearer an edge than the box itself stands: at the touch a gift
        //  at the ring's side can stand within 3 % of the edge, its closed lid with it)
        const b = r.body;
        const bm = lidOnly && Number.isFinite(b[0]) ? Math.min(b[0] / W, b[1] / H, (W - b[2]) / W, (H - b[3]) / H) : 1;
        worst = Math.min(worst, m + Math.max(0, MARGIN - bm));
        if (r.hud.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b)) hits++;
      }
      const what = lidOnly ? 'the lid' : 'its parts';
      console.log(`${sz} gift ${n} turn ${turn}°: ${what} keep ${(worst * 100).toFixed(1)} % from the edge, ${hits} frames over the title/buttons`);
      if (worst < MARGIN) problems.push(`${sz} gift ${n} turn ${turn}°: ${what} come within ${(worst * 100).toFixed(1)} % of the edge`);
      if (hits) problems.push(`${sz} gift ${n} turn ${turn}°: ${what} cross the title or the buttons in ${hits} frames`);
    }
}
await browser.close();
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ every moving part stays in the frame, clear of the title and the buttons');
process.exit(problems.length ? 1 : 0);
