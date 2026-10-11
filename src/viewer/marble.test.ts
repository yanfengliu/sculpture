/**
 * The marble shader's injection (src/viewer/marble.ts) on a stand-in shader object: no WebGL.
 * Bound: it pins that the finish code crosses to the fragment shader as a `flat` varying in both stages, so a triangle joining two codes carries one of them rather than a blend that rounds to tools between them (the defect of 2026-10-11), and that the flat-colour uniform and the finish attribute are declared. What the pixels show is the `finish=1` capture's job.
 */
import { describe, expect, it } from 'vitest';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

import { FINISH_ATTRIBUTE, createMarbleMaterial } from './marble';

function compiled(): WebGLProgramParametersWithUniforms {
  const marble = createMarbleMaterial({ flat: true });
  const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <worldpos_vertex>\n}', fragmentShader: '#include <color_fragment>\n#include <normal_fragment_maps>' } as unknown as WebGLProgramParametersWithUniforms;
  marble.material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
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
});
