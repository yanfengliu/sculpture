/**
 * The dust pool (docs/design/spec.md, Tools): one `Points` of DUST_POOL_SIZE soft white discs, updated from the `DustState`s of src/tools/dust.ts every frame. Cheap: one draw call, no texture, the disc drawn in the fragment shader.
 * A grain's `size` is its diameter in metres; the vertex shader turns it into pixels with the camera's projection and the drawing buffer's height, set before each render.
 */
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial, Vector2 } from 'three';
import type { Camera, WebGLRenderer } from 'three';

import type { DustState } from './dust';

export const DUST_POOL_SIZE = 1024;
const DUST_COLOUR = 0xffffff;

const VERTEX = `
attribute float size;
attribute float opacity;
uniform float pixelsPerMetre;
varying float vOpacity;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.0, size * pixelsPerMetre / max(-view.z, 0.01));
  vOpacity = opacity;
}
`;

const FRAGMENT = `
uniform vec3 colour;
varying float vOpacity;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = (1.0 - smoothstep(0.15, 1.0, r)) * vOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour, alpha);
}
`;

export class DustPool {
  readonly points: Points;
  private readonly positions = new Float32Array(DUST_POOL_SIZE * 3);
  private readonly sizes = new Float32Array(DUST_POOL_SIZE);
  private readonly opacities = new Float32Array(DUST_POOL_SIZE);
  private readonly geometry = new BufferGeometry();
  private readonly buffer = new Vector2();

  constructor() {
    const attribute = (array: Float32Array, size: number): BufferAttribute => new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', attribute(this.positions, 3));
    this.geometry.setAttribute('size', attribute(this.sizes, 1));
    this.geometry.setAttribute('opacity', attribute(this.opacities, 1));
    this.geometry.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      uniforms: { colour: { value: new Color(DUST_COLOUR) }, pixelsPerMetre: { value: 1000 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      // Not additive, which would wash the white marble out: normal blending keeps a thin haze against the stone and a clear puff against the yard.
      blending: NormalBlending,
    });
    const pixelsPerMetre = material.uniforms['pixelsPerMetre'] ?? { value: 1000 };
    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.name = 'dust';
    this.points.onBeforeRender = (renderer: WebGLRenderer, _scene, camera: Camera) => {
      renderer.getDrawingBufferSize(this.buffer);
      // projectionMatrix[5] is 1 / tan(fov / 2): a metre at unit depth spans half the buffer height times that.
      pixelsPerMetre.value = (this.buffer.y * camera.projectionMatrix.elements[5]) / 2;
    };
  }

  /** Shows the first DUST_POOL_SIZE grains. */
  update(grains: readonly DustState[]): void {
    const count = Math.min(grains.length, DUST_POOL_SIZE);
    for (let i = 0; i < count; i += 1) {
      const grain = grains[i];
      if (grain === undefined) break;
      this.positions.set(grain.position, i * 3);
      this.sizes[i] = grain.size;
      this.opacities[i] = grain.opacity;
    }
    this.geometry.setDrawRange(0, count);
    for (const name of ['position', 'size', 'opacity']) {
      const attribute = this.geometry.getAttribute(name);
      attribute.needsUpdate = true;
    }
  }
}
