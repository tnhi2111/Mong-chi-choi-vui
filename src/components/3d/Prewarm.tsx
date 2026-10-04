import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Gift } from '../../data/gifts';
import { createGiftMaterials } from './Gift3D';
import { createFloorMaterial } from './RoomWorld';
import { createSwarmMaterial } from './FinalWorld';
import { createHeartMaterial } from './heartMaterial';
import { createLetterDogMaterials } from './LetterDog';
import { loadLetterDog } from './letterDogGeometry';

/*
 * Compiling a physically based shader takes a few hundred milliseconds on some
 * systems (Windows turns GLSL into HLSL), and the gift room introduces about ten
 * of them at once — enough to freeze the fade-in for seconds. So we compile them
 * ahead of time, against the real scene so lights and environment match (programs
 * are shared by parameters, so the real materials reuse them when they appear).
 *
 * Two rules keep this invisible:
 *  • it runs during the welcome words (CSS-animated, unaffected by a busy main
 *    thread) — never while she is looking at, or touching, the heart;
 *  • one shader at a time with a breath in between, so no single freeze is long.
 *
 * Warm-up materials are kept alive on purpose: disposing one could release a
 * program before its real user arrives.
 */
const keepAlive: THREE.Material[] = [];
let done = false;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Prewarm({ gifts, glass, solidHeart, delay = 500 }: { gifts: Gift[]; glass: boolean; solidHeart: boolean; delay?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (done) return;
    let cancelled = false;
    const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);

    const jobs: THREE.Object3D[] = [];
    // materials that would build the same program need only one compile job (the gift
    // surfaces all share one: see `surface()` in Gift3D)
    const seen = new Set<string>();
    const add = (m: THREE.Material) => {
      const p = m as THREE.MeshPhysicalMaterial;
      const sig = [m.type, m.transparent, m.side, m.vertexColors, !!p.map, !!p.bumpMap, !!p.alphaMap, (p.transmission ?? 0) > 0, (p.iridescence ?? 0) > 0, (p.sheen ?? 0) > 0, (p.clearcoat ?? 0) > 0].join('|');
      if (seen.has(sig)) return;
      seen.add(sig);
      keepAlive.push(m);
      const mesh = new THREE.Mesh(box, m);
      mesh.position.set(0, 0, -1);
      jobs.push(mesh);
    };
    for (const g of gifts) Object.values(createGiftMaterials(g, glass)).forEach((m) => m && add(m));
    add(createFloorMaterial());
    // the letter-carrying puppy: sculpt it in a worker now, and compile its fur and face
    void loadLetterDog();
    Object.values(createLetterDogMaterials()).forEach(add);
    if (solidHeart) add(createHeartMaterial(glass).material);
    const swarm = createSwarmMaterial();
    keepAlive.push(swarm);
    const inst = new THREE.InstancedMesh(box, swarm, 1);
    inst.setColorAt(0, new THREE.Color('#ffffff'));
    jobs.push(inst);

    const compileOne = async (obj: THREE.Object3D, target: THREE.WebGLRenderTarget | null) => {
      const temp = new THREE.Scene();
      temp.add(obj);
      const prev = gl.getRenderTarget();
      // Glass (transmission) renders the opaque world once more into a linear,
      // un-tonemapped target — a second variant of each shader. `target` warms that one.
      gl.setRenderTarget(target);
      const p = gl.compileAsync(temp, camera, scene);
      gl.setRenderTarget(prev);
      await p;
      temp.remove(obj);
    };

    void (async () => {
      await pause(delay);
      // only the glass heart still refracts; without it there is no second render pass to warm
      const rt = glass && solidHeart ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
      try {
        for (const obj of jobs) {
          if (cancelled) return;
          await compileOne(obj, null);
          await pause(60);
          if (rt && !cancelled) {
            await compileOne(obj, rt);
            await pause(60);
          }
        }
        done = !cancelled;
      } catch {
        /* nothing lost: the shaders simply compile on first use */
      } finally {
        rt?.dispose();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, gifts, glass, solidHeart, delay]);

  return null;
}
