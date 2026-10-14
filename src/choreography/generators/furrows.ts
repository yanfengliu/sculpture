/**
 * The point's work on a face of the stock (docs/research/technique.md, Stage 2; tools.md, Subbia): layers taken off toward the figure "as one would lift a wax figure out of a pail of water", the highest points of the figure appearing first.
 * A face carries a raster of columns running inward. Each column knows where the figure plus the step's margin stops it (or where its run ends when it meets no figure: the relief plane from the front or the back, the block's middle from a side, nowhere from the top, which only clears what stands over the figure) and whether its stop point is in the phase's region (the region's `contains` predicate on the figure's normal there; a column that meets no figure is kept) and outside `keep` (the crown's crust). Where its stone begins is read, before every blow, from a scratch copy of the stock (./scratch.ts) that the planner carves with each blow it plans, so each blow lands on the surface the blows before it left, its normal is that surface's gradient, and a blow that would meet air is left out.
 * The scratch is a 2 cm lattice (ROUGHING_SCRATCH_CELL) whatever the stock's own cell: a crater is 36 cm wide and a furrow 10 to 30 cm long, so the point's work needs no finer surface, and at the page's 8 mm the full-resolution copy cost each roughing step 2 to 4 s to plan (2026-10-13, docs/devlog/summary.md). The columns march and the entries are read at half that cell. The finishing passes (./combing.ts, ./rasping.ts) keep the full-resolution scratch, since they chase the allowance to within a cell.
 * Passes are the outer loop: a pass takes one layer off every column that still stands proud, so the whole face comes down together and the figure emerges evenly. Within a pass the order is Vasari's: the first blow falls on the column whose stop is nearest the face (the knee, the hand, the chest), and the work spreads from there over the raster's neighbours, always to the neighbour whose figure lies highest, lower rows before higher in a tie, so the cut grows outward and downward from the high points and never hops across the face.
 * Bulk cuts (blows at or above the tools' bulk size, struck steeply) are craters sized and placed with seeded irregularity, each covering its neighbours for the pass so no pillar or sliver stands between them. The sculptor's stroke (the 45-degree point) runs in furrows along the form: the furrow follows the contour of the figure under it (around a mass, along a limb), turned a little one way or the other in alternation between neighbouring runs so the field reads as crossing diagonals, as on the Prisoners; each run is one stroke of 10 to 30 cm, and the shaft is kept clear of the stone.
 */
import type { Blow, PlanContext, RegionDef, Vec3 } from '../../contracts/making';
import { BULK_CUT_SIZE_M, BULK_RADIUS_RATIO } from '../../stock/tool-volumes';
import { type Column, type Face, FaceModel, proud } from './face-model';
import { clearFloor, FLOOR_ROWS, type FloorOptions } from './floor';
import { ScratchStock } from './scratch';
import { blowAt, dot, firstEntry, mulberry32 } from './surface';

export type { Face } from './face-model';

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

/** How far back along the shaft the stone must be clear, metres (the handle end of a 25 cm point). */
const SHAFT_CLEARANCE = 0.16;
/** The turn of a stroke furrow off the figure's contour, radians, one way then the other between neighbouring runs (the crossing diagonals of the Prisoners' furrows). */
const FURROW_TURN = (30 * Math.PI) / 180;
/** Longest run of one stroke, metres (tools.md, Subbia, The mark: bands 10 to 30 cm long). */
const RUN_LENGTH = 0.3;
/** Cell size of the scratch the point's work is planned on, metres, where the stock's own is finer (see the header). */
export const ROUGHING_SCRATCH_CELL = 0.02;

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

