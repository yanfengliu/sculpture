/**
 * A scratch stock for planning (docs/design/spec.md, Blows, strokes and steps; the review of 81acb40, F11 and C2.4: blows planned against a step's starting stock struck air): a copy of the stock the step starts from, on its own lattice, that a generator carves with every blow it plans. Each blow is then placed on the surface the blows before it leave, its normal is that surface's gradient, and a blow that would remove nothing is seen before it is planned and left out.
 * The copy is carved by the engine's own kernel (src/stock/carve-kernel.ts) with no finish and the undo record thrown away, so the planner's surface is, cell for cell, the surface the engine will make when it applies the same blows in the same order (src/choreography/shaft.test.ts replays the plan and compares).
 * The lattice is the stock's own, or a coarser one the generator asks for (`cell`): the roughing's craters are 36 cm wide and its furrows 10 to 30 cm long, so the point's work needs no finer surface than 2 cm, and at the page's 8 mm the full copy cost the roughing steps 2 to 4 s each to plan (2026-10-13 measurement, docs/devlog/summary.md). A coarse scratch is the stock and the figure sampled at its own cell centres (trilinear, so the surface lies where the fine grid puts it to within the interpolation), with the figure copy cached per figure grid and cell size since the figure never changes. The Making applies the planned blows on the real grid whatever lattice planned them, so the replay is the same bytes for the same plan; only the plan itself depends on the lattice, deterministically.
 * The figure and the stock must be grids on one lattice, which is what the Making passes; a generator given plain samplers cannot build a scratch and says so.
 */
import type { GridSpec } from '../../contracts/grid';
import type { Blow, PlanContext, SdfSampler, Vec3 } from '../../contracts/making';
import { dilatedBox, kernelParams, volumeOf } from '../../stock/carve';
import { carveCells, type KernelTarget, UndoSink } from '../../stock/carve-kernel';
import { Grid } from '../../stock/grid';

/** A cut that removes less than this many cells' volume is an empty cut: the tool met air. Anything more is a blow on stone and stays in the plan, since the scratch has already taken it and the engine must take the same (a dropped cut that had removed a sliver would leave that sliver standing in the real stock, unknown to the planner). */
const EMPTY_CELLS = 0.5;

export interface ScratchOptions {
  /** Cell size of the scratch's lattice, metres: the stock's own when absent or finer than the stock's; coarser, the stock and the figure are resampled onto it. */
  readonly cell?: number;
  /** Rows of the stock's own lattice, from its lowest stone row up, kept at the stock's resolution beside the scratch and carved with every blow: the floor band ./floor.ts clears. None when absent. */
  readonly floorRows?: number;
}

/** The floor band: the stock's lowest rows on its own lattice, carved with every blow the scratch takes, so the planner sees the sheets a coarse scratch averages away. */
export interface FloorBand {
  /** The stock's own lattice. */
  readonly spec: GridSpec;
  /** The band's first row on that lattice (the stock's lowest stone row at the step's start) and its row count. */
  readonly j0: number;
  readonly rows: number;
  /** Stock and figure values of the band's cells, x fastest, then the band's rows, then z, in the grid's fixed point. */
  readonly values: Int16Array;
  readonly figure: Int16Array;
  /** The stock's clamp in fixed point. */
  readonly limit: number;
}

/** Copies rows `j0` to `j0 + rows - 1` of `values` on `spec`'s lattice, x fastest, then the rows, then z. */
function bandOf(values: Int16Array, spec: GridSpec, j0: number, rows: number): Int16Array {
  const [nx, ny, nz] = spec.size;
  const out = new Int16Array(nx * rows * nz);
  for (let k = 0; k < nz; k += 1) out.set(values.subarray(nx * (j0 + ny * k), nx * (j0 + rows + ny * k)), nx * rows * k);
  return out;
}

/** The lowest row of `stock` holding a stone cell, or −1 when it holds none. */
function lowestStoneRow(stock: Grid): number {
  const { nx, ny, nz, values } = stock;
  for (let j = 0; j < ny; j += 1) {
    for (let k = 0; k < nz; k += 1) {
      const base = nx * (j + ny * k);
      for (let i = 0; i < nx; i += 1) if ((values[base + i] ?? 0) < 0) return j;
    }
  }
  return -1;
}

/** Coarse figure copies by figure grid, then by cell size, metres: the figure never changes, so one copy serves every step. */
const coarseFigures = new WeakMap<Grid, Map<number, Grid>>();

/** The lattice at `cell` metres with the same origin as `spec`, reaching at least as far on every axis. */
export function coarseLattice(spec: GridSpec, cell: number, band: number): GridSpec {
  const size = spec.size.map((n) => Math.ceil(((n - 1) * spec.cell) / cell - 1e-9) + 1) as [number, number, number];
  return { cell, size, origin: spec.origin, band };
}

