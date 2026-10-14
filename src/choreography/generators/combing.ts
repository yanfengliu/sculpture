/**
 * Combing with the toothed chisels (docs/research/technique.md, Stage 3 and 4; tools.md, Calcagnuolo and Gradina): bands around the form, each pass crossing the one before, the chisel at its documented angle leaning along the stroke.
 * The first pass strikes the stock where it stands above the margin; a later pass runs over the surface the first one leaves, in the crossing orientation.
 */
import type { Blow, PlanContext, ToolId } from '../../contracts/making';
import { type BandOrientation, bandBlows } from './bands';

export interface CombingOptions {
  readonly tool: ToolId;
  /** Band spacing and blow spacing along a band, metres. */
  readonly pitch: number;
  readonly stride: number;
  /** Cut depth per blow, metres. */
  readonly size: number;
  /** Degrees to the surface, inside the toothed chisels' 35 to 60. */
  readonly angle: number;
  /** One orientation per pass; the second crosses the first. */
  readonly passes: readonly BandOrientation[];
  readonly strokeLength?: number;
}

export function combing(ctx: PlanContext, options: CombingOptions): Blow[] {
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
          strokeLength: options.strokeLength ?? 0.4,
          floor: pass === 0 ? 'stock' : 'margin',
          onlyWhereStockAbove: pass === 0,
          steeper: 60,
        },
        strokeBase,
      ),
    );
  });
  return blows;
}
