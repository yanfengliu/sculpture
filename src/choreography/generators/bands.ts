/**
 * Blows laid in bands around the form (docs/research/technique.md, Stage 3 and 4: the claw "works around the form", successive passes crossing): the sampler the toothed chisels, the rasps, the abrasives and the brush share.
 * Points come from the figure's surface inside the region, about `stride` apart, kept where they fall within a blow of a band's centreline, bands `pitch` apart; each blow sits where the stock surface lies outward along the figure's normal (or on the step's margin surface for a later pass), with the stock's own normal there, and leans along the band unless the shaft would then run into stone, in which case it tries the other way along the band, across it, and a steeper lean inside the tool's range, and keeps the clearest (src/choreography/shaft.test.ts). Bands run horizontally, diagonally or vertically around the figure's axis, top band first, and a stroke is a run of neighbouring blows along one band.
 */
import type { Blow, PlanContext, ToolId, Vec3 } from '../../contracts/making';
import { add, blowAt, cross, dot, figureSurfacePoints, firstEntry, normalize, stockAbove } from './surface';

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
  /** The steepest lean the tool's documented range allows, degrees, tried when the shaft at `angle` would enter stone; `angle` when absent. */
  readonly steeper?: number;
}

/** How far above the figure the stock surface is looked for, metres. */
const LOOK_UP = 0.4;
/** How far back along the shaft the stone must be clear, metres (the handle end of the chisels and the rasps). */
const SHAFT_CLEARANCE = 0.16;

/** The blow whose shaft stays out of the stock: `forward` along the band first, then back, then across the band either way, each at `angle` and then at `steeper`; failing all, the clearest. */
function clearBlow(ctx: PlanContext, options: BandOptions, point: Vec3, normal: Vec3, forward: Vec3, stroke: number): Blow {
  const across = normalize(cross(normal, forward));
  const directions: Vec3[] = [forward, [-forward[0], -forward[1], -forward[2]], across, [-across[0], -across[1], -across[2]]];
  const angles = options.steeper === undefined || options.steeper <= options.angle ? [options.angle] : [options.angle, options.steeper];
  let best: Blow | null = null;
  let bestClear = -1;
  for (const angle of angles) {
    for (const dir of directions) {
      const blow = blowAt(options.tool, point, normal, dir, angle, options.size, stroke);
      const shaft: Vec3 = [-blow.direction[0], -blow.direction[1], -blow.direction[2]];
      const from: Vec3 = [point[0] + shaft[0] * ctx.cell, point[1] + shaft[1] * ctx.cell, point[2] + shaft[2] * ctx.cell];
      const hit = firstEntry(ctx.stock, from, shaft, SHAFT_CLEARANCE, ctx.cell * 0.5);
      if (hit === null) return blow;
      if (hit > bestClear) {
        bestClear = hit;
        best = blow;
      }
    }
  }
  return best ?? blowAt(options.tool, point, normal, forward, options.angle, options.size, stroke);
}
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
    const figureNormal = ctx.figure.gradient(q[0], q[1], q[2]);
    let point: Vec3;
    let normal: Vec3;
    if (options.floor === 'stock') {
      const above = stockAbove(ctx, q, LOOK_UP);
      if (above === null) continue;
      if (options.onlyWhereStockAbove && above.depth <= ctx.margin + ctx.cell * 0.25) continue;
      point = above.point;
      // The blow's normal is the stock's, where the tool meets it; the figure's where the stock's turns away from it.
      const stockNormal = ctx.stock.gradient(point[0], point[1], point[2]);
      normal = dot(stockNormal, figureNormal) > 0.2 ? stockNormal : figureNormal;
    } else {
      point = add(q, figureNormal, Math.max(ctx.margin, 0));
      normal = figureNormal;
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
    blows.push(clearBlow(ctx, options, c.point, c.normal, forward, stroke));
    previous = c;
  }
  return blows;
}
