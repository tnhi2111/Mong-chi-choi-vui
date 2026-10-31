import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { carrier, type Quad } from '../../lib/carrier';
import { motion as MOTION } from '../../config/motion';

/**
 * K / P — the sheet a gift lets out, which becomes the memory page (see `src/lib/carrier.ts`).
 *
 * One finely subdivided plane (24 × 48), shaped in its vertex shader:
 *  • `tri` / `half` — a letter / a note in a loose roll (W2: never creased — one smooth curve,
 *             `fold` 1 → 0 relaxes it flat; `foldB` rolls its top a little tighter);
 *  • `roll` — a scroll: what is not yet unrolled wraps round a small cylinder (`fold`);
 *  • `page` — a journal page lifting off its book, curled (`fold`).
 * P — it is a magic sheet: the air moves its edges (`wind`), it bows a little (`curl`, also
 * the small bounce as it lies flat), its edge has a thickness (`edge`) and a fine line of
 * warm gold runs round it (`rim`, emissive only — no light is added to the scene); a few
 * motes of light hover round it while it waits (`motes`) and fall from it as it opens
 * (`fall`). All of these are faded to nothing before the handoff, so at that moment the
 * 3D sheet is exactly the page's paper (written straight out, no tone mapping).
 *
 * Every frame it is rendered it reports its four corners on screen (`onBeforeRender`: the
 * camera as it is for THAT frame — never a frame late).
 */
export interface CarrierPose {
  show: boolean;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** world height of the sheet when flat (its width is height × aspect) */
  height: number;
  /** 1 = folded / rolled / curled, 0 = flat (the outer crease, or the only one) */
  fold: number;
  /** the inner crease of a letter folded in three (1 folded … 0 flat) */
  foldB: number;
  /** a little flutter in the air while it flies (0..1) */
  flutter: number;
  /** P: the air at its edges, its bow, the gold at its rim, its edge's thickness, warmth */
  wind: number;
  curl: number;
  rim: number;
  edge: number;
  warm: number;
  /** motes waiting round it / falling from it (0..1) */
  motes: number;
  fall: number;
  /** Q: how much of it exists yet, from its middle outward (1 = all of it) */
  reveal: number;
  /** V: faint lines of writing on it while it flies (it is a letter, not a blank sheet) */
  lines: number;
  /** Y2: the paler sheets and the light that follow its path (0..1) */
  trail: number;
  /** set by PaperCarrier: put this pose on the sheet now (call right after writing it) */
  apply?: () => void;
}

export function newCarrierPose(): CarrierPose {
  return { show: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), height: 0.3, fold: 1, foldB: 1, flutter: 0, wind: 0, curl: 0, rim: 0, edge: 0, warm: 0, motes: 0, fall: 0, reveal: 1, lines: 0, trail: 0 };
}

const MODES = { none: 0, tri: 1, half: 2, roll: 3, page: 4 } as const;

