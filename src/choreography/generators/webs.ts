/**
 * The webs (docs/research/technique.md, Stage 4 and 5; tools.md, Gradina and Trapano): stone left standing in the hollows and gaps between two parts of the figure, which the claws' bands passed over because a band blow sits where the stock ends along the figure's normal (./bands.ts), and from either side of a gap that normal runs through the web into the other part. On the David at 8 mm the fine claw left 3,718 such cells in 572 pockets (2026-10-14, cells farther than 9.5 mm from the figure); the rasp, whose scratches are under half a millimetre deep (tools.md, Raspe e lime), took most of those of the flesh later, and those of the hair and the stump stayed to the end.
 * The planner reads them from the stock the step starts from, on a full-resolution scratch (./scratch.ts) it carves with every blow: a web cell is stone whose figure distance is more than the step's margin plus `reach` (half a cell when absent), inside the step's region (judged at the cell's nearest figure point) and above the block's floor. The cells are grouped into 6-connected clusters and visited as a tour from the highest (`clustersOf`).
 * Each cluster is worked from its open side: the seeds are its cells that touch air on the scratch, or, for a cluster sealed under waste stone, the first cells touching air within SEAL_LAYERS of it through stone farther than the margin from the figure, never through the figure; each seed's blow lands where the stock surface lies outward along the scratch's normal, and the tool is tried at the given angles and at LEANS directions round the normal. A candidate counts only when its shaft is clear of stone for SHAFT_CLEARANCE, and the one whose removed volume takes the most of the cluster's standing cells is struck and carved into the scratch; the cluster is worked until no candidate takes a cell of it or MAX_BLOWS_PER_CLUSTER is reached, so a web no chisel reaches with its shaft in air is left standing.
 * The carving rule stops every cut at the figure plus the step's margin (src/stock/carve-kernel.ts), so no blow cuts the statue; ./webs.test.ts holds the plan to its claims on a fixture.
 */
import { FIXED_POINT } from '../../contracts/grid';
import type { Blow, PlanContext, ToolId, Vec3 } from '../../contracts/making';
import { volumeOf } from '../../stock/carve';
import type { Grid } from '../../stock/grid';
import { ScratchStock } from './scratch';
import { blowAt, cross, firstEntry, firstExit, inRegion, normalize, tangentOf } from './surface';

export interface WebOptions {
  readonly tool: ToolId;
  /** Cut depth of a blow, metres. */
  readonly size: number;
  /** Degrees to the surface, inside the tool's documented range, tried in this order. */
  readonly angles: readonly number[];
  /** How far beyond the step's margin a cell of stone must stand from the figure to be a web cell, metres; half a cell when absent, so the narrow webs between two parts a cell or two apart count as well as the pockets. */
  readonly reach?: number;
}

/** Directions round the normal a blow may lean along, the first pushing down the surface (the overhand stroke, handle up). */
const LEANS = 8;
/** How far back along the shaft the stone must be clear, metres (the handle end of an 18 cm chisel, as ./bands.ts). */
const SHAFT_CLEARANCE = 0.16;
/** Seeds tried per blow: the cluster's open cells, evenly spaced along the list. */
const MAX_SEEDS = 12;
/** Layers of stone searched round a sealed cluster for its open side. */
const SEAL_LAYERS = 4;
/** Blows one cluster may take: a guard far above the few patches a pocket needs. */
const MAX_BLOWS_PER_CLUSTER = 16;
/** A stroke is the blows of one cluster within this of its first blow, metres (the blow cycle's slide, src/tools/blow-cycle.ts, STROKE_SPAN). */
const STROKE_SPAN = 0.15;
/** What a metre of climb costs the tour over a metre across, so the work runs down the figure (see `clustersOf`). */
const RISE_COST = 3;

/** The six face neighbours of cell `index` on `grid`, −1 off the lattice. */
function neighbours(grid: Grid, index: number): number[] {
  const { nx, ny, nz } = grid;
  const slice = nx * ny;
  const k = Math.floor(index / slice);
  const j = Math.floor((index - k * slice) / nx);
  const i = index - k * slice - j * nx;
  return [i > 0 ? index - 1 : -1, i + 1 < nx ? index + 1 : -1, j > 0 ? index - nx : -1, j + 1 < ny ? index + nx : -1, k > 0 ? index - slice : -1, k + 1 < nz ? index + slice : -1];
}

function worldOfIndex(grid: Grid, index: number): Vec3 {
  const { nx, ny } = grid;
  const slice = nx * ny;
  const k = Math.floor(index / slice);
  const j = Math.floor((index - k * slice) / nx);
  return grid.worldOf(index - k * slice - j * nx, j, k);
}

