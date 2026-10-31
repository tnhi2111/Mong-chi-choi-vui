/**
 * W4d / Y1c — the cake stands where a cake can stand: a ray straight down from the cake's foot
 * meets the table's top within 2 cm (not air, not the floor), the table's top is 0.72–0.78 m
 * above the floor, its foot is on the floor, the cake is 55–75 % of the table's top, the table
 * is outside the gifts' ring, and the sign's lowest words hang ≥ 0.35 m above the tallest gift.
 * Both ways in: resumed in the room, and led in by the light's tour (`--resumed` / `--ledin`
 * for one of them) — the tour is where every set piece once sank 1.05 m under the floor.
 *
 *   node scripts/qa-plausible.mjs [--gpu] [--size=1440x900] [--mobile] [--resumed|--ledin]
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { support, enterRoom, seedRoom } from './lib/cake-seg.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const ways = process.argv.includes('--ledin') ? [true] : process.argv.includes('--resumed') ? [false] : [false, true];
const bad = [];
for (const ledIn of ways) {
  const way = ledIn ? 'led in' : 'resumed';
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
  if (!ledIn) await seedRoom(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => m.type() === 'error' && m.text().includes('[room]') && errors.push(m.text()));
  await enterRoom(p, { url, W, H, mobile, ledIn, password });
  const s = await p.evaluate(support);
  const r = await p.evaluate(() => {
    const T = window.__THREE;
    const scene = window.__scene;
    let table = null;
    let floor = null;
    scene.traverse((o) => {
      if (!table && o.userData.cakeTable) table = o;
      if (!floor && o.isMesh && o.userData.seg === 'floor') floor = o;
    });
    const tb = new T.Box3().setFromObject(table);
    let ringTop = -Infinity;
    let ringR = 0;
    scene.traverse((o) => {
      if (!o.name?.startsWith('gift:')) return;
      const b = new T.Box3();
      o.traverse((m) => m.isMesh && m.visible && m.material?.colorWrite !== false && !(m.material?.transparent && m.material.opacity < 0.05) && b.union(new T.Box3().setFromObject(m)));
      if (b.isEmpty()) return;
      ringTop = Math.max(ringTop, b.max.y);
      ringR = Math.max(ringR, Math.hypot((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2) + Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2);
    });
    let letters = null;
    scene.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.aOrder && o.userData.frame === 'sign') letters = new T.Box3().setFromObject(o); });
    const tableC = tb.getCenter(new T.Vector3());
    return {
      offFloor: window.__cakeOffFloor ?? null,
      tableInnerEdge: +(Math.hypot(tableC.x, tableC.z) - (tb.max.x - tb.min.x) / 2).toFixed(2),
      ringOuter: +ringR.toFixed(2),
      giftTop: +ringTop.toFixed(3),
      lettersBottom: letters ? +letters.min.y.toFixed(3) : null,
    };
  });
  console.log(way, JSON.stringify({ ...s, ...r }));
  const no = (m) => bad.push(`${way}: ${m}`);
  if (s.error) no(s.error);
  else {
    if (s.gap === null || Math.abs(s.gap) > 0.02) no(`nothing holds the cake within 2 cm (gap ${s.gap}, ${s.hitPart})`);
    if (s.topAboveFloor < 0.72 || s.topAboveFloor > 0.78) no(`table top at ${s.topAboveFloor} m`);
    if (Math.abs(s.footOnFloor) > 0.01) no(`the table's foot ends ${s.footOnFloor} m off the floor`);
    if (s.cakeVsTop < 0.55 || s.cakeVsTop > 0.75) no(`the cake is ${(s.cakeVsTop * 100).toFixed(0)} % of the table's top`);
    if (r.offFloor === null || Math.abs(r.offFloor) > 0.01) no(`the set piece holding the table is ${r.offFloor} m off the floor`);
    if (r.tableInnerEdge < r.ringOuter + 0.2) no(`the table stands in the gifts' ring (${r.tableInnerEdge} < ${r.ringOuter})`);
    // (the gifts bob ≤ 8 cm and lift 10 cm under her hand on top of their measured rest)
    if (r.lettersBottom < r.giftTop + 0.18 + 0.35) no(`the sign's words are only ${(r.lettersBottom - r.giftTop).toFixed(2)} m above the tallest gift`);
  }
  errors.forEach((e) => no(e));
  await ctx.close();
}
await browser.close();
console.log(bad.length ? '✗ ' + bad.join('\n✗ ') : '✓ the cake stands on its table, the table on the floor, the words above the gifts');
process.exit(bad.length ? 1 : 0);
