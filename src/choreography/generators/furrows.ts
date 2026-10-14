/**
 * The point's work on a face of the stock (docs/research/technique.md, Stage 2; tools.md, Subbia): layers taken off toward the figure "as one would lift a wax figure out of a pail of water", the highest points of the figure appearing first.
 * A face carries a raster of columns running inward. Each column knows where the figure plus the step's margin stops it (or where its run ends when it meets no figure: the relief plane from the front or the back, the block's middle from a side, nowhere from the top, which only clears what stands over the figure) and whether its stop point is in the phase's region (the region's `contains` predicate on the figure's normal there; a column that meets no figure is kept) and outside `keep` (the crown's crust). Where its stone begins is read, before every blow, from a scratch copy of the stock (./scratch.ts) that the planner carves with each blow it plans, so each blow lands on the surface the blows before it left, its normal is that surface's gradient, and a blow that would meet air is left out.
 * Passes are the outer loop: a pass takes one layer off every column that still stands proud, so the whole face comes down together and the figure emerges evenly. Within a pass the order is Vasari's: the first blow falls on the column whose stop is nearest the face (the knee, the hand, the chest), and the work spreads from there over the raster's neighbours, always to the neighbour whose figure lies highest, lower rows before higher in a tie, so the cut grows outward and downward from the high points and never hops across the face.
 * Bulk cuts (blows at or above the tools' bulk size, struck steeply) are craters sized and placed with seeded irregularity, each covering its neighbours for the pass so no pillar or sliver stands between them. The sculptor's stroke (the 45-degree point) runs in furrows along the form: the furrow follows the contour of the figure under it (around a mass, along a limb), turned a little one way or the other in alternation between neighbouring runs so the field reads as crossing diagonals, as on the Prisoners; each run is one stroke of 10 to 30 cm, and the shaft is kept clear of the stone.
 */
import type { Blow, PlanContext, RegionDef, Vec3 } from '../../contracts/making';
import { BULK_CUT_SIZE_M, BULK_RADIUS_RATIO } from '../../stock/tool-volumes';
import { ScratchStock } from './scratch';
import { blowAt, dot, firstEntry, firstExit, inRegion, mulberry32, normalize } from './surface';

export type Face = 'front' | 'back' | 'left' | 'right' | 'top';

export interface FurrowsOptions {
  /** Faces to work, in this order. */
  readonly faces: readonly Face[];
  /** Spacing between blows along a furrow, metres; for bulk craters the nominal spacing of the craters. */
  readonly pitch: number;
  /** Spacing between furrows (rows), metres; `pitch` when absent. */
  readonly rowPitch?: number;
  /** Cut depth per blow, metres. */
  readonly size: number;
  /** Tool axis angle to the surface, degrees. */
  readonly angle: number;
  /** Most passes per face: how many layers this step takes, a guard against a region deeper than the stage should cut. */
  readonly maxPasses?: number;
  /** Spacing of the surface raster, metres; a quarter of the pitch for bulk craters and the pitch for strokes when absent. */
  readonly raster?: number;
  /** Seeded irregularity of the bulk craters as a fraction of their size and spacing; a quarter when absent, none for strokes. */
  readonly jitter?: number;
  /** A region whose figure points are left untouched: columns stopping on it are not struck (the crown keeps its crust). */
  readonly keep?: RegionDef;
  /** The allowance this phase stops at, metres, when it is not the step's: the bulk craters of a furrowed step stop a stroke's depth short, so the furrows are what finishes the layer. */
  readonly margin?: number;
}

/** One phase of a step's point work: its options and, when it works a smaller region than the step's, that region. */
export interface FurrowsPhase {
  readonly options: FurrowsOptions;
  readonly region?: RegionDef;
}

interface FaceFrame {
  /** Inward direction. */
  readonly inward: Vec3;
  readonly outwardNormal: Vec3;
  /** Row axis (across the face) and column axis (rows stack along it, top first). */
  readonly row: Vec3;
  readonly column: Vec3;
}

