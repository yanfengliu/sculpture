/**
 * Keeping a step's paint and cut inside its region (review finding C2.7, docs/work/0_making-of/reviews/0_integration.md; round 2's item of 2026-10-14): the rubbing and the paint tools strike a footprint of 3 to 15 cm (src/stock/footprint.ts, `footprintOf`) and the kernel cuts and paints every band cell within one cell of a volume (src/stock/carve-kernel.ts), so a rasp blow beside the hairline painted and cut about 6 cm into the hair, and a slab on the underside of the brow reached the forehead 13 cm away through the stone, since a slab that follows the figure's level sets has no floor of its own inside its box.
 * So ./bands.ts tries each footprint blow before it keeps it: the kernel applies a cutting blow to the stock the step plans on, as the engine will apply it to the real grid, marking every cell it cuts or paints for the first time in the step, and a blow that removes nothing (the polish, the gilding) is read against the kernel's paint rule for such a volume, every band cell within a cell of it, without a write; each cell so found is asked the step's region at its centre with the figure's gradient there, the reading src/choreography/paint-confinement.test.ts makes, and the answers are kept per cell for the step. A cutting blow that reached a cell outside the region is undone from the kernel's own record of the bytes it changed. A cell under the block's bottom face is under the yard's floor, never stone and never seen, and does not count.
 * A blow that reaches outside is moved inward, away from the cells it reached outside, by the distance their place suggests (`inwardMove`). A step's passes share one confinement (./combing.ts, ./rasping.ts), so a cell is asked once a step and a point no blow could keep inside is not tried again.
 */
import { FIXED_POINT } from '../../contracts/grid';
import type { Blow, PlanContext, ToolId, Vec3 } from '../../contracts/making';
import { dilatedBox, kernelParams, volumeOf } from '../../stock/carve';
import { carveCells, type KernelTarget, PAINT_OVER_ALL, UndoSink } from '../../stock/carve-kernel';
import type { CellBox } from '../../stock/chunks';
import { type Footprint, footprintOf } from '../../stock/footprint';
import { Grid } from '../../stock/grid';
import { blowFrame, roundedBox2 } from '../../stock/tool-frame';
import type { ToolVolume } from '../../stock/tool-volumes';
import { dot, inRegion, normalize } from './surface';

/** One blow tried on the step's stock. */
export interface Trial {
  readonly blow: Blow;
  /** Every cell the blow cut or painted lies in the region, and the blow stands; otherwise it has been undone. */
  readonly inside: boolean;
  /** Offsets from the blow point of the cells it cut or painted outside the region, world metres, x, y, z after one another. */
  readonly outside: Float64Array;
}

/** Region answers, two bits a cell: not yet asked, inside, outside. */
const UNASKED = 0;
const INSIDE = 1;
const OUTSIDE = 2;
/** The mark the kernel paints on the cells a kept blow cut or painted. */
const MARK = 1;
/** Points of a footprint well inside its edge, as fractions of its half extents along the push and across: the stock surface there is cut or painted by any blow of that footprint, so a cell there outside the region condemns the blow before the kernel runs. */
const SURE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.7, 0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [-0.7, -0.7],
];

/** A step's confinement of one footprint tool: its footprint, the stock it plans on, the cells its kept blows have marked and the region's answers so far. */
export class Confiner {
  readonly footprint: Footprint;
  /** The paint's reach beyond the volume, metres: one cell. */
  readonly reach: number;
  private readonly answers: Uint8Array;
  private readonly marks: Uint8Array;
  private readonly target: KernelTarget;
  private readonly sink = new UndoSink();
  /** The figure points whose blow no move kept inside, in any pass of the step. */
  private readonly dropped = new Set<Vec3>();

  /** The confinement of `tool`'s blows of cut depth `size`, planned on `stock` (the step's scratch, or the stock itself for a tool that removes nothing), or null when its volume is no footprint (the toothed chisels' wedges), which ./bands.ts places as before. */
  static of(ctx: PlanContext, tool: ToolId, size: number, stock: Grid): Confiner | null {
    const footprint = footprintOf(tool, size);
    return footprint === null ? null : new Confiner(ctx, footprint, stock);
  }

  private constructor(
    private readonly ctx: PlanContext,
    footprint: Footprint,
    private readonly stock: Grid,
  ) {
    const figure = ctx.figure;
    if (!(figure instanceof Grid) || figure.nx !== stock.nx || figure.ny !== stock.ny || figure.nz !== stock.nz) throw new Error(`confining region ${ctx.region.label} needs the figure as a grid on the stock's lattice (${stock.spec.size.join('×')} cells); it was given ${figure instanceof Grid ? `a grid of ${figure.spec.size.join('×')}` : 'a plain sampler'}`);
    this.footprint = footprint;
    this.reach = stock.cell;
    this.answers = new Uint8Array(Math.ceil(stock.values.length / 4));
    this.marks = new Uint8Array(stock.values.length);
    this.target = { values: stock.values, finish: this.marks, figure: figure.values, nx: stock.nx, ny: stock.ny, nz: stock.nz, offset: [0, 0, 0], origin: stock.spec.origin, cell: stock.cell, limit: stock.limit, globalNx: stock.nx, globalNy: stock.ny };
  }