const vertex = /* glsl */ `
  uniform float uFold;
  uniform float uFoldB;
  uniform float uMode;
  uniform float uFlutter;
  uniform float uWind;
  uniform float uCurl;
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec3 vView;
  void main() {
    vec3 p = position;
    float y = p.y;
    float z = 0.0;
    const float PI = 3.14159265;
    if (uMode > 0.5 && uMode < 2.5) {
      // W2: a letter / a note is never creased — it is one soft sheet in a loose roll that
      // relaxes as it flies: the same curvature everywhere along it (a cylinder of radius
      // 1/κ), κ falling smoothly to 0, so nowhere on it is there a fold or a corner.
      // (rolled most of a turn round its middle row; a little more at its top edge so it reads
      //  as a sheet rolled from the top, like a letter taken out of an envelope)
      float k = uFold * (5.2 + 0.8 * uFoldB);
      float yy = p.y + 0.12 * uFold;
      if (k > 1e-3) {
        y = sin(yy * k) / k - 0.12 * uFold;
        z = (1.0 - cos(yy * k)) / k;
      }
    } else if (uMode > 2.5 && uMode < 3.5) {
      // a scroll: unrolled from the bottom; the rest is wound round a cylinder above it
      // (W2: a loose roll — tight, its turns would read as folds)
      float s = p.y + 0.5;
      float lu = 1.0 - uFold;
      if (s > lu) {
        float r = 0.07 / max(uAspect, 0.4);
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
    // a breath of air while it flies: a slow wave running down to its trailing (lower) edge,
    // stronger toward that edge — paper floating, not shaking
    float tail = 0.35 + 0.65 * smoothstep(0.3, -0.5, p.y);
    z += uFlutter * 0.022 * tail * sin(p.y * 5.0 - uTime * 2.1 + p.x * 1.5) * (0.7 + 0.3 * sin(p.x * 3.0 + uTime * 1.3));
    // P: the air at its edges (the middle holds still, the edges and corners stir)
    float edgeK = smoothstep(0.28, 0.5, max(abs(p.x), abs(y)));
    z += uWind * edgeK * (0.012 * sin(p.x * 9.0 + uTime * 3.7) * sin(y * 7.0 + uTime * 2.9) + 0.008 * sin(uTime * 1.9 + p.x * 3.0 + y * 2.0));
    // P: a soft bow across the sheet (negative: the little bounce as it lies flat)
    z += uCurl * 0.05 * (1.0 - 4.0 * y * y) * (1.0 - 1.6 * p.x * p.x);
    vec4 mv = modelViewMatrix * vec4(p.x, y, z, 1.0);
    vUv = uv;
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uPaper;
  uniform float uMode;
  uniform float uTime;
  uniform float uRim;
  uniform float uEdge;
  uniform float uWarm;
  uniform float uAspect;
  uniform float uReveal;
  uniform float uLines;
  uniform float uGhost;
  varying vec2 vUv;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  void main() {
    // Q: condensing out of light — it exists from its middle outward, with a soft torn edge
    if (uReveal < 0.999) {
      vec2 q = vUv - 0.5;
      float r = length(vec2(q.x * uAspect, q.y * 3.0)) / length(vec2(0.5 * uAspect, 0.5));
      if (r + (hash(floor(vUv * 160.0)) - 0.5) * 0.08 > uReveal * 1.15) discard;
    }
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    // facing her squarely, it is exactly the page's paper; turned away, a little shaded
    // (against the lens's axis, not the ray to each point: a big sheet close to the lens
    //  would otherwise darken toward its edges, and the page — evenly lit — would not match)
    float facing = abs(n.z);
    float lit = mix(0.8, 1.0, smoothstep(0.2, 0.97, facing));
    if (!gl_FrontFacing) lit *= 0.93;
    // fibres: a laid paper — a soft grain longer along the sheet, a little tooth across it
    float fib = vnoise(vUv * vec2(90.0, 260.0)) * 0.6 + vnoise(vUv * vec2(18.0, 50.0)) * 0.4;
    float tooth = vnoise(vUv * vec2(420.0, 560.0));
    float grain = 1.0 + (fib - 0.5) * 0.035 + (tooth - 0.5) * 0.012;
    // (W2: no creases — it was never folded, only rolled)
    vec3 col = uPaper * lit * grain * (1.0 + 0.05 * uWarm);
    // V: lines of handwriting in gilt ink — strokes of different lengths in the page's margins,
    // an image of writing (the real words are on the page), gone by the handoff
    if (uLines > 0.001) {
      float row = floor((1.0 - vUv.y) * 26.0);
      float inRow = fract((1.0 - vUv.y) * 26.0);
      float len = 0.55 + 0.4 * hash(vec2(row, 3.1));
      float x0 = 0.12;
      float on = step(2.0, row) * step(row, 23.0) * step(x0, vUv.x) * step(vUv.x, x0 + len * 0.76);
      on *= smoothstep(0.42, 0.5, inRow) * (1.0 - smoothstep(0.56, 0.64, inRow));
      // the pen lifts between words
      on *= step(0.18, fract(vUv.x * 9.0 + hash(vec2(row, 7.0)) * 3.0));
      col = mix(col, vec3(0.62, 0.45, 0.3), on * 0.55 * uLines);
    }
    // P: how far this point is from the edge (in units of the sheet's height, both ways)
    vec2 d2 = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
    float e = min(d2.x, d2.y);
    // its thickness: a hair of shade right at the edge, a hair of light just inside it
    col *= 1.0 - uEdge * (0.14 * smoothstep(0.004, 0.0, e) - 0.03 * smoothstep(0.012, 0.004, e));
    // a fine line of warm gold round it, a brighter bead of it travelling along the rim
    float along = fract((vUv.x + vUv.y * 0.6 + (vUv.y > 0.5 ? 0.0 : 0.5)) * 0.5 - uTime * 0.12);
    float bead = exp(-pow((along - 0.5) * 9.0, 2.0));
    // (on near-white paper light cannot be added — it is a GILT edge: the colour turns gold)
    float rim = exp(-e * 120.0) * (0.55 + 0.45 * bead);
    col = mix(col, vec3(0.86, 0.6, 0.28) * (1.0 + 0.35 * bead), clamp(rim * uRim, 0.0, 1.0));
    col += vec3(1.0, 0.8, 0.5) * exp(-e * 30.0) * 0.06 * uRim;
    // Y2: a trailing sheet (uGhost = its opacity): the same paper, warmer, see-through
    if (uGhost > 0.0) col = mix(col, vec3(1.0, 0.86, 0.64), 0.3);
    gl_FragColor = vec4(col, uGhost > 0.0 ? uGhost : 1.0);
  }
`;

