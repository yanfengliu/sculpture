/**
 * The marble shader's injection (src/viewer/marble.ts) on a stand-in shader object, and its switch from the light first program to the full stone with a stand-in renderer: no WebGL.
 * Bound: it pins that the finish code crosses to the fragment shader as a `flat` varying in both stages, so a triangle joining two codes carries one of them rather than a blend that rounds to tools between them (the defect of 2026-10-11), that the flat-colour uniform and the finish attribute are declared, that the light program holds no noise, that `prepare` compiles a twin for a mesh with the chunks' attributes before switching, and that the fbm's loop bound is the `marbleLoop` uniform's, which keeps Direct3D's compiler from unrolling it. What the pixels show is the captures' job; what the compile costs is the load probe's (npm run load).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

import { FINISH_ATTRIBUTE, createMarbleMaterial } from './marble';

const STAND_IN = { vertexShader: 'void main() {\n#include <worldpos_vertex>\n}', fragmentShader: '#include <color_fragment>\n#include <normal_fragment_maps>' };

function compile(material: THREE.Material): WebGLProgramParametersWithUniforms {
  const shader = { uniforms: {}, ...STAND_IN } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

function compiled(): WebGLProgramParametersWithUniforms {
  return compile(createMarbleMaterial({ flat: true }).material);
}

type CompileCall = [THREE.Object3D, THREE.Camera, THREE.Scene | null | undefined];

/** A renderer that records what `compileAsync` was given and resolves at once. */
function recordingRenderer(): { renderer: WebGLRenderer; calls: CompileCall[] } {
  const calls: CompileCall[] = [];
  const compileAsync = vi.fn((object: THREE.Object3D, camera: THREE.Camera, target?: THREE.Scene | null) => {
    calls.push([object, camera, target]);
    return Promise.resolve(object);
  });
  return { renderer: { compileAsync } as unknown as WebGLRenderer, calls };
}

describe('createMarbleMaterial', () => {
  it('passes the finish code to the fragment shader as a flat varying in both stages', () => {
    const shader = compiled();
    expect(shader.vertexShader).toContain('flat varying float vFinish;');
    expect(shader.fragmentShader).toContain('flat varying float vFinish;');
    expect(shader.vertexShader).not.toMatch(/(^|[^t] )varying float vFinish/);
    expect(shader.vertexShader).toContain(`attribute float ${FINISH_ATTRIBUTE};`);
    expect(shader.vertexShader).toContain(`vFinish = ${FINISH_ATTRIBUTE};`);
  });

  it('rounds the code to the nearest whole number and binds the flat-colour uniforms', () => {
    const shader = compiled();
    expect(shader.fragmentShader).toContain('int marbleCode(float finish) { return int(finish + 0.5); }');
    expect(shader.uniforms['flatCodes']).toEqual({ value: 1 });
    expect(shader.uniforms['finishColours']).toBeDefined();
  });

  it('starts on the light first program: the finish tables without the noise, under a cache key of its own', () => {
    const marble = createMarbleMaterial({ flat: false });
    const shader = compile(marble.material);
    expect(marble.full).toBe(false);
    expect(marble.material.customProgramCacheKey()).toBe('marble-lite');
    expect(shader.fragmentShader).toContain('marbleColour(');
    expect(shader.fragmentShader).not.toContain('marbleStone');
    expect(shader.fragmentShader).not.toContain('marbleGradient');
  });

  it("compiles the full stone for a stand-in with the chunks' attributes under the scene's lights, then switches to it", async () => {
    const marble = createMarbleMaterial({ flat: false });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { renderer, calls } = recordingRenderer();
    const version = marble.material.version;
    await marble.prepare(renderer, scene, camera);
    expect(marble.full).toBe(true);
    expect(marble.material.version).toBeGreaterThan(version);
    expect(marble.material.customProgramCacheKey()).toBe('marble');
    // The light program and the twin's full one, each on a mesh like a stock chunk (a position and a finish code, no normal, casting and taking shadows), compiled against the scene's lights.
    expect(calls).toHaveLength(2);
    for (const [object, given, target] of calls) {
      const mesh = object as THREE.Mesh;
      expect(given).toBe(camera);
      expect(target).toBe(scene);
      expect(Object.keys(mesh.geometry.attributes).sort()).toEqual([FINISH_ATTRIBUTE, 'position']);
      expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    }
    const materials = calls.map(([object]) => (object as THREE.Mesh).material as THREE.Material);
    expect(materials).toContain(marble.material);
    const twin = materials.find((material) => material !== marble.material);
    expect(twin?.customProgramCacheKey()).toBe('marble');
    if (twin !== undefined) expect(compile(twin).fragmentShader).toBe(compile(marble.material).fragmentShader);
    await marble.prepare(renderer, scene, camera);
    expect(calls).toHaveLength(2);
  });

  it('runs the fbm loop to a bound scaled by the marbleLoop uniform, which the compiler cannot unroll', async () => {
    const marble = createMarbleMaterial({ flat: false });
    await marble.prepare(recordingRenderer().renderer, new THREE.Scene(), new THREE.PerspectiveCamera());
    const shader = compile(marble.material);
    expect(shader.fragmentShader).toContain('marbleStone');
    expect(shader.fragmentShader).toContain('uniform int marbleLoop;');
    expect(shader.uniforms['marbleLoop']).toEqual({ value: 1 });
    const fbm = /float marbleFbm\(vec3 p, int octaves\) \{[\s\S]*?\n\}/.exec(shader.fragmentShader)?.[0] ?? '';
    expect(fbm).toContain('for (int octave = 0; octave < octaves * marbleLoop; octave++)');
    expect(fbm).not.toContain('break');
  });
});
