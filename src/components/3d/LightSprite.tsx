import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShader } from './useShader';
import { motion } from '../../config/motion';
import { HIST, sprite, spriteUniforms } from './spriteFlight';
import { getGlowTexture } from './glowTexture';

/**
 * The light sprite, drawn (storyboard D). The brain is `spriteFlight.ts`; this is one points
 * draw for the whole flock plus two sprites for the leader's core.
 *
 * Every mote is somewhere back along the leader's recorded path (`aLag` seconds ago), so the
 * flock is a comet that follows the real curve the leader flew — it is never translated as
 * a block. Around that point each mote has its own place:
 *  - swarm (most): a cloud that is tight at the head and opens toward the tail, stirred by
 *    a divergence-free flow (each component of the flow ignores its own axis, so the flow
 *    neither gathers nor scatters — it curls, the way smoke does);
 *  - ribbons: a few strands winding round the path — the light's own "trail";
 *  - orbiters: a handful circling the camera, so she is inside the swarm, not watching it.
 * Two extra shapes, blended by the script: `uCorridor` turns the swarm into a spiral tunnel
 * round the path (the way into the room), `uStars` sends every mote out to a sphere of
 * fixed points — the flock becomes the finale's sky.
 */

const S = motion.sprite;
const HDT = S.history / (HIST - 1);

const vertex = /* glsl */ `
  uniform vec3 uHist[${HIST}];
  uniform float uSince;
  uniform vec3 uLeader;
  uniform vec3 uVel;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCorridor;
  uniform float uStars;
  uniform vec3 uStarCenter;
  uniform float uPixelRatio;
  uniform float uSpan;
  attribute float aLag;
  attribute float aLagC;
  attribute float aRole;
  attribute float aSeed;
  attribute float aStrand;
  attribute vec3 aOff;
  varying float vAlpha;
  varying float vHead;
  varying float vStar;

  vec3 histAt(float lag) {
    // ahead of the leader (the corridor reaches forward): along its velocity
    if (lag < 0.0) return uLeader - uVel * lag;
    if (lag <= uSince) return mix(uLeader, uHist[0], uSince > 1e-4 ? lag / uSince : 0.0);
    float f = (lag - uSince) / ${HDT.toFixed(5)};
    float fi = min(${(HIST - 2).toFixed(1)}, floor(f));
    int i = int(fi);
    return mix(uHist[i], uHist[i + 1], clamp(f - fi, 0.0, 1.0));
  }

  // divergence-free: no component depends on its own axis
  vec3 flow(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t * 0.9) + sin(p.z * 2.3 - t * 0.6),
      sin(p.z * 1.9 + t * 0.7) + sin(p.x * 2.1 + t * 0.8),
      sin(p.x * 1.5 - t * 0.5) + sin(p.y * 2.7 + t * 0.4)
    ) * 0.5;
  }

  void main() {
    float lag = mix(aLag, aLagC, aRole < 0.5 ? uCorridor : 0.0);
    vec3 c = histAt(lag);
    vec3 T = c - histAt(lag + 0.06);
    T = length(T) > 1e-4 ? normalize(T) : vec3(0.0, 0.0, -1.0);
    vec3 N1 = normalize(cross(T, abs(T.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 N2 = cross(T, N1);
    float k = clamp(aLag / ${S.tail.toFixed(3)}, 0.0, 1.0);
    vec3 p;
    float bright;
    float size;
    if (aRole < 0.5) {
      // the swarm: tight at the head, opening toward the tail, curling
      float rad = mix(0.035, ${S.spread.toFixed(3)}, pow(k, 0.85)) * (0.3 + 0.7 * aSeed) * uSpan;
      vec3 off = aOff * rad + flow(aOff * 2.3 + c * 0.7, uTime * 0.9) * rad * 0.65;
      float ang = aStrand * 6.2831853 + lag * ${(S.corridorTwist * 6.2831853).toFixed(3)} + uTime * 0.5;
      vec3 tube = (N1 * cos(ang) + N2 * sin(ang)) * ${S.corridorR.toFixed(3)} * (0.8 + 0.4 * aSeed)
                + flow(aOff * 3.0 + c * 0.4, uTime) * 0.08;
      p = c + mix(off, tube, uCorridor);
      bright = mix(pow(1.0 - k, 1.4), (0.55 + 0.45 * aSeed) * 0.75, uCorridor);
      size = mix(1.2 + 1.6 * (1.0 - k), 1.4, uCorridor);
    } else if (aRole < 1.5) {
      // the ribbons: strands of light winding round the path it has flown
      float kk = clamp(aLag / ${S.history.toFixed(3)}, 0.0, 1.0);
      float ang = aStrand * 6.2831853 + aLag * ${(S.ribbonTwist * 6.2831853).toFixed(3)} + uTime * 1.3;
      p = c + (N1 * cos(ang) + N2 * sin(ang)) * ${S.ribbonR.toFixed(3)} * (1.0 + kk * 1.6) * uSpan;
      bright = pow(1.0 - kk, 1.8) * 0.9;
      size = 1.05;
    } else {
      // round the camera: she is inside the flock, not watching it
      float ang = aSeed * 6.2831853 + uTime * (0.3 + aSeed * 0.35);
      vec3 o = vec3(cos(ang), sin(ang * 0.7 + aSeed * 3.0) * 0.45, sin(ang)) * (1.0 + aStrand * 1.1);
      p = cameraPosition + o;
      bright = 0.5;
      size = 1.0;
    }
    // the finale's sky: every mote leaves for a fixed place on a far sphere, not all at once
    float st = clamp(uStars * 1.5 - aSeed * 0.5, 0.0, 1.0);
    st = st * st * (3.0 - 2.0 * st);
    vec3 star = uStarCenter + aOff * (6.5 + aSeed * 9.0);
    p = mix(p, star, st);
    bright = mix(bright, 0.45 + 0.55 * fract(aSeed * 13.7), st);
    size = mix(size, 0.9 + aSeed, st);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0);
    // never a blast in her face: a mote right at the lens fades and stops growing
    float near = smoothstep(0.18, 0.9, -mv.z);
    gl_PointSize = min(size * uPixelRatio * (4.2 / max(0.3, -mv.z)) * mix(1.0, uSpan, 0.6 * (1.0 - st)), 22.0 * uPixelRatio);
    vAlpha = uIntensity * bright * twinkle * near;
    vHead = (1.0 - k) * (1.0 - uCorridor * 0.6) * (1.0 - st);
    vStar = st;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vHead;
  varying float vStar;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.45, 0.0, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.45;
    // white-gold at the head, champagne along the body, rose at the tail; stars a cool ivory
    vec3 tail = vec3(0.96, 0.62, 0.66);
    vec3 body = vec3(1.0, 0.84, 0.62);
    vec3 head = vec3(1.0, 0.95, 0.86);
    vec3 col = mix(tail, body, smoothstep(0.0, 0.5, vHead));
    col = mix(col, head, smoothstep(0.55, 1.0, vHead));
    col = mix(col, vec3(0.95, 0.92, 1.0), vStar);
    gl_FragColor = vec4(col, (core + halo) * vAlpha);
  }
`;

