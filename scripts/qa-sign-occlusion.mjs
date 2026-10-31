/**
 * W1c / W4c — nothing may stand in front of the subject of a hidden moment, at any turn of the
 * gift ring. Measured in pixels, with the scene's real materials (the wall's dolls'-house cut
 * and the props that step aside live in their shaders, so flat override materials would lie):
 * in one frame (no clock advances between the passes) the scene is drawn several times —
 *   A:  the subject alone                   → its mask (pixels it lights)
 *   B:  the whole scene                     → the picture saved for the worst frames
 *   B2: the scene without the subject's own installation (sign arch / cake table)
 *   C2: the same, without the subject
 * A subject pixel is hidden when B2 ≈ C2 there: whatever is drawn at that pixel does not
 * depend on the subject, i.e. something else stands in front of it.
 *
 *   node scripts/qa-sign-occlusion.mjs [--subject=sign|cake] [--gpu] [--sizes=1440x900,1920x1080,390x844m]
 *       [--steps=36] [--noduck]   (--noduck: the gifts keep standing — shows what the duck prevents)
 *
 * Every size × gift state (all closed / all opened) × ring turn. Saves the 3 worst frames.
 * Exit 1 if any hidden pixel is counted, or the subject's mask is empty.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const subject = arg('subject', 'sign');
const sizes = arg('sizes', '1440x900,1920x1080,390x844m').split(',');
const steps = +arg('steps', '36');
const noduck = process.argv.includes('--noduck');
const gpu = process.argv.includes('--gpu');
const url = arg('url', process.env.QA_URL ?? 'http://localhost:4173/');
const out = `qa-output/occlusion-${subject}${noduck ? '-noduck' : ''}`;
mkdirSync(out, { recursive: true });
const exe = [process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const ALL = ['the-day-we-met', 'first-date', 'first-trip', 'ordinary-day', 'letter'];
const states = { closed: [], opened: ALL };
const rows = [];
const problems = [];

/** In the page: the three passes, and the count (plus a picture of the hidden pixels). */
function measure(subject) {
  const T = window.__THREE;
  const gl = window.__gl;
  const scene = window.__scene;
  const cam = window.__camera;
  const isSubject = (o) => {
    if (subject === 'sign') {
      // the lettering itself: the letter faces and their rims of light
      if (!o.geometry?.attributes?.aOrder) return false;
      for (let p = o; p; p = p.parent) if (p.userData.signPart) return true;
      return false;
    }
    for (let p = o; p; p = p.parent) if (p.userData.cakePart) return o.isMesh && o.material?.colorWrite !== false && !(o.material?.transparent && o.material.opacity < 0.05);
    return false;
  };
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const drawables = [];
  scene.traverse((o) => (o.isMesh || o.isPoints || o.isSprite || o.isLine) && shown(o) && drawables.push(o));
  const subj = drawables.filter(isSubject);
  // the subject's own installation (the sign's arch and posies, the cake's table and topper)
  // may cross it — that is its design, not something standing in front of it
  const own = (o) => { for (let p = o; p; p = p.parent) if (p.userData.signPart || p.userData.cakePart) return true; return false; };
  // (and light that is ADDED to the picture — points, glows — cannot stand in front of anything;
  //  it can only saturate a pixel, which would read as "hidden")
  const additive = (o) => o.isPoints || o.isSprite || o.material?.blending === T.AdditiveBlending;
  const ownParts = drawables.filter((o) => (own(o) || additive(o)) && !subj.includes(o));
  const size = gl.getDrawingBufferSize(new T.Vector2());
  const w = size.x;
  const h = size.y;
  const rt = new T.WebGLRenderTarget(w, h, { samples: 0 });
  const read = () => {
    const px = new Uint8Array(w * h * 4);
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
    return px;
  };
  const prevTarget = gl.getRenderTarget();
  const prevClear = gl.getClearColor(new T.Color());
  const prevAlpha = gl.getClearAlpha();
  const bg = scene.background;
  scene.background = null;
  // A: the subject alone
  const others = drawables.filter((o) => !subj.includes(o));
  others.forEach((o) => (o.visible = false));
  const A = read();
  others.forEach((o) => (o.visible = true));
  // B: everything
  const B = read();
  // B2 / C2: everything, and everything but the subject — both without the subject's own installation (what hides it then is
  // something else)
  ownParts.forEach((o) => (o.visible = false));
  const B2 = read();
  subj.forEach((o) => (o.visible = false));
  const C2 = read();
  subj.forEach((o) => (o.visible = true));
  ownParts.forEach((o) => (o.visible = true));
  scene.background = bg;
  gl.setRenderTarget(prevTarget);
  gl.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  let mask = 0;
  let hidden = 0;
  const where = [];
  const pic = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const la = Math.max(A[k], A[k + 1], A[k + 2]);
    // (the picture: the scene dimmed, the subject's mask in green, its hidden pixels in red)
    const y = h - 1 - Math.floor(i / w);
    const o = (y * w + (i % w)) * 4;
    pic[o] = B[k] * 0.5;
    pic[o + 1] = B[k + 1] * 0.5;
    pic[o + 2] = B[k + 2] * 0.5;
    pic[o + 3] = 255;
    if (la < 40) continue; // only where the subject really lights the pixel
    mask++;
    const d = Math.abs(B2[k] - C2[k]) + Math.abs(B2[k + 1] - C2[k + 1]) + Math.abs(B2[k + 2] - C2[k + 2]);
    if (d <= 3) {
      hidden++;
      if (where.length < 4000) where.push([i % w, y, o]);
      pic[o] = 255;
      pic[o + 1] = 0;
      pic[o + 2] = 0;
    } else pic[o + 1] = Math.max(pic[o + 1], 140);
  }
  // A hidden pixel is something IN FRONT only if a ray meets that thing well before the
  // subject's own surface; where the subject touches another surface (a table's foot on the
  // floor) the two are at the same depth and the pixel is a contact, not an occlusion.
  const rc = new T.Raycaster();
  const blocks = (it) => shown(it.object) && !ownParts.includes(it.object) && it.object.material?.colorWrite !== false && !(it.object.material?.transparent && it.object.material.opacity < 0.05);
  const by = [];
  for (const [x, y, o] of where) {
    rc.setFromCamera(new T.Vector2(((x + 0.5) / w) * 2 - 1, -(((y + 0.5) / h) * 2 - 1)), cam);
    const hits = rc.intersectObjects(scene.children, true).filter(blocks);
    const own = hits.find((it) => subj.includes(it.object));
    const other = hits.find((it) => !subj.includes(it.object));
    if (own && (!other || other.distance > own.distance - 0.01)) {
      hidden--;
      pic[o] = 255;
      pic[o + 1] = 200;
      pic[o + 2] = 0;
      continue;
    }
    if (by.length < 4) {
      let name = '';
      for (let p = other?.object; p && !name; p = p.parent) name = p.name;
      by.push(`${x},${y}:${other ? name || other.object.geometry?.type || other.object.type : 'nothing'}`);
    }
  }
  // to a PNG data URL (for the worst frames)
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(pic, w, h), 0, 0);
  return { mask, hidden, by, subjects: subj.length, png: cv.toDataURL('image/png') };
}

