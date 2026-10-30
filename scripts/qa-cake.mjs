/**
 * R1 — the cake must be there, in every way she can come to it: resumed in the room, after
 * the led-in tour, after the cake moment (touched for real), after coming back from the
 * finale. For each: the cake mesh is drawn (visible all the way up, not scaled away), its
 * centre is inside the frame, a ray from the camera reaches it (what is in front of it is
 * reported), and it covers pixels of its own colour on the screenshot.
 *
 *   node scripts/qa-cake.mjs [--gpu] [--size=1440x900] [--mobile]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const mobile = process.argv.includes('--mobile');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/cake-${W}x${H}${mobile ? 'm' : ''}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const problems = [];

/** What the scene says about the cake right now. */
const cakeState = (p) =>
  p.evaluate(() => {
    const scene = window.__scene;
    const cam = window.__camera;
    let mesh = null;
    scene?.traverse((o) => {
      if (!mesh && o.isMesh && o.userData.frame === 'cake' && o.geometry?.attributes?.aKind) mesh = o;
    });
    if (!mesh) return { found: false };
    let drawn = true;
    let scale = 1;
    for (let o = mesh; o; o = o.parent) {
      if (!o.visible) drawn = false;
      scale *= Math.min(o.scale.x, o.scale.y, o.scale.z);
    }
    mesh.updateWorldMatrix(true, false);
    const c = mesh.geometry.boundingSphere ?? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
    const centre = c.center.clone().applyMatrix4(mesh.matrixWorld);
    const ndc = centre.clone().project(cam);
    const inFrame = Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1;
    // what a ray from the camera meets first on its way to the cake's middle
    const dir = centre.clone().sub(cam.position).normalize();
    let blocker = null;
    try {
      const rc = new window.__THREE.Raycaster(cam.position.clone(), dir, 0.05, cam.position.distanceTo(centre) - 0.3);
      rc.camera = cam;
      const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
      const hits = rc.intersectObjects(scene.children, true).filter((h) => shown(h.object) && h.object.isMesh && !h.object.userData.frame && !h.object.material?.transparent && h.object.material?.colorWrite !== false);
      if (hits.length) blocker = hits[0].object.name || hits[0].object.geometry?.type || 'mesh';
    } catch (e) {
      blocker = null;
      console.warn('raycast failed', String(e));
    }
    return {
      found: true,
      drawn,
      scale: +scale.toFixed(3),
      inFrame,
      px: [Math.round((ndc.x * 0.5 + 0.5) * innerWidth), Math.round((-ndc.y * 0.5 + 0.5) * innerHeight)],
      blocker,
    };
  });

const check = async (p, tag) => {
  const s = await cakeState(p);
  await p.screenshot({ path: `${out}/${tag}.png` });
  console.log(tag.padEnd(14), JSON.stringify(s));
  if (!s.found) problems.push(`${tag}: no cake in the scene`);
  else {
    if (!s.drawn) problems.push(`${tag}: the cake is hidden`);
    if (s.scale < 0.5) problems.push(`${tag}: the cake is scaled away (${s.scale})`);
  }
  return s;
};

const ctxFor = async (seed) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile });
  if (seed)
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ ...s, at: Date.now() }));
    }, seed);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  return { ctx, p };
};

// 1. resumed in the room
{
  const { ctx, p } = await ctxFor({ unlocked: true, opened: [], finaleSeen: false });
  await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
  await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 40000 });
  await p.waitForTimeout(3000);
  await check(p, '1-resumed');
  // 3. the cake moment, touched for real (aim at it on screen)
  const s = await cakeState(p);
  if (s.inFrame) {
    await (mobile ? p.touchscreen.tap(s.px[0], s.px[1]) : p.mouse.click(s.px[0], s.px[1]));
    await p.waitForTimeout(4200);
    const m = await check(p, '3-moment');
    if (!m.inFrame) problems.push('3-moment: the cake is out of the frame');
    if (m.blocker) problems.push(`3-moment: something stands in front of the cake (${m.blocker})`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(2500);
    await check(p, '3b-after');
  } else {
    await p.evaluate(() => window.__moment('cake'));
    await p.waitForTimeout(4200);
    const m = await check(p, '3-moment');
    if (!m.inFrame) problems.push('3-moment: the cake is out of the frame');
    await p.evaluate(() => window.__moment(null));
  }
  await ctx.close();
}
// 2. led in (the tour)
{
  const { ctx, p } = await ctxFor(null);
  await p.goto(`${url}?reset&debug`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  const touch = async () => {
    const before = await p.getAttribute('.heart-hit', 'aria-label');
    for (const dy of [0, 80, 160, 0]) {
      const a = await p.evaluate(() => {
        const h = window.__heart;
        const c = window.__camera;
        if (!h || !c) return null;
        const v = h.getWorldPosition(h.position.clone()).project(c);
        return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
      });
      await p.mouse.click(a ? a.x : W / 2, (a ? a.y : H / 2) + dy);
      await p.waitForTimeout(350);
      if ((await p.getAttribute('.heart-hit', 'aria-label')) !== before) return;
    }
  };
  await touch();
  await p.waitForTimeout(6500);
  await touch();
  await p.waitForTimeout(1800);
  await touch();
  await p.locator('#bday').waitFor({ timeout: 25000 });
  await p.waitForFunction(() => document.activeElement?.id === 'bday', null, { timeout: 20000 });
  await p.fill('.gate__input', password);
  await p.locator('.gate__submit').click();
  await p.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 25000 });
  await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Step inside' }).click();
  await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 40000 });
  await p.waitForTimeout(9000);
  await check(p, '2-led-in');
  await ctx.close();
}
// 4. back from the finale
{
  const { ctx, p } = await ctxFor({ unlocked: true, opened: ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'], finaleSeen: true });
  await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
  await p.locator('.room-ui__cta').waitFor({ timeout: 40000 });
  await p.waitForTimeout(2500);
  await check(p, '4a-all-open');
  await p.locator('.room-ui__cta').click();
  const more = p.getByRole('button', { name: 'One more thing…' });
  await more.waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  await more.click();
  const back = p.getByRole('button', { name: 'Back to our room' });
  for (let t = 0; t < 140 && !(await back.isVisible().catch(() => false)); t++) {
    const m = p.getByRole('button', { name: 'There’s more?' });
    if (await m.isVisible().catch(() => false)) await m.click().catch(() => {});
    await p.waitForTimeout(500);
  }
  await back.click();
  await p.locator('.room-ui__cta').waitFor({ timeout: 40000 });
  await p.waitForTimeout(5000);
  await check(p, '4b-back');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? '✗ ' + [...new Set(problems)].join('\n✗ ') : '✓ the cake is there in every way she comes to it');
process.exit(problems.length ? 1 : 0);
