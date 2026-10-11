/**
 * The chip pool (docs/design/spec.md, Tools; docs/research/engine-options.md, section 6, Chips and dust): one instanced mesh of small marble fragments, posed every frame from `Making.chips`.
 * The chips are a pure function of `t` in the making, so this module only places them; it keeps no state of its own.
 */
import * as THREE from 'three';

import type { ChipState } from '../contracts/making';

/** Instances in the pool; chips beyond it are not drawn. */
export const CHIP_CAPACITY = 1024;

export interface ChipPool {
  readonly mesh: THREE.InstancedMesh;
  set(chips: readonly ChipState[]): void;
}

export function createChipPool(capacity: number = CHIP_CAPACITY): ChipPool {
  // A flattened irregular tetrahedron of unit size; `scale` in the chip state is its size in metres.
  const geometry = new THREE.TetrahedronGeometry(1, 0);
  geometry.scale(1, 0.55, 0.8);
  const material = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.75, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'chips';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  return {
    mesh,
    set(chips) {
      const count = Math.min(capacity, chips.length);
      for (let index = 0; index < count; index += 1) {
        const chip = chips[index];
        if (chip === undefined) break;
        const size = chip.scale * Math.max(0, Math.min(1, chip.life));
        position.set(...chip.position);
        quaternion.set(...chip.quaternion);
        scale.setScalar(size);
        mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
      }
      mesh.count = count;
      if (count > 0) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
