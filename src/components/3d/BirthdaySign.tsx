import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { getHeartGeometry } from './heartShape';
import { birthdayConfig } from '../../config/birthday';

/*
 * The room's signature: a suspended HAPPY BIRTHDAY installation, hung behind the stage.
 *
 *   • dimensional letters — painted ivory faces with a champagne-gold bevelled edge and
 *     rose-gold returns (a stack of thin layers, so they have real depth), a soft warm
 *     glow inside and a halo of light behind them on the air and the wall
 *   • a fine champagne arch framing both words, strung with tiny warm bulbs, hung on
 *     thin cables that disappear up into the dark
 *   • a small rose-gold heart hanging under the apex, pointing down at the real heart
 *   • posies of blush and ivory flowers at the arch's feet, and satin ribbons falling
 *     from them, stirring in the air
 *
 * It is the room's second light (warm champagne), always quieter than the heart.
 * Everything is unlit custom shading, like the rest of the set; the font is the site's
 * own Cormorant Garamond, drawn into a small atlas (redrawn once the web font is ready).
 */

const FONT = '"Cormorant Garamond", Georgia, serif';
const CELL_W = 200;
const CELL_H = 240; // room above the capitals for Vietnamese accents (HÙ TÁ)
const FONT_PX = 200;
const CAP_PX = 128; // Cormorant's capital height at FONT_PX (approx.)
/** Where the capitals sit in a cell: their centre is the cell's centre. */
const BASELINE = CELL_H / 2 + CAP_PX / 2;

/** Letterform weights of the one family: the display cut, and a lighter one. */
type Style = 'r' | 'l';
const FACES: Record<Style, string> = { r: `500 ${FONT_PX}px ${FONT}`, l: `400 ${FONT_PX}px ${FONT}` };

/**
 * The installation as ONE composition, in one family (Cormorant Garamond, upright capitals
 * throughout). The hierarchy comes from size, weight, spacing and metal, not from mixing
 * styles: HAPPY BIRTHDAY leads; MY BABY, lighter and widely spaced, is held between two fine
 * gold hairlines; her name beneath is small, spaced like an engraving, in a deeper gold.
 * `tone` 0 = champagne ivory … 1 = warm gold. Words come from birthdayConfig.room.sign.
 */
const WORDS = birthdayConfig.room.sign;
export const SIGN_LINES: { text: string; style: Style; h: number; cap: number; track: number; tone: number }[] = [
  { text: WORDS.headline[0], style: 'r', h: 2.43, cap: 0.26, track: 0.2, tone: 0 },
  { text: WORDS.headline[1], style: 'r', h: 1.99, cap: 0.38, track: 0.14, tone: 0 },
  { text: WORDS.endearment, style: 'l', h: 1.62, cap: 0.19, track: 0.46, tone: 0.35 },
  { text: WORDS.name, style: 'r', h: 1.3, cap: 0.15, track: 0.52, tone: 1 },
];
/** Which line the hairlines frame (MY BABY). */
const FRAMED_LINE = 2;
const LAYERS = 6;
const DEPTH = 0.07;

interface Glyphs {
  mask: THREE.CanvasTexture;
  soft: THREE.CanvasTexture;
  halo: THREE.CanvasTexture;
  index: Map<string, number>;
  advance: Map<string, number>; // in cap-heights
  count: number;
}

/** Draw every glyph (keyed style + character) into one atlas, plus two blurred copies. */
function drawGlyphs(chars: string[]): Glyphs {
  const n = chars.length;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = CELL_W * n;
    c.height = CELL_H;
    return c;
  };
  const base = make();
  const g = base.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, base.width, base.height);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineWidth = 9; // the display cut is a little heavier than the text face
  const index = new Map<string, number>();
  const advance = new Map<string, number>();
  chars.forEach((key, i) => {
    const style = key[0] as Style;
    const ch = key.slice(1);
    g.font = FACES[style];
    // the lighter weight gets a little less added weight
    g.lineWidth = style === 'l' ? 7 : 9;
    const x = i * CELL_W + CELL_W / 2;
    g.fillText(ch, x, BASELINE);
    g.strokeText(ch, x, BASELINE);
    index.set(key, i);
    advance.set(key, (g.measureText(ch).width + g.lineWidth) / CAP_PX);
  });
  const blurred = (px: number) => {
    const c = make();
    const b = c.getContext('2d')!;
    b.fillStyle = '#000';
    b.fillRect(0, 0, c.width, c.height);
    b.filter = `blur(${px}px)`;
    b.drawImage(base, 0, 0);
    return c;
  };
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };
  return { mask: tex(base), soft: tex(blurred(5)), halo: tex(blurred(16)), index, advance, count: n };
}

