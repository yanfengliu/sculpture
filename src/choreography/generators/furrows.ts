/**
 * The point's work on a face of the stock (docs/research/technique.md, Stage 2; tools.md, Subbia): layers taken off toward the figure "as one would lift a wax figure out of a pail of water", the highest points of the figure appearing first.
 * A face carries a raster of columns running inward; each column's march through the step's starting stock gives where its stone begins and where the figure plus the step's margin stops it; a column that meets no figure runs to where its stone ends, but no farther than the block's middle from a side face (the other side takes the rest, so the two do not strike the same air) and not at all from the top (the sides clear what stands beside the figure). The region's box bounds the work; its facing predicate is not applied, because a column takes down whatever stands in front of the figure whichever way that surface faces, as a relief does, and `keep` names the one region whose stop points are left alone (the crown's crust).
 * The planner keeps a model of the surface it has made: a crater lowers to its floor every column under it whose surface lies within the crater's depth, a stroke lowers its own column by its depth, so each blow lands on the surface the blows before it left, and a column is struck only while stone stands above its stop. `furrowsPhases` runs several phases (the bulk craters, then the sculptor's stroke) over one shared model, so a later phase lands on what the earlier one cut (src/choreography/shaft.test.ts and src/stock/connectivity.test.ts check the result).
 * Passes are the outer loop: a pass takes one layer off every column that still stands proud, the shallowest surfaces first so no plate is left standing over a deeper cut, and among equals in the water-rule order (the columns whose stop is nearest the face first, so the knee, the hand and the chest come out before the hollows). Bulk cuts (blows at or above the tools' bulk size, struck steeply) are craters sized and placed with seeded irregularity, each covering its columns with a margin so no pillar or sliver survives between neighbours. The sculptor's stroke (the 45-degree point) runs in furrows along a diagonal of the face, the diagonal alternating between neighbouring runs as on the Prisoners, each run one stroke, and the shaft kept clear of the stone.
 */
import type { Blow, PlanContext, RegionDef, Vec3 } from '../../contracts/making';
import { AIR_EXTENSION, BULK_CUT_SIZE_M, BULK_RADIUS_RATIO } from '../../stock/tool-volumes';
import { blowAt, firstEntry, inRegion, mulberry32 } from './surface';

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
  /** Most passes per face, a guard against a region deeper than the stage should cut. */
  readonly maxPasses?: number;
  /** Spacing of the surface raster, metres; a quarter of the pitch for bulk craters and the pitch for strokes when absent. */
  readonly raster?: number;
  /** Seeded irregularity of the bulk craters as a fraction of their size and spacing; a quarter when absent, none for strokes. */
  readonly jitter?: number;
  /** A region whose figure points are left untouched: columns stopping on it are not struck (the crown keeps its crust). */
  readonly keep?: RegionDef;
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
  /** Row axis (furrow direction) and column axis (rows stack along it, top first). */
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

/** The two diagonals of a face the stroke furrows follow, alternating between runs. */
const DIAGONALS: readonly (readonly [number, number])[] = [
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
];
/** How far back along the shaft the stone must be clear, metres (the handle end of a 25 cm point). */
const SHAFT_CLEARANCE = 0.16;

function axisIndex(v: Vec3): number {
  return v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
}

/** One column of the raster: its place on the face, where its stone begins and ends in the starting stock, and the surface the plan has made so far. */
interface Column {
  readonly u: number;
  readonly v: number;
  readonly start: Vec3;
  /** Depth along the column where the stone begins, or null when the column holds none. */
  readonly entry: number | null;
  /** Depth where the figure plus margin stops the column, or where its stone ends. */
  readonly stop: number;
  /** False when the stop point lies in the region the step keeps. */
  readonly wanted: boolean;
  surface: number;
  /** The pass in which a crater covered this column with a margin, so it is not struck again that pass. */
  covered: number;
}