/** `source` sampled at the centres of `spec`'s cells, clamped to `spec`'s band. */
export function resample(source: Grid, spec: GridSpec): Grid {
  const grid = new Grid(spec);
  grid.fill((x, y, z) => source.sample(x, y, z));
  return grid;
}

function coarseFigure(figure: Grid, cell: number): Grid {
  let byCell = coarseFigures.get(figure);
  if (byCell === undefined) {
    byCell = new Map();
    coarseFigures.set(figure, byCell);
  }
  let coarse = byCell.get(cell);
  if (coarse === undefined) {
    coarse = resample(figure, coarseLattice(figure.spec, cell, figure.spec.band));
    byCell.set(cell, coarse);
  }
  return coarse;
}

export class ScratchStock implements SdfSampler {
  readonly grid: Grid;
  /** The figure on the stock's own lattice, for the blow volumes. */
  readonly figure: Grid;
  /** The scratch's cell size, metres: the planner's resolution. */
  readonly cell: number;
  /** Blows carved so far. */
  carved = 0;
  /** The floor band, or null when the options asked for none or the stock holds no stone. */
  readonly floor: FloorBand | null;
  /** Metres cubed the last `carve` took from the floor band. */
  floorRemoved = 0;
  private readonly target: KernelTarget;
  private readonly floorTarget: KernelTarget | null;
  private readonly sink = new UndoSink();

  constructor(ctx: PlanContext, options: ScratchOptions = {}) {
    if (!(ctx.figure instanceof Grid) || !(ctx.stock instanceof Grid)) throw new Error(`a scratch stock needs the figure and the stock as grids on one lattice; region ${ctx.region.label} was planned with plain samplers`);
    const stock = ctx.stock;
    this.figure = ctx.figure;
    const cell = options.cell ?? stock.cell;
    let figureValues: Int16Array;
    if (cell <= stock.cell * (1 + 1e-9)) {
      this.grid = new Grid(stock.spec, stock.values.slice());
      figureValues = ctx.figure.values;
    } else {
      this.grid = resample(stock, coarseLattice(stock.spec, cell, stock.spec.band));
      figureValues = coarseFigure(ctx.figure, cell).values;
    }
    const grid = this.grid;
    this.cell = grid.cell;
    this.target = { values: grid.values, finish: null, figure: figureValues, nx: grid.nx, ny: grid.ny, nz: grid.nz, offset: [0, 0, 0], origin: grid.spec.origin, cell: grid.cell, limit: grid.limit, globalNx: grid.nx, globalNy: grid.ny };
    const j0 = (options.floorRows ?? 0) > 0 ? lowestStoneRow(stock) : -1;
    if (j0 < 0) {
      this.floor = null;
      this.floorTarget = null;
      return;
    }
    const rows = Math.min(options.floorRows ?? 0, stock.ny - j0);
    this.floor = { spec: stock.spec, j0, rows, values: bandOf(stock.values, stock.spec, j0, rows), figure: bandOf(ctx.figure.values, stock.spec, j0, rows), limit: stock.limit };
    this.floorTarget = { values: this.floor.values, finish: null, figure: this.floor.figure, nx: stock.nx, ny: rows, nz: stock.nz, offset: [0, j0, 0], origin: stock.spec.origin, cell: stock.cell, limit: stock.limit, globalNx: stock.nx, globalNy: stock.ny };
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

  /** Carves `blow` at the step's `margin` into the scratch, and into the floor band where its box reaches the band's rows, and returns the volume it removed from the scratch, metres cubed (`floorRemoved` holds the band's). */
  carve(blow: Blow, margin: number): number {
    const volume = volumeOf(this.figure, blow);
    this.floorRemoved = 0;
    const box = dilatedBox(volume, this.grid.spec);
    if (box === null) return 0;
    const { sink } = this;
    this.resetSink();
    const result = carveCells(this.target, volume, box, kernelParams(blow, margin, this.cell), sink);
    this.carved += 1;
    const floor = this.floor;
    const floorTarget = this.floorTarget;
    if (floor !== null && floorTarget !== null) {
      const fine = dilatedBox(volume, floor.spec);
      if (fine !== null && fine.min[1] < floor.j0 + floor.rows && fine.max[1] >= floor.j0) {
        this.resetSink();
        const local = { min: [fine.min[0], Math.max(0, fine.min[1] - floor.j0), fine.min[2]] as const, max: [fine.max[0], Math.min(floor.rows - 1, fine.max[1] - floor.j0), fine.max[2]] as const };
        this.floorRemoved = carveCells(floorTarget, volume, local, kernelParams(blow, margin, floor.spec.cell), sink).removed;
      }
    }
    return result.removed;
  }

  private resetSink(): void {
    const { sink } = this;
    sink.runs.count = 0;
    sink.indices.count = 0;
    sink.stock.count = 0;
    sink.finish.count = 0;
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