for (const sz of sizes) {
  const mobile = sz.endsWith('m');
  const [W, H] = sz.replace('m', '').split('x').map(Number);
  for (const [stateName, opened] of Object.entries(states)) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      sessionStorage.setItem('love-story:v2', JSON.stringify({ ...s, at: Date.now() }));
    }, { unlocked: true, opened, finaleSeen: opened.length === ALL.length });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${sz} ${stateName}: pageerror ${e.message}`));
    await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
    await p.locator(opened.length === ALL.length ? '.room-ui__cta' : '.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(3000);
    await p.evaluate((nd) => (window.__giftRing.qaNoDuck = nd), noduck);
    await p.evaluate((s) => window.__moment(s), subject);
    await p.waitForTimeout(5500);
    await p.screenshot({ path: `${out}/${sz}-${stateName}-screen.png` });
    for (let i = 0; i < steps; i++) {
      const deg = (i * 360) / steps;
      await p.evaluate((a) => (window.__giftRing.qaTurn = a), (deg * Math.PI) / 180);
      // a few frames: the gifts take their new places
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const m = await p.evaluate(measure, subject);
      rows.push({ size: sz, state: stateName, deg, mask: m.mask, hidden: m.hidden, png: m.png });
      if (!m.mask) problems.push(`${sz} ${stateName} ${deg}°: the subject lights no pixel (${m.subjects} meshes) — test is blind`);
      if (m.hidden) problems.push(`${sz} ${stateName} ${deg}°: ${m.hidden} of ${m.mask} subject pixels hidden (${m.by.join(' ')})`);
    }
    process.stdout.write(`${sz} ${stateName}: worst ${Math.max(...rows.filter((r) => r.size === sz && r.state === stateName).map((r) => r.hidden))} hidden px\n`);
    await ctx.close();
  }
}
await browser.close();

const worst = [...rows].sort((a, b) => b.hidden - a.hidden || a.mask - b.mask).slice(0, 3);
worst.forEach((r, i) => writeFileSync(`${out}/worst-${i + 1}-${r.size}-${r.state}-${r.deg}deg.png`, Buffer.from(r.png.split(',')[1], 'base64')));
writeFileSync(`${out}/result.json`, JSON.stringify(rows.map(({ png, ...r }) => r), null, 1));
console.log(`${rows.length} frames; worst: ${worst.map((r) => `${r.size}/${r.state}/${r.deg}° ${r.hidden}/${r.mask}`).join(', ')}`);
console.log(problems.length ? '✗ ' + [...new Set(problems)].slice(0, 30).join('\n✗ ') : `✓ no pixel of the ${subject} is hidden, at any turn of the ring`);
process.exit(problems.length ? 1 : 0);