interface Props {
  /** Scales the number of motes (quality tier). */
  factor: number;
}

export function LightSprite({ factor }: Props) {
  const points = useRef<THREE.Points>(null);
  const core = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const count = Math.max(500, Math.round(S.count * Math.min(1, Math.max(0.25, factor))));
  const warmed = useRef(0);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = count;
    const lag = new Float32Array(n);
    const lagC = new Float32Array(n);
    const role = new Float32Array(n);
    const seed = new Float32Array(n);
    const strand = new Float32Array(n);
    const off = new Float32Array(n * 3);
    const nRib = Math.round(n * S.ribbons);
    const nOrb = Math.round(n * S.orbiters);
    const strands = 5;
    for (let i = 0; i < n; i++) {
      seed[i] = Math.random();
      const r = i < nRib ? 1 : i < nRib + nOrb ? 2 : 0;
      role[i] = r;
      if (r === 1) {
        // ribbon motes sit evenly along their strand, so the strand reads as a line
        const sIdx = i % strands;
        strand[i] = sIdx / strands;
        lag[i] = (Math.floor(i / strands) / Math.ceil(nRib / strands)) * S.history * 0.96;
      } else {
        strand[i] = Math.random();
        // most of the swarm stays near the head: the tail thins out
        lag[i] = Math.pow(Math.random(), 1.6) * S.tail;
      }
      lagC[i] = -0.9 + Math.random() * 2.3;
      // a random direction, inside the unit ball (more at the core)
      const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.pow(Math.random(), 0.6));
      off[i * 3] = v.x;
      off[i * 3 + 1] = v.y;
      off[i * 3 + 2] = v.z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aLag', new THREE.BufferAttribute(lag, 1));
    g.setAttribute('aLagC', new THREE.BufferAttribute(lagC, 1));
    g.setAttribute('aRole', new THREE.BufferAttribute(role, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useShader(vertex, fragment, spriteUniforms);
  material.depthWrite = false;

  useFrame((state, dt) => {
    sprite.update(state.clock.elapsedTime, dt, state.camera);
    spriteUniforms.uPixelRatio.value = state.viewport.dpr;
    const p = points.current;
    if (!p) return;
    const on = spriteUniforms.uIntensity.value > 0.004;
    // linked in the first frames at zero alpha, so no change of world waits for a compile
    const warm = warmed.current < 3;
    if (warm) warmed.current++;
    p.visible = on || warm;
    // (the leader's core stays lit when the flock has become stars: it still has to fly home)
    const k = Math.max(0, spriteUniforms.uIntensity.value);
    for (const s of [core.current, halo.current]) {
      if (!s) continue;
      s.visible = k > 0.004;
      s.position.copy(sprite.leader);
    }
    // the leader's heart: a small hot core and a soft halo that breathes with its speed
    const speed = sprite.vel.length();
    // far away (drawing the card), the sprite grows so it still reads on screen
    const span = THREE.MathUtils.clamp(state.camera.position.distanceTo(sprite.leader) / 2.4, 1, 2.6);
    spriteUniforms.uSpan.value += (span - spriteUniforms.uSpan.value) * (1 - Math.exp(-dt * 4));
    if (core.current) {
      (core.current.material as THREE.SpriteMaterial).opacity = 0.85 * k;
      core.current.scale.setScalar((0.16 + 0.02 * Math.sin(spriteUniforms.uTime.value * 9)) * spriteUniforms.uSpan.value);
    }
    if (halo.current) {
      (halo.current.material as THREE.SpriteMaterial).opacity = 0.3 * k;
      halo.current.scale.setScalar((0.7 + Math.min(0.5, speed * 0.08)) * spriteUniforms.uSpan.value);
    }
  });

  return (
    <>
      <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={61} visible={false} />
      <sprite ref={halo} visible={false} renderOrder={62}>
        <spriteMaterial map={getGlowTexture()} color="#ffcf9e" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite ref={core} visible={false} renderOrder={63}>
        <spriteMaterial map={getGlowTexture()} color="#fff4e2" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </>
  );
}