/* P: motes of light — hovering round the sheet while it waits, falling from it as it opens */
const moteVertex = /* glsl */ `
  uniform float uTime;
  uniform float uMotes;
  uniform float uFall;
  uniform float uPixelRatio;
  uniform float uAspect;
  attribute float aSeed;
  varying float vA;
  void main() {
    float s = aSeed;
    // (local units of the sheet: x already spans its width — the mesh is scaled to it)
    // waiting: a slow orbit just outside the sheet's edge, each mote on its own path
    float a = s * 6.2831 + uTime * (0.18 + fract(s * 7.3) * 0.2);
    vec3 orbit = vec3(cos(a) * (0.5 + 0.08 / uAspect), sin(a) * 0.58, 0.04 + sin(uTime * 0.7 + s * 30.0) * 0.06);
    orbit.y += sin(uTime * 0.9 + s * 11.0) * 0.04;
    // opening: half of them fall from the sheet, drifting, and fade
    float faller = step(0.5, fract(s * 5.0));
    float life = fract(uTime * 0.35 + s * 3.7);
    vec3 fall = vec3((fract(s * 13.1) - 0.5) + sin(life * 6.0 + s * 9.0) * 0.04 / uAspect, 0.4 - life * 1.3, 0.05);
    vec3 p = mix(orbit, fall, faller * uFall);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (3.0 + fract(s * 17.0) * 4.0) * uPixelRatio * (3.2 / -mv.z);
    float tw = 0.55 + 0.45 * sin(uTime * (2.0 + fract(s * 3.0) * 3.0) + s * 40.0);
    vA = tw * max(uMotes, uFall * faller * (1.0 - life));
  }
`;
const moteFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.55), smoothstep(0.5, 0.0, d) * vA);
  }