/** Marches one column through the starting stock: where its stone begins, the margin stop (the figure plus margin, or where the column's last stone ends when it meets no figure) and the figure's normal at a figure stop. */
function march(ctx: PlanContext, frame: FaceFrame, start: Vec3, length: number): { entry: number | null; stop: number; stopNormal: Vec3 | null } {
  const step = ctx.cell * 0.5;
  const at = (s: number): Vec3 => [start[0] + frame.inward[0] * s, start[1] + frame.inward[1] * s, start[2] + frame.inward[2] * s];
  let entry: number | null = null;
  let last = 0;
  for (let s = 0; s <= length + 1e-9; s += step) {
    const p = at(s);
    if (ctx.stock.sample(p[0], p[1], p[2]) <= 0) {
      if (entry === null) entry = s;
      last = s;
    }
    if (ctx.figure.sample(p[0], p[1], p[2]) - ctx.margin <= 0) {
      const q = at(Math.max(0, s - step));
      return { entry, stop: Math.max(0, s - step), stopNormal: ctx.figure.gradient(q[0], q[1], q[2]) };
    }
  }
  return { entry, stop: entry === null ? length : Math.min(length, last + step), stopNormal: null };
}

/** How far a column that meets no figure may run: a side face stops at the block's middle (the other side takes the rest), the top face leaves such columns to the sides, the front and back faces run to their relief plane. */
function throughLimit(face: Face, length: number): number {
  if (face === 'top') return 0;
  return face === 'left' || face === 'right' ? length / 2 : length;
}

/** The columns of one face over `box`, with the surface model the phases share. */
class FaceModel {
  readonly columns: Column[] = [];
  readonly rows: number;
  readonly cols: number;
  readonly frame: FaceFrame;
  private readonly ri: number;
  private readonly ci: number;

  constructor(
    ctx: PlanContext,
    face: Face,
    box: RegionDef,
    readonly raster: number,
    keep: RegionDef | undefined,
  ) {
    this.frame = FACES[face];
    const frame = this.frame;
    this.ri = axisIndex(frame.row);
    this.ci = axisIndex(frame.column);
    const ii = axisIndex(frame.inward);
    const uMin = box.min[this.ri] ?? 0;
    const uMax = box.max[this.ri] ?? 0;
    const vMin = box.min[this.ci] ?? 0;
    const vMax = box.max[this.ci] ?? 0;
    this.cols = Math.max(1, Math.round((uMax - uMin) / raster));
    this.rows = Math.max(1, Math.round((vMax - vMin) / raster));
    const into = frame.inward[ii] ?? 1;
    const faceAt = into < 0 ? (box.max[ii] ?? 0) : (box.min[ii] ?? 0);
    const length = (box.max[ii] ?? 0) - (box.min[ii] ?? 0);
    // Rows run from the top of the face down; the raster is centred so its first and last cells lie within half a spacing of the box's edges.
    for (let r = 0; r < this.rows; r += 1) {
      const v = (frame.column[this.ci] ?? -1) < 0 ? vMax - ((r + 0.5) * (vMax - vMin)) / this.rows : vMin + ((r + 0.5) * (vMax - vMin)) / this.rows;
      for (let c = 0; c < this.cols; c += 1) {
        const u = uMin + ((c + 0.5) * (uMax - uMin)) / this.cols;
        const start: [number, number, number] = [0, 0, 0];
        start[this.ri] = u;
        start[this.ci] = v;
        start[ii] = faceAt;
        const marched = march(ctx, frame, start, length);
        const { entry, stopNormal } = marched;
        const stop = stopNormal === null ? Math.min(marched.stop, throughLimit(face, length)) : marched.stop;
        const stopPoint: Vec3 = [start[0] + frame.inward[0] * stop, start[1] + frame.inward[1] * stop, start[2] + frame.inward[2] * stop];
        const wanted = keep === undefined || stopNormal === null ? true : !inRegion(keep, stopPoint, stopNormal);
        this.columns.push({ u, v, start, entry, stop, wanted, surface: entry ?? Number.POSITIVE_INFINITY, covered: -1 });
      }
    }
  }