/** One quad per letter per layer (and one halo quad behind each), laid along the arc. */
function letterGeometry(glyphs: Glyphs, lines: typeof SIGN_LINES, R: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const layer: number[] = [];
  const tone: number[] = [];
  const halfWidths: number[] = [];
  let lineTone = 0;
  const hpos: number[] = [];
  const huv: number[] = [];
  const quad = (out: number[], outUv: number[], s: number, h: number, w: number, hh: number, z: number, cell: number, lay: number | null) => {
    // s: arc length of the centre, h: centre height; the quad faces the middle of the room
    const corners: [number, number, number, number][] = [
      [-w / 2, -hh / 2, 0, 0],
      [w / 2, -hh / 2, 1, 0],
      [w / 2, hh / 2, 1, 1],
      [-w / 2, -hh / 2, 0, 0],
      [w / 2, hh / 2, 1, 1],
      [-w / 2, hh / 2, 0, 1],
    ];
    for (const [lx, ly, u, v] of corners) {
      const th = (s + lx) / R;
      const rr = R - z;
      out.push(Math.sin(th) * rr, h + ly, -Math.cos(th) * rr);
      outUv.push((cell + u) / glyphs.count, v);
      if (lay !== null) {
        layer.push(lay);
        tone.push(lineTone);
      }
    }
  };
  for (const line of lines) {
    const chars = [...line.text];
    const track = line.track;
    const widths = chars.map((c) => (c === ' ' ? 0.42 + track : (glyphs.advance.get(line.style + c) ?? 0.8) + track) * line.cap);
    // (the last letter's tracking isn't part of the word's width)
    const total = widths.reduce((a, b) => a + b, 0) - track * line.cap;
    halfWidths.push(total / 2);
    lineTone = line.tone;
    let s = -total / 2;
    chars.forEach((c, i) => {
      const cx = s + widths[i] / 2;
      s += widths[i];
      const cell = glyphs.index.get(line.style + c);
      if (cell === undefined) return;
      const w = (CELL_W / CAP_PX) * line.cap;
      const hh = (CELL_H / CAP_PX) * line.cap;
      // layers from the face (0) back
      for (let k = LAYERS - 1; k >= 0; k--) quad(pos, uv, cx, line.h, w, hh, (k / (LAYERS - 1)) * -DEPTH, cell, k / (LAYERS - 1));
      quad(hpos, huv, cx, line.h, w * 1.15, hh * 1.15, -DEPTH - 0.18, cell, null);
    });
  }
  const letters = new THREE.BufferGeometry();
  letters.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  letters.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  letters.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  letters.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  const halos = new THREE.BufferGeometry();
  halos.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3));
  halos.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2));
  return { letters, halos, halfWidths };
}