/** The web cells of the scratch, by index: stone farther than `threshold` metres from the figure, inside the region's box and the region (at the cell's nearest figure point), above the block's floor. */
function webCells(ctx: PlanContext, scratch: ScratchStock, figure: Grid, threshold: number): number[] {
  const grid = scratch.grid;
  const { nx, ny, nz, values } = grid;
  const { region } = ctx;
  const toCell = (axis: 0 | 1 | 2, value: number, round: (v: number) => number, size: number): number => Math.min(size - 1, Math.max(0, round((value - grid.spec.origin[axis]) / grid.cell)));
  const i0 = toCell(0, region.min[0], Math.ceil, nx);
  const i1 = toCell(0, region.max[0], Math.floor, nx);
  const j0 = Math.max(toCell(1, region.min[1], Math.ceil, ny), toCell(1, grid.cell, Math.ceil, ny));
  const j1 = toCell(1, region.max[1], Math.floor, ny);
  const k0 = toCell(2, region.min[2], Math.ceil, nz);
  const k1 = toCell(2, region.max[2], Math.floor, nz);
  const limit = Math.round((threshold / grid.cell) * FIXED_POINT);
  const figureValues = figure.values;
  const scale = grid.cell / FIXED_POINT;
  const cells: number[] = [];
  for (let k = k0; k <= k1; k += 1) {
    for (let j = j0; j <= j1; j += 1) {
      let index = i0 + nx * (j + ny * k);
      for (let i = i0; i <= i1; i += 1, index += 1) {
        const f = figureValues[index] ?? 0;
        if ((values[index] ?? 0) >= 0 || f <= limit) continue;
        const p = grid.worldOf(i, j, k);
        const n = figure.gradient(p[0], p[1], p[2]);
        const d = f * scale;
        if (inRegion(region, [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d], n)) cells.push(index);
      }
    }
  }
  return cells;
}

/**
 * The 6-connected clusters of `cells` in the order the tool visits them: from the highest, each time to the cluster whose centre costs least to reach, the distance plus RISE_COST times any climb, so the work runs down the figure as the chips fall onto stone not yet worked and moves to a near pocket rather than hopping across the block.
 */
function clustersOf(grid: Grid, cells: readonly number[]): number[][] {
  const left = new Set(cells);
  const clusters: { cells: number[]; centre: Vec3 }[] = [];
  for (const start of cells) {
    if (!left.delete(start)) continue;
    const cluster = [start];
    const sum: [number, number, number] = [0, 0, 0];
    for (let head = 0; head < cluster.length; head += 1) {
      const index = cluster[head] ?? 0;
      const p = worldOfIndex(grid, index);
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
      for (const n of neighbours(grid, index)) {
        if (n >= 0 && left.delete(n)) cluster.push(n);
      }
    }
    clusters.push({ cells: cluster, centre: [sum[0] / cluster.length, sum[1] / cluster.length, sum[2] / cluster.length] });
  }
  const order: number[][] = [];
  let at: Vec3 | null = null;
  while (clusters.length > 0) {
    let best = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    clusters.forEach((cluster, n) => {
      const from = at;
      const cost = from === null ? -cluster.centre[1] : Math.hypot(cluster.centre[0] - from[0], cluster.centre[1] - from[1], cluster.centre[2] - from[2]) + RISE_COST * Math.max(0, cluster.centre[1] - from[1]);
      if (cost < bestCost) {
        best = n;
        bestCost = cost;
      }
    });
    const [next] = clusters.splice(best, 1);
    if (next === undefined) break;
    order.push(next.cells);
    at = next.centre;
  }
  return order;
}

