/**
 * The tool rig: holds every rendered tool's model and places it each frame, at the pose `Making.poses` gives it or else at its rest pose on the bench (docs/policies/local-rules.md: a tool rests where a sculptor would set it down, never floats idle).
 * The models and the rest poses come from the tools (src/tools/geometry, src/tools/bench.ts) through the bundle (src/viewer/bundle.ts); the drill's bow and spindle are animated by the cycle phase of the blow in progress.
 */
import { Group } from 'three';
import type { Object3D } from 'three';

import type { ToolPose } from '../contracts/making';
import type { RenderedTool } from './bundle';

export interface ToolRigOptions {
  readonly meshes: ReadonlyMap<RenderedTool, Object3D>;
  readonly restPose: (tool: RenderedTool) => ToolPose;
  /** Poses the moving parts of a tool's model for a cycle phase; a no-op for rigid tools. */
  readonly animateParts?: (model: Object3D, tool: RenderedTool, phase: number) => void;
}

export interface ToolRig {
  readonly group: Group;
  /** Places the posed tools, rests the others and animates the parts of the tool in progress. */
  update(poses: readonly ToolPose[], current: { readonly tool: RenderedTool; readonly phase: number } | null): void;
}

export function createToolRig({ meshes, restPose, animateParts }: ToolRigOptions): ToolRig {
  const group = new Group();
  group.name = 'tools';
  for (const mesh of meshes.values()) group.add(mesh);
  const place = (mesh: Object3D, pose: ToolPose): void => {
    mesh.position.set(...pose.position);
    mesh.quaternion.set(...pose.quaternion);
  };
  return {
    group,
    update(poses, current) {
      const posed = new Set<RenderedTool>();
      for (const pose of poses) {
        const mesh = meshes.get(pose.tool);
        if (mesh === undefined) continue;
        posed.add(pose.tool);
        place(mesh, pose);
      }
      for (const [tool, mesh] of meshes) {
        mesh.visible = true;
        if (!posed.has(tool)) place(mesh, restPose(tool));
        animateParts?.(mesh, tool, current !== null && current.tool === tool && posed.has(tool) ? current.phase : 0);
      }
    },
  };
}
