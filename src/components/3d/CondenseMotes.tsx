import { useMemo } from 'react';
import * as THREE from 'three';
import { useShader } from './useShader';

/**
 * Q — the music box has no letter in it: its tune makes one. Every note of the comb lets a
 * cluster of motes go up out of the box; they swirl, and condense onto the shape of a folded
 * sheet floating in the middle of the frame (points sampled on that sheet's plane). Then the
 * real sheet appears from its middle outward (`uReveal`, the same reveal its shader uses) and
 * the motes it passes go out. Closing runs the clock back: the light goes home into the box.
 *
 * The parent (Gift3D) writes the uniforms every frame: `uT` (seconds of the opening),
 * `uFrom` (the box's mouth, world), `uSheet` (the floating sheet's matrix, with its size),
 * `uNotes` (when each note plays, s), `uReveal`, `uOn`.
 */
const NOTES = 8;

const vertex = /* glsl */ `
  uniform float uT;
  uniform vec3 uFrom;
  uniform mat4 uSheet;
  uniform float uNotes[${NOTES}];
  uniform float uReveal;
  uniform float uOn;
  uniform float uPixelRatio;
  uniform float uAspect;
  attribute vec2 aTarget;
  attribute float aNote;
  attribute float aSeed;
  varying float vA;
  float at(float i) {
    float t = 0.0;
    for (int k = 0; k < ${NOTES}; k++) if (float(k) == i) t = uNotes[k];
    return t;
  }
  void main() {
    float delay = at(aNote) + fract(aSeed * 7.13) * 0.28;
    float dur = 1.15 + fract(aSeed * 3.7) * 0.45;
    float u = clamp((uT - delay) / dur, 0.0, 1.0);
    float e = u * u * (3.0 - 2.0 * u);
    vec3 target = (uSheet * vec4(aTarget, 0.0, 1.0)).xyz;
    // it rises out of the box first, then swirls across to its place on the sheet
    vec3 start = uFrom + vec3((fract(aSeed * 11.0) - 0.5) * 0.06, 0.0, (fract(aSeed * 5.0) - 0.5) * 0.04);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 c1 = start + up * (0.35 + fract(aSeed * 13.0) * 0.25);
    vec3 c2 = target + vec3(sin(aSeed * 40.0), 0.0, cos(aSeed * 40.0)) * 0.22 - up * 0.08;
    float iv = 1.0 - e;
    vec3 p = iv * iv * iv * start + 3.0 * iv * iv * e * c1 + 3.0 * iv * e * e * c2 + e * e * e * target;
    // a slow curl round its path while it flies
    float sw = sin(u * 3.14159);
    p += vec3(cos(aSeed * 20.0 + uT * 2.0), sin(aSeed * 17.0 + uT * 1.6), 0.0) * 0.035 * sw;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.2 + fract(aSeed * 19.0) * 2.6) * uPixelRatio * (2.6 / -mv.z) * (1.0 + 0.6 * sw);
    // landed motes go out as the real sheet appears over them (from its middle outward)
    float r = length(vec2(aTarget.x * uAspect, aTarget.y * 3.0)) / length(vec2(0.5 * uAspect, 0.5));
    float covered = smoothstep(r - 0.05, r + 0.12, uReveal * 1.15);
    float tw = 0.65 + 0.35 * sin(uT * 5.0 + aSeed * 60.0);
    vA = uOn * step(0.0001, uT - delay) * min(1.0, u * 4.0) * (1.0 - covered) * tw;
  }
`;
const fragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.84, 0.6), smoothstep(0.5, 0.0, d) * vA);
  }
`;

export interface CondenseUniforms {
  uT: { value: number };
  uFrom: { value: THREE.Vector3 };
  uSheet: { value: THREE.Matrix4 };
  uNotes: { value: number[] };
  uReveal: { value: number };
  uOn: { value: number };
  uPixelRatio: { value: number };
  uAspect: { value: number };
}

export function newCondenseUniforms(): CondenseUniforms {
  return {
    uT: { value: 0 },
    uFrom: { value: new THREE.Vector3() },
    uSheet: { value: new THREE.Matrix4() },
    uNotes: { value: new Array(NOTES).fill(99) },
    uReveal: { value: 0 },
    uOn: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uAspect: { value: 0.8 },
  };
}

export function CondenseMotes({ uniforms, count = 760 }: { uniforms: CondenseUniforms; count?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const target: number[] = [];
    const note: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      // on the folded sheet's face: its full width, the middle third of its height
      target.push(Math.random() - 0.5, (Math.random() - 0.5) / 3);
      note.push(i % NOTES);
      seed.push(Math.random());
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aTarget', new THREE.Float32BufferAttribute(target, 2));
    g.setAttribute('aNote', new THREE.Float32BufferAttribute(note, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const material = useShader(vertex, fragment, uniforms as unknown as Record<string, THREE.IUniform>);
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} raycast={() => null} />;
}