/** Cells of `from` that touch air on the scratch; failing that, the stone cells touching air within SEAL_LAYERS of them through waste (stone farther than the margin from the figure, `waste`), never through the figure or its margin, which no blow may break into. */
function openSeeds(grid: Grid, from: readonly number[], waste: (index: number) => boolean): number[] {
  const values = grid.values;
  const touchesAir = (index: number): boolean => neighbours(grid, index).some((n) => n >= 0 && (values[n] ?? 0) >= 0);
  let layer = from.filter(touchesAir);
  if (layer.length > 0) return layer;
  const seen = new Set(from);
  layer = [...from];
  for (let depth = 0; depth < SEAL_LAYERS; depth += 1) {
    const next: number[] = [];
    for (const index of layer) {
      for (const n of neighbours(grid, index)) {
        if (n < 0 || seen.has(n) || (values[n] ?? 0) >= 0 || !waste(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    const open = next.filter(touchesAir);
    if (open.length > 0) return open;
    layer = next;
  }
  return [];
}

/** How many of `cells` (still stone) a blow's removed volume takes. */
function takes(scratch: ScratchStock, figure: Grid, blow: Blow, cells: readonly number[]): number {
  const volume = volumeOf(figure, blow);
  const scale = figure.cell / FIXED_POINT;
  let count = 0;
  for (const index of cells) {
    const p = worldOfIndex(scratch.grid, index);
    if (volume.distance(p[0], p[1], p[2], (figure.values[index] ?? 0) * scale) < 0) count += 1;
  }
  return count;
}

/** Whether the shaft behind a blow's tip runs through air for SHAFT_CLEARANCE. */
function shaftClear(scratch: ScratchStock, blow: Blow): boolean {
  const back: Vec3 = [-blow.direction[0], -blow.direction[1], -blow.direction[2]];
  const step = scratch.cell * 0.5;
  const from: Vec3 = [blow.point[0] + back[0] * step, blow.point[1] + back[1] * step, blow.point[2] + back[2] * step];
  return firstEntry(scratch, from, back, SHAFT_CLEARANCE, step) === null;
}

/** The best blow on the cluster's standing cells from its open side, or null when no candidate with its shaft in air takes any of them. */
function bestBlow(scratch: ScratchStock, figure: Grid, options: WebOptions, standing: readonly number[], margin: number): Blow | null {
  const grid = scratch.grid;
  const marginFixed = Math.round((margin / grid.cell) * FIXED_POINT);
  const seeds = openSeeds(grid, standing, (index) => (figure.values[index] ?? 0) > marginFixed);
  const every = Math.max(1, Math.ceil(seeds.length / MAX_SEEDS));
  let best: Blow | null = null;
  let bestTaken = 0;
  for (let s = 0; s < seeds.length; s += every) {
    const centre = worldOfIndex(grid, seeds[s] ?? 0);
    const out = scratch.normalAt(centre);
    const exit = firstExit(scratch, centre, out, 3 * grid.cell, grid.cell * 0.25);
    if (exit === null) continue;
    const point: Vec3 = [centre[0] + out[0] * exit, centre[1] + out[1] * exit, centre[2] + out[2] * exit];
    const normal = scratch.normalAt(point);
    const down = tangentOf(normal, [0, -1, 0]);
    const side = normalize(cross(normal, down));
    for (const angle of options.angles) {
      for (let l = 0; l < LEANS; l += 1) {
        const turn = (2 * Math.PI * l) / LEANS;
        const lean: Vec3 = [down[0] * Math.cos(turn) + side[0] * Math.sin(turn), down[1] * Math.cos(turn) + side[1] * Math.sin(turn), down[2] * Math.cos(turn) + side[2] * Math.sin(turn)];
        const blow = blowAt(options.tool, point, normal, lean, angle, options.size, 0);
        if (!shaftClear(scratch, blow)) continue;
        const taken = takes(scratch, figure, blow, standing);
        if (taken > bestTaken) {
          best = blow;
          bestTaken = taken;
        }
      }
    }
  }
  return best;
}

/** Plans the blows that clear the webs of the step's region, cluster by cluster along the tour of `clustersOf`, each blow from the cluster's open side with the shaft in air and each cluster its own stroke while its blows stay within STROKE_SPAN of the first. */
export function webs(ctx: PlanContext, options: WebOptions): Blow[] {
  const scratch = new ScratchStock(ctx);
  const figure = scratch.figure;
  const grid = scratch.grid;
  const blows: Blow[] = [];
  let stroke = -1;
  let strokeStart: Vec3 | null = null;
  for (const cluster of clustersOf(grid, webCells(ctx, scratch, figure, ctx.margin + (options.reach ?? grid.cell / 2)))) {
    for (let n = 0; n < MAX_BLOWS_PER_CLUSTER; n += 1) {
      const standing = cluster.filter((index) => (grid.values[index] ?? 0) < 0);
      if (standing.length === 0) break;
      const blow = bestBlow(scratch, figure, options, standing, ctx.margin);
      if (blow === null) break;
      const apart = strokeStart === null || n === 0 ? Number.POSITIVE_INFINITY : Math.hypot(blow.point[0] - strokeStart[0], blow.point[1] - strokeStart[1], blow.point[2] - strokeStart[2]);
      if (apart > STROKE_SPAN) {
        stroke += 1;
        strokeStart = blow.point;
      }
      const placed: Blow = { ...blow, stroke };
      scratch.carve(placed, ctx.margin);
      blows.push(placed);
    }
  }
  return blows;
}
