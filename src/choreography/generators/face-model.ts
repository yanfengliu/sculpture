/**
 * The faces of the block as the point works them (docs/research/technique.md, Stage 2; ./furrows.ts): each face's frame, and the raster of columns running inward from it, read against the planner's scratch stock (./scratch.ts).
 * A column knows where the figure plus the phase's margin stops it (or where its run ends when it meets no figure: the relief plane from the front or the back, the block's middle from a side, nowhere from the top), whether its stop point is in the phase's region, and where its stone begins on the scratch, re-read after every nearby blow.
 */
import type { PlanContext, RegionDef, Vec3 } from '../../contracts/making';
import type { ScratchStock } from './scratch';
import { dot, firstEntry, firstExit, inRegion, normalize } from './surface';

export type Face = 'front' | 'back' | 'left' | 'right' | 'top';

export interface FaceFrame {
  /** Inward direction. */
  readonly inward: Vec3;
  readonly outwardNormal: Vec3;
  /** Row axis (across the face) and column axis (rows stack along it, top first). */
  readonly row: Vec3;
  readonly column: Vec3;
}

export const FACES: Readonly<Record<Face, FaceFrame>> = {
  front: { inward: [0, 0, -1], outwardNormal: [0, 0, 1], row: [1, 0, 0], column: [0, -1, 0] },
  back: { inward: [0, 0, 1], outwardNormal: [0, 0, -1], row: [-1, 0, 0], column: [0, -1, 0] },
  left: { inward: [-1, 0, 0], outwardNormal: [1, 0, 0], row: [0, 0, -1], column: [0, -1, 0] },
  right: { inward: [1, 0, 0], outwardNormal: [-1, 0, 0], row: [0, 0, 1], column: [0, -1, 0] },
  top: { inward: [0, -1, 0], outwardNormal: [0, 1, 0], row: [1, 0, 0], column: [0, 0, -1] },
};

/** A blow whose stock normal leans more than about 25 degrees from the face's own (cosine below this) is struck along the face's normal instead: the point works into the face, never sideways into a crater's rim, which would tunnel under the stone beside it and set it adrift (src/stock/connectivity.test.ts). */
const WALL_COSINE = 0.9;
/**
 * The raster's lowest row runs this far above the region box's lower edge, in scratch cells, not half a raster spacing (2.5 cm for the craters): a column reads stone only along its own line, and the region boxes start at the block's floor, so a ridge lower than the lowest line stood on the floor unseen by every face's columns and no crater was struck at it. With the 2 cm scratch the last crater's rim left 2 to 8 cm of stone there that the next step's columns could not see either (the floor stubs of the slow test, 2026-10-14: 160 cells behind the mannequin's base, 47 and 63 on the David). A quarter cell puts the line inside the floor's first row of stone on either lattice.
 */
const FLOOR_LINE_CELLS = 0.25;

function axisIndex(v: Vec3): number {
  return v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
}

/** One column of the raster. */
export interface Column {
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

/** Marches one column through the figure at `step` metres: the margin stop and the figure's normal there, or the run's limit when it meets no figure. */
function marchFigure(ctx: PlanContext, frame: FaceFrame, start: Vec3, length: number, limit: number, step: number): { stop: number; stopNormal: Vec3 | null } {
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
export class FaceModel {
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
  /** The box's lower edge along the column axis: a jittered crater is kept above it, so none is centred under the block's floor (for the top face, whose column axis is z, the edge is the box's back, outside the block, where the clamp does nothing). */
  readonly vMin: number;
  /** The line of row 0 along the column axis, and the signed step from one row's line to the next (rows run top first, so the step is negative when the column axis points down). */
  private readonly v0: number;
  private readonly dvRow: number;
  private readonly du: number;
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
    const vMin = box.min[this.ci] ?? 0;
    const vMax = box.max[this.ci] ?? 0;
    this.vMin = vMin;
    this.cols = Math.max(1, Math.round((uMax - this.uMin) / raster));
    this.rows = Math.max(1, Math.round((vMax - vMin) / raster));
    this.du = (uMax - this.uMin) / this.cols;
    const dv = (vMax - vMin) / this.rows;
    this.down = (frame.column[this.ci] ?? -1) < 0;
    // Rows run from the top of the face down, `dv` apart, the lowest a quarter scratch cell above the box's lower edge (FLOOR_LINE_CELLS); the columns are centred in u, within half a spacing of the box's sides, which lie outside the block.
    const lowest = vMin + FLOOR_LINE_CELLS * scratch.cell;
    this.v0 = this.down ? lowest + (this.rows - 1) * dv : lowest;
    this.dvRow = this.down ? -dv : dv;
    const into = frame.inward[this.ii] ?? 1;
    this.faceAt = into < 0 ? (box.max[this.ii] ?? 0) : (box.min[this.ii] ?? 0);
    this.length = (box.max[this.ii] ?? 0) - (box.min[this.ii] ?? 0);
    const limit = throughLimit(face, this.length);
    for (let r = 0; r < this.rows; r += 1) {
      const v = this.v0 + r * this.dvRow;
      for (let c = 0; c < this.cols; c += 1) {
        const u = this.uMin + (c + 0.5) * this.du;
        const start = this.pointAt(u, v, 0);
        const { stop, stopNormal } = marchFigure({ ...ctx, margin }, frame, start, this.length, limit, scratch.cell * 0.5);
        const column: Column = { index: r * this.cols + c, r, c, u, v, stop, stopPoint: this.pointAt(u, v, stop), stopNormal, entry: null, covered: -1 };
        this.refresh(column, 0);
        this.columns.push(column);
      }
    }
  }

  at(r: number, c: number): Column | undefined {
    return r < 0 || c < 0 || r >= this.rows || c >= this.cols ? undefined : this.columns[r * this.cols + c];
  }

  /** The column whose raster cell holds `(u, v)` (the nearest row line, the column whose cell holds u), or undefined off the face. */
  columnAt(u: number, v: number): Column | undefined {
    const c = Math.floor((u - this.uMin) / this.du);
    const r = Math.round((v - this.v0) / this.dvRow);
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
export function proud(column: Column, cell: number): boolean {
  return column.entry !== null && column.entry < column.stop - cell * 0.25;
}
