/**
 * Blows laid in bands around the form (docs/research/technique.md, Stage 3 and 4: the claw "works around the form", successive passes crossing): the sampler the toothed chisels, the rasps, the abrasives and the brush share.
 * Points come from the figure's surface inside the region, about `stride` apart, kept where they fall within a blow of a band's centreline, bands `pitch` apart; each blow sits where the stock surface lies outward along the figure's normal (read when the blow is planned, so with a scratch stock it is the surface the blows before it left) or on the step's margin surface, with the stock's own normal there, and leans along the band unless the shaft would then run into stone, in which case it tries the other way along the band, across it, and a steeper lean inside the tool's range, and keeps the clearest (src/choreography/shaft.test.ts). Bands run horizontally, diagonally or vertically around the figure's axis, top band first, and a stroke is a run of neighbouring blows along one band.
 * With `onlyWhereStockAbove` a pass strikes only where stone stands above the margin by more than a quarter cell, so a pass that plans nothing proves the region is at its margin at every band point (./combing.ts and ./rasping.ts repeat crossing passes until then).
 * A tool that strikes a footprint (the fine claw's combing patch, the rasp, the file, the pumice, the polish, the gilding leaf) keeps its cut and paint inside the step's region (./confine.ts): each blow is tried before it is kept, leaning along the band's axis and then across it, and when neither keeps inside it moves inward along the axis whose move is shorter, its reach then meeting the region's edge, up to MOVES tries an axis. It is dropped when no move keeps inside, when it lands within half a stride of the blow before it, or, in a pass that strikes only where stone stands, when the moved footprint no longer holds the point that called it, since it cannot then take that stone; the step's later passes that strike only where stone stands leave a point whose blow was dropped (./combing.ts and ./rasping.ts give their passes one confinement).
 */
import type { Blow, PlanContext, ToolId, Vec3 } from '../../contracts/making';
import { STOCK_BAND_CELLS } from '../../david/frame';
import { footprintOf } from '../../stock/footprint';
import { Grid } from '../../stock/grid';
import { TOOL_VOLUMES } from '../../stock/tool-volumes';
import { Confiner, covers, inwardMove, type Trial } from './confine';
import type { ScratchStock } from './scratch';
import { add, blowAt, cross, dot, figureSurfacePoints, firstEntry, inRegion, normalize, projectToFigure, stockAbove } from './surface';

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
  /** Where the blows sit: on the current stock, or on the margin surface the earlier pass leaves. */
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
/** Tries of a moved footprint blow along one axis. */
const MOVES = 3;

const reverse = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** The ways a blow at `normal` may lean, in order of preference: `forward` along the band, back, then across the band either way; entries 0 and 1 share the band's axis, 2 and 3 the axis across it. */
function leanings(normal: Vec3, forward: Vec3): Vec3[] {
  const across = normalize(cross(normal, forward));
  return [forward, reverse(forward), across, reverse(across)];
}

/** The blow whose shaft stays out of the stock, with the index of its direction: `directions` in order, each at `angle` and then at `steeper`, skipping a direction whose index `admits` refuses; failing all, the clearest admitted; null when none is admitted. */
function clearBlow(ctx: PlanContext, options: BandOptions, point: Vec3, normal: Vec3, directions: readonly Vec3[], stroke: number, admits: (index: number) => boolean = () => true): { blow: Blow; index: number } | null {
  const angles = options.steeper === undefined || options.steeper <= options.angle ? [options.angle] : [options.angle, options.steeper];
  let best: { blow: Blow; index: number } | null = null;
  let bestClear = -1;
  for (const angle of angles) {
    for (let index = 0; index < directions.length; index += 1) {
      const dir = directions[index];
      if (dir === undefined || !admits(index)) continue;
      const blow = blowAt(options.tool, point, normal, dir, angle, options.size, stroke);
      const shaft: Vec3 = [-blow.direction[0], -blow.direction[1], -blow.direction[2]];
      const from: Vec3 = [point[0] + shaft[0] * ctx.cell, point[1] + shaft[1] * ctx.cell, point[2] + shaft[2] * ctx.cell];
      const hit = firstEntry(ctx.stock, from, shaft, SHAFT_CLEARANCE, ctx.cell * 0.5);
      if (hit === null) return { blow, index };
      if (hit > bestClear) {
        bestClear = hit;
        best = { blow, index };
      }
    }
  }
  return best;
}