const FACES: Readonly<Record<Face, FaceFrame>> = {
  front: { inward: [0, 0, -1], outwardNormal: [0, 0, 1], row: [1, 0, 0], column: [0, -1, 0] },
  back: { inward: [0, 0, 1], outwardNormal: [0, 0, -1], row: [-1, 0, 0], column: [0, -1, 0] },
  left: { inward: [-1, 0, 0], outwardNormal: [1, 0, 0], row: [0, 0, -1], column: [0, -1, 0] },
  right: { inward: [1, 0, 0], outwardNormal: [-1, 0, 0], row: [0, 0, 1], column: [0, -1, 0] },
  top: { inward: [0, -1, 0], outwardNormal: [0, 1, 0], row: [1, 0, 0], column: [0, 0, -1] },
};

/** How far back along the shaft the stone must be clear, metres (the handle end of a 25 cm point). */
const SHAFT_CLEARANCE = 0.16;
/** The turn of a stroke furrow off the figure's contour, radians, one way then the other between neighbouring runs (the crossing diagonals of the Prisoners' furrows). */
const FURROW_TURN = (30 * Math.PI) / 180;
/** Longest run of one stroke, metres (tools.md, Subbia, The mark: bands 10 to 30 cm long). */
const RUN_LENGTH = 0.3;
/** A blow whose stock normal leans more than about 25 degrees from the face's own (cosine below this) is struck along the face's normal instead: the point works into the face, never sideways into a crater's rim, which would tunnel under the stone beside it and set it adrift (src/stock/connectivity.test.ts). */
const WALL_COSINE = 0.9;

function axisIndex(v: Vec3): number {
  return v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
}

/** One column of the raster. */
interface Column {
  readonly index: number;
  readonly r: number;
  readonly c: number;
  readonly u: number;
  readonly v: number;
  /** Depth along the column where the figure plus margin stops it, or where its run ends when it meets no figure. */
  readonly stop: number;
  readonly stopPoint: Vec3;
  /** The figure's outward normal at the stop point, or null when the column meets no figure. */
  readonly stopNormal: Vec3 | null;
  /** Depth where the scratch stock begins, or null when the column holds no stone; refreshed after every nearby blow. */
  entry: number | null;
  /** The pass in which a crater covered this column or a furrow ran through it, so it is not struck again that pass. */
  covered: number;
}

/** Marches one column through the figure: the margin stop and the figure's normal there, or the run's limit when it meets no figure. */
function marchFigure(ctx: PlanContext, frame: FaceFrame, start: Vec3, length: number, limit: number): { stop: number; stopNormal: Vec3 | null } {
  const step = ctx.cell * 0.5;
  for (let s = 0; s <= length + 1e-9; s += step) {
    const p: Vec3 = [start[0] + frame.inward[0] * s, start[1] + frame.inward[1] * s, start[2] + frame.inward[2] * s];
    if (ctx.figure.sample(p[0], p[1], p[2]) - ctx.margin <= 0) {
      const back = Math.max(0, s - step);
      const q: Vec3 = [start[0] + frame.inward[0] * back, start[1] + frame.inward[1] * back, start[2] + frame.inward[2] * back];
      return { stop: back, stopNormal: ctx.figure.gradient(q[0], q[1], q[2]) };
    }
  }
  return { stop: limit, stopNormal: null };
}

/** How far a column that meets no figure may run: a side face stops at the block's middle (the other side takes the rest), the top face leaves such columns to the sides, the front and back faces run to their relief plane. */
function throughLimit(face: Face, length: number): number {
  if (face === 'top') return 0;
  return face === 'left' || face === 'right' ? length / 2 : length;
}

/** The columns of one face over `box`, read against the scratch. */
class FaceModel {
  readonly columns: Column[] = [];
  readonly rows: number;
  readonly cols: number;
  readonly frame: FaceFrame;
  readonly length: number;
  private readonly ri: number;
  private readonly ci: number;
  private readonly ii: number;
  private readonly faceAt: number;
  private readonly uMin: number;
  private readonly vMin: number;
  private readonly vMax: number;
  private readonly du: number;
  private readonly dv: number;
  /** True when rows count down the face (v falls as r rises). */
  private readonly down: boolean;