/**
 * The order of a pass (docs/research/technique.md, Stage 2, Vasari's water rule): the pass starts at the live column whose figure lies highest (nearest the face) and grows from there as a patch over the raster's neighbours: the next column is the frontier's lowest in distance from the pass's start, plus how much lower its figure lies than the start's, plus twice its distance from the last column struck, so the cut spreads outward from the high point, leans toward the high ground and moves on to a near column rather than hopping across the face; when the frontier is empty the same rule picks among every live column, so a pass that mops up scattered columns still works outward from where it began (src/choreography/roughing-order.test.ts holds the first blow of every layer to the high points and the spread to growing).
 * One exception keeps the stone whole: a live column inside the chosen column's crater footprint whose stone stands a layer shallower (a pillar the last pass left between its craters) is struck first, since the deeper crater beside it would cut the stone from under it and set it adrift (src/stock/connectivity.test.ts). Until 2026-10-14 every pillar of the face was struck before each pass began and the frontier's highest column came next wherever it lay, so the later layers started wherever a pillar stood and the strikes hopped over the face.
 */
class Spread {
  private readonly frontier = new Set<number>();
  private start: Column | null = null;
  private last: Column | null = null;

  constructor(
    private readonly model: FaceModel,
    private readonly live: (column: Column) => boolean,
    /** The layer a column's stone stands in: its entry in units of half a cut. */
    private readonly layer: (column: Column) => number,
    /** Raster cells around a chosen column that its blow may cut: where a shallower pillar is struck first. */
    private readonly footprint: number,
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
    if (this.start === null) {
      for (const column of candidates) {
        if (this.live(column) && (best === null || higher(column, best))) best = column;
      }
      this.start = best;
    } else {
      best = this.nearest(this.frontier, true) ?? this.nearest(candidates.map((column) => column.index), false);
    }
    if (best === null) return null;
    const chosen = this.pillarUnder(best) ?? best;
    this.frontier.delete(chosen.index);
    this.last = chosen;
    return chosen;
  }

  /** The live column of `indices` lowest in distance from the pass's start, plus how much lower its figure lies than the start's, plus twice its distance from the last column struck; dead ones are dropped from the frontier when `prune`. */
  private nearest(indices: Iterable<number>, prune: boolean): Column | null {
    const { start, last } = this;
    if (start === null || last === null) return null;
    let best: Column | null = null;
    let bestKey = Number.POSITIVE_INFINITY;
    for (const index of indices) {
      const column = this.model.columns[index];
      if (column === undefined || !this.live(column)) {
        if (prune) this.frontier.delete(index);
        continue;
      }
      const key = Math.hypot(column.u - start.u, column.v - start.v) + (column.stop - start.stop) + 2 * Math.hypot(column.u - last.u, column.v - last.v);
      if (key < bestKey - 1e-12 || (Math.abs(key - bestKey) <= 1e-12 && best !== null && higher(column, best))) {
        best = column;
        bestKey = key;
      }
    }
    return best;
  }

  /** The shallowest live column within the footprint of `column` whose stone stands in a shallower layer, the highest among equals; null when there is none. */
  private pillarUnder(column: Column): Column | null {
    let pillar: Column | null = null;
    let pillarLayer = this.layer(column);
    const cells = this.footprint;
    for (let rr = column.r - cells; rr <= column.r + cells; rr += 1) {
      for (let cc = column.c - cells; cc <= column.c + cells; cc += 1) {
        const other = this.model.at(rr, cc);
        if (other === undefined || other === column || !this.live(other)) continue;
        const layer = this.layer(other);
        if (layer < pillarLayer || (pillar !== null && layer === pillarLayer && higher(other, pillar))) {
          pillar = other;
          pillarLayer = layer;
        }
      }
    }
    return pillar;
  }
}

/** Whether column `a`'s figure lies higher than `b`'s (its stop nearer the face), lower rows first in a tie, then from the row's start. */
function higher(a: Column, b: Column): boolean {
  return a.stop < b.stop - 1e-9 || (Math.abs(a.stop - b.stop) <= 1e-9 && (a.r > b.r || (a.r === b.r && a.c < b.c)));
}