/**
 * A footprint tool's blow over the figure point `q`, placed at `at` and tried on the step's stock (./confine.ts), where it stands once returned: as clearBlow over the axes whose tried blow keeps inside the region, the band's and then the one across it; when neither keeps, moved inward along each axis in turn, the shorter estimated move first. Null when nothing keeps inside, and for a move that lands within half a stride of `last` (the blow before it, which it would only repeat) or, in a pass that strikes only where stone stands, whose footprint no longer holds `q` half a cell inside its edge.
 */
function confinedBlow(ctx: PlanContext, options: BandOptions, confiner: Confiner, q: Vec3, at: { point: Vec3; normal: Vec3 }, forward: Vec3, stroke: number, last: Vec3 | null): Blow | null {
  const directions = leanings(at.normal, forward);
  const refused = [false, false];
  const failed: (Trial | null)[] = [null, null];
  for (;;) {
    const pick = clearBlow(ctx, options, at.point, at.normal, directions, stroke, (index) => refused[index >> 1] !== true);
    if (pick === null) break;
    const trial = confiner.trial(pick.blow);
    if (trial.inside) return trial.blow;
    refused[pick.index >> 1] = true;
    failed[pick.index >> 1] = trial;
  }
  const { footprint, reach } = confiner;
  const moves = [0, 1].flatMap((axis) => {
    const trial = failed[axis];
    const move = trial === null || trial === undefined ? null : inwardMove(ctx, confiner, trial, q);
    return move === null ? [] : [{ axis, move }];
  });
  moves.sort((a, b) => a.move.distance - b.move.distance);
  for (const { axis, move } of moves) {
    const direction = directions[2 * axis] ?? forward;
    const longest = footprint.halfPush + footprint.halfWidth + reach + STOCK_BAND_CELLS * ctx.cell;
    let distance = move.distance;
    for (let attempt = 0; attempt < MOVES && distance <= longest; attempt += 1) {
      const moved = projectToFigure(ctx.figure, add(q, move.direction, distance));
      const normal = ctx.figure.gradient(moved[0], moved[1], moved[2]);
      if (!inRegion(ctx.region, moved, normal)) break;
      const placed = place(ctx, options, moved, normal, false);
      if (placed === null) break;
      const pick = clearBlow(ctx, options, placed.point, placed.normal, [direction, reverse(direction)], stroke);
      if (pick === null || (options.onlyWhereStockAbove && !covers(pick.blow, footprint, q, ctx.cell * 0.5))) break;
      const p = pick.blow.point;
      if (last !== null && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.5 * options.stride) return null;
      const trial = confiner.trial(pick.blow);
      if (trial.inside) return trial.blow;
      const further = inwardMove(ctx, confiner, trial, moved, move.direction);
      if (further === null) break;
      distance += further.distance;
    }
  }
  return null;
}

/** Radius used to turn an angle around the figure's axis into a band position, metres. */
const BAND_RADIUS = 0.5;

