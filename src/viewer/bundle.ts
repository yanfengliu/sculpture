/**
 * What `src/main.ts` needs from the engine and the tools together, so the swap from the development stub to the real parts is one line there.
 * The engine supplies the Making (src/timeline/making.ts), the tools supply the meshes and the names (src/tools/), and the page wires them (docs/design/spec.md, Modules and ownership).
 */
import type { Object3D } from 'three';

import type { GridSource } from '../contracts/grid';
import type { Blow, BlowCycle, Making, ToolId } from '../contracts/making';

export type RenderedTool = ToolId | 'mallet';

/** Italian and English names of a tool, as the label's detail line prints them. */
export interface ToolNames {
  readonly italian: string;
  readonly english: string;
}

export interface MakingBundle {
  readonly making: Making;
  /** The tools' cycle: the page rests every tool the making does not pose at `restPose`. */
  readonly blowCycle: BlowCycle;
  /** Seconds a hand needs to carry the tool from the bench to `blow` (src/tools/blow-cycle.ts, `approachSeconds`); the page stretches a step's first approach to it. */
  readonly carrySeconds?: (blow: Blow) => number;
  /** One mesh per rendered tool, origin at the working tip, shaft along +Y; the page sets each one's position and quaternion from `Making.poses` every frame and hides the ones no pose names. */
  readonly toolMeshes: ReadonlyMap<RenderedTool, Object3D>;
  readonly toolNames: (tool: RenderedTool) => ToolNames;
  /** The figure grid's attribution from its header, for the footer; null when no grid is loaded. */
  readonly source: GridSource | null;
}
