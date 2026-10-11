/**
 * The point's furrows (docs/research/technique.md, Stage 2; tools.md, Subbia): layers taken off a face of the stock toward the figure, "as one would lift a wax figure out of a pail of water", the highest points of the figure appearing first.
 * A face is scanned in columns from outside the block inward; each column is struck in passes, one bite deeper each time, until the blow point reaches the figure plus the step's margin or the region's far side, skipping depths where the step's starting stock holds no stone within a bite. Passes come first, then rows top to bottom, then the columns of a row back and forth, so one row of one pass is a furrow and a stroke.
 * Blows at or above the tools' bulk size are the steep bulk cuts (60 to 90 degrees); smaller ones are the sculptor's stroke at the documented 45 degrees, leaning along the furrow.
 */
import type { Blow, PlanContext, Vec3 } from '../../contracts/making';
import { blowAt, firstEntry, mulberry32 } from './surface';

export type Face = 'front' | 'back' | 'left' | 'right' | 'top';

export interface FurrowsOptions {
  /** Faces to work, in this order. */
  readonly faces: readonly Face[];
  /** Spacing between the blows along a furrow, metres. */
  readonly pitch: number;
  /** Spacing between furrows (rows), metres; `pitch` when absent. */
  readonly rowPitch?: number;
  /** Cut depth per blow, metres. */
  readonly size: number;
  /** Tool axis angle to the surface, degrees. */
  readonly angle: number;
  /** Fraction of `size` each pass descends, so successive bites overlap. */
  readonly overlap?: number;
  /** Most passes per face, a guard against a region deeper than the stage should cut. */
  readonly maxPasses?: number;
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

function axisIndex(v: Vec3): number {
  return v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
}

/** The column's start on the region's outer face and its length through the region. */
function columnStart(ctx: PlanContext, frame: FaceFrame, u: number, v: number): { start: Vec3; length: number } {
  const start: [number, number, number] = [0, 0, 0];
  const ri = axisIndex(frame.row);
  const ci = axisIndex(frame.column);
  const ii = axisIndex(frame.inward);
  start[ri] = u;
  start[ci] = v;
  const into = frame.inward[ii] ?? 1;
  start[ii] = into < 0 ? ctx.region.max[ii] ?? 0 : ctx.region.min[ii] ?? 0;
  return { start, length: (ctx.region.max[ii] ?? 0) - (ctx.region.min[ii] ?? 0) };
}

export function furrows(ctx: PlanContext, options: FurrowsOptions): Blow[] {
  const random = mulberry32(ctx.seed);
  const overlap = options.overlap ?? 0.75;
  const bite = Math.max(options.size * overlap, ctx.cell);
  const maxPasses = options.maxPasses ?? 64;
  const rowPitch = options.rowPitch ?? options.pitch;
  const blows: Blow[] = [];
  let stroke = 0;
  const marginField = { sample: (x: number, y: number, z: number) => ctx.figure.sample(x, y, z) - ctx.margin, gradient: ctx.figure.gradient.bind(ctx.figure) };
  for (const face of options.faces) {
    const frame = FACES[face];
    const ri = axisIndex(frame.row);
    const ci = axisIndex(frame.column);
    const rows: number[] = [];
    const columns: number[] = [];
    const rowSign = frame.column[ci] ?? -1;
    for (let v = rowSign < 0 ? (ctx.region.max[ci] ?? 0) - rowPitch / 2 : (ctx.region.min[ci] ?? 0) + rowPitch / 2; v >= (ctx.region.min[ci] ?? 0) && v <= (ctx.region.max[ci] ?? 0); v += rowSign * rowPitch) rows.push(v);
    for (let u = (ctx.region.min[ri] ?? 0) + options.pitch / 2; u <= (ctx.region.max[ri] ?? 0); u += options.pitch) columns.push(u);
    // Each column's stock entry and stop depth along the inward direction, found once; null when the column holds no stock.
    const entries: (number | null)[][] = rows.map((v) =>
      columns.map((u) => {
        const { start, length } = columnStart(ctx, frame, u + (random() - 0.5) * 0.3 * options.pitch, v);
        const entry = firstEntry(ctx.stock, start, frame.inward, length, ctx.cell * 0.5);
        return entry;
      }),
    );
    const stops: number[][] = rows.map((v, r) =>
      columns.map((u, c) => {
        const entry = entries[r]?.[c];
        if (entry === null || entry === undefined) return 0;
        const { start, length } = columnStart(ctx, frame, u, v);
        const stop = firstEntry(marginField, start, frame.inward, length, ctx.cell * 0.5);
        return stop ?? length;
      }),
    );
    for (let pass = 0; pass < maxPasses; pass += 1) {
      let struck = 0;
      for (let r = 0; r < rows.length; r += 1) {
        const v = rows[r] ?? 0;
        const reversed = (pass + r) % 2 === 1;
        let rowStruck = 0;
        for (let n = 0; n < columns.length; n += 1) {
          const c = reversed ? columns.length - 1 - n : n;
          const entry = entries[r]?.[c];
          const stop = stops[r]?.[c] ?? 0;
          if (entry === null || entry === undefined) continue;
          const depth = entry + pass * bite;
          if (depth >= stop - ctx.cell * 0.25) continue;
          const { start } = columnStart(ctx, frame, columns[c] ?? 0, v);
          const point: Vec3 = [start[0] + frame.inward[0] * depth, start[1] + frame.inward[1] * depth, start[2] + frame.inward[2] * depth];
          // No stone within a bite ahead of the point in the step's starting stock: the blow would strike air, so it is not planned.
          if (pass > 0 && firstEntry(ctx.stock, point, frame.inward, options.size, ctx.cell * 0.5) === null) continue;
          const along: Vec3 = reversed ? [-frame.row[0], -frame.row[1], -frame.row[2]] : frame.row;
          blows.push(blowAt('point', point, frame.outwardNormal, along, options.angle, options.size, stroke));
          rowStruck += 1;
        }
        if (rowStruck > 0) stroke += 1;
        struck += rowStruck;
      }
      if (struck === 0) break;
    }
  }
  return blows;
}