  constructor(
    ctx: PlanContext,
    face: Face,
    box: RegionDef,
    readonly raster: number,
    readonly margin: number,
    private readonly scratch: ScratchStock,
  ) {
    this.frame = FACES[face];
    const frame = this.frame;
    this.ri = axisIndex(frame.row);
    this.ci = axisIndex(frame.column);
    this.ii = axisIndex(frame.inward);
    this.uMin = box.min[this.ri] ?? 0;
    const uMax = box.max[this.ri] ?? 0;
    this.vMin = box.min[this.ci] ?? 0;
    this.vMax = box.max[this.ci] ?? 0;
    this.cols = Math.max(1, Math.round((uMax - this.uMin) / raster));
    this.rows = Math.max(1, Math.round((this.vMax - this.vMin) / raster));
    this.du = (uMax - this.uMin) / this.cols;
    this.dv = (this.vMax - this.vMin) / this.rows;
    this.down = (frame.column[this.ci] ?? -1) < 0;
    const into = frame.inward[this.ii] ?? 1;
    this.faceAt = into < 0 ? (box.max[this.ii] ?? 0) : (box.min[this.ii] ?? 0);
    this.length = (box.max[this.ii] ?? 0) - (box.min[this.ii] ?? 0);
    const limit = throughLimit(face, this.length);
    // Rows run from the top of the face down; the raster is centred so its first and last cells lie within half a spacing of the box's edges.
    for (let r = 0; r < this.rows; r += 1) {
      const v = this.down ? this.vMax - (r + 0.5) * this.dv : this.vMin + (r + 0.5) * this.dv;
      for (let c = 0; c < this.cols; c += 1) {
        const u = this.uMin + (c + 0.5) * this.du;
        const start = this.pointAt(u, v, 0);
        const { stop, stopNormal } = marchFigure({ ...ctx, margin }, frame, start, this.length, limit);
        const column: Column = { index: r * this.cols + c, r, c, u, v, stop, stopPoint: this.pointAt(u, v, stop), stopNormal, entry: null, covered: -1 };
        this.refresh(column, 0);
        this.columns.push(column);
      }
    }
  }

  at(r: number, c: number): Column | undefined {
    return r < 0 || c < 0 || r >= this.rows || c >= this.cols ? undefined : this.columns[r * this.cols + c];
  }

  /** The column whose raster cell holds `(u, v)`, or undefined off the face. */
  columnAt(u: number, v: number): Column | undefined {
    const c = Math.floor((u - this.uMin) / this.du);
    const r = Math.floor(this.down ? (this.vMax - v) / this.dv : (v - this.vMin) / this.dv);
    return this.at(r, c);
  }

  /** The world point `depth` along the column through `(u, v)` of the face. */
  pointAt(u: number, v: number, depth: number): Vec3 {
    const p: [number, number, number] = [0, 0, 0];
    p[this.ri] = u;
    p[this.ci] = v;
    p[this.ii] = this.faceAt;
    const { inward } = this.frame;
    return [p[0] + inward[0] * depth, p[1] + inward[1] * depth, p[2] + inward[2] * depth];
  }

  /** The first stone along `(u, v)` near depth `from`, read from the scratch: inward from there, or back outward when `from` is already inside stone; null when the column holds no stone within its run. */
  entryAt(u: number, v: number, from: number): number | null {
    const at = Math.min(Math.max(0, from), this.length);
    const p = this.pointAt(u, v, at);
    const step = this.scratch.cell * 0.5;
    if (this.scratch.sample(p[0], p[1], p[2]) <= 0) {
      const { inward } = this.frame;
      const out = firstExit(this.scratch, p, [-inward[0], -inward[1], -inward[2]], at, step);
      return out === null ? 0 : at - out;
    }
    const hit = firstEntry(this.scratch, p, this.frame.inward, this.length - at, step);
    return hit === null ? null : at + hit;
  }

  /** Re-reads where the column's stone begins, from `from`. */
  refresh(column: Column, from: number): void {
    column.entry = this.entryAt(column.u, column.v, from);
  }

  /** Refreshes every column within `reach` metres of `(u, v)` after a blow there. */
  refreshAround(u: number, v: number, reach: number): void {
    const centre = this.columnAt(u, v);
    if (centre === undefined) return;
    const cells = Math.ceil(reach / this.raster);
    for (let rr = centre.r - cells; rr <= centre.r + cells; rr += 1) {
      for (let cc = centre.c - cells; cc <= centre.c + cells; cc += 1) {
        const column = this.at(rr, cc);
        if (column === undefined || column.entry === null || Math.hypot(column.u - u, column.v - v) > reach) continue;
        this.refresh(column, column.entry - this.scratch.cell);
      }
    }
  }

