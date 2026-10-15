/**
 * Combing with the toothed chisels (docs/research/technique.md, Stage 3 and 4; tools.md, Calcagnuolo and Gradina): bands around the form, each pass crossing the one before, the chisel at its documented angle leaning along the stroke.
 * The first pass goes over the whole region, as a sculptor's pass does, cutting where there is stone and leaving its mark everywhere; the passes after it are driven by the allowance left: each strikes the scratch stock (./scratch.ts) where it still stands above the margin by more than a quarter cell, in the listed orientations and then on round the crossing ones, until a pass finds nothing to strike or MAX_PASSES is reached, so the region ends within the margin at every band point. A step with `untilCovered` false runs its listed passes only: the coarse claws, whose bands are wider than their blades, texture rather than level.
 */
import type { Blow, PlanContext, ToolId } from '../../contracts/making';
import { type BandOrientation, bandBlows, bandConfiner, bandSurfacePoints } from './bands';
import { ScratchStock, scratchContext } from './scratch';

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
  /** Repeat crossing passes until the region is at its margin (the default); false runs the listed passes only. */
  readonly untilCovered?: boolean;
}

/** Most passes of a covering step: with a blade's reach of a few millimetres per pass, the deepest allowance left by the point (about 30 mm plus a crater's jitter) is reached within this. */
export const MAX_PASSES = 8;
const ORIENTATIONS: readonly BandOrientation[] = ['horizontal', 'diagonal', 'vertical'];

/** The orientation of pass `n`: the listed ones first, then on round the cycle from the last listed. */
export function orientationOf(listed: readonly BandOrientation[], n: number): BandOrientation {
  const given = listed[n];
  if (given !== undefined) return given;
  const last = listed[listed.length - 1] ?? 'horizontal';
  const from = ORIENTATIONS.indexOf(last);
  return ORIENTATIONS[(from + 1 + (n - listed.length)) % ORIENTATIONS.length] ?? 'horizontal';
}

export function combing(ctx: PlanContext, options: CombingOptions): Blow[] {
  const blows: Blow[] = [];
  const scratch = new ScratchStock(ctx);
  const sctx = scratchContext(ctx, scratch);
  const passes = options.untilCovered === false ? options.passes.length : MAX_PASSES;
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
        strokeLength: options.strokeLength ?? 0.4,
        floor: 'stock',
        onlyWhereStockAbove: pass > 0,
        steeper: 60,
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
