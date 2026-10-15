/**
 * The yard's image-based light: three.js's RoomEnvironment through a PMREM, as before, with the PMREM's blur and GGX programs compiled off the page's thread first, so building it never waits on a compile (docs/design/spec.md, Budgets).
 * `PMREMGenerator.fromScene` compiles its programs on first use and waits for them; its GGX convolution (a 256-sample loop) alone held the page for 0.3 s on 2026-10-14. Its materials are reached through private fields (`_setSize`, `_allocateTargets`, `_blurMaterial`, `_ggxMaterial`), checked at run time: a three.js without them builds the environment the plain way, compiling on first use.
 * The stand-in is the render target those fields allocate, with the final texture's mapping and size, so the scene's programs can compile against it while the PMREM is built: a program reads only whether there is an environment, its mapping and its height. Nothing is drawn with it.
 * The room's own programs and the PMREM's background box compile ahead the same way: `fromScene` draws them into its target with its own cube camera and no tone mapping.
 * Bound: a three.js whose PMREM draws other programs than these compiles those on first use; the load probe (npm run load) shows it as a long task.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** The PMREM's sigma for the room: a soft blur, as the yard has always had. */
const ROOM_SIGMA = 0.04;
/** `fromScene`'s default cube size, which sets the blur and GGX programs' defines and the texture's size. */
const PMREM_SIZE = 256;

interface PmremInternals {
  _setSize?: (size: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
}

export interface Environment {
  /** A texture with the final one's mapping and size, to compile programs against before it is built; null when this three.js keeps the PMREM's internals elsewhere. Never drawn with. */
  readonly standIn: THREE.Texture | null;
  /** The room's PMREM, built once its blur and GGX programs have compiled in the background. */
  readonly texture: Promise<THREE.Texture>;
}

/** Starts building the room's PMREM: the blur and GGX programs compile in the background first. */
export function buildEnvironment(renderer: THREE.WebGLRenderer): Environment {
  const generator = new THREE.PMREMGenerator(renderer);
  const internals = generator as unknown as PmremInternals;
  if (typeof internals._setSize !== 'function' || typeof internals._allocateTargets !== 'function') {
    return { standIn: null, texture: Promise.resolve(generator.fromScene(new RoomEnvironment(), ROOM_SIGMA).texture) };
  }
  internals._setSize(PMREM_SIZE);
  const target = internals._allocateTargets();
  const room = new RoomEnvironment();
  const materials = [internals._blurMaterial, internals._ggxMaterial].filter((material): material is THREE.Material => material instanceof THREE.Material);
  // fromScene draws them into its render targets with no lights and no scene: a mesh with a position and an orthographic camera into a bound target give the same programs.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const camera = new THREE.OrthographicCamera();
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const pending = materials.map((material) => renderer.compileAsync(new THREE.Mesh(geometry, material), camera));
  const background = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'PMREM.Background', side: THREE.BackSide, depthWrite: false, depthTest: false }));
  pending.push(renderer.compileAsync(room, camera), renderer.compileAsync(background, camera));
  renderer.setRenderTarget(previous);
  const texture = Promise.all(pending).then(() => {
    geometry.dispose();
    const built = generator.fromScene(room, ROOM_SIGMA).texture;
    // Only now: disposing the background's stand-in releases its program, which three.js deletes once nothing else holds it.
    background.geometry.dispose();
    background.material.dispose();
    generator.dispose();
    // The stand-in is swapped out before the next frame (src/viewer/scene.ts), and nothing was drawn with it.
    target.dispose();
    return built;
  });
  return { standIn: target.texture, texture };
}
