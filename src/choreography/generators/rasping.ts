/**
 * Rasps, files, pumice and polish (docs/research/technique.md, Stage 6 and 7; tools.md, Raspe e lime, Abrasives and polish): strokes crossing over the surface, the tool lying along it, each pass lowering the skin toward the step's margin and painting its finish.
 * The first pass goes over the whole region, leaving the tool's mark everywhere; the passes after it are driven by the allowance left, as ./combing.ts: each strikes the scratch stock where it still stands above the margin by more than a quarter cell, crossing the pass before, until nothing is left to take or MAX_PASSES is reached. A tool that removes nothing (the polish) runs its listed passes over the whole region, since it has no allowance to chase.
 * `rasping` is the rasp and file passes; `abrading` the pumice, tripoli, straw and leather passes, which differ only in tool, angle and depth.
 */
import type { Blow, PlanContext, ToolId } from '../../contracts/making';
import { TOOL_VOLUMES } from '../../stock/tool-volumes';
import { type BandOrientation, bandBlows, bandConfiner, bandSurfacePoints } from './bands';
import { MAX_PASSES, orientationOf } from './combing';
import { ScratchStock, scratchContext } from './scratch';

export interface StrokingOptions {
  readonly tool: ToolId;
  /** Band spacing and stroke spacing along a band, metres. */
  readonly pitch: number;
  readonly stride: number;
  /** Depth taken per blow, metres; the carving rule stops it at the step's margin. */
  readonly size: number;
  /** Degrees to the surface, the tool lying nearly flat. */
  readonly angle: number;
  readonly passes: readonly BandOrientation[];
  readonly strokeLength?: number;
}

function stroking(ctx: PlanContext, options: StrokingOptions): Blow[] {
  const blows: Blow[] = [];
  const removes = TOOL_VOLUMES[options.tool].removes;
  const scratch = removes ? new ScratchStock(ctx) : undefined;
  const sctx = scratch === undefined ? ctx : scratchContext(ctx, scratch);
  const passes = removes ? MAX_PASSES : options.passes.length;
  const points = bandSurfacePoints(ctx, options);
  // One confinement for the step's passes (./confine.ts): they share the region's answers and the points where no blow kept inside.
  const confiner = bandConfiner(sctx, options, scratch);
  for (let pass = 0; pass < passes; pass += 1) {
    const strokeBase = blows.length === 0 ? 0 : (blows[blows.length - 1]?.stroke ?? 0) + 1;
    const planned = bandBlows(
      sctx,
      {
        tool: options.tool,
        pitch: options.pitch,
        stride: options.stride,
        size: options.size,
        angle: options.angle,
        orientation: orientationOf(options.passes, pass),
        strokeLength: options.strokeLength ?? 0.3,
        floor: 'stock',
        onlyWhereStockAbove: removes && pass > 0,
      },
      strokeBase,
      scratch,
      points,
      confiner,
    );
    if (planned.length === 0) break;
    blows.push(...planned);
  }
  return blows;
}

/** Rasp and file passes. */
export function rasping(ctx: PlanContext, options: StrokingOptions): Blow[] {
  return stroking(ctx, options);
}

/** Pumice and polish passes. */
export function abrading(ctx: PlanContext, options: StrokingOptions): Blow[] {
  return stroking(ctx, options);
}