  /** Whether the column lies in the phase's region box on the face. */
  inBox(column: Column, box: RegionDef): boolean {
    return column.u >= (box.min[this.ri] ?? 0) && column.u <= (box.max[this.ri] ?? 0) && column.v >= (box.min[this.ci] ?? 0) && column.v <= (box.max[this.ci] ?? 0);
  }

  /** Whether the column's stop point is the phase's to cut: in the region (by the figure's normal there) and outside the kept one; a column meeting no figure is wanted. */
  wanted(column: Column, region: RegionDef, keep: RegionDef | undefined): boolean {
    if (column.stopNormal === null) return true;
    return inRegion(region, column.stopPoint, column.stopNormal) && (keep === undefined || !inRegion(keep, column.stopPoint, column.stopNormal));
  }

  /** The in-face direction of the figure's contour under the column (perpendicular to the figure normal's part in the face), or the face's diagonal where the figure faces the column squarely or is absent. */
  contourOf(column: Column): Vec3 {
    const { frame } = this;
    const n = column.stopNormal;
    if (n !== null) {
      const nu = dot(n, frame.row);
      const nv = dot(n, frame.column);
      if (Math.hypot(nu, nv) > 0.15) {
        const along = normalize([nu, nv, 0]);
        return [frame.row[0] * -along[1] + frame.column[0] * along[0], frame.row[1] * -along[1] + frame.column[1] * along[0], frame.row[2] * -along[1] + frame.column[2] * along[0]];
      }
    }
    return [(frame.row[0] + frame.column[0]) * Math.SQRT1_2, (frame.row[1] + frame.column[1]) * Math.SQRT1_2, (frame.row[2] + frame.column[2]) * Math.SQRT1_2];
  }

  /** `along` turned by `angle` within the face. */
  turn(along: Vec3, angle: number): Vec3 {
    const { frame } = this;
    const au = dot(along, frame.row);
    const av = dot(along, frame.column);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tu = au * cos - av * sin;
    const tv = au * sin + av * cos;
    return [frame.row[0] * tu + frame.column[0] * tv, frame.row[1] * tu + frame.column[1] * tv, frame.row[2] * tu + frame.column[2] * tv];
  }

  /** A stroke's normal: the scratch surface's gradient at the point, or the face's normal where the gradient turns into a wall. */
  normalAt(point: Vec3): Vec3 {
    const gradient = this.scratch.normalAt(point);
    return dot(gradient, this.frame.outwardNormal) < WALL_COSINE ? this.frame.outwardNormal : gradient;
  }
}

/** Whether the column still has stone to take above its stop. */
function proud(column: Column, cell: number): boolean {
  return column.entry !== null && column.entry < column.stop - cell * 0.25;
}

/** The stroke blow whose shaft stays out of the stock: the run's direction first, then its reverse, each at the documented angle and then at a steeper lean within the point's range; failing all, the clearest. */
function clearStroke(scratch: ScratchStock, point: Vec3, normal: Vec3, along: Vec3, angle: number, size: number, stroke: number): Blow {
  const back: Vec3 = [-along[0], -along[1], -along[2]];
  let best: Blow | null = null;
  let bestClear = -1;
  for (const lean of [angle, 50]) {
    for (const dir of [along, back]) {
      const blow = blowAt('point', point, normal, dir, lean, size, stroke);
      const shaft: Vec3 = [-blow.direction[0], -blow.direction[1], -blow.direction[2]];
      const from: Vec3 = [point[0] + shaft[0] * scratch.cell, point[1] + shaft[1] * scratch.cell, point[2] + shaft[2] * scratch.cell];
      const hit = firstEntry(scratch, from, shaft, SHAFT_CLEARANCE, scratch.cell * 0.5);
      if (hit === null) return blow;
      if (hit > bestClear) {
        bestClear = hit;
        best = blow;
      }
    }
  }
  return best ?? blowAt('point', point, normal, along, angle, size, stroke);
}

