/**
 * Rasps, files, pumice and polish (docs/research/technique.md, Stage 6 and 7; tools.md, Raspe e lime, Abrasives and polish): strokes crossing over the surface, the tool lying along it, each pass lowering the skin by the step's margin step and painting its finish.
 * `rasping` is the rasp and file passes; `abrading` the pumice, tripoli, straw and leather passes, which differ only in tool, angle and depth.
 */
import type { Blow, PlanContext, ToolId } from '../../contracts/making';
import { type BandOrientation, bandBlows } from './bands';

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
  options.passes.forEach((orientation, pass) => {
    const strokeBase = blows.length === 0 ? 0 : (blows[blows.length - 1]?.stroke ?? 0) + 1;
    blows.push(
      ...bandBlows(
        ctx,
        {
          tool: options.tool,
          pitch: options.pitch,
          stride: options.stride,
          size: options.size,
          angle: options.angle,
          orientation,
          strokeLength: options.strokeLength ?? 0.3,
          floor: pass === 0 ? 'stock' : 'margin',
          onlyWhereStockAbove: false,
        },
        strokeBase,
      ),
    );
  });
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
