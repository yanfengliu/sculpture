/**
 * A scratch stock for planning (docs/design/spec.md, Blows, strokes and steps; the review of 81acb40, F11 and C2.4: blows planned against a step's starting stock struck air): a copy of the stock the step starts from, on its own lattice, that a generator carves with every blow it plans. Each blow is then placed on the surface the blows before it leave, its normal is that surface's gradient, and a blow that would remove nothing is seen before it is planned and left out.
 * The copy is carved by the engine's own kernel (src/stock/carve-kernel.ts) with no finish and the undo record thrown away, so the planner's surface is, cell for cell, the surface the engine will make when it applies the same blows in the same order (src/choreography/shaft.test.ts replays the plan and compares).
 * The figure and the stock must be grids on one lattice, which is what the Making passes; a generator given plain samplers cannot build a scratch and says so.
 */
import type { Blow, PlanContext, SdfSampler, Vec3 } from '../../contracts/making';
import { dilatedBox, kernelParams, volumeOf } from '../../stock/carve';
import { carveCells, type KernelTarget, UndoSink } from '../../stock/carve-kernel';
import { Grid } from '../../stock/grid';

/** A cut that removes less than this many cells' volume is an empty cut: the tool met air. Anything more is a blow on stone and stays in the plan, since the scratch has already taken it and the engine must take the same (a dropped cut that had removed a sliver would leave that sliver standing in the real stock, unknown to the planner). */
const EMPTY_CELLS = 0.5;

export class ScratchStock implements SdfSampler {
  readonly grid: Grid;
  readonly figure: Grid;
  readonly cell: number;
  /** Blows carved so far. */
  carved = 0;
  private readonly target: KernelTarget;
  private readonly sink = new UndoSink();

  constructor(ctx: PlanContext) {
    if (!(ctx.figure instanceof Grid) || !(ctx.stock instanceof Grid)) throw new Error(`a scratch stock needs the figure and the stock as grids on one lattice; region ${ctx.region.label} was planned with plain samplers`);
    const stock = ctx.stock;
    this.figure = ctx.figure;
    this.cell = stock.cell;
    this.grid = new Grid(stock.spec, stock.values.slice());
    this.target = { values: this.grid.values, finish: null, figure: this.figure.values, nx: stock.nx, ny: stock.ny, nz: stock.nz, offset: [0, 0, 0], origin: stock.spec.origin, cell: stock.cell, limit: stock.limit, globalNx: stock.nx, globalNy: stock.ny };
  }

  sample(x: number, y: number, z: number): number {
    return this.grid.sample(x, y, z);
  }

  gradient(x: number, y: number, z: number): Vec3 {
    return this.grid.gradient(x, y, z);
  }

  /** The surface normal over a stencil one cell wide, which steadies the gradient at a crater's rim where the half-cell stencil flickers. */
  normalAt(p: Vec3): Vec3 {
    const h = this.cell;
    const gx = this.grid.sample(p[0] + h, p[1], p[2]) - this.grid.sample(p[0] - h, p[1], p[2]);
    const gy = this.grid.sample(p[0], p[1] + h, p[2]) - this.grid.sample(p[0], p[1] - h, p[2]);
    const gz = this.grid.sample(p[0], p[1], p[2] + h) - this.grid.sample(p[0], p[1], p[2] - h);
    const length = Math.hypot(gx, gy, gz);
    return length < 1e-12 ? [0, 1, 0] : [gx / length, gy / length, gz / length];
  }

  /** Carves `blow` at the step's `margin` into the scratch and returns the volume it removed, metres cubed. */
  carve(blow: Blow, margin: number): number {
    const volume = volumeOf(this.figure, blow);
    const box = dilatedBox(volume, this.grid.spec);
    if (box === null) return 0;
    const { sink } = this;
    sink.runs.count = 0;
    sink.indices.count = 0;
    sink.stock.count = 0;
    sink.finish.count = 0;
    const result = carveCells(this.target, volume, box, kernelParams(blow, margin, this.cell), sink);
    this.carved += 1;
    return result.removed;
  }

  /** Whether a cut removing `removed` metres cubed counts as a blow on stone. */
  struckStone(removed: number): boolean {
    return removed >= EMPTY_CELLS * this.cell * this.cell * this.cell;
  }
}

/** A plan context whose stock is the scratch, for the shared samplers of ./surface.ts. */
export function scratchContext(ctx: PlanContext, scratch: ScratchStock): PlanContext {
  return { ...ctx, stock: scratch };
}
