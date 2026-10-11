/**
 * The tool rig: holds every rendered tool's mesh and places the ones `Making.poses` names each frame; the rest stay hidden, so no tool floats idle in frame (docs/policies/local-rules.md).
 * The meshes come from the tools worker at integration (src/viewer/bundle.ts); this module only moves them.
 */
import { Group } from 'three';
import type { Object3D } from 'three';

import type { ToolPose } from '../contracts/making';
import type { RenderedTool } from './bundle';

export interface ToolRig {
  readonly group: Group;
  setPoses(poses: readonly ToolPose[]): void;
}

export function createToolRig(meshes: ReadonlyMap<RenderedTool, Object3D>): ToolRig {
  const group = new Group();
  group.name = 'tools';
  for (const mesh of meshes.values()) {
    mesh.visible = false;
    group.add(mesh);
  }
  return {
    group,
    setPoses(poses) {
      for (const mesh of meshes.values()) mesh.visible = false;
      for (const pose of poses) {
        const mesh = meshes.get(pose.tool);
        if (mesh === undefined) continue;
        mesh.visible = true;
        mesh.position.set(...pose.position);
        mesh.quaternion.set(...pose.quaternion);
      }
    },
  };
}
