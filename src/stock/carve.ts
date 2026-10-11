/**
 * The carving rule (docs/design/spec.md, Stock and figure): per blow, `stock' = max(stock, min(-tool, figure - margin))` in fixed point over the blow's box dilated by the stock band, so stock only shrinks, never passes the figure plus margin, and the bytes come out the same whatever the order of the blows.
 * Each blow also paints the tool's finish code on the cells it touched near the surface, records an undo box (the old stock and finish of every changed cell) and reports the changed cells, the removed volume and the dirty chunks.
 * Removed volume is the change in cell occupancy, where a cell's occupancy is `clamp(0.5 - distance in cells, 0, 1)`, so a cut thinner than a cell still counts.
 * The box is walked in 4³ blocks: a block farther from the tool volume than the band is skipped, a block deeper inside it than the band takes the clamp without evaluating the tool, and only the blocks on the volume's boundary evaluate the distance per cell.
 * Undo stores the cells that were deep stock (−limit, unpainted) as runs of indices and every other cell with its old bytes, which keeps a bulk cut's record near 1 byte per cell.
 */
import { FINISH, FIXED_POINT, type FinishCode } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { type CellBox, type ChunkLayout, chunksTouching } from './chunks';
import type { Grid } from './grid';
import { toolVolume } from './tool-volumes';

/** The finish code each tool leaves (src/contracts/grid.ts, FINISH). */
export const TOOL_FINISH: Readonly<Record<ToolId, FinishCode>> = {
  charcoal: FINISH.drawn,
  point: FINISH.point,
  'two-tooth': FINISH.twoTooth,
  claw: FINISH.claw,
  'fine-claw': FINISH.fineClaw,
  roundel: FINISH.roundel,
  flat: FINISH.flat,
  drill: FINISH.drill,
  rasp: FINISH.rasp,
  file: FINISH.file,
  pumice: FINISH.pumice,
  polish: FINISH.polish,
  gilding: FINISH.gilt,
};

export interface CarveState {
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly chunks: ChunkLayout;
}

/** The old bytes of every cell a blow changed, for exact undo. */
export interface UndoBox {
  /** Pairs of (first index, length): cells that were deep stock, −limit with finish 0. */
  readonly runs: Uint32Array;
  /** Every other changed cell with its old stock and finish. */
  readonly indices: Uint32Array;
  readonly stock: Int16Array;
  readonly finish: Uint8Array;
  /** Cell box of the changed cells, for dirtying chunks on undo; null when nothing changed. */
  readonly box: CellBox | null;
}

export interface ApplyResult {
  readonly changed: number;
  /** Metres cubed. */
  readonly removed: number;
  readonly dirty: readonly number[];
  readonly undo: UndoBox;
}

const BLOCK = 4;
const HALF_DIAGONAL = Math.sqrt(3) * (BLOCK / 2);

const EMPTY_UNDO: UndoBox = { runs: new Uint32Array(0), indices: new Uint32Array(0), stock: new Int16Array(0), finish: new Uint8Array(0), box: null };

class Growable<T extends Uint32Array | Int16Array | Uint8Array> {
  array: T;
  count = 0;

  constructor(
    private readonly make: (n: number) => T,
    capacity: number,
  ) {
    this.array = make(capacity);
  }

  push(value: number): void {
    if (this.count === this.array.length) {
      const grown = this.make(Math.max(64, this.array.length * 2));
      grown.set(this.array);
      this.array = grown;
    }
    this.array[this.count] = value;
    this.count += 1;
  }

  done(): T {
    return this.array.slice(0, this.count) as T;
  }
}

function occupancy(fixed: number): number {
  const o = 0.5 - fixed / FIXED_POINT;
  return o < 0 ? 0 : o > 1 ? 1 : o;
}