  at(r: number, c: number): Column | undefined {
    return r < 0 || c < 0 || r >= this.rows || c >= this.cols ? undefined : this.columns[r * this.cols + c];
  }

  pointOf(column: Column, depth: number): Vec3 {
    const { inward } = this.frame;
    return [column.start[0] + inward[0] * depth, column.start[1] + inward[1] * depth, column.start[2] + inward[2] * depth];
  }

  /** Whether the column lies in the phase's region box on the face. */
  inBox(column: Column, box: RegionDef): boolean {
    return column.u >= (box.min[this.ri] ?? 0) && column.u <= (box.max[this.ri] ?? 0) && column.v >= (box.min[this.ci] ?? 0) && column.v <= (box.max[this.ci] ?? 0);
  }
}

/** Whether the column still has stone to take above its stop. */
function proud(column: Column, cell: number): boolean {
  return column.entry !== null && column.wanted && column.surface < column.stop - cell * 0.25;
}

/** The stroke blow whose shaft stays out of the starting stock: the run's direction first, then its reverse, each at the documented angle and then at a steeper lean within the point's range; failing all, the clearest. */
function clearStroke(ctx: PlanContext, point: Vec3, normal: Vec3, along: Vec3, angle: number, size: number, stroke: number): Blow {
  const back: Vec3 = [-along[0], -along[1], -along[2]];
  let best: Blow | null = null;
  let bestClear = -1;
  for (const lean of [angle, 50]) {
    for (const dir of [along, back]) {
      const blow = blowAt('point', point, normal, dir, lean, size, stroke);
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
  return best ?? blowAt('point', point, normal, along, angle, size, stroke);
}

/** Plans one phase's blows over a face model; `strokeBase` numbers the strokes across phases and the count after is returned. */
function planPhase(ctx: PlanContext, model: FaceModel, options: FurrowsOptions, box: RegionDef, random: () => number, blows: Blow[], strokeBase: number): number {
  const { frame, raster } = model;
  const bulk = options.size >= BULK_CUT_SIZE_M;
  const jitter = options.jitter ?? (bulk ? 0.25 : 0);
  const maxPasses = options.maxPasses ?? 64;
  let stroke = strokeBase;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    // Shallowest surfaces first, so no plate is left over a deeper cut; among equals the water rule, the stop nearest the face first.
    const order: number[] = [];
    model.columns.forEach((column, index) => {
      if (proud(column, ctx.cell) && model.inBox(column, box)) order.push(index);
    });
    if (order.length === 0) break;
    order.sort((a, b) => (model.columns[a]?.surface ?? 0) - (model.columns[b]?.surface ?? 0) || (model.columns[a]?.stop ?? 0) - (model.columns[b]?.stop ?? 0) || a - b);
    let struck = 0;
    if (bulk) {
      for (const index of order) {
        const column = model.columns[index];
        if (column === undefined || column.covered === pass || !proud(column, ctx.cell)) continue;
        const size = options.size * (1 + jitter * (random() * 2 - 1));
        const r = Math.floor(index / model.cols);
        const c = index % model.cols;
        const du = jitter * raster * (random() * 2 - 1);
        const dv = jitter * raster * (random() * 2 - 1);
        const depth = column.surface;
        const centre: Vec3 = [column.start[0] + frame.row[0] * du + frame.column[0] * dv, column.start[1] + frame.row[1] * du + frame.column[1] * dv, column.start[2] + frame.row[2] * du + frame.column[2] * dv];
        const point: Vec3 = [centre[0] + frame.inward[0] * depth, centre[1] + frame.inward[1] * depth, centre[2] + frame.inward[2] * depth];
        const lean = random() < 0.5 ? frame.row : ([-frame.row[0], -frame.row[1], -frame.row[2]] as const);
        blows.push(blowAt('point', point, frame.outwardNormal, lean, options.angle, size, stroke));
        stroke += 1;
        struck += 1;
        // The crater's floor: every column under the crater whose surface lies between the crater's open top and its floor is taken down to the floor, or to its own stop; a column inside it by half a raster cell or more is covered for this pass, so the stone between raster cells is always under some crater.
        const radius = BULK_RADIUS_RATIO * size;
        const reach = Math.ceil((radius + Math.abs(du) + Math.abs(dv)) / raster);
        for (let rr = r - reach; rr <= r + reach; rr += 1) {
          for (let cc = c - reach; cc <= c + reach; cc += 1) {
            const other = model.at(rr, cc);
            if (other === undefined || other.entry === null) continue;
            const far = Math.hypot(other.u - (column.u + du), other.v - (column.v + dv));
            if (far > radius) continue;
            const floor = Math.min(depth + size, other.stop);
            if (other.surface >= depth - AIR_EXTENSION && other.surface < floor) other.surface = floor;
            if (far <= radius - raster * Math.SQRT1_2) other.covered = pass;
          }
        }
      }
    } else {
      // Strokes: furrows along a diagonal of the face, each run one stroke, the diagonal alternating between runs.
      const visited = new Set<number>();
      for (const index of order) {
        const column = model.columns[index];
        if (column === undefined || visited.has(index) || !proud(column, ctx.cell)) continue;
        const diagonal: readonly [number, number] = DIAGONALS[stroke % DIAGONALS.length] ?? [Math.SQRT1_2, Math.SQRT1_2];
        const along: Vec3 = [frame.row[0] * diagonal[0] + frame.column[0] * diagonal[1], frame.row[1] * diagonal[0] + frame.column[1] * diagonal[1], frame.row[2] * diagonal[0] + frame.column[2] * diagonal[1]];
        let r = Math.floor(index / model.cols);
        let c = index % model.cols;
        let runLength = 0;
        for (;;) {
          const here = model.at(r, c);
          const hereIndex = r * model.cols + c;
          if (here === undefined || visited.has(hereIndex) || !proud(here, ctx.cell) || !model.inBox(here, box)) break;
          visited.add(hereIndex);
          blows.push(clearStroke(ctx, model.pointOf(here, here.surface), frame.outwardNormal, along, options.angle, options.size, stroke));
          here.surface = Math.min(here.surface + options.size, here.stop);
          struck += 1;
          runLength += 1;
          // Rows count down the face and columns across it: the diagonal steps one of each.
          r += diagonal[1] < 0 ? 1 : -1;
          c += diagonal[0] > 0 ? 1 : -1;
        }
        if (runLength > 0) stroke += 1;
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

/** Plans the phases in order over one surface model per face, so each lands on what the earlier ones cut; the step's region bounds a phase without one of its own. */
export function furrowsPhases(ctx: PlanContext, phases: readonly FurrowsPhase[]): Blow[] {
  const random = mulberry32(ctx.seed);
  const blows: Blow[] = [];
  const box = unionBox(ctx, phases);
  const faces = new Set<Face>();
  for (const phase of phases) for (const face of phase.options.faces) faces.add(face);
  const raster = Math.min(...phases.map((phase) => phase.options.raster ?? (phase.options.size >= BULK_CUT_SIZE_M ? phase.options.pitch / 4 : phase.options.pitch)));
  const keep = phases.find((phase) => phase.options.keep !== undefined)?.options.keep;
  const models = new Map<Face, FaceModel>();
  for (const face of faces) models.set(face, new FaceModel(ctx, face, box, raster, keep));
  let stroke = 0;
  for (const phase of phases) {
    for (const face of phase.options.faces) {
      const model = models.get(face);
      if (model !== undefined) stroke = planPhase(ctx, model, phase.options, phase.region ?? ctx.region, random, blows, stroke);
    }
  }
  return blows;
}

export function furrows(ctx: PlanContext, options: FurrowsOptions): Blow[] {
  return furrowsPhases(ctx, [{ options }]);
}
