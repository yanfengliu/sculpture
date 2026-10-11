/**
 * Blows laid in bands around the form (docs/research/technique.md, Stage 3 and 4: the claw "works around the form", successive passes crossing): the sampler the toothed chisels, the rasps, the abrasives and the brush share.
 * Points come from the figure's surface inside the region, about `stride` apart, kept where they fall within a blow of a band's centreline, bands `pitch` apart; each blow sits where the stock surface lies outward along the figure's normal (or on the step's margin surface for a later pass). Bands run horizontally, diagonally or vertically around the figure's axis, top band first, and a stroke is a run of neighbouring blows along one band.
 */
import type { Blow, PlanContext, ToolId, Vec3 } from '../../contracts/making';
import { add, blowAt, figureSurfacePoints, normalize, stockAbove } from './surface';

export type BandOrientation = 'horizontal' | 'diagonal' | 'vertical';

export interface BandOptions {
  readonly tool: ToolId;
  /** Spacing between bands, metres: the blade's width for full coverage, more for a sparser field. */
  readonly pitch: number;
  /** Spacing between blows along a band, metres. */
  readonly stride: number;
  /** Cut depth per blow, metres. */
  readonly size: number;
  /** Tool axis angle to the surface, degrees. */
  readonly angle: number;
  readonly orientation: BandOrientation;
  /** Metres of band one set-up covers before the tool lifts to a new stroke. */
  readonly strokeLength: number;
  /** Where the blows sit: on the current stock (the first pass of a step) or on the margin surface the earlier pass leaves. */
  readonly floor: 'stock' | 'margin';
  /** Skip points where the stock is already down to the margin, so a pass only strikes where there is stone to take. */
  readonly onlyWhereStockAbove: boolean;
}

/** How far above the figure the stock surface is looked for, metres. */
const LOOK_UP = 0.4;
/** Radius used to turn an angle around the figure's axis into a band position, metres. */
const BAND_RADIUS = 0.5;

interface Candidate {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly band: number;
  readonly along: number;
}

/** The coordinate across the bands, metres: height, the diagonal, or the arc around the figure's axis. */
function acrossOf(q: Vec3, orientation: BandOrientation): number {
  switch (orientation) {
    case 'horizontal':
      return q[1];
    case 'diagonal':
      return (q[1] + q[0]) / Math.SQRT2;
    default:
      return Math.atan2(q[2], q[0]) * BAND_RADIUS;
  }
}

function alongOf(q: Vec3, orientation: BandOrientation): number {
  return orientation === 'vertical' ? -q[1] : Math.atan2(q[2], q[0]);
}

/** Plans the blows of one pass; `strokeBase` offsets the stroke indices so passes of one step stay distinct. */
export function bandBlows(ctx: PlanContext, options: BandOptions, strokeBase = 0): Blow[] {
  const candidates: Candidate[] = [];
  for (const q of figureSurfacePoints(ctx, Math.min(options.stride, options.pitch))) {
    const normal = ctx.figure.gradient(q[0], q[1], q[2]);
    let point: Vec3;
    if (options.floor === 'stock') {
      const above = stockAbove(ctx, q, LOOK_UP);
      if (above === null) continue;
      if (options.onlyWhereStockAbove && above.depth <= ctx.margin + ctx.cell * 0.25) continue;
      point = above.point;
    } else {
      point = add(q, normal, Math.max(ctx.margin, 0));
    }
    // A band is one blow wide: points off its centreline by more than half a stride lie between bands and are left.
    const across = acrossOf(q, options.orientation);
    const band = Math.floor(across / options.pitch);
    if (Math.abs(across - (band + 0.5) * options.pitch) > options.stride / 2) continue;
    candidates.push({ point, normal, band, along: alongOf(q, options.orientation) });
  }
  candidates.sort((a, b) => b.band - a.band || a.along - b.along);
  const blows: Blow[] = [];
  let stroke = strokeBase;
  let strokeStart: Vec3 | null = null;
  let previous: Candidate | null = null;
  for (let n = 0; n < candidates.length; n += 1) {
    const c = candidates[n];
    if (c === undefined) continue;
    const next = candidates[n + 1];
    const neighbour = next !== undefined && next.band === c.band ? next : previous;
    const tangent: Vec3 = neighbour === null ? [1, 0, 0] : normalize([neighbour.point[0] - c.point[0], neighbour.point[1] - c.point[1], neighbour.point[2] - c.point[2]]);
    const forward: Vec3 = neighbour === previous && neighbour !== null ? [-tangent[0], -tangent[1], -tangent[2]] : tangent;
    const apart = previous === null || previous.band !== c.band ? Number.POSITIVE_INFINITY : Math.hypot(c.point[0] - previous.point[0], c.point[1] - previous.point[1], c.point[2] - previous.point[2]);
    // Along a band the blows keep the stride apart.
    if (apart < 0.8 * options.stride) continue;
    const run = strokeStart === null ? 0 : Math.hypot(c.point[0] - strokeStart[0], c.point[1] - strokeStart[1], c.point[2] - strokeStart[2]);
    if (apart > 2.5 * options.stride || run > options.strokeLength) {
      stroke += 1;
      strokeStart = c.point;
    }
    blows.push(blowAt(options.tool, c.point, c.normal, forward, options.angle, options.size, stroke));
    previous = c;
  }
  return blows;
}
