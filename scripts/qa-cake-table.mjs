/**
 * Y1 — the cake moment, judged in pixels: the cake stands on a real table and the frame is the
 * cake, its table and the warm room behind — not the floor.
 *
 * Each frame is drawn twice more, at the same instant, with flat ID colours (an "ID render"):
 *   A: the scene, the floor (+ the stage) flat green, the cake flat red, its table flat blue,
 *      everything else with its real material (the wall's dolls'-house cut and the props that
 *      step aside live in their shaders) — light that is only ADDED (points, glows) is left out
 *   B: the cake and its table alone, flat — their mask
 * Then: floor pixels / frame ≤ 25 %; cake + table pixels hidden by anything (in B, not red or
 * blue in A) = 0; the cake's box inside the frame with a margin ≥ 6 % on every side.
 * Also: the cake's foot rests on the table (a ray down meets the table's top within 2 cm), and
 * the moment opened 5 times lands the same camera and the same picture, never burned white.
 *
 *   node scripts/qa-cake-table.mjs [--gpu] [--sizes=1440x900,1920x1080,390x844m] [--steps=36]
 *        [--resumed]  (Z1: by default it comes in by HER way — intro → password → the light's
 *                      tour, the path where the set pieces once sank under the floor; this adds a
 *                      visit resumed in the room)
 * Also: the table must be seen — ≥ 8 % of the frame.
 * Shots in qa-output/cake-table/ (the moment at each size, the worst frame, a sheet of turns).
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { measure, support, enterRoom as enter } from './lib/cake-seg.mjs';
const enterRoom = (p, W, H, mobile, ledIn) => enter(p, { url, W, H, mobile, ledIn, password });

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const sizes = arg('sizes', '1440x900,1920x1080,390x844m').split(',');
const steps = +arg('steps', '36');
const gpu = process.argv.includes('--gpu');
const resumedToo = process.argv.includes('--resumed');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = 'qa-output/cake-table';
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const LIMIT = { floor: 0.25, margin: 0.06, gap: 0.02, table: 0.08 };
const problems = [];

const stats = (p) =>
  p.evaluate(async () => {
    // the frame as she sees it: mean light, and how much of it is burned near-white
    const c = document.querySelector('canvas');
    const g = Object.assign(document.createElement('canvas'), { width: 480, height: Math.round((480 * c.height) / c.width) }).getContext('2d');
    await new Promise((r) => requestAnimationFrame(r));
    g.drawImage(c, 0, 0, g.canvas.width, g.canvas.height);
    const d = g.getImageData(0, 0, g.canvas.width, g.canvas.height).data;
    let sum = 0;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++;
    }
    return { mean: +(sum / (d.length / 4)).toFixed(1), white: +((white / (d.length / 4)) * 100).toFixed(2) };
  });

const runs = sizes.map((s) => [s, true]);
if (resumedToo) runs.push(...sizes.map((s) => [s, false]));
const worst = [];
for (const [sz, ledIn] of runs) {
  const mobile = sz.endsWith('m');
  const [W, H] = sz.replace('m', '').split('x').map(Number);
  const tag = `${sz}${ledIn ? '' : '-resumed'}`;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (!ledIn)
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() }));
    });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${tag}: pageerror ${e.message}`));
  await enterRoom(p, W, H, mobile, ledIn);
  const s = await p.evaluate(support);
  console.log(`${tag} support`, JSON.stringify(s));
  if (s.error) problems.push(`${tag}: ${s.error}`);
  else {
    if (s.gap === null || Math.abs(s.gap) > LIMIT.gap) problems.push(`${tag}: nothing holds the cake within ${LIMIT.gap * 100} cm (gap ${s.gap}, ${s.hitPart})`);
    if (s.topAboveFloor < 0.72 || s.topAboveFloor > 0.78) problems.push(`${tag}: the table's top is ${s.topAboveFloor} m above the floor`);
    if (Math.abs(s.footOnFloor) > 0.01) problems.push(`${tag}: the table's foot is ${s.footOnFloor} m off the floor`);
    if (s.cakeVsTop < 0.55 || s.cakeVsTop > 0.75) problems.push(`${tag}: the cake is ${(s.cakeVsTop * 100).toFixed(0)} % of the table's top`);
  }
  // the moment, 5 times: the same camera, the same picture
  const opens = [];
  for (let n = 0; n < 5; n++) {
    await p.evaluate(() => window.__moment('cake'));
    await p.waitForTimeout(5000);
    const cam = await p.evaluate(() => window.__camera.position.toArray());
    const pose = await p.evaluate(() => {
      const c = window.__camera;
      const f = c.getWorldDirection(new window.__THREE.Vector3());
      let floor = null;
      window.__scene.traverse((o) => { if (!floor && o.isMesh && o.userData.seg === 'floor') floor = o; });
      const fy = new window.__THREE.Vector3().setFromMatrixPosition(floor.matrixWorld).y;
      return { pitch: +((Math.asin(f.y) * 180) / Math.PI).toFixed(1), height: +(c.position.y - fy).toFixed(2), fov: +c.fov.toFixed(1) };
    });
    if (n === 0) {
      console.log(`${tag} camera: pitch ${pose.pitch}°, ${pose.height} m above the floor, lens ${pose.fov}°`);
      if (pose.pitch > -8 || pose.pitch < -14) problems.push(`${tag}: the camera's pitch is ${pose.pitch}° (want -8° to -14°)`);
      // a little above the table's top (0.77 m): a person standing by it. (A phone's tall frame
      // must fit the table's width, so it stands further back and so higher.)
      const maxH = mobile ? 2.2 : 1.7;
      if (pose.height < 0.75 || pose.height > maxH) problems.push(`${tag}: the camera stands ${pose.height} m above the floor (want 0.75–${maxH})`);
    }
    const st = await stats(p);
    const m = await p.evaluate(measure, LIMIT);
    opens.push({ cam, ...st, floor: m.floor });
    if (n === 0) await p.screenshot({ path: `${out}/moment-${tag}.png` });
    if (n < 4) {
      await p.evaluate(() => window.__moment(null));
      await p.waitForTimeout(3000);
    }
  }
  const drift = Math.max(...opens.map((o) => Math.hypot(...o.cam.map((v, i) => v - opens[0].cam[i]))));
  console.log(`${tag} 5 opens: camera drift ${(drift * 100).toFixed(1)} cm, mean ${opens.map((o) => o.mean).join('/')}, near-white ${opens.map((o) => o.white).join('/')} %`);
  if (drift > 0.02) problems.push(`${tag}: the 5 openings do not land the same camera (${(drift * 100).toFixed(1)} cm)`);
  if (Math.max(...opens.map((o) => o.mean)) - Math.min(...opens.map((o) => o.mean)) > 3) problems.push(`${tag}: the 5 openings do not look the same`);
  if (Math.max(...opens.map((o) => o.white)) > 0.5) problems.push(`${tag}: burned white (${Math.max(...opens.map((o) => o.white))} %)`);
  // every turn of the ring
  const rows = [];
  for (let i = 0; i < steps; i++) {
    const deg = (i * 360) / steps;
    await p.evaluate((a) => (window.__giftRing.qaTurn = a), (deg * Math.PI) / 180);
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const m = await p.evaluate(measure, LIMIT);
    rows.push({ deg, ...m });
    if (m.floor > LIMIT.floor) problems.push(`${tag} ${deg}°: floor is ${(m.floor * 100).toFixed(1)} % of the frame`);
    if (m.tableShare < LIMIT.table) problems.push(`${tag} ${deg}°: the table is only ${(m.tableShare * 100).toFixed(1)} % of the frame`);
    if (m.hidden) problems.push(`${tag} ${deg}°: ${m.hidden} of ${m.ours} cake/table pixels hidden (${m.by.join(' ')})`);
    if (m.margin < LIMIT.margin) problems.push(`${tag} ${deg}°: the cake's margin is ${(m.margin * 100).toFixed(1)} % (box ${m.box})`);
    if (!m.cake || !m.table) problems.push(`${tag} ${deg}°: cake ${m.cake} px, table ${m.table} px — test is blind`);
    if (i % 9 === 0) await p.screenshot({ path: `${out}/turn-${tag}-${deg}.png` });
  }
  await p.evaluate(() => (window.__giftRing.qaTurn = 0));
  const f = rows.map((r) => r.floor);
  console.log(`${tag} ${steps} turns: table ≥ ${(Math.min(...rows.map((r) => r.tableShare)) * 100).toFixed(1)} %, floor ${(Math.min(...f) * 100).toFixed(1)}–${(Math.max(...f) * 100).toFixed(1)} %, hidden max ${Math.max(...rows.map((r) => r.hidden))} px, margin min ${(Math.min(...rows.map((r) => r.margin)) * 100).toFixed(1)} %`);
  worst.push({ tag, rows: rows.map(({ deg, floor, hidden, margin }) => ({ deg, floor: +floor.toFixed(4), hidden, margin: +margin.toFixed(3) })), opens, support: s });
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/result.json`, JSON.stringify(worst, null, 1));
console.log(problems.length ? '✗ ' + [...new Set(problems)].slice(0, 40).join('\n✗ ') : '✓ the cake stands on its table, the frame is cake + table + room (floor ≤ 25 %), nothing hides them, 5 openings alike');
process.exit(problems.length ? 1 : 0);