  /** Notes that no blow over the figure point `q` keeps inside the region. */
  drop(q: Vec3): void {
    this.dropped.add(q);
  }

  /** Whether an earlier pass of the step found no blow over `q` that keeps inside (the passes share their figure points, ./bands.ts, `bandSurfacePoints`). */
  dropping(q: Vec3): boolean {
    return this.dropped.has(q);
  }

  /** Applies `blow` to the step's stock and asks the region of every cell it cut or painted for the first time; undoes it when any lies outside. */
  trial(blow: Blow): Trial {
    const { stock, sink } = this;
    const volume = volumeOf(this.ctx.figure as Grid, blow);
    const box = dilatedBox(volume, stock.spec);
    if (box === null) return { blow, inside: true, outside: new Float64Array(0) };
    const condemned = this.condemned(blow);
    if (condemned.length > 0) return { blow, inside: false, outside: condemned };
    if (!volume.removes) return this.paintTrial(blow, volume, box);
    sink.runs.count = 0;
    sink.indices.count = 0;
    sink.stock.count = 0;
    sink.finish.count = 0;
    // The mark goes on whatever a cell holds, so the record holds every cell the blow cut or painted that no kept blow of the step had marked.
    carveCells(this.target, volume, box, { ...kernelParams(blow, this.ctx.margin, stock.cell), code: MARK, paintOver: PAINT_OVER_ALL }, sink);
    const outside: number[] = [];
    const visit = (start: number, length: number): void => {
      for (let g = start; g < start + length; g += 1) {
        if (this.answer(g) !== OUTSIDE) continue;
        const p = this.worldOf(g);
        outside.push(p[0] - blow.point[0], p[1] - blow.point[1], p[2] - blow.point[2]);
      }
    };
    for (const pairs of [sink.runs, sink.indices]) {
      for (let r = 0; r + 1 < pairs.count; r += 2) visit(pairs.array[r] ?? 0, pairs.array[r + 1] ?? 0);
    }
    if (outside.length === 0) return { blow, inside: true, outside: new Float64Array(0) };
    this.undo();
    return { blow, inside: false, outside: Float64Array.from(outside) };
  }

  /** Offsets from the blow point of the band cells at the stock surface under SURE that lie outside the region: cells the blow will surely reach, read before the kernel runs; empty when none is outside. */
  private condemned(blow: Blow): Float64Array {
    const { stock } = this;
    const f = blowFrame(blow);
    const { halfPush, halfWidth } = this.footprint;
    const out: number[] = [];
    for (const [fa, fb] of SURE) {
      const a = fa * halfPush;
      const b = fb * halfWidth;
      const x: Vec3 = [f.px + a * f.u[0] + b * f.w[0], f.py + a * f.u[1] + b * f.w[1], f.pz + a * f.u[2] + b * f.w[2]];
      // Onto the stock surface along the blow's normal, then the nearest cell.
      const d = stock.sample(x[0], x[1], x[2]);
      const i = Math.round((x[0] - f.n[0] * d - stock.spec.origin[0]) / stock.cell);
      const j = Math.round((x[1] - f.n[1] * d - stock.spec.origin[1]) / stock.cell);
      const k = Math.round((x[2] - f.n[2] * d - stock.spec.origin[2]) / stock.cell);
      if (i < 0 || j < 0 || k < 0 || i >= stock.nx || j >= stock.ny || k >= stock.nz) continue;
      const g = stock.index(i, j, k);
      const s = stock.values[g] ?? stock.limit;
      if (s <= -stock.limit || s >= stock.limit || this.answer(g) !== OUTSIDE) continue;
      const p = stock.worldOf(i, j, k);
      out.push(p[0] - blow.point[0], p[1] - blow.point[1], p[2] - blow.point[2]);
    }
    return Float64Array.from(out);
  }

  /**
   * The cells a blow that removes nothing paints, by the kernel's rule for such a volume (src/stock/carve-kernel.ts: no cut, so a cell is painted when its stock is inside the band and the volume's distance there, formed from the same floats, is under the paint's reach of a cell; such a thin volume has no cell deep inside it), read without a write; a cell already answered inside is passed over without its distance.
   */
  private paintTrial(blow: Blow, volume: ToolVolume, box: CellBox): Trial {
    const { stock } = this;
    const { values, limit, cell } = stock;
    const figureValues = (this.ctx.figure as Grid).values;
    const origin = stock.spec.origin;
    const figureScale = cell / FIXED_POINT;
    const outside: number[] = [];
    for (let k = box.min[2]; k <= box.max[2]; k += 1) {
      const z = origin[2] + k * cell;
      for (let j = box.min[1]; j <= box.max[1]; j += 1) {
        const y = origin[1] + j * cell;
        let g = stock.index(box.min[0], j, k);
        for (let i = box.min[0]; i <= box.max[0]; i += 1, g += 1) {
          const s = values[g] ?? limit;
          if (s <= -limit || s >= limit || this.known(g) === INSIDE) continue;
          const x = origin[0] + i * cell;
          if (volume.distance(x, y, z, (figureValues[g] ?? 0) * figureScale) >= cell) continue;
          if (this.answer(g) === OUTSIDE) outside.push(x - blow.point[0], y - blow.point[1], z - blow.point[2]);
        }
      }
    }
    return { blow, inside: outside.length === 0, outside: Float64Array.from(outside) };
  }

