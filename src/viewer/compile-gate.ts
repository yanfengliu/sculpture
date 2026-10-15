/**
 * Compiles the programs of every material in the scene off the page's thread before the frame that first draws it, so no shader compile blocks the page (docs/design/spec.md, Budgets).
 * three.js compiles a program on its first draw and then waits for it; with `KHR_parallel_shader_compile` its `compileAsync` asks the browser to compile in the background and polls until the program is done. The gate does that for each material it has not seen yet, with one mesh that wears it, and tells the frame loop to draw nothing until the batch is done.
 * The transmission pass (the marble's `transmission`) draws the opaque materials again into a render target, without tone mapping and in the working colour space (three.js `renderTransmissionPass`), so each batch also compiles those programs for the opaque materials, with a render target bound.
 * Bound: what it does not see still compiles on first draw: the shadow pass's depth programs (small, three.js's own), and a program a material needs after a change of its own (the marble's switch to the full stone, which src/viewer/marble.ts compiles ahead).
 */
import * as THREE from 'three';

export interface CompileGate {
  /** True when every material in the scene has its programs; otherwise starts compiling the new ones, once, and returns false, so the caller draws nothing this frame. */
  ready(): boolean;
}

function materialsOf(object: THREE.Object3D): readonly THREE.Material[] {
  if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite)) return [];
  const material = (object as THREE.Mesh).material;
  return Array.isArray(material) ? material : [material];
}

/** The materials three.js draws in the opaque list, which the transmission pass draws again (WebGLRenderList: neither transmissive nor transparent). */
function opaque(material: THREE.Material): boolean {
  return !(material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) && !material.transparent;
}

/** `lit` settles once a program compiled for the scene is the one it draws with (src/viewer/scene.ts): the gate compiles nothing before it, since a program compiled without the environment would be compiled again, and starts on what the scene holds then. */
export function createCompileGate(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, lit: Promise<unknown>): CompileGate {
  const seen = new WeakSet<THREE.Material>();
  const linear = new THREE.WebGLRenderTarget(1, 1);
  let waiting = true;
  let compiling = false;

  /** The materials not seen before, each with one object that wears it; marks them seen. */
  function fresh(): Map<THREE.Material, THREE.Object3D> {
    const found = new Map<THREE.Material, THREE.Object3D>();
    scene.traverse((object) => {
      for (const material of materialsOf(object)) {
        if (seen.has(material)) continue;
        seen.add(material);
        found.set(material, object);
      }
    });
    return found;
  }

  /** Issues every program at once, so the browser compiles them side by side, then waits for the screen's and the transmission pass's in turn (three.js polls the program a material last compiled). */
  async function compile(found: Map<THREE.Material, THREE.Object3D>): Promise<void> {
    const all = [...found.values()];
    const redrawn = [...found].filter(([material]) => opaque(material)).map(([, object]) => object);
    const previous = renderer.getRenderTarget();
    const intoTarget = <T>(each: (object: THREE.Object3D) => T): T[] => {
      renderer.setRenderTarget(linear);
      const results = redrawn.map(each);
      renderer.setRenderTarget(previous);
      return results;
    };
    intoTarget((object) => renderer.compile(object, camera, scene));
    await Promise.all(all.map((object) => renderer.compileAsync(object, camera, scene)));
    await Promise.all(intoTarget((object) => renderer.compileAsync(object, camera, scene)));
  }

  function ready(): boolean {
    if (waiting || compiling) return false;
    const found = fresh();
    if (found.size === 0) return true;
    compiling = true;
    compile(found)
      .catch((error: unknown) => {
        console.error(`Compiling ${String(found.size)} new materials ahead of drawing failed (${error instanceof Error ? error.message : String(error)}); they compile on first draw instead.`);
      })
      .finally(() => {
        compiling = false;
      });
    return false;
  }

  void lit
    .catch(() => undefined)
    .then(() => {
      waiting = false;
      ready();
    });
  return { ready };
}
