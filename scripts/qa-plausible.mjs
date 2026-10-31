/**
 * W4d — the cake stands where a cake can stand: a ray straight down from the cake's foot meets
 * the table's top (not air, not the floor), the table's top is 0.7–0.8 m above the floor, its
 * legs reach the floor, the cake is narrower than the table, the table is outside the gifts'
 * ring, and the sign's lowest words hang ≥ 0.35 m above the tallest gift.
 *
 *   node scripts/qa-plausible.mjs [--gpu] [--size=1440x900] [--mobile]
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('qa-seeded')) return;
  sessionStorage.setItem('qa-seeded', '1');
  sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() }));
});
const p = await ctx.newPage();
await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const T = window.__THREE;
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  let cake = null;
  let table = null;
  scene.traverse((o) => {
    if (!cake && o.isMesh && o.userData.frame === 'cake' && o.geometry?.attributes?.aKind) cake = o;
    if (!table && o.userData.cakeTable) table = o;
  });
  if (!cake || !table) return { error: `cake ${!!cake} table ${!!table}` };
  const cb = new T.Box3().setFromObject(cake);
  const tb = new T.Box3().setFromObject(table);
  // the floor: the lowest point of the table's legs should be on it
  const floorY = -0.95 - 0.08; // FLOOR_Y − STAGE_STEP (the wood floor)
  const foot = new T.Vector3((cb.min.x + cb.max.x) / 2, cb.min.y + 0.01, (cb.min.z + cb.max.z) / 2);
  const rc = new T.Raycaster(foot, new T.Vector3(0, -1, 0), 0, 3);
  const meshes = [];
  table.traverse((o) => o.isMesh && meshes.push(o));
  const hit = rc.intersectObjects(meshes, false)[0];
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
    rayHitsTable: !!hit,
    gapUnderCake: hit ? +(foot.y - hit.point.y).toFixed(3) : null,
    tableTopAboveFloor: +(tb.max.y - floorY).toFixed(3),
    legsToFloor: +(tb.min.y - floorY).toFixed(3),
    cakeW: +Math.max(cb.max.x - cb.min.x, cb.max.z - cb.min.z).toFixed(3),
    tableW: +Math.max(tb.max.x - tb.min.x, tb.max.z - tb.min.z).toFixed(3),
    tableInnerEdge: +(Math.hypot(tableC.x, tableC.z) - (tb.max.x - tb.min.x) / 2).toFixed(2),
    ringOuter: +ringR.toFixed(2),
    giftTop: +ringTop.toFixed(3),
    lettersBottom: letters ? +letters.min.y.toFixed(3) : null,
  };
});
console.log(JSON.stringify(r));
const bad = [];
if (r.error) bad.push(r.error);
else {
  if (!r.rayHitsTable) bad.push('nothing under the cake');
  if (r.gapUnderCake > 0.03) bad.push(`the cake floats ${r.gapUnderCake} m over the table`);
  if (r.tableTopAboveFloor < 0.7 || r.tableTopAboveFloor > 0.82) bad.push(`table top at ${r.tableTopAboveFloor} m`);
  if (Math.abs(r.legsToFloor) > 0.02) bad.push(`the legs end ${r.legsToFloor} m off the floor`);
  if (r.cakeW >= r.tableW) bad.push('the cake is wider than its table');
  if (r.tableInnerEdge < r.ringOuter + 0.2) bad.push(`the table stands in the gifts' ring (${r.tableInnerEdge} < ${r.ringOuter})`);
  // (the gifts bob ≤ 8 cm and lift 10 cm under her hand on top of their measured rest)
  if (r.lettersBottom < r.giftTop + 0.18 + 0.35) bad.push(`the sign's words are only ${(r.lettersBottom - r.giftTop).toFixed(2)} m above the tallest gift`);
}
await browser.close();
console.log(bad.length ? '✗ ' + bad.join('\n✗ ') : '✓ the cake stands on its table, the table on the floor, the words above the gifts');
process.exit(bad.length ? 1 : 0);