const letterVertex = /* glsl */ `
  attribute float aLayer;
  attribute float aTone;
  varying vec2 vUv;
  varying float vTone;
  varying float vLayer;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vLayer = aLayer;
    vTone = aTone;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const letterFragment = /* glsl */ `
  uniform sampler2D uMask;
  uniform sampler2D uSoft;
  uniform vec2 uTexel;
  uniform float uFloorY;
  uniform float uGlow;
  uniform float uHeart;
  uniform float uSweep;     // where the slow band of light is, along the sign (world x)
  uniform float uSweepAmp;  // how bright it is (more when she hovers / looks closely)
  varying vec2 vUv;
  varying float vTone;
  varying float vLayer;
  varying vec3 vWorld;
  void main() {
    float m = texture2D(uMask, vUv).r;
    if (m < 0.5) discard;
    float s = texture2D(uSoft, vUv).r;
    float h = vWorld.y - uFloorY;
    if (vLayer > 0.01) {
      // the returns: brushed rose-gold, darker toward the back
      vec3 c = vec3(0.46, 0.29, 0.21) * (1.0 - vLayer * 0.5) * (0.8 + 0.2 * s);
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    // the face: a soft bevel read from the blurred mask
    vec2 dx = vec2(uTexel.x * 3.0, 0.0);
    vec2 dy = vec2(0.0, uTexel.y * 3.0);
    float gx = texture2D(uSoft, vUv + dx).r - texture2D(uSoft, vUv - dx).r;
    float gy = texture2D(uSoft, vUv + dy).r - texture2D(uSoft, vUv - dy).r;
    vec3 n = normalize(vec3(-gx * 3.0, -gy * 3.0, 1.0));
    vec3 L = normalize(vec3(-0.35, 0.6, 0.7));
    float dif = clamp(dot(n, L), 0.0, 1.0);
    // brushed champagne metal; the dedication a deeper, warmer gold
    vec3 champagne = mix(vec3(0.93, 0.81, 0.64), vec3(0.86, 0.66, 0.41), vTone * 0.75);
    vec3 gold = vec3(0.84, 0.62, 0.36);
    float edge = 1.0 - smoothstep(0.42, 0.78, s);
    vec3 col = mix(champagne, gold, edge * 0.85);
    // a fine brushed grain across the face
    col *= 0.95 + 0.05 * sin(vWorld.x * 900.0 + vWorld.y * 40.0);
    vec3 lit = col * (0.22 + 0.36 * dif);
    vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
    lit += vec3(1.0, 0.85, 0.6) * pow(max(dot(n, hv), 0.0), 26.0) * (0.25 + edge * 0.45);
    // a slow band of warm light travelling across the letters
    float band = exp(-(vWorld.x - uSweep) * (vWorld.x - uSweep) * 2.2);
    lit += vec3(1.0, 0.86, 0.62) * band * uSweepAmp * (0.4 + 0.6 * edge + 0.3 * dif);
    // the heart's rose light rising from the stage onto the lower letters
    lit += vec3(0.9, 0.32, 0.45) * 0.07 * uHeart * (1.0 - smoothstep(1.2, 2.6, h));
    // and their own gentle warmth, from inside
    lit += vec3(1.0, 0.76, 0.5) * s * s * 0.16 * uGlow;
    gl_FragColor = vec4(lit, 1.0);
  }
`;
const haloFragment = /* glsl */ `
  uniform sampler2D uHalo;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uHalo, vUv).r;
    gl_FragColor = vec4(vec3(1.0, 0.7, 0.42) * a * a * 0.32 * uGlow, 1.0);
  }
`;
const haloVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* fine champagne metal: the arch, the cables, the little heart */
export const metalVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
export const metalFragment = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = clamp(dot(vN, vView), 0.0, 1.0);
    vec3 col = uColor * (0.22 + 0.4 * f);
    vec3 hl = normalize(vec3(-0.3, 0.7, 0.6));
    col += vec3(1.0, 0.86, 0.62) * pow(max(dot(reflect(-vView, vN), hl), 0.0), 30.0) * 0.55;
    col += uColor * pow(1.0 - f, 3.0) * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* tiny warm bulbs */
const bulbVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  attribute float aSize;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = 0.75 + 0.25 * sin(uTime * uMotion * (0.6 + aSeed) + aSeed * 40.0);
    gl_PointSize = aSize * uPixelRatio * (20.0 / -mv.z);
  }
`;
const bulbFragment = /* glsl */ `
  uniform float uGlow;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.14, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d);
    vec3 c = vec3(1.0, 0.8, 0.55) * (core * 1.1 + halo * halo * 0.4);
    gl_FragColor = vec4(c * vA * uGlow, 1.0);
  }
`;

