/**
 * The footprint of a blow whose volume lies along the surface, in the blow's frame (./tool-frame.ts): a rounded rectangle `halfPush` along the push and `halfWidth` across with corners of radius `rounding`. These are the numbers the rubbing slab and the paint footprint of ./tool-volumes.ts build from; the planner sizes the moves that keep a step's paint and cut inside its region with them (src/choreography/generators/confine.ts), and src/choreography/paint-confinement.test.ts checks them against the volumes.
 */
import type { ToolId } from '../contracts/making';
import { FOOTPRINT_ROUNDING, PAINT_ROUNDING, PATCH_SIZE_M, PATCH_SPEC, TOOL_VOLUMES, type ToolVolumeSpec } from './tool-volumes';

export interface Footprint {
  readonly halfPush: number;
  readonly halfWidth: number;
  readonly rounding: number;
}

/** The footprint of `tool` at cut depth `size`: the rubbing slab (rasp, file, pumice, and the fine claw's combing patch from PATCH_SIZE_M) or the paint footprint (charcoal, polish, gilding); null for the volumes that are no footprint (the point's cone and crater, the chisels' wedges, the roundel's scoop, the drill's hole). */
export function footprintOf(tool: ToolId, size: number): Footprint | null {
  switch (tool) {
    case 'fine-claw':
      return size >= PATCH_SIZE_M ? slabFootprint(PATCH_SPEC) : null;
    case 'rasp':
    case 'file':
    case 'pumice':
      return slabFootprint(TOOL_VOLUMES[tool]);
    case 'charcoal':
    case 'polish':
    case 'gilding': {
      const spec = TOOL_VOLUMES[tool];
      const halfPush = spec.push / 2;
      const halfWidth = spec.width / 2;
      return { halfPush, halfWidth, rounding: Math.min(halfPush, halfWidth) * PAINT_ROUNDING };
    }
    default:
      return null;
  }
}

function slabFootprint(spec: ToolVolumeSpec): Footprint {
  return { halfPush: spec.push / 2, halfWidth: spec.width / 2, rounding: FOOTPRINT_ROUNDING * spec.width };
}