interface Candidate {
  /** The figure-surface point and the figure's normal there. */
  readonly q: Vec3;
  readonly figureNormal: Vec3;
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

/** Where the blow over the figure point `q` sits and which way it faces, or null when the stock there is out of reach, or, with `onlyWhereStone`, already at the margin. */
function place(ctx: PlanContext, options: BandOptions, q: Vec3, figureNormal: Vec3, onlyWhereStone: boolean): { point: Vec3; normal: Vec3 } | null {
  if (options.floor !== 'stock') return { point: add(q, figureNormal, Math.max(ctx.margin, 0)), normal: figureNormal };
  const above = stockAbove(ctx, q, LOOK_UP);
  if (above === null) return null;
  if (onlyWhereStone && above.depth <= ctx.margin + ctx.cell * 0.25) return null;
  // The blow's normal is the stock's, where the tool meets it; the figure's where the stock's turns away from it.
  const stockNormal = ctx.stock.gradient(above.point[0], above.point[1], above.point[2]);
  return { point: above.point, normal: dot(stockNormal, figureNormal) > 0.2 ? stockNormal : figureNormal };
}

/** The surface points a pass of `options` scans, `figureSurfacePoints` at the lesser of the stride and the pitch: the same for every pass of a step, so a step scans once and hands them to each `bandBlows`. */
export function bandSurfacePoints(ctx: PlanContext, options: Pick<BandOptions, 'stride' | 'pitch'>): Vec3[] {
  return figureSurfacePoints(ctx, Math.min(options.stride, options.pitch));
}

/** The step's confinement of a footprint tool (./confine.ts), planned on `scratch` when the step carves one and on the stock when the tool removes nothing; null for a tool whose volume is no footprint. A step makes one and hands it to each `bandBlows`, so its passes share the region's answers and the points where no blow kept inside. */
export function bandConfiner(ctx: PlanContext, options: Pick<BandOptions, 'tool' | 'size'>, scratch?: ScratchStock): Confiner | null {
  if (footprintOf(options.tool, options.size) === null) return null;
  // A trial carves the stock it is given, so a tool that removes stone must be tried on the step's scratch, never on the step's own stock.
  if (scratch === undefined && TOOL_VOLUMES[options.tool].removes) throw new Error(`the ${options.tool} removes stone, so its blows over region ${ctx.region.label} are tried on a scratch stock, and the step passed none; give bandBlows the step's ScratchStock (./scratch.ts)`);
  const stock = scratch?.grid ?? ctx.stock;
  if (!(stock instanceof Grid)) throw new Error(`the ${options.tool}'s blows over region ${ctx.region.label} are confined on a stock grid, and the step was given a plain sampler and no scratch stock`);
  return Confiner.of(ctx, options.tool, options.size, stock);
}

/** Plans the blows of one pass; `strokeBase` offsets the stroke indices so passes of one step stay distinct. With `scratch` (the stock of `ctx`), each blow is carved as it is planned, so the next is placed on the surface it leaves. `points` are the pass's surface points when the caller scanned them already (`bandSurfacePoints`); `confiner` the step's confinement (`bandConfiner`), made here when not given. */
export function bandBlows(ctx: PlanContext, options: BandOptions, strokeBase = 0, scratch?: ScratchStock, points?: readonly Vec3[], confiner: Confiner | null = bandConfiner(ctx, options, scratch)): Blow[] {
  const candidates: Candidate[] = [];
  for (const q of points ?? bandSurfacePoints(ctx, options)) {
    // A band is one blow wide: points off its centreline by more than half a stride lie between bands and are left.
    const across = acrossOf(q, options.orientation);
    const band = Math.floor(across / options.pitch);
    if (Math.abs(across - (band + 0.5) * options.pitch) > options.stride / 2) continue;
    candidates.push({ q, figureNormal: ctx.figure.gradient(q[0], q[1], q[2]), band, along: alongOf(q, options.orientation) });
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
    const tangent: Vec3 = neighbour === null ? [1, 0, 0] : normalize([neighbour.q[0] - c.q[0], neighbour.q[1] - c.q[1], neighbour.q[2] - c.q[2]]);
    const forward: Vec3 = neighbour === previous && neighbour !== null ? [-tangent[0], -tangent[1], -tangent[2]] : tangent;
    const apart = previous === null || previous.band !== c.band ? Number.POSITIVE_INFINITY : Math.hypot(c.q[0] - previous.q[0], c.q[1] - previous.q[1], c.q[2] - previous.q[2]);
    // Along a band the blows keep the stride apart; a pass that strikes only where stone stands leaves the points where an earlier pass found no blow that keeps inside the region.
    if (apart < 0.8 * options.stride || (options.onlyWhereStockAbove && confiner?.dropping(c.q) === true)) continue;
    const placed = place(ctx, options, c.q, c.figureNormal, options.onlyWhereStockAbove);
    if (placed === null) continue;
    const run = strokeStart === null ? 0 : Math.hypot(c.q[0] - strokeStart[0], c.q[1] - strokeStart[1], c.q[2] - strokeStart[2]);
    const opens = apart > 2.5 * options.stride || run > options.strokeLength;
    const index = opens ? stroke + 1 : stroke;
    let blow: Blow;
    if (confiner === null) {
      const pick = clearBlow(ctx, options, placed.point, placed.normal, leanings(placed.normal, forward), index);
      if (pick === null) continue;
      blow = pick.blow;
      scratch?.carve(blow, ctx.margin);
    } else {
      const kept = confinedBlow(ctx, options, confiner, c.q, placed, forward, index, blows[blows.length - 1]?.point ?? null);
      if (kept === null) {
        confiner.drop(c.q);
        continue;
      }
      blow = kept;
    }
    if (opens) {
      stroke = index;
      strokeStart = c.q;
    }
    blows.push(blow);
    previous = c;
  }
  return blows;
}