/* satin: ribbons and petals, catching warm light on their folds */
export const satinVertex = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  attribute vec3 aColor;
  attribute float aSway;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vColor;
  varying float vV;
  void main() {
    vec3 p = position;
    // ribbons stir in the room's air, more toward their free ends
    float t = uTime * uMotion;
    p.x += sin(t * 0.9 + p.y * 2.3 + aSway * 7.0) * 0.035 * aSway;
    p.z += cos(t * 0.7 + p.y * 1.9 + aSway * 3.0) * 0.025 * aSway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vColor = aColor;
    vV = uv.y;
    gl_Position = projectionMatrix * mv;
  }
`;
export const satinFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vColor;
  varying float vV;
  void main() {
    float f = abs(dot(vN, vView));
    // satin: a broad soft sheen across the fold
    float sheen = pow(1.0 - f, 2.0) * 0.4 + pow(f, 8.0) * 0.25;
    vec3 col = vColor * (0.3 + 0.35 * f) + vec3(1.0, 0.82, 0.7) * sheen * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Props {
  floorY: number;
  /** radius of the arc it hangs on (in front of the wall) */
  radius: number;
  /** overall size (smaller on a phone, where the back of the room is narrow) */
  scale: number;
  /** how far below its usual height it hangs */
  drop?: number;
  /** 0..1 how awake the heart is (its light on the letters) */
  heart: number;
  motion: number;
  /** the camera has come close to read it (RoomWorld's focus) */
  focused?: boolean;
  /** a touch on the sign: it has something to say */
  onTap?: () => void;
}

export function BirthdaySign({ floorY, radius, scale, drop = 0.32, heart, motion, focused = false, onTap }: Props) {
  const chars = useMemo(() => [...new Set(SIGN_LINES.flatMap((l) => [...l.text.replace(/ /g, '')].map((c) => l.style + c)))], []);
  const SAMPLE = SIGN_LINES.map((l) => l.text).join(' ');
  const [fontReady, setFontReady] = useState(() => (document.fonts ? document.fonts.check(FACES.r, SAMPLE) && document.fonts.check(FACES.l, SAMPLE) : true));
  useEffect(() => {
    if (fontReady || !document.fonts) return;
    let alive = true;
    Promise.all([document.fonts.load(FACES.r, SAMPLE), document.fonts.load(FACES.l, SAMPLE)]).then(() => alive && setFontReady(true), () => undefined);
    return () => {
      alive = false;
    };
  }, [fontReady]);

  // built in "sign space": feet of the room at y = 0, centred on the back of the room;
  // the group scales about the sign's own centre
  const R = radius;
  const glyphs = useMemo(() => drawGlyphs(chars), [chars, fontReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [glyphs.mask, glyphs.soft, glyphs.halo].forEach((t) => t.dispose()), [glyphs]);
  const { letters, halos, halfWidths } = useMemo(
    () =>
      letterGeometry(glyphs, SIGN_LINES, R),
    [glyphs, R],
  );
  useEffect(
    () => () => {
      letters.dispose();
      halos.dispose();
    },
    [letters, halos],
  );

  // the arch, its cables and bulbs, the hanging heart, posies and ribbons
  const parts = useMemo(() => {
    const onArc = (s: number, h: number, z = 0) => new THREE.Vector3(Math.sin(s / R) * (R - z), h, -Math.cos(s / R) * (R - z));
    // the arch frames all four lines: its feet low beside her name, its crown above HAPPY
    const A = 2.45;
    const archPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const p = -Math.PI / 2 + (i / 64) * Math.PI;
      archPts.push(onArc(Math.sin(p) * A, 1.02 + Math.cos(p) * 1.85, 0.02));
    }
    const archCurve = new THREE.CatmullRomCurve3(archPts);
    const arch = new THREE.TubeGeometry(archCurve, 160, 0.014, 8, false);
    // a second, finer line just inside it
    const innerPts = archPts.map((_, i) => {
      const p = -Math.PI / 2 + (i / 64) * Math.PI;
      return onArc(Math.sin(p) * (A - 0.1), 1.06 + Math.cos(p) * 1.73, 0.02);
    });
    const inner = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(innerPts), 160, 0.006, 6, false);
    // cables: from the apex and the shoulders straight up into the dark
    const cables = [0, -0.62, 0.62].map((u) => {
      const p = -Math.PI / 2 + ((u + 1) / 2) * Math.PI;
      const from = onArc(Math.sin(p) * A, 1.02 + Math.cos(p) * 1.85, 0.02);
      return new THREE.TubeGeometry(new THREE.LineCurve3(from, from.clone().setY(7)), 1, 0.004, 4, false);
    });
    // bulbs along the arch (and three small sparkles above the apex)
    const bulbPos: number[] = [];
    const bulbSeed: number[] = [];
    const bulbSize: number[] = [];
    const count = 34;
    for (let i = 1; i < count; i++) {
      const p = archCurve.getPointAt(i / count);
      bulbPos.push(p.x, p.y - 0.035, p.z + 0.01);
      bulbSeed.push(Math.random());
      bulbSize.push(2.4);
    }
    [-0.28, 0, 0.28].forEach((s, i) => {
      const p = onArc(s, 3.08 + (i === 1 ? 0.1 : 0), 0.02);
      bulbPos.push(p.x, p.y, p.z);
      bulbSeed.push(Math.random());
      bulbSize.push(i === 1 ? 4.2 : 3.2);
    });
    const bulbs = new THREE.BufferGeometry();
    bulbs.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
    bulbs.setAttribute('aSeed', new THREE.Float32BufferAttribute(bulbSeed, 1));
    bulbs.setAttribute('aSize', new THREE.Float32BufferAttribute(bulbSize, 1));

    // posies at the arch's feet: a cluster of small blooms, and ribbons falling from them
    const blush = new THREE.Color('#d9a3a6');
    const ivory = new THREE.Color('#efe1cf');
    const rose = new THREE.Color('#a8485e');
    const satinParts: THREE.BufferGeometry[] = [];
    const tint = (g: THREE.BufferGeometry, c: THREE.Color, sway: number) => {
      const n = g.attributes.position.count;
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
      g.setAttribute('aSway', new THREE.Float32BufferAttribute(new Array(n).fill(sway), 1));
      return g;
    };
    for (const side of [-1, 1]) {
      const foot = onArc(side * A, 1.02, 0.0);
      // two posies, arranged by hand: not quite mirror images
      const blooms = (
        side < 0
          ? [
              [0, 0, 0.11, ivory],
              [0.1, 0.06, 0.08, blush],
              [-0.09, 0.05, 0.08, blush],
              [0.04, -0.09, 0.075, rose],
              [-0.05, 0.12, 0.065, ivory],
              [0.13, -0.05, 0.06, ivory],
              [-0.12, -0.06, 0.06, rose],
            ]
          : [
              [0.01, 0.01, 0.1, ivory],
              [0.11, 0.04, 0.085, rose],
              [-0.08, 0.07, 0.07, blush],
              [0.02, -0.1, 0.08, blush],
              [0.07, 0.13, 0.06, ivory],
              [-0.13, -0.03, 0.055, ivory],
              [0.15, -0.08, 0.05, rose],
              [-0.03, 0.17, 0.045, blush],
            ]
      ) as [number, number, number, THREE.Color][];
      for (const [dx, dy, r, c] of blooms) {
        const g = new THREE.IcosahedronGeometry(r, 1);
        g.scale(1, 1, 0.7);
        g.translate(foot.x + dx * side, foot.y + dy, foot.z + 0.04);
        satinParts.push(tint(g, c, 0));
      }
      // two ribbons, falling and curling a little
      for (const [k, len, col] of (side < 0
        ? [
            [0, 1.05, rose],
            [1, 0.8, blush],
          ]
        : [
            [0, 0.86, blush],
            [1, 1.18, rose],
          ]) as [number, number, THREE.Color][]) {
        const segs = 18;
        const g = new THREE.PlaneGeometry(0.045, len, 1, segs);
        const pa = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pa.count; i++) {
          const y = pa.getY(i);
          const u = (len / 2 - y) / len; // 0 at the top, 1 at the free end
          const twist = u * 2.2 + k;
          const x = pa.getX(i);
          pa.setXYZ(i, foot.x + side * (0.03 + k * 0.05) + x * Math.cos(twist) + Math.sin(u * 3 + k) * 0.05, foot.y - 0.08 - u * len, foot.z + 0.03 + x * Math.sin(twist));
        }
        g.computeVertexNormals();
        // sway grows toward the free end
        const n = pa.count;
        g.setAttribute('aColor', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [col.r, col.g, col.b]).flat(), 3));
        g.setAttribute(
          'aSway',
          new THREE.Float32BufferAttribute(
            Array.from({ length: n }, (_, i) => (foot.y - pa.getY(i)) / len),
            1,
          ),
        );
        satinParts.push(g);
      }
    }
    // keep only the attributes they share before merging
    const satin = mergeAll(
      satinParts.map((g) => {
        if (!g.index) return g;
        const flat = g.toNonIndexed();
        g.dispose();
        return flat;
      }),
    );
    const heartAt = onArc(0, 2.74, 0.02);
    return { arch, inner, cables, bulbs, satin, heartAt };
  }, [R]);
  useEffect(
    () => () => {
      parts.arch.dispose();
      parts.inner.dispose();
      parts.cables.forEach((c) => c.dispose());
      parts.bulbs.dispose();
      parts.satin.dispose();
    },
    [parts],
  );

  const letterU = useMemo(
    () => ({
      uMask: { value: glyphs.mask },
      uSoft: { value: glyphs.soft },
      uTexel: { value: new THREE.Vector2(1 / (CELL_W * glyphs.count), 1 / CELL_H) },
      uFloorY: { value: 0 },
      uGlow: { value: 1 },
      uHeart: { value: heart },
      uSweep: { value: -9 },
      uSweepAmp: { value: 0.1 },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  letterU.uMask.value = glyphs.mask;
  letterU.uSoft.value = glyphs.soft;
  const haloU = useMemo(() => ({ uHalo: { value: glyphs.halo }, uGlow: { value: 1 } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  haloU.uHalo.value = glyphs.halo;
  const goldU = useMemo(() => ({ uColor: { value: new THREE.Color('#d8b47c') } }), []);
  const roseGoldU = useMemo(() => ({ uColor: { value: new THREE.Color('#c98d78') } }), []);
  const bulbU = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uMotion: { value: motion }, uGlow: { value: 1 } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const satinU = useMemo(() => ({ uTime: { value: 0 }, uMotion: { value: motion } }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const letterMat = useShader(letterVertex, letterFragment, letterU, { opaque: true });
  const haloMat = useShader(haloVertex, haloFragment, haloU);
  const goldMat = useShader(metalVertex, metalFragment, goldU, { opaque: true });
  const roseGoldMat = useShader(metalVertex, metalFragment, roseGoldU, { opaque: true });
  const bulbMat = useShader(bulbVertex, bulbFragment, bulbU);
  const satinMat = useShader(satinVertex, satinFragment, satinU, { opaque: true, side: THREE.DoubleSide });

  // her hand on it / the camera close to it: the sign warms a little, the band of light shows
  const hover = useRef(0);
  const hovered = useRef(false);
  const focusAmt = useRef(0);
  useFrame((state, rawDt) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(rawDt, 0.05);
    bulbU.uTime.value = satinU.uTime.value = t;
    bulbU.uMotion.value = satinU.uMotion.value = motion;
    hover.current += ((hovered.current ? 1 : 0) - hover.current) * (1 - Math.exp(-dt * 5));
    focusAmt.current += ((focused ? 1 : 0) - focusAmt.current) * (1 - Math.exp(-dt * 2.5));
    const h = hover.current;
    const f = focusAmt.current;
    // a slow breath in the sign's light — almost subconscious, never a flicker
    const breath = 0.93 + 0.07 * Math.sin(t * 0.45 * motion);
    letterU.uGlow.value = haloU.uGlow.value = breath * (1 + 0.18 * h + 0.3 * f);
    bulbU.uGlow.value = breath * (1 + 0.35 * h + 0.4 * f);
    letterU.uHeart.value += (heart - letterU.uHeart.value) * 0.05;
    // the band of light crosses the letters every ~11 s (faster and brighter when she's here)
    const period = 11 - 4 * Math.max(h, f);
    letterU.uSweep.value = -3.4 + ((t * motion) % period) / period * 6.8;
    letterU.uSweepAmp.value = 0.1 + 0.3 * h + 0.25 * f;
  });

  // two fine gold hairlines holding MY BABY between them — the thread through the lines
  const hairlines = useMemo(() => {
    const line = SIGN_LINES[FRAMED_LINE];
    const half = halfWidths[FRAMED_LINE];
    if (half === undefined) return null;
    const onArc = (sArc: number, h: number) => new THREE.Vector3(Math.sin(sArc / R) * (R - 0.01), h, -Math.cos(sArc / R) * (R - 0.01));
    const parts2: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const a = side * (half + 0.16);
      const b = side * (half + 0.78);
      parts2.push(new THREE.TubeGeometry(new THREE.LineCurve3(onArc(a, line.h), onArc(b, line.h)), 1, 0.0045, 5, false));
      const dot = new THREE.SphereGeometry(0.014, 8, 6);
      dot.translate(...onArc(a - side * 0.04, line.h).toArray());
      parts2.push(dot);
    }
    const flat = parts2.map((g) => (g.index ? g.toNonIndexed() : g));
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const total = flat.reduce((n, g) => n + g.attributes[name].array.length, 0);
      const arr = new Float32Array(total);
      let o = 0;
      for (const g of flat) {
        arr.set(g.attributes[name].array as Float32Array, o);
        o += g.attributes[name].array.length;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    return out;
  }, [halfWidths, R]);
  useEffect(() => () => hairlines?.dispose(), [hairlines]);

  // scale about the sign's centre (on the arc, at the height of its middle)
  const pivot: [number, number, number] = [0, 2.0, -R];
  return (
    <group position={[0, floorY - drop, 0]}>
      <group position={pivot} scale={scale * 0.9}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
          <mesh geometry={halos} material={haloMat} renderOrder={-2} />
          <mesh geometry={letters} material={letterMat} />
          <mesh geometry={parts.arch} material={goldMat} />
          <mesh geometry={parts.inner} material={goldMat} />
          {parts.cables.map((c, i) => (
            <mesh key={i} geometry={c} material={goldMat} />
          ))}
          <points geometry={parts.bulbs} material={bulbMat} frustumCulled={false} />
          <mesh geometry={parts.satin} material={satinMat} />
          {hairlines && <mesh geometry={hairlines} material={goldMat} />}
          {/* a generous, invisible touch target over the lettering */}
          <mesh
            position={[0, 1.95, -R + 0.15]}
            userData={{ moment: true }}
            onClick={(e) => {
              // only when the sign is the nearest thing under her finger
              if (e.intersections[0]?.object !== e.object || e.delta > 8) return;
              e.stopPropagation();
              onTap?.();
            }}
            onPointerOver={(e) => {
              if (e.intersections[0]?.object !== e.object) return;
              hovered.current = true;
              if (onTap) document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              hovered.current = false;
              document.body.style.cursor = '';
            }}
          >
            <planeGeometry args={[4.6, 2.3]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
          {/* the little heart under the apex — it points down at the real one */}
          <mesh geometry={getHeartGeometry('low')} position={parts.heartAt} rotation={[0, 0, Math.PI]} scale={[0.09, 0.09, 0.04]} material={roseGoldMat} />
        </group>
      </group>
    </group>
  );
}

export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'aColor', 'aSway'];
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  parts.forEach((g) => g.dispose());
  return out;
}