/** Applies one blow and returns what changed. `margin` is the step's allowance above the figure, metres. */
export function applyBlow(state: CarveState, figure: Grid, blow: Blow, margin: number): ApplyResult {
  const { stock, finish } = state;
  const { cell, origin } = stock.spec;
  const { nx, ny, nz, values, limit } = stock;
  const figureValues = figure.values;
  const figureAtPoint = figure.sample(blow.point[0], blow.point[1], blow.point[2]);
  const volume = toolVolume(blow, figureAtPoint, figure.spec.band * cell);
  const removes = volume.removes;
  const code = TOOL_FINISH[blow.tool];
  const marginFixed = Math.round((margin / cell) * FIXED_POINT);
  const paintReach = cell;
  const cellVolume = cell * cell * cell;
  const metresToFixed = FIXED_POINT / cell;
  const figureScale = cell / FIXED_POINT;

  const i0 = Math.max(0, Math.floor((volume.min[0] - origin[0]) / cell) - STOCK_BAND_CELLS);
  const j0 = Math.max(0, Math.floor((volume.min[1] - origin[1]) / cell) - STOCK_BAND_CELLS);
  const k0 = Math.max(0, Math.floor((volume.min[2] - origin[2]) / cell) - STOCK_BAND_CELLS);
  const i1 = Math.min(nx - 1, Math.ceil((volume.max[0] - origin[0]) / cell) + STOCK_BAND_CELLS);
  const j1 = Math.min(ny - 1, Math.ceil((volume.max[1] - origin[1]) / cell) + STOCK_BAND_CELLS);
  const k1 = Math.min(nz - 1, Math.ceil((volume.max[2] - origin[2]) / cell) + STOCK_BAND_CELLS);
  if (i1 < i0 || j1 < j0 || k1 < k0) return { changed: 0, removed: 0, dirty: [], undo: EMPTY_UNDO };

  const capacity = Math.min(4096, (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1));
  const runs = new Growable((n) => new Uint32Array(n), 256);
  const indices = new Growable((n) => new Uint32Array(n), capacity);
  const oldStock = new Growable((n) => new Int16Array(n), capacity);
  const oldFinish = new Growable((n) => new Uint8Array(n), capacity);
  let runStart = -1;
  let runLength = 0;
  let removed = 0;
  let changed = 0;
  let bi0 = nx;
  let bj0 = ny;
  let bk0 = nz;
  let bi1 = -1;
  let bj1 = -1;
  let bk1 = -1;
  const skipBeyond = (HALF_DIAGONAL + STOCK_BAND_CELLS + 1.5) * cell;
  const deepWithin = -(HALF_DIAGONAL + STOCK_BAND_CELLS + 0.5) * cell;
  const deepFixed = -(limit + 1);

  for (let kb = k0; kb <= k1; kb += BLOCK) {
    const kEnd = Math.min(k1, kb + BLOCK - 1);
    for (let jb = j0; jb <= j1; jb += BLOCK) {
      const jEnd = Math.min(j1, jb + BLOCK - 1);
      for (let ib = i0; ib <= i1; ib += BLOCK) {
        const iEnd = Math.min(i1, ib + BLOCK - 1);
        const ic = (ib + iEnd) / 2;
        const jc = (jb + jEnd) / 2;
        const kc = (kb + kEnd) / 2;
        const centreIndex = Math.round(ic) + nx * (Math.round(jc) + ny * Math.round(kc));
        const dCentre = volume.distance(origin[0] + ic * cell, origin[1] + jc * cell, origin[2] + kc * cell, (figureValues[centreIndex] ?? 0) * figureScale);
        if (dCentre > skipBeyond) continue;
        const deep = dCentre < deepWithin;
        for (let k = kb; k <= kEnd; k += 1) {
          const z = origin[2] + k * cell;
          for (let j = jb; j <= jEnd; j += 1) {
            const y = origin[1] + j * cell;
            let index = ib + nx * (j + ny * k);
            let rowFirst = -1;
            let rowLast = -1;
            for (let i = ib; i <= iEnd; i += 1, index += 1) {
              const s = values[index] ?? limit;
              if (s >= limit) continue;
              const figureFixed = figureValues[index] ?? 0;
              let tFixed = deepFixed;
              let inReach = true;
              if (!deep) {
                const t = volume.distance(origin[0] + i * cell, y, z, figureFixed * figureScale);
                tFixed = Math.round(t * metresToFixed);
                inReach = t < paintReach;
              }
              let next = s;
              if (removes) {
                const candidate = Math.min(-tFixed, figureFixed - marginFixed);
                if (candidate > s) next = candidate > limit ? limit : candidate;
              }
              const was = finish[index] ?? 0;
              let nextFinish = was;
              if (inReach && next > -limit && next < limit) nextFinish = code;
              if (next === s && nextFinish === was) continue;
              if (s === -limit && was === 0) {
                if (runStart >= 0 && runStart + runLength === index) runLength += 1;
                else {
                  if (runStart >= 0) {
                    runs.push(runStart);
                    runs.push(runLength);
                  }
                  runStart = index;
                  runLength = 1;
                }
              } else {
                indices.push(index);
                oldStock.push(s);
                oldFinish.push(was);
              }
              changed += 1;
              if (next !== s) {
                removed += (occupancy(s) - occupancy(next)) * cellVolume;
                values[index] = next;
              }
              if (nextFinish !== was) finish[index] = nextFinish;
              if (rowFirst < 0) rowFirst = i;
              rowLast = i;
            }
            if (rowFirst >= 0) {
              if (rowFirst < bi0) bi0 = rowFirst;
              if (rowLast > bi1) bi1 = rowLast;
              if (j < bj0) bj0 = j;
              if (j > bj1) bj1 = j;
              if (k < bk0) bk0 = k;
              if (k > bk1) bk1 = k;
            }
          }
        }
      }
    }
  }
  if (runStart >= 0) {
    runs.push(runStart);
    runs.push(runLength);
  }
  const box: CellBox | null = bi1 < 0 ? null : { min: [bi0, bj0, bk0], max: [bi1, bj1, bk1] };
  const undo: UndoBox = changed === 0 ? EMPTY_UNDO : { runs: runs.done(), indices: indices.done(), stock: oldStock.done(), finish: oldFinish.done(), box };
  return { changed, removed, dirty: box === null ? [] : chunksTouching(state.chunks, box), undo };
}

/** Restores the bytes an `applyBlow` changed and returns the chunks to remesh. */
export function undoBlow(state: CarveState, undo: UndoBox): readonly number[] {
  const { runs, indices, stock, finish } = undo;
  const values = state.stock.values;
  const deep = -state.stock.limit;
  for (let r = 0; r < runs.length; r += 2) {
    const start = runs[r] ?? 0;
    const end = start + (runs[r + 1] ?? 0);
    values.fill(deep, start, end);
    state.finish.fill(0, start, end);
  }
  for (let n = 0; n < indices.length; n += 1) {
    const index = indices[n] ?? 0;
    values[index] = stock[n] ?? 0;
    state.finish[index] = finish[n] ?? 0;
  }
  return undo.box === null ? [] : chunksTouching(state.chunks, undo.box);
}

/** Bytes an undo box holds. */
export function undoBytes(undo: UndoBox): number {
  return undo.runs.byteLength + undo.indices.byteLength + undo.stock.byteLength + undo.finish.byteLength;
}
