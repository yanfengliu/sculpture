/**
 * The chip pool (docs/design/spec.md, Tools): one InstancedMesh of 4,096 flattened irregular tetrahedra, updated from the `ChipState`s the blow cycle computes.
 * A chip's `scale` is its longest dimension in metres, so the unit chip is about one metre across; `life` shrinks a fading chip into the floor.
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

import type { ChipState } from '../contracts/making';

export const CHIP_POOL_SIZE = 4096;
const CHIP_COLOUR = 0xeeeae2;

/** A flattened irregular tetrahedron about one unit long and a quarter as thick, lying on its widest face: a marble spall is a flake, so the catalog's chip size is its longest dimension. */
export function chipGeometry(): BufferGeometry {
  const a = new Vector3(-0.5, 0, -0.28);
  const b = new Vector3(0.5, 0, -0.34);
  const c = new Vector3(0.08, 0, 0.42);
  const d = new Vector3(0.05, 0.24, 0.04);
  const faces: [Vector3, Vector3, Vector3][] = [
    [a, c, b],
    [a, b, d],
    [b, c, d],
    [c, a, d],
  ];
  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, i) => {
    face.forEach((vertex, j) => {
      positions.set([vertex.x, vertex.y, vertex.z], i * 9 + j * 3);
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class ChipPool {
  readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();

  constructor() {
    this.mesh = new InstancedMesh(chipGeometry(), new MeshStandardMaterial({ color: CHIP_COLOUR, roughness: 0.9, metalness: 0, flatShading: true }), CHIP_POOL_SIZE);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'chips';
  }

  /** Shows the first `CHIP_POOL_SIZE` states; a faded chip shrinks with its life. */
  update(states: readonly ChipState[]): void {
    const count = Math.min(states.length, CHIP_POOL_SIZE);
    for (let i = 0; i < count; i += 1) {
      const state = states[i];
      if (state === undefined) break;
      const size = state.scale * easeLife(state.life);
      this.position.set(state.position[0], state.position[1], state.position[2]);
      this.quaternion.set(state.quaternion[0], state.quaternion[1], state.quaternion[2], state.quaternion[3]);
      this.scale.set(size, size, size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function easeLife(life: number): number {
  const clamped = Math.min(1, Math.max(0, life));
  return clamped * clamped * (3 - 2 * clamped);
}