/** The order of a pass: the work spreads from the column whose figure lies highest over the raster's neighbours, to the highest of them each time, lower rows first in a tie; when the spread has nowhere to go it starts again at the highest column left. Before all that, a column whose stone stands a layer shallower than its neighbours' (a pillar the last pass left between its craters) is struck first, so no crater beside it cuts the floor from under it and sets it adrift (src/stock/connectivity.test.ts). */
class Spread {
  private readonly frontier = new Set<number>();

  constructor(
    private readonly model: FaceModel,
    private readonly live: (column: Column) => boolean,
    /** The layer a column's stone stands in: its entry in units of half a cut. */
    private readonly layer: (column: Column) => number,
  ) {}

  /** Adds the live columns within `cells` raster cells of `column` to the frontier. */
  reach(column: Column, cells: number): void {
    for (let rr = column.r - cells; rr <= column.r + cells; rr += 1) {
      for (let cc = column.c - cells; cc <= column.c + cells; cc += 1) {
        const other = this.model.at(rr, cc);
        if (other !== undefined && other !== column && this.live(other)) this.frontier.add(other.index);
      }
    }
  }

  /** The next column to strike, or null when none is left. */
  next(candidates: readonly Column[]): Column | null {
    let best: Column | null = null;
    for (const index of this.frontier) {
      const column = this.model.columns[index];
      if (column === undefined || !this.live(column)) {
        this.frontier.delete(index);
        continue;
      }
      if (best === null || this.before(column, best)) best = column;
    }
    if (best === null) {
      for (const column of candidates) {
        if (this.live(column) && (best === null || this.before(column, best))) best = column;
      }
    }
    if (best !== null) this.frontier.delete(best.index);
    return best;
  }

  private before(a: Column, b: Column): boolean {
    const la = this.layer(a);
    const lb = this.layer(b);
    if (la !== lb) return la < lb;
    return a.stop < b.stop - 1e-9 || (Math.abs(a.stop - b.stop) <= 1e-9 && (a.r > b.r || (a.r === b.r && a.c < b.c)));
  }
}

/** Plans one phase's blows over a face model; `strokeBase` numbers the strokes across phases and the count after is returned. */
function planPhase(ctx: PlanContext, scratch: ScratchStock, model: FaceModel, options: FurrowsOptions, region: RegionDef, random: () => number, blows: Blow[], strokeBase: number): number {
  const { frame, raster } = model;
  const cell = scratch.cell;
  const margin = options.margin ?? ctx.margin;
  const bulk = options.size >= BULK_CUT_SIZE_M;
  const jitter = options.jitter ?? (bulk ? 0.25 : 0);
  const maxPasses = options.maxPasses ?? 64;
  let stroke = strokeBase;
  let turnSign = 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const live = (column: Column): boolean => column.covered !== pass && proud(column, cell) && model.inBox(column, region) && model.wanted(column, region, options.keep);
    const candidates = model.columns.filter(live);
    if (candidates.length === 0) break;
    const spread = new Spread(model, live, (column) => Math.floor((column.entry ?? 0) / (options.size / 2)));
    let struck = 0;
    for (;;) {
      const column = spread.next(candidates);
      if (column === null) break;
      if (bulk) {
        const size = options.size * (1 + jitter * (random() * 2 - 1));
        const u = column.u + jitter * raster * (random() * 2 - 1);
        const v = column.v + jitter * raster * (random() * 2 - 1);
        const depth = model.entryAt(u, v, (column.entry ?? 0) - 2 * cell) ?? column.entry ?? 0;
        const point = model.pointAt(u, v, depth);
        const lean = random() < 0.5 ? frame.row : ([-frame.row[0], -frame.row[1], -frame.row[2]] as const);
        // A crater is driven into the face along its normal: one shown bulk blow stands for a field of pits struck into the face, and a crater tilted to a rim's gradient would tunnel under the stone beside it.
        const blow = blowAt('point', point, frame.outwardNormal, lean, options.angle, size, stroke);
        const removed = scratch.carve(blow, margin);
        const radius = BULK_RADIUS_RATIO * size;
        column.covered = pass;
        // The crater covers its neighbours for this pass: a column inside it by half a raster cell or more is not struck again, so the stone between raster cells is always under some crater.
        const cells = Math.ceil((radius + Math.abs(u - column.u) + Math.abs(v - column.v)) / raster);
        for (let rr = column.r - cells; rr <= column.r + cells; rr += 1) {
          for (let cc = column.c - cells; cc <= column.c + cells; cc += 1) {
            const other = model.at(rr, cc);
            if (other !== undefined && Math.hypot(other.u - u, other.v - v) <= radius - raster * Math.SQRT1_2) other.covered = pass;
          }
        }
        if (!scratch.struckStone(removed)) continue;
        blows.push(blow);
        stroke += 1;
        struck += 1;
        model.refreshAround(u, v, radius + raster);
        spread.reach(column, cells + 1);
      } else {
        // A stroke: a furrow along the figure's contour, turned one way then the other between runs, each run one stroke.
        const along = model.turn(model.contourOf(column), turnSign * FURROW_TURN);
        turnSign = -turnSign;
        const stepU = dot(along, frame.row) * raster;
        const stepV = dot(along, frame.column) * raster;
        const halfRow = (options.rowPitch ?? raster) / 2;
        const sideCells = Math.ceil(halfRow / raster);
        let u = column.u;
        let v = column.v;
        let runLength = 0;
        let here: Column | undefined = column;
        while (here !== undefined && live(here) && runLength < RUN_LENGTH) {
          // The run covers a band `rowPitch` wide, so the next furrow runs that far off.
          for (let rr = here.r - sideCells; rr <= here.r + sideCells; rr += 1) {
            for (let cc = here.c - sideCells; cc <= here.c + sideCells; cc += 1) {
              const other = model.at(rr, cc);
              if (other !== undefined && Math.hypot(other.u - u, other.v - v) < halfRow) other.covered = pass;
            }
          }
          here.covered = pass;
          const depth = model.entryAt(u, v, (here.entry ?? 0) - 2 * cell);
          if (depth !== null) {
            const point = model.pointAt(u, v, depth);
            const blow = clearStroke(scratch, point, model.normalAt(point), along, options.angle, options.size, stroke);
            const removed = scratch.carve(blow, margin);
            if (scratch.struckStone(removed)) {
              blows.push(blow);
              struck += 1;
              model.refreshAround(u, v, options.size * 2 + raster);
            }
          }
          spread.reach(here, sideCells + 1);
          u += stepU;
          v += stepV;
          runLength += raster;
          here = model.columnAt(u, v);
        }
        stroke += 1;
      }
    }
    if (struck === 0) break;
  }
  return stroke;
}

