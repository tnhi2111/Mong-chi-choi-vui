import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  className: string;
  num: string;
  title: string;
  /** The label's own element, for the caller's per-frame styling (opacity, classes). */
  labelRef?: RefObject<HTMLDivElement | null>;
}

const v = new THREE.Vector3();

/**
 * A small name that follows a point in the scene — plain DOM, no React root of its own.
 * (drei's <Html> renders through a second React root, and tearing many of them down
 * together with the room threw a removeChild error mid-commit.)
 */
export function ScreenLabel({ position, className, num, title, labelRef }: Props) {
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);
  const els = useRef<{ holder: HTMLDivElement; label: HTMLDivElement; num: HTMLSpanElement; title: HTMLSpanElement } | null>(null);

  // (layout effects, in this order: the element exists before its content is written)
  useLayoutEffect(() => {
    const target = gl.domElement.parentNode;
    if (!target) return;
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;will-change:transform;';
    // centred on the point by a wrapper, so the label keeps its own CSS transform
    const center = document.createElement('div');
    center.style.transform = 'translate(-50%, -50%)';
    const label = document.createElement('div');
    const n = document.createElement('span');
    n.className = 'gift-label__num';
    const t = document.createElement('span');
    t.className = 'gift-label__title';
    label.append(n, t);
    center.append(label);
    holder.append(center);
    target.appendChild(holder);
    els.current = { holder, label, num: n, title: t };
    if (labelRef) labelRef.current = label;
    return () => {
      holder.remove();
      els.current = null;
      if (labelRef) labelRef.current = null;
    };
  }, [gl, labelRef]);

  useLayoutEffect(() => {
    const e = els.current;
    if (!e) return;
    // keep classes the caller toggles per frame (is-behind) — they are re-applied each frame
    e.label.className = className;
    e.num.textContent = num;
    e.title.textContent = title;
  }, [className, num, title]);

  useFrame(({ camera, size }) => {
    const e = els.current;
    const g = group.current;
    if (!e || !g) return;
    g.getWorldPosition(v);
    v.project(camera);
    const behind = v.z > 1;
    e.holder.style.display = behind ? 'none' : '';
    if (behind) return;
    const x = (v.x * 0.5 + 0.5) * size.width;
    const y = (-v.y * 0.5 + 0.5) * size.height;
    e.holder.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  });

  return <group ref={group} position={position} />;
}