`;

export function PaperCarrier({ pose, mode, aspect, paper = '#f6ede3' }: { pose: { current: CarrierPose }; mode: keyof typeof MODES; aspect: number; paper?: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 24, 48), []);
  const makeUniforms = () => ({
    uFold: { value: 1 },
    uFoldB: { value: 1 },
    uMode: { value: MODES[mode] },
    uFlutter: { value: 0 },
    uWind: { value: 0 },
    uCurl: { value: 0 },
    uRim: { value: 0 },
    uEdge: { value: 0 },
    uWarm: { value: 0 },
    uReveal: { value: 1 },
    uLines: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: aspect },
    // (sRGB, written straight to the screen — the same number as the page's --paper)
    uPaper: { value: new THREE.Vector3(...hexRGB(paper)) },
    uGhost: { value: 0 },
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uniforms = useMemo(makeUniforms, []);
  // Y2: two paler sheets follow its path (the same program: only uGhost differs), each with a
  // few motes of light falling from it — the trail drifts on the same rhythm and fades
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ghostU = useMemo(() => [makeUniforms(), makeUniforms()], []);
  const ghostMats = [
    useShader(vertex, fragment, ghostU[0], { additive: false, side: THREE.DoubleSide }),
    useShader(vertex, fragment, ghostU[1], { additive: false, side: THREE.DoubleSide }),
  ];
  const ghosts = useRef<(THREE.Mesh | null)[]>([]);
  const history = useRef<{ t: number; pos: THREE.Vector3; quat: THREE.Quaternion; height: number; fold: number; curl: number; flutter: number; wind: number }[]>([]);
  for (const u of [uniforms, ...ghostU]) {
    u.uMode.value = MODES[mode];
    u.uAspect.value = aspect;
  }
  const material = useShader(vertex, fragment, uniforms, { opaque: true, side: THREE.DoubleSide });
  const corner = useMemo(() => new THREE.Vector3(), []);
  const lastAt = useRef(0);
  const moteGeo = useMemo(() => {
    const n = 48;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, i) => (i + 0.5) / n), 1));
    return g;
  }, []);
  const moteU = useMemo(
    () => ({ uTime: uniforms.uTime, uMotes: { value: 0 }, uFall: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uAspect: uniforms.uAspect }),
    [uniforms],
  );
  const moteMat = useShader(moteVertex, moteFragment, moteU);
  const ghostMoteU = useMemo(
    () => ghostU.map((g) => ({ uTime: uniforms.uTime, uMotes: { value: 0 }, uFall: { value: 0 }, uPixelRatio: moteU.uPixelRatio, uAspect: g.uAspect })),
    [ghostU, uniforms, moteU],
  );
  const ghostMoteMats = [useShader(moteVertex, moteFragment, ghostMoteU[0]), useShader(moteVertex, moteFragment, ghostMoteU[1])];

  // Y2: its programs (the sheet, a trailing sheet, their motes) are linked when it mounts — with
  // the room, under its veil — not the first time the sheet flies: the trail's first frame was
  // a 36–46 ms stall in the middle of the flight
  const gl = useThree((st) => st.gl);
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    const warm = new THREE.Scene();
    warm.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, ghostMats[0]), new THREE.Points(moteGeo, moteMat), new THREE.Points(moteGeo, ghostMoteMats[0]));
    void gl.compileAsync(warm, camera).catch(() => {});
  }, [gl]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Y2: the trail — each paler sheet is where the sheet was `lag` s ago, sinking a little. */
  const trailFrame = (now: number, p: CarrierPose) => {
    const T = MOTION.paper.trail;
    const h = history.current;
    if (p.show && !carrier.handed) {
      const last = h[h.length - 1];
      if (!last || now - last.t > 1 / 120) {
        const e = h.length > 90 ? h.shift()! : { t: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), height: 0, fold: 0, curl: 0, flutter: 0, wind: 0 };
        e.t = now;
        e.pos.copy(p.pos);
        e.quat.copy(p.quat);
        e.height = p.height;
        e.fold = p.fold;
        e.curl = p.curl;
        e.flutter = p.flutter;
        e.wind = p.wind;
        h.push(e);
      }
    } else h.length = 0;
    ghosts.current.forEach((g, i) => {
      if (!g) return;
      const a = T.alpha[i] * p.trail;
      const at = now - T.lag[i];
      const j = h.findIndex((e) => e.t >= at);
      // (drawn — all but invisible — from the sheet's first frame: its first draw belongs with
      //  the sheet's, not in the middle of the flight, where it was a 35 ms frame)
      g.visible = p.show && !carrier.handed;
      if (!g.visible) return;
      const e0 = j > 0 ? h[j - 1] : h[0];
      const e1 = j > 0 ? h[j] : h[0];
      if (!e0) {
        g.visible = false;
        return;
      }
      const f = (at - e0.t) / Math.max(1e-4, e1.t - e0.t);
      g.position.lerpVectors(e0.pos, e1.pos, f);
      g.position.y -= T.lag[i] * 0.05;
      g.quaternion.slerpQuaternions(e0.quat, e1.quat, f);
      const ht = (e0.height + (e1.height - e0.height) * f) * T.size[i];
      g.scale.set(ht * aspect, ht, ht);
      const u = ghostU[i];
      u.uFold.value = e0.fold + (e1.fold - e0.fold) * f;
      u.uFoldB.value = u.uFold.value;
      u.uCurl.value = e0.curl;
      u.uFlutter.value = e0.flutter;
      u.uWind.value = e0.wind;
      u.uTime.value = now - T.lag[i];
      u.uGhost.value = j > 0 ? Math.max(1e-3, a) : 1e-3;
      ghostMoteU[i].uFall.value = j > 0 ? Math.min(1, a * 5) : 0;
    });
  };

  // Y2: the pose is applied by whoever writes it, the moment it is written (`pose.apply`) —
  // this component's own frame callback runs BEFORE its parent's (children subscribe first),
  // so on its own it drew every pose one frame late, with the last frame's camera: invisible
  // while frames are even, a jump right after a long one
  const apply = (now: number) => {
    const m = mesh.current;
    if (!m) return;
    const p = pose.current;
    m.visible = p.show;
    trailFrame(now, p);
    if (!p.show) return;
    m.position.copy(p.pos);
    m.quaternion.copy(p.quat);
    m.scale.set(p.height * aspect, p.height, p.height);
    uniforms.uFold.value = p.fold;
    uniforms.uFoldB.value = p.foldB;
    uniforms.uFlutter.value = p.flutter;
    uniforms.uWind.value = p.wind;
    uniforms.uCurl.value = p.curl;
    uniforms.uRim.value = p.rim;
    uniforms.uEdge.value = p.edge;
    uniforms.uWarm.value = p.warm;
    uniforms.uReveal.value = p.reveal;
    uniforms.uLines.value = p.lines;
    uniforms.uTime.value = now;
    moteU.uMotes.value = carrier.handed ? 0 : p.motes;
    moteU.uFall.value = carrier.handed ? 0 : p.fall;
    // handed over: it still renders (so it keeps reporting where it is), but draws nothing
    material.colorWrite = !carrier.handed;
    material.depthWrite = !carrier.handed;
  };
  const clock = useThree((st) => st.clock);
  pose.current.apply = () => apply(clock.elapsedTime);
  // (and on its own frame, for a writer that does not call it)
  useFrame((state) => apply(state.clock.elapsedTime));

  return (
    <>
      <mesh
        ref={mesh}
        name="paper-carrier"
        geometry={geometry}
        material={material}
        visible={false}
        frustumCulled={false}
        renderOrder={4}
        onBeforeRender={(gl, _scene, cam) => {
          const m = mesh.current;
          // (only the view she sees: another pass — a capture with its own camera — would
          //  report corners she never sees, and the page could take over from them)
          if (!m || cam !== camera) return;
          const el = gl.domElement;
          const w = el.clientWidth;
          const h = el.clientHeight;
          const q = ([[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]] as const).map(([x, y]) => {
            corner.set(x, y, 0).applyMatrix4(m.matrixWorld).project(cam);
            return [(corner.x * 0.5 + 0.5) * w, (-corner.y * 0.5 + 0.5) * h];
          }) as Quad;
          // (and how fast its corners are moving on screen, px/s — the page carries that on)
          const now = performance.now();
          const prev = carrier.quad;
          const dtq = (now - lastAt.current) / 1000;
          if (prev && dtq > 0.001 && dtq < 0.2) {
            const v = q.map(([x, y], i) => [(x - prev[i][0]) / dtq, (y - prev[i][1]) / dtq]) as Quad;
            const o2 = carrier.vel;
            carrier.vel = o2 ? (v.map(([x, y], i) => [o2[i][0] * 0.5 + x * 0.5, o2[i][1] * 0.5 + y * 0.5]) as Quad) : v;
          }
          lastAt.current = now;
          carrier.quad = q;
          carrier.at = now;
        }}
      >
        <points geometry={moteGeo} material={moteMat} frustumCulled={false} renderOrder={5} raycast={() => null} />
      </mesh>
      {ghostMats.map((gm, i) => (
        <mesh key={i} ref={(g) => void (ghosts.current[i] = g)} geometry={geometry} material={gm} visible={false} frustumCulled={false} renderOrder={3} raycast={() => null}>
          <points geometry={moteGeo} material={ghostMoteMats[i]} frustumCulled={false} renderOrder={5} raycast={() => null} />
        </mesh>
      ))}
    </>
  );
}

function hexRGB(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
