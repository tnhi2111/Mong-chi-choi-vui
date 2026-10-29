import { forwardRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

const FONT = "'Cormorant Garamond', Georgia, serif";
/** canvas size; the plane keeps the same aspect */
const CW = 2048;
const CH = 640;
export const SHOT_TITLE_ASPECT = CH / CW;

function draw(canvas: HTMLCanvasElement, title: string, subtitle: string) {
  const c = canvas.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, CW, CH);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  // the name of the memory, in wide upright capitals — as large as fits
  const words = title.toUpperCase();
  let px = 300;
  const track = 0.1;
  const widthAt = (p: number) => {
    c.font = `500 ${p}px ${FONT}`;
    return c.measureText(words).width + words.length * p * track;
  };
  while (px > 80 && widthAt(px) > CW * 0.94) px -= 6;
  c.font = `500 ${px}px ${FONT}`;
  c.fillStyle = '#fbeee6';
  // drawn letter by letter for the tracking (canvas letterSpacing is not everywhere yet)
  const total = widthAt(px);
  let x = (CW - total) / 2 + (px * track) / 2;
  const base = CH * 0.58;
  for (const ch of words) {
    const w = c.measureText(ch).width;
    c.fillText(ch, x + w / 2, base);
    x += w + px * track;
  }
  // its line in Vietnamese, small and italic beneath, between two hairlines
  if (subtitle) {
    const sp = Math.round(Math.min(78, px * 0.34));
    c.font = `italic 400 ${sp}px ${FONT}`;
    c.fillStyle = 'rgba(244, 214, 206, 0.9)';
    const y = base + sp * 1.55;
    c.fillText(subtitle, CW / 2, y);
    const half = c.measureText(subtitle).width / 2;
    c.fillStyle = 'rgba(232, 196, 150, 0.55)';
    c.fillRect(CW / 2 - half - 150, y - sp * 0.3, 110, 2);
    c.fillRect(CW / 2 + half + 40, y - sp * 0.3, 110, 2);
  }
}

/**
 * The gift's name, set large behind it during its product shot (as a studio title card
 * stands behind the product): a camera-facing plane between the wine wash and the gift,
 * so the gift itself occludes part of it. Gift3D drives opacity, rise and placement.
 */
export const ShotTitle = forwardRef<THREE.Mesh, { title: string; subtitle?: string }>(function ShotTitle({ title, subtitle = '' }, ref) {
  const canvas = useMemo(() => {
    const el = document.createElement('canvas');
    el.width = CW;
    el.height = CH;
    return el;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const fonts = document.fonts;
    if (!fonts?.load) return setFontReady(true);
    Promise.all([fonts.load(`500 120px ${FONT}`), fonts.load(`italic 400 60px ${FONT}`)]).then(
      () => alive && setFontReady(true),
      () => alive && setFontReady(true),
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    draw(canvas, title, subtitle);
    texture.needsUpdate = true;
  }, [canvas, texture, title, subtitle, fontReady]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh ref={ref} visible={false} renderOrder={-1}>
      <planeGeometry args={[1, SHOT_TITLE_ASPECT]} />
      <meshBasicMaterial map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
});