  /** Puts back the bytes the last trial changed, from the kernel's record (src/stock/carve.ts, undoBlow, reads the same record). */
  private undo(): void {
    const { sink, marks } = this;
    const values = this.stock.values;
    const deep = -this.stock.limit;
    for (let r = 0; r + 1 < sink.runs.count; r += 2) {
      const start = sink.runs.array[r] ?? 0;
      const end = start + (sink.runs.array[r + 1] ?? 0);
      values.fill(deep, start, end);
      marks.fill(0, start, end);
    }
    let n = 0;
    for (let r = 0; r + 1 < sink.indices.count; r += 2) {
      const start = sink.indices.array[r] ?? 0;
      const length = sink.indices.array[r + 1] ?? 0;
      values.set(sink.stock.array.subarray(n, n + length), start);
      marks.set(sink.finish.array.subarray(n, n + length), start);
      n += length;
    }
  }

  /** The centre of cell `g` of the stock's lattice, world metres. */
  private worldOf(g: number): Vec3 {
    const { nx, ny } = this.stock;
    return this.stock.worldOf(g % nx, Math.floor(g / nx) % ny, Math.floor(g / (nx * ny)));
  }

  /** The region's answer for cell `g` so far, UNASKED before it is asked. */
  private known(g: number): number {
    return ((this.answers[g >> 2] ?? 0) >> ((g & 3) * 2)) & 3;
  }

  /** Whether cell `g` lies in the region, asked once per step. */
  private answer(g: number): number {
    const known = this.known(g);
    if (known !== UNASKED) return known;
    const byte = g >> 2;
    const shift = (g & 3) * 2;
    const p = this.worldOf(g);
    const answer = p[1] < 0 || inRegion(this.ctx.region, p, this.ctx.figure.gradient(p[0], p[1], p[2])) ? INSIDE : OUTSIDE;
    this.answers[byte] = (this.answers[byte] ?? 0) | (answer << shift);
    return answer;
  }
}

/**
 * From a trial that reached outside: the direction inward, in the figure's tangent plane at `q`, away from the cells it reached outside (or `direction` when given), and the move along it that takes the footprint's far edge, with the paint's reach, past the outside cell that lies furthest inward, metres; null when those cells give no direction.
 */
export function inwardMove(ctx: PlanContext, confiner: Confiner, trial: Trial, q: Vec3, direction?: Vec3): { direction: Vec3; distance: number } | null {
  const { outside } = trial;
  const n = ctx.figure.gradient(q[0], q[1], q[2]);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let m = 0; m + 2 < outside.length; m += 3) {
    sx += outside[m] ?? 0;
    sy += outside[m + 1] ?? 0;
    sz += outside[m + 2] ?? 0;
  }
  const along = sx * n[0] + sy * n[1] + sz * n[2];
  const tangent: Vec3 = [along * n[0] - sx, along * n[1] - sy, along * n[2] - sz];
  if (direction === undefined && Math.hypot(tangent[0], tangent[1], tangent[2]) < 1e-9) return null;
  const v = direction ?? normalize(tangent);
  let furthest = -Infinity;
  for (let m = 0; m + 2 < outside.length; m += 3) furthest = Math.max(furthest, (outside[m] ?? 0) * v[0] + (outside[m + 1] ?? 0) * v[1] + (outside[m + 2] ?? 0) * v[2]);
  const f = blowFrame(trial.blow);
  const { halfPush, halfWidth, rounding } = confiner.footprint;
  const reachThatWay = Math.abs(dot(v, f.u)) * (halfPush - rounding) + Math.abs(dot(v, f.w)) * (halfWidth - rounding) + rounding + confiner.reach;
  return { direction: v, distance: Math.max(confiner.reach, furthest + reachThatWay + confiner.reach) };
}

/** Whether the figure point `q` lies inside `blow`'s footprint by at least `inset` metres, in the blow's tangent plane. */
export function covers(blow: Blow, footprint: Footprint, q: Vec3, inset: number): boolean {
  const f = blowFrame(blow);
  const r: Vec3 = [q[0] - f.px, q[1] - f.py, q[2] - f.pz];
  return roundedBox2(dot(r, f.u), dot(r, f.w), footprint.halfPush, footprint.halfWidth, footprint.rounding) <= -inset;
}