/** Plans one phase's blows over a face model; `strokeBase` numbers the strokes across phases and the count after is returned. */
function planPhase(ctx: PlanContext, scratch: ScratchStock, model: FaceModel, options: FurrowsOptions, region: RegionDef, random: () => number, blows: Blow[], strokeBase: number, mark: (pass: number, runStart?: Vec3) => void): number {
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
    const footprint = Math.ceil((bulk ? BULK_RADIUS_RATIO * options.size * (1 + jitter) : (options.rowPitch ?? raster) / 2) / raster);
    const spread = new Spread(model, live, (column) => Math.floor((column.entry ?? 0) / (options.size / 2)), footprint);
    let struck = 0;
    for (;;) {
      const column = spread.next(candidates);
      if (column === null) break;
      if (bulk) {
        const size = options.size * (1 + jitter * (random() * 2 - 1));
        const u = column.u + jitter * raster * (random() * 2 - 1);
        const v = Math.max(model.vMin, column.v + jitter * raster * (random() * 2 - 1));
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
        mark(pass);
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
              mark(pass, model.pointAt(column.u, column.v, 0));
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

/** What the planner knew of a blow it kept: the face and the phase it was struck in, the pass (one layer of that face), and whether it was a bulk crater, a stroke of a furrow or a chop of the floor pass. */
export interface FurrowMark {
  readonly face: Face | 'floor';
  readonly phase: number;
  readonly pass: number;
  readonly kind: 'bulk' | 'stroke' | 'floor';
  /** For a stroke, where its run began: the run's first column on the face's plane, whose figure contour the run was turned from (the first blow kept may lie further along when the run's first cut met air). */
  readonly runStart?: Vec3;
}

/** A step's point work: the phases, then the floor pass when `floor` is given (./floor.ts). */
export interface FurrowsPlan {
  readonly blows: Blow[];
  /** One mark per blow, in the blows' order: the plan-order gate's view of the plan (src/choreography/roughing-order.test.ts). */
  readonly marks: FurrowMark[];
}

/** Plans the phases in order over one scratch stock and one column model per face, so each lands on what the earlier ones cut; the step's region bounds a phase without one of its own. With `floor`, a floor pass over the phases' box follows (./floor.ts), from the phases' side faces at the step's margin. */
export function planFurrows(ctx: PlanContext, phases: readonly FurrowsPhase[], floor?: FloorOptions): FurrowsPlan {
  const random = mulberry32(ctx.seed);
  const blows: Blow[] = [];
  const marks: FurrowMark[] = [];
  const scratch = new ScratchStock(ctx, { cell: Math.max(ctx.cell, ROUGHING_SCRATCH_CELL), ...(floor === undefined ? {} : { floorRows: FLOOR_ROWS }) });
  const box = unionBox(ctx, phases);
  const raster = Math.min(...phases.map((phase) => phase.options.raster ?? (phase.options.size >= BULK_CUT_SIZE_M ? phase.options.pitch / 4 : phase.options.pitch)));
  const models = new Map<string, FaceModel>();
  let stroke = 0;
  phases.forEach((phase, index) => {
    const margin = phase.options.margin ?? ctx.margin;
    const kind = phase.options.size >= BULK_CUT_SIZE_M ? 'bulk' : 'stroke';
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
      stroke = planPhase(ctx, scratch, model, phase.options, phase.region ?? ctx.region, random, blows, stroke, (pass, runStart) => marks.push(runStart === undefined ? { face, phase: index, pass, kind } : { face, phase: index, pass, kind, runStart }));
    }
  });
  if (floor !== undefined) {
    const faces = [...new Set(phases.flatMap((phase) => phase.options.faces))];
    clearFloor(ctx, scratch, box, faces, floor, random, blows, stroke, () => marks.push({ face: 'floor', phase: phases.length, pass: 0, kind: 'floor' }));
  }
  return { blows, marks };
}

/** The blows of `planFurrows`. */
export function furrowsPhases(ctx: PlanContext, phases: readonly FurrowsPhase[], floor?: FloorOptions): Blow[] {
  return planFurrows(ctx, phases, floor).blows;
}

export function furrows(ctx: PlanContext, options: FurrowsOptions): Blow[] {
  return furrowsPhases(ctx, [{ options }]);
}
