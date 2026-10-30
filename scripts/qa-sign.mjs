/**
 * S — nothing stands in front of the HAPPY BIRTHDAY sign. Rays from the camera to a 5 × 5
 * grid over the sign's lettering (its centre and corners among them), in the default room
 * view and in the sign moment, on a wide and a tall screen: ≥ 95 % must reach the sign, and
 * no gift (nor the music box) may be what a ray meets first.
 *
 *   node scripts/qa-sign.mjs [--gpu]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const gpu = process.argv.includes('--gpu');
const url = process.env.QA_URL ?? 'http://localhost:4173/';
mkdirSync('qa-output/sign', { recursive: true });
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const problems = [];

const probe = (p) =>
  p.evaluate(() => {
    const T = window.__THREE;
    const scene = window.__scene;
    const cam = window.__camera;
    let letters = null;
    scene.traverse((o) => {
      if (!letters && o.isMesh && o.userData.frame === 'sign' && o.geometry.attributes.aOrder) letters = o;
    });
    if (!letters) return { error: 'no sign' };
    letters.updateWorldMatrix(true, false);
    const box = new T.Box3().setFromObject(letters);
    const rc = new T.Raycaster();
    rc.camera = cam;
    const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    const ofSign = (o) => { for (let x = o; x; x = x.parent) if (x.userData?.frame === 'sign' || x.userData?.signPart) return true; return false; };
    const giftOf = (o) => { for (let x = o; x; x = x.parent) if (x.name?.startsWith('gift:')) return x.name; return null; };
    let seen = 0;
    let total = 0;
    const blockers = {};
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const t = new T.Vector3(box.min.x + ((box.max.x - box.min.x) * i) / 4, box.min.y + ((box.max.y - box.min.y) * j) / 4, (box.min.z + box.max.z) / 2);
        // only points that are on screen count
        const ndc = t.clone().project(cam);
        if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
        total++;
        const d = t.clone().sub(cam.position);
        rc.set(cam.position, d.clone().normalize());
        rc.far = d.length() + 0.3;
        const hits = rc.intersectObjects(scene.children, true).filter((h) => shown(h.object) && h.object.isMesh && h.object.material?.colorWrite !== false && !(h.object.material?.transparent && !h.object.material?.depthWrite) && h.distance < d.length() - 0.25);
        const first = hits.find((h) => !ofSign(h.object));
        if (!first) seen++;
        else {
          const g = giftOf(first.object) ?? first.object.name ?? first.object.geometry?.type ?? 'mesh';
          blockers[g] = (blockers[g] ?? 0) + 1;
        }
      }
    return { seen, total, share: total ? +(seen / total).toFixed(2) : 0, blockers };
  });

for (const [W, H, mobile] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened: [], finaleSeen: false, at: Date.now() })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
  await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 40000 });
  await p.waitForTimeout(3000);
  for (const view of ['default', 'moment']) {
    if (view === 'moment') {
      await p.evaluate(() => window.__moment('sign'));
      await p.waitForTimeout(4500);
    }
    const r = await probe(p);
    await p.screenshot({ path: `qa-output/sign/${W}x${H}-${view}.png` });
    console.log(`${W}x${H} ${view}:`, JSON.stringify(r));
    const tag = `${W}x${H} ${view}`;
    if (r.error) problems.push(`${tag}: ${r.error}`);
    else {
      const gifts = Object.keys(r.blockers).filter((k) => k.startsWith('gift:'));
      // (the default view only has to keep the gifts out of the way; the moment must show it whole)
      if (view === 'moment' && r.share < 0.95) problems.push(`${tag}: only ${Math.round(r.share * 100)} % of the sign is seen`);
      if (gifts.length) problems.push(`${tag}: ${gifts.join(', ')} in front of the sign`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? '✗ ' + problems.join('\n✗ ') : '✓ nothing stands in front of the sign');
process.exit(problems.length ? 1 : 0);
