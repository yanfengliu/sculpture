/**
 * The carving rule (docs/design/spec.md, Stock and figure): per blow, `stock' = max(stock, min(-tool, figure - margin))` in fixed point over the blow's box dilated by the stock band, so stock only shrinks, never passes the figure plus margin, and the bytes come out the same whatever the order of the blows.
 * Each blow also paints the tool's finish code on the cells it touched near the surface, records a sparse undo box (the old stock and finish of every changed cell) and reports the changed cells, the removed volume and the dirty chunks.
 * Removed volume is the change in cell occupancy, where a cell's occupancy is `clamp(0.5 - distance in cells, 0, 1)`, so a cut thinner than a cell still counts.
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

/** Cells per side of the blocks the apply loop skips when the whole block is farther than the band from the tool volume. */
const PRUNE_BLOCK = 8;
const PRUNE_HALF_DIAGONAL = Math.sqrt(3) * (PRUNE_BLOCK / 2);

const EMPTY_UNDO: UndoBox = { indices: new Uint32Array(0), stock: new Int16Array(0), finish: new Uint8Array(0), box: null };

class UndoWriter {
  indices: Uint32Array;
  stock: Int16Array;
  finish: Uint8Array;
  count = 0;

  constructor(capacity: number) {
    this.indices = new Uint32Array(capacity);
    this.stock = new Int16Array(capacity);
    this.finish = new Uint8Array(capacity);
  }

  push(index: number, stock: number, finish: number): void {
    if (this.count === this.indices.length) this.grow();
    this.indices[this.count] = index;
    this.stock[this.count] = stock;
    this.finish[this.count] = finish;
    this.count += 1;
  }

  private grow(): void {
    const capacity = Math.max(64, this.indices.length * 2);
    const indices = new Uint32Array(capacity);
    indices.set(this.indices);
    const stock = new Int16Array(capacity);
    stock.set(this.stock);
    const finish = new Uint8Array(capacity);
    finish.set(this.finish);
    this.indices = indices;
    this.stock = stock;
    this.finish = finish;
  }

  done(box: CellBox | null): UndoBox {
    if (this.count === 0) return EMPTY_UNDO;
    return { indices: this.indices.slice(0, this.count), stock: this.stock.slice(0, this.count), finish: this.finish.slice(0, this.count), box };
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

  const i0 = Math.max(0, Math.floor((volume.min[0] - origin[0]) / cell) - STOCK_BAND_CELLS);
  const j0 = Math.max(0, Math.floor((volume.min[1] - origin[1]) / cell) - STOCK_BAND_CELLS);
  const k0 = Math.max(0, Math.floor((volume.min[2] - origin[2]) / cell) - STOCK_BAND_CELLS);
  const i1 = Math.min(nx - 1, Math.ceil((volume.max[0] - origin[0]) / cell) + STOCK_BAND_CELLS);
  const j1 = Math.min(ny - 1, Math.ceil((volume.max[1] - origin[1]) / cell) + STOCK_BAND_CELLS);
  const k1 = Math.min(nz - 1, Math.ceil((volume.max[2] - origin[2]) / cell) + STOCK_BAND_CELLS);
  if (i1 < i0 || j1 < j0 || k1 < k0) return { changed: 0, removed: 0, dirty: [], undo: EMPTY_UNDO };

  const undo = new UndoWriter(Math.min(4096, (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1)));
  let removed = 0;
  let bi0 = nx;
  let bj0 = ny;
  let bk0 = nz;
  let bi1 = -1;
  let bj1 = -1;
  let bk1 = -1;
  const pruneReach = (PRUNE_HALF_DIAGONAL + STOCK_BAND_CELLS + 1.5) * cell;

  for (let kb = k0; kb <= k1; kb += PRUNE_BLOCK) {
    const kEnd = Math.min(k1, kb + PRUNE_BLOCK - 1);
    for (let jb = j0; jb <= j1; jb += PRUNE_BLOCK) {
      const jEnd = Math.min(j1, jb + PRUNE_BLOCK - 1);
      for (let ib = i0; ib <= i1; ib += PRUNE_BLOCK) {
        const iEnd = Math.min(i1, ib + PRUNE_BLOCK - 1);
        const cx = origin[0] + ((ib + iEnd) / 2) * cell;
        const cy = origin[1] + ((jb + jEnd) / 2) * cell;
        const cz = origin[2] + ((kb + kEnd) / 2) * cell;
        const centreIndex = Math.round((ib + iEnd) / 2) + nx * (Math.round((jb + jEnd) / 2) + ny * Math.round((kb + kEnd) / 2));
        const figureAtCentre = ((figureValues[centreIndex] ?? 0) / FIXED_POINT) * cell;
        if (volume.distance(cx, cy, cz, figureAtCentre) > pruneReach) continue;
        for (let k = kb; k <= kEnd; k += 1) {
          const z = origin[2] + k * cell;
          for (let j = jb; j <= jEnd; j += 1) {
            const y = origin[1] + j * cell;
            let index = ib + nx * (j + ny * k);
            for (let i = ib; i <= iEnd; i += 1, index += 1) {
              const s = values[index] ?? limit;
              if (s >= limit) continue;
              const figureFixed = figureValues[index] ?? 0;
              const t = volume.distance(origin[0] + i * cell, y, z, (figureFixed / FIXED_POINT) * cell);
              const tFixed = Math.round((t / cell) * FIXED_POINT);
              let next = s;
              if (removes) {
                const candidate = Math.min(-tFixed, figureFixed - marginFixed);
                if (candidate > s) next = candidate > limit ? limit : candidate;
              }
              const oldFinish = finish[index] ?? 0;
              let nextFinish = oldFinish;
              if (t < paintReach && next > -limit && next < limit) nextFinish = code;
              if (next === s && nextFinish === oldFinish) continue;
              undo.push(index, s, oldFinish);
              if (next !== s) {
                removed += (occupancy(s) - occupancy(next)) * cellVolume;
                values[index] = next;
              }
              if (nextFinish !== oldFinish) finish[index] = nextFinish;
              if (i < bi0) bi0 = i;
              if (i > bi1) bi1 = i;
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
  const box: CellBox | null = bi1 < 0 ? null : { min: [bi0, bj0, bk0], max: [bi1, bj1, bk1] };
  return { changed: undo.count, removed, dirty: box === null ? [] : chunksTouching(state.chunks, box), undo: undo.done(box) };
}

/** Restores the bytes an `applyBlow` changed and returns the chunks to remesh. */
export function undoBlow(state: CarveState, undo: UndoBox): readonly number[] {
  const { indices, stock, finish } = undo;
  const values = state.stock.values;
  for (let n = 0; n < indices.length; n += 1) {
    const index = indices[n] ?? 0;
    values[index] = stock[n] ?? 0;
    state.finish[index] = finish[n] ?? 0;
  }
  return undo.box === null ? [] : chunksTouching(state.chunks, undo.box);
}

/** Bytes an undo box holds. */
export function undoBytes(undo: UndoBox): number {
  return undo.indices.byteLength + undo.stock.byteLength + undo.finish.byteLength;
}
