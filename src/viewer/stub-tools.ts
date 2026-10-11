/**
 * Placeholder tool meshes for development, until the tools worker's procedural geometry (src/tools/geometry/) lands at integration.
 * Same frame as the contract asks of the real ones: origin at the working tip, the shaft along +Y, the striking face at the +Y end. The mallet's striking face is at its origin, facing −Y, with the barrel along +Y and the handle out along +X.
 * Sizes are rough, not the catalogue's documented ones; nothing here is authentic and nothing here survives integration.
 */
import * as THREE from 'three';

import type { ToolId } from '../contracts/making';
import type { RenderedTool } from './bundle';

const IRON = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.85, roughness: 0.45 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x8b6b43, metalness: 0, roughness: 0.8 });
const CHARCOAL = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0, roughness: 1 });
const PUMICE = new THREE.MeshStandardMaterial({ color: 0x9a9a92, metalness: 0, roughness: 1 });
const LEATHER = new THREE.MeshStandardMaterial({ color: 0x5a3b22, metalness: 0, roughness: 0.9 });
const BRISTLE = new THREE.MeshStandardMaterial({ color: 0xc9a55a, metalness: 0, roughness: 0.9 });

function part(geometry: THREE.BufferGeometry, material: THREE.Material, y: number, x = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A chisel: a cone or blade at the tip, an octagonal shank, a mushroomed head at the top. */
function chisel(tip: THREE.Mesh, length: number): THREE.Group {
  const group = new THREE.Group();
  group.add(tip, part(new THREE.CylinderGeometry(0.011, 0.011, length - 0.05, 8), IRON, 0.03 + (length - 0.05) / 2), part(new THREE.CylinderGeometry(0.015, 0.012, 0.02, 12), IRON, length - 0.01));
  return group;
}

/** A toothed blade: `teeth` small prisms across a 0.006 m thick edge. */
function toothedBlade(teeth: number, width: number): THREE.Mesh {
  const blade = part(new THREE.BoxGeometry(width, 0.03, 0.006), IRON, 0.02);
  const pitch = width / teeth;
  for (let index = 0; index < teeth; index += 1) {
    const tooth = part(new THREE.ConeGeometry(pitch * 0.45, 0.01, 4), IRON, -0.02, -width / 2 + pitch * (index + 0.5));
    blade.add(tooth);
  }
  return blade;
}

function build(tool: RenderedTool): THREE.Object3D {
  switch (tool) {
    case 'charcoal':
      return part(new THREE.CylinderGeometry(0.006, 0.005, 0.12, 8), CHARCOAL, 0.06);
    case 'point':
      return chisel(part(new THREE.ConeGeometry(0.011, 0.03, 8), IRON, 0.015), 0.28);
    case 'two-tooth':
      return chisel(toothedBlade(2, 0.022), 0.26);
    case 'claw':
      return chisel(toothedBlade(3, 0.03), 0.26);
    case 'fine-claw':
      return chisel(toothedBlade(5, 0.028), 0.25);
    case 'roundel':
      return chisel(part(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10, 1, false, 0, Math.PI), IRON, 0.012), 0.24);
    case 'flat':
      return chisel(part(new THREE.BoxGeometry(0.024, 0.03, 0.005), IRON, 0.02), 0.25);
    case 'drill': {
      const group = new THREE.Group();
      group.add(part(new THREE.CylinderGeometry(0.004, 0.002, 0.3, 8), IRON, 0.15), part(new THREE.BoxGeometry(0.3, 0.012, 0.012), WOOD, 0.22), part(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), WOOD, 0.325));
      return group;
    }
    case 'rasp': {
      const group = new THREE.Group();
      group.add(part(new THREE.BoxGeometry(0.03, 0.25, 0.008), IRON, 0.125), part(new THREE.CylinderGeometry(0.014, 0.011, 0.1, 10), WOOD, 0.3));
      return group;
    }
    case 'file': {
      const group = new THREE.Group();
      group.add(part(new THREE.BoxGeometry(0.015, 0.25, 0.005), IRON, 0.125), part(new THREE.CylinderGeometry(0.012, 0.01, 0.1, 10), WOOD, 0.3));
      return group;
    }
    case 'pumice':
      return part(new THREE.SphereGeometry(0.04, 10, 8).scale(1, 0.8, 1.2), PUMICE, 0.032);
    case 'polish':
      return part(new THREE.BoxGeometry(0.08, 0.02, 0.06), LEATHER, 0.01);
    case 'gilding': {
      const group = new THREE.Group();
      group.add(part(new THREE.BoxGeometry(0.015, 0.03, 0.006), BRISTLE, 0.015), part(new THREE.CylinderGeometry(0.005, 0.004, 0.2, 8), WOOD, 0.13));
      return group;
    }
    case 'mallet': {
      const group = new THREE.Group();
      group.add(part(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 16), IRON, 0.065), part(new THREE.CylinderGeometry(0.014, 0.012, 0.28, 10).rotateZ(Math.PI / 2), WOOD, 0.065, 0.14 + 0.045));
      return group;
    }
  }
}

const TOOL_IDS: readonly ToolId[] = ['charcoal', 'point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

export function createPlaceholderTools(): ReadonlyMap<RenderedTool, THREE.Object3D> {
  const meshes = new Map<RenderedTool, THREE.Object3D>();
  for (const tool of [...TOOL_IDS, 'mallet'] as const) {
    const object = build(tool);
    object.name = `tool:${tool}`;
    meshes.set(tool, object);
  }
  return meshes;
}
