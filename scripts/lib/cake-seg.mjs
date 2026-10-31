/** Y1 — the cake moment's ID renders and the cake's support (run in the page via page.evaluate). */
/** In the page: the two ID renders and what they say. */
export function measure(LIMIT) {
  const T = window.__THREE;
  const gl = window.__gl;
  const scene = window.__scene;
  const cam = window.__camera;
  const up = (o, f) => { for (let p = o; p; p = p.parent) if (f(p)) return p; return null; };
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const cat = (o) => (up(o, (p) => p.userData.seg === 'floor') ? 'floor' : up(o, (p) => p.userData.secretLetter) ? null : up(o, (p) => p.userData.cakeTable) ? 'table' : up(o, (p) => p.userData.cakePart) ? 'cake' : null);
  const flat = {
    floor: new T.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false }),
    cake: new T.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }),
    table: new T.MeshBasicMaterial({ color: 0x0000ff, toneMapped: false }),
  };
  const all = [];
  scene.traverse((o) => (o.isMesh || o.isPoints || o.isSprite || o.isLine) && shown(o) && all.push(o));
  const saved = all.map((o) => [o, o.material, o.visible]);
  const solid = (o) => o.isMesh && o.material?.colorWrite !== false && !o.material?.transparent;
  const added = (o) => !o.isMesh || o.material?.blending === T.AdditiveBlending || (o.material?.transparent && o.material.opacity < 0.05);
  const size = gl.getDrawingBufferSize(new T.Vector2());
  const w = size.x;
  const h = size.y;
  const rt = new T.WebGLRenderTarget(w, h, { samples: 0 });
  const read = () => {
    const px = new Uint8Array(w * h * 4);
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
    return px;
  };
  const prev = [gl.getRenderTarget(), gl.getClearColor(new T.Color()), gl.getClearAlpha(), scene.background];
  scene.background = null;
  // A
  for (const o of all) {
    const c = cat(o);
    if (c) {
      if (solid(o)) o.material = flat[c];
      else o.visible = false; // (its contact shadows, its hit sphere, its flames)
    } else if (added(o)) o.visible = false;
  }
  const A = read();
  // B
  for (const o of all) if (!cat(o) || cat(o) === 'floor') o.visible = false;
  const B = read();
  for (const [o, m, v] of saved) {
    o.material = m;
    o.visible = v;
  }
  scene.background = prev[3];
  gl.setRenderTarget(prev[0]);
  gl.setClearColor(prev[1], prev[2]);
  rt.dispose();
  Object.values(flat).forEach((m) => m.dispose());
  const is = (P, k, r, g, b) => P[k] === r && P[k + 1] === g && P[k + 2] === b;
  let floor = 0;
  let ours = 0;
  let hidden = 0;
  let cake = 0;
  let table = 0;
  const box = [w, h, -1, -1];
  const where = [];
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    if (is(A, k, 0, 255, 0)) floor++;
    const red = is(B, k, 255, 0, 0);
    const blue = is(B, k, 0, 0, 255);
    if (!red && !blue) continue;
    ours++;
    if (red) {
      cake++;
      const x = i % w;
      const y = h - 1 - Math.floor(i / w);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    } else table++;
    // (a pixel where the floor shows is where something of ours TOUCHES the floor — the
    //  secret letter's corner, the foot — the floor cannot stand in front of anything)
    if (!is(A, k, 255, 0, 0) && !is(A, k, 0, 0, 255) && !is(A, k, 0, 255, 0)) {
      hidden++;
      if (where.length < 3) where.push([i % w, h - 1 - Math.floor(i / w)]);
    }
  }
  // what stands in front (a ray through each hidden pixel: the first thing that is not ours)
  const by = where.map(([x, y]) => {
    const rc = new T.Raycaster();
    rc.camera = cam;
    rc.setFromCamera(new T.Vector2(((x + 0.5) / w) * 2 - 1, -(((y + 0.5) / h) * 2 - 1)), cam);
    const hit = rc.intersectObjects(scene.children, true).find((it) => shown(it.object) && it.object.isMesh && !cat(it.object) && !added(it.object) && it.object.material?.colorWrite !== false);
    let name = '';
    for (let q = hit?.object; q && !name; q = q.parent) name = q.name || (q.userData.anchor !== undefined ? `anchor ${q.userData.anchor}` : '');
    return `${x},${y}:${hit ? name || hit.object.geometry?.type : 'nothing'}`;
  });
  const margin = cake ? Math.min(box[0] / w, box[1] / h, (w - 1 - box[2]) / w, (h - 1 - box[3]) / h) : -1;
  return { floor: floor / (w * h), cake, table, ours, hidden, by, margin, box: box.map((v, i) => +(v / (i % 2 ? h : w)).toFixed(3)) };
}

