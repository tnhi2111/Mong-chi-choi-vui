import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { carrier, type Quad } from '../../lib/carrier';

/**
 * K — the sheet a gift lets out, which becomes the memory page (see `src/lib/carrier.ts`).
 *
 * One subdivided plane, folded in its vertex shader:
 *  • `tri`  — a letter folded in three (C-fold): the outer (top) panel opens first, then the
 *             inner one; the creases stay as faint lines once it is flat (and on the page);
 *  • `half` — a note folded once;
 *  • `roll` — a scroll: whatever is not yet unrolled wraps round a small cylinder at its top;
 *  • `page` — a journal page lifting off its book, curled and flattening as it comes.
 * Its paper is the page's own colour, written straight out (no tone mapping), so at the
 * handoff the 3D sheet and the DOM leaf are the same colour.
 *
 * The parent drives it through `pose` (world position / orientation / height, fold 1 → 0).
 * Every frame it is rendered it reports its four corners on screen (`onBeforeRender`: the
 * camera as it is for THAT frame — never a frame late).
 */
export interface CarrierPose {
  show: boolean;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** world height of the sheet when flat (its width is height × aspect) */
  height: number;
  /** 1 = folded / rolled / curled, 0 = flat */
  fold: number;
  /** a little flutter in the air while it flies (0..1) */
  flutter: number;
}

export function newCarrierPose(): CarrierPose {
  return { show: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), height: 0.3, fold: 1, flutter: 0 };
}

const MODES = { none: 0, tri: 1, half: 2, roll: 3, page: 4 } as const;

const vertex = /* glsl */ `
  uniform float uFold;
  uniform float uMode;
  uniform float uFlutter;
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec3 vView;
  void main() {
    vec3 p = position;
    float y = p.y;
    float z = 0.0;
    const float PI = 3.14159265;
    if (uMode > 0.5 && uMode < 1.5) {
      // letter fold in three: creases at ±1/6; the top panel lies outermost
      float c = 1.0 / 6.0;
      float aT = PI * smoothstep(0.4, 1.0, uFold);
      float aB = PI * smoothstep(0.0, 0.6, uFold);
      if (p.y > c) {
        float d = p.y - c;
        y = c + d * cos(aT);
        z = d * sin(aT) + 0.01 * aT / PI;
      } else if (p.y < -c) {
        float d = p.y + c;
        y = -c + d * cos(aB);
        z = -d * sin(aB) + 0.005 * aB / PI;
      }
    } else if (uMode > 1.5 && uMode < 2.5) {
      float a = PI * smoothstep(0.0, 1.0, uFold);
      if (p.y > 0.0) {
        y = p.y * cos(a);
        z = p.y * sin(a) + 0.006 * a / PI;
      }
    } else if (uMode > 2.5 && uMode < 3.5) {
      // a scroll: unrolled from the bottom; the rest is wound round a cylinder above it
      float s = p.y + 0.5;
      float lu = 1.0 - uFold;
      if (s > lu) {
        float r = 0.028 / max(uAspect, 0.4);
        float phi = (s - lu) / r;
        float rr = r * (1.0 + phi * 0.012);
        y = lu - 0.5 + rr * sin(phi);
        z = rr * (1.0 - cos(phi));
      }
    } else if (uMode > 3.5) {
      // a page leaving its book: curled up from the spine side, flattening as it comes
      float u = p.x + 0.5;
      z = uFold * 0.22 * u * u;
      p.x -= uFold * 0.06 * u * u;
    }
    // a breath of air while it flies
    z += uFlutter * 0.018 * sin(p.x * 4.0 + uTime * 5.0) * sin(y * 3.0 + uTime * 3.3);
    vec4 mv = modelViewMatrix * vec4(p.x, y, z, 1.0);
    vUv = uv;
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uPaper;
  uniform float uMode;
  varying vec2 vUv;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float crease(float y, float at) { return exp(-pow((y - at) * 160.0, 2.0)); }
  void main() {
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    vec3 V = normalize(-vView);
    float facing = abs(dot(n, V));
    // facing her squarely, it is exactly the page's paper; turned away, a little shaded
    float lit = mix(0.8, 1.0, smoothstep(0.2, 0.97, facing));
    if (!gl_FrontFacing) lit *= 0.93;
    // fibres: a soft grain, longer along the sheet than across it
    float fib = vnoise(vUv * vec2(90.0, 260.0)) * 0.6 + vnoise(vUv * vec2(18.0, 50.0)) * 0.4;
    float grain = 1.0 + (fib - 0.5) * 0.035;
    // creases where it was folded (they stay once it is flat)
    float c = 0.0;
    if (uMode > 0.5 && uMode < 1.5) c = crease(vUv.y, 1.0 / 3.0) + crease(vUv.y, 2.0 / 3.0);
    else if (uMode > 1.5 && uMode < 2.5) c = crease(vUv.y, 0.5);
    // (no darkened rim: the page has none, and at the handoff the two must be one sheet)
    vec3 col = uPaper * lit * grain * (1.0 - c * 0.09);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function PaperCarrier({ pose, mode, aspect, paper = '#f6ede3' }: { pose: { current: CarrierPose }; mode: keyof typeof MODES; aspect: number; paper?: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 18, 60), []);
  const uniforms = useMemo(
    () => ({
      uFold: { value: 1 },
      uMode: { value: MODES[mode] },
      uFlutter: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: aspect },
      // (sRGB, written straight to the screen — the same number as the page's --paper)
      uPaper: { value: new THREE.Vector3(...hexRGB(paper)) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  uniforms.uMode.value = MODES[mode];
  uniforms.uAspect.value = aspect;
  const material = useShader(vertex, fragment, uniforms, { opaque: true, side: THREE.DoubleSide });
  const corner = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const p = pose.current;
    m.visible = p.show;
    if (!p.show) return;
    m.position.copy(p.pos);
    m.quaternion.copy(p.quat);
    m.scale.set(p.height * aspect, p.height, p.height);
    uniforms.uFold.value = p.fold;
    uniforms.uFlutter.value = p.flutter;
    uniforms.uTime.value = state.clock.elapsedTime;
    // handed over: it still renders (so it keeps reporting where it is), but draws nothing
    material.colorWrite = !carrier.handed;
    material.depthWrite = !carrier.handed;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      visible={false}
      frustumCulled={false}
      renderOrder={4}
      onBeforeRender={(gl, _scene, camera) => {
        const m = mesh.current;
        if (!m) return;
        const el = gl.domElement;
        const w = el.clientWidth;
        const h = el.clientHeight;
        const q = ([[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]] as const).map(([x, y]) => {
          corner.set(x, y, 0).applyMatrix4(m.matrixWorld).project(camera);
          return [(corner.x * 0.5 + 0.5) * w, (-corner.y * 0.5 + 0.5) * h];
        }) as Quad;
        carrier.quad = q;
      }}
    />
  );
}

function hexRGB(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