/** The box holding every phase's region. */
function unionBox(ctx: PlanContext, phases: readonly FurrowsPhase[]): RegionDef {
  const min: [number, number, number] = [...ctx.region.min];
  const max: [number, number, number] = [...ctx.region.max];
  for (const phase of phases) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? 0, phase.region?.min[axis] ?? min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? 0, phase.region?.max[axis] ?? max[axis] ?? 0);
    }
  }
  return { label: ctx.region.label, min, max };
}

/** Plans the phases in order over one scratch stock and one column model per face, so each lands on what the earlier ones cut; the step's region bounds a phase without one of its own. */
export function furrowsPhases(ctx: PlanContext, phases: readonly FurrowsPhase[]): Blow[] {
  const random = mulberry32(ctx.seed);
  const blows: Blow[] = [];
  const scratch = new ScratchStock(ctx);
  const box = unionBox(ctx, phases);
  const raster = Math.min(...phases.map((phase) => phase.options.raster ?? (phase.options.size >= BULK_CUT_SIZE_M ? phase.options.pitch / 4 : phase.options.pitch)));
  const models = new Map<string, FaceModel>();
  let stroke = 0;
  for (const phase of phases) {
    const margin = phase.options.margin ?? ctx.margin;
    for (const face of phase.options.faces) {
      const key = `${face}:${String(margin)}`;
      let model = models.get(key);
      if (model === undefined) {
        model = new FaceModel(ctx, face, box, raster, margin, scratch);
        models.set(key, model);
      } else {
        // Another face or phase has cut since this model last read the scratch.
        for (const column of model.columns) if (column.entry !== null) model.refresh(column, column.entry - scratch.cell);
      }
      stroke = planPhase(ctx, scratch, model, phase.options, phase.region ?? ctx.region, random, blows, stroke);
    }
  }
  return blows;
}

export function furrows(ctx: PlanContext, options: FurrowsOptions): Blow[] {
  return furrowsPhases(ctx, [{ options }]);
}