/** In the page: the cake's foot on the table, the table on the floor, their sizes. */
export function support() {
  const T = window.__THREE;
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  let cake = null;
  let table = null;
  let floor = null;
  scene.traverse((o) => {
    if (!cake && o.isMesh && o.userData.frame === 'cake' && o.geometry?.attributes?.aKind) cake = o;
    if (!table && o.userData.cakeTable) table = o;
    if (!floor && o.isMesh && o.userData.seg === 'floor') floor = o;
  });
  if (!cake || !table || !floor) return { error: `cake ${!!cake} table ${!!table} floor ${!!floor}` };
  const cb = new T.Box3().setFromObject(cake);
  const parts = [];
  table.traverse((o) => o.isMesh && parts.push(o));
  const top = parts.find((o) => o.userData.tablePart === 'clothTop');
  const tb = new T.Box3().setFromObject(top);
  const col = new T.Box3().setFromObject(parts.find((o) => o.userData.tablePart === 'column'));
  const floorY = new T.Vector3().setFromMatrixPosition(floor.matrixWorld).y;
  const foot = new T.Vector3((cb.min.x + cb.max.x) / 2, cb.min.y + 0.005, (cb.min.z + cb.max.z) / 2);
  const hit = new T.Raycaster(foot, new T.Vector3(0, -1, 0), 0, 3).intersectObjects(parts, false)[0];
  return {
    gap: hit ? +(cb.min.y - hit.point.y).toFixed(4) : null,
    hitPart: hit?.object.userData.tablePart ?? null,
    topAboveFloor: +(tb.max.y - floorY).toFixed(3),
    footOnFloor: +(col.min.y - floorY).toFixed(3),
    cakeVsTop: +((cb.max.x - cb.min.x) / (tb.max.x - tb.min.x)).toFixed(3),
  };
}


/** Seed a visit that resumes in the room (before the page loads). */
export const seedRoom = (ctx, opened = []) =>
  ctx.addInitScript((opened) => {
    if (sessionStorage.getItem('qa-seeded')) return;
    sessionStorage.setItem('qa-seeded', '1');
    sessionStorage.setItem('love-story:v2', JSON.stringify({ unlocked: true, opened, finaleSeen: false, at: Date.now() }));
  }, opened);

/**
 * Into the room: resumed (a seeded visit, `?debug`), or `ledIn` — the real way, intro → three
 * touches → password → welcome → the light's tour (where the set pieces once sank).
 * (A resumed visit needs its context seeded with `seedRoom` first.)
 */
export async function enterRoom(p, { url, W, H, mobile, ledIn, password }) {
  if (!ledIn) {
    await p.goto(`${url}?debug`, { waitUntil: 'networkidle' });
    await p.locator('.gift-nav__btn:not([disabled])').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(3000);
    return;
  }
  await p.goto(`${url}?reset&debug`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  const touch = async () => {
    const before = await p.getAttribute('.heart-hit', 'aria-label');
    for (const dy of [0, 80, 160, 0]) {
      const a = await p.evaluate(() => {
        const hh = window.__heart;
        const c = window.__camera;
        if (!hh || !c) return null;
        const v = hh.getWorldPosition(hh.position.clone()).project(c);
        return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
      });
      const x = a ? a.x : W / 2;
      const y = (a ? a.y : H / 2) + dy;
      await (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
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
}
