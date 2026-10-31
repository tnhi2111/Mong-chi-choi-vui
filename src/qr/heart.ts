/**
 * The heart of light, for the QR card — the same language as the heart that opens the site:
 * a VOLUME of motes (a bright shell and a softer core) turning slowly, beating, with a warm
 * halo. Plain Canvas 2D: a few thousand points projected by hand and drawn as glowing sprites
 * with 'lighter' blending (no depth sorting needed for light). The same function draws the
 * page (animated) and the PNG export (one still frame, any size).
 */

export interface HeartPoint {
  x: number;
  y: number;
  z: number;
  /** 1 = on the shell, 0 = in the core */
  shell: number;
  /** scattered start (the motes gather into the heart as the page opens) */
  sx: number;
  sy: number;
  sz: number;
  delay: number;
  size: number;
  hue: number;
}

/** The classic 3D heart surface: (x² + 9/4·y² + z² − 1)³ − x²z³ − 9/80·y²z³ = 0 (z up). */
const F = (x: number, y: number, z: number) => {
  const a = x * x + 2.25 * y * y + z * z - 1;
  return a * a * a - x * x * z * z * z - 0.1125 * y * y * z * z * z;
};

export function makeHeart(count: number, seed = 7): HeartPoint[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: HeartPoint[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 200) {
    const x = (rnd() * 2 - 1) * 1.25;
    const y = (rnd() * 2 - 1) * 0.8;
    const z = (rnd() * 2 - 1) * 1.3;
    const f = F(x, y, z);
    if (f > 0) continue;
    // most of the light lies on the shell; a softer core fills it
    const shell = f > -0.035 ? 1 : 0;
    if (!shell && rnd() > 0.22) continue;
    const a = rnd() * Math.PI * 2;
    const b = Math.acos(rnd() * 2 - 1);
    const r = 2.6 + rnd() * 1.8;
    pts.push({
      // (screen: x right, y up = the heart's z, depth = its y)
      x,
      y: z,
      z: y,
      shell,
      sx: Math.sin(b) * Math.cos(a) * r,
      sy: Math.cos(b) * r,
      sz: Math.sin(b) * Math.sin(a) * r,
      delay: rnd() * 0.45,
      size: shell ? 0.8 + rnd() * 1.1 : 0.6 + rnd() * 0.8,
      hue: rnd(),
    });
  }
  return pts;
}

/** Glowing sprites, made once per colour. */
function sprite(rgb: [number, number, number], px = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  gr.addColorStop(0, `rgba(255,250,244,1)`);
  gr.addColorStop(0.22, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`);
  gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}
let sprites: HTMLCanvasElement[] | null = null;
const getSprites = () => (sprites ??= [sprite([246, 168, 186]), sprite([255, 210, 170]), sprite([232, 120, 150])]);

export interface HeartFrame {
  /** centre and size of the heart on the canvas (px; size ≈ its height) */
  cx: number;
  cy: number;
  size: number;
  /** seconds (turn, beat, twinkle) */
  t: number;
  /** 0 = scattered, 1 = gathered */
  gather: number;
  /** extra yaw / pitch from her pointer or the phone's tilt (rad, small) */
  yaw?: number;
  pitch?: number;
  /** device pixel ratio (sprite size) */
  dpr?: number;
  /** a still frame for print/export: no twinkle */
  still?: boolean;
}

/** lub-dub: two quick swells, then rest (≈ 64 bpm) */
const beat = (t: number) => {
  const p = (t * 1.07) % 1;
  const k = (c: number, w: number) => Math.exp(-((p - c) * (p - c)) / (2 * w * w));
  return 1 + 0.045 * k(0.08, 0.035) + 0.028 * k(0.25, 0.04);
};

export function drawHeart(g: CanvasRenderingContext2D, pts: HeartPoint[], f: HeartFrame) {
  const dpr = f.dpr ?? 1;
  const sp = getSprites();
  // (it sways, it does not spin: seen side-on a heart is only an oval)
  const yaw = Math.sin(f.t * 0.35) * 0.55 + (f.yaw ?? 0);
  const pitch = 0.12 + (f.pitch ?? 0);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const spi = Math.sin(pitch);
  const B = beat(f.t);
  const scale = (f.size / 2.3) * B;
  const cam = 4.2;

  // the halo: a warm breath behind the heart (soft, never a flare)
  g.save();
  g.globalCompositeOperation = 'lighter';
  const hr = f.size * 0.95 * B;
  const halo = g.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, hr);
  halo.addColorStop(0, `rgba(214,104,132,${0.28 * f.gather})`);
  halo.addColorStop(0.45, `rgba(150,50,80,${0.16 * f.gather})`);
  halo.addColorStop(1, 'rgba(90,20,40,0)');
  g.fillStyle = halo;
  g.fillRect(f.cx - hr, f.cy - hr, hr * 2, hr * 2);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    // gathering: each mote on its own delay, eased, with a curl as it comes
    const k = Math.min(1, Math.max(0, (f.gather - p.delay) / (1 - p.delay * 0.9)));
    const e = k * k * (3 - 2 * k);
    const curl = (1 - e) * 1.6;
    let x = p.sx + (p.x - p.sx) * e;
    let y = p.sy + (p.y - p.sy) * e;
    let z = p.sz + (p.z - p.sz) * e;
    const cc = Math.cos(curl);
    const sc = Math.sin(curl);
    [x, z] = [x * cc - z * sc, x * sc + z * cc];
    // the core breathes a little more than the shell
    const breath = p.shell ? 1 : 1 + (B - 1) * 0.8;
    x *= breath;
    y *= breath;
    z *= breath;
    // turn, tip, project
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    const ry = y * cp - rz * spi;
    const rz2 = y * spi + rz * cp;
    const persp = cam / (cam - rz2);
    const px = f.cx + rx * scale * persp;
    const py = f.cy - (ry - 0.12) * scale * persp;
    // nearer motes are larger and brighter; the far side of the shell is dimmer
    const near = (rz2 + 1.3) / 2.6;
    const tw = f.still ? 1 : 0.7 + 0.3 * Math.sin(f.t * (1.3 + p.hue * 2.2) + i);
    // (fine motes, held below white: light adds up where the shell folds over itself)
    const alpha = (p.shell ? 0.26 + 0.34 * near : 0.08 + 0.12 * near) * tw * (0.35 + 0.65 * e);
    const r = p.size * dpr * (f.size / 260) * persp * (p.shell ? 1.9 : 1.6);
    if (alpha < 0.02 || r < 0.3) continue;
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(sp[p.hue < 0.55 ? 0 : p.hue < 0.85 ? 1 : 2], px - r, py - r, r * 2, r * 2);
  }
  g.restore();
}
