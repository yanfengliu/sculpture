/**
 * The carving kernel (docs/design/spec.md, Stock and figure): one blow's rule, `stock' = max(stock, min(-tool, figure - margin))` in fixed point, over a cell box of a target array, plus the finish paint and the undo record.
 * The target is any x-fastest array of stock, finish and figure values: the whole grid on the main thread, or one 32³ chunk in a carve worker. Every cell's new value depends only on its own old value, the figure at the cell and the tool's distance there, so a blow applied chunk by chunk in the workers writes the same bytes as the serial path, as long as the blows reach each cell in index order (src/stock/carve-parallel.test.ts compares the two).
 * The box is walked in 4³ blocks, row by row across the box: a block farther from the tool volume than the band is skipped, a block or row segment deeper inside it than the band takes the clamp without evaluating the tool, and only the segments on the volume's boundary evaluate the distance per cell (a row at a time for the shapes that offer it); the per-cell result is the same either way (the distances are Lipschitz and each volume states its constant), so the block grid's alignment does not change the bytes.
 * Undo records the cells that were deep stock (−limit, unpainted) as runs of global indices, each run as long as the row of the box allows, and every other changed cell with its old bytes, so a bulk cut's record stays well under 1 byte per cell.
 * A tool paints its finish code only over the codes its mask allows (the gilding leaf bonds to the claw and roundel texture of the sling and the stump, never over polished flesh; docs/design/choreography.md, Known compromises).
 */
import { FIXED_POINT } from '../contracts/grid';
import { STOCK_BAND_CELLS } from '../david/frame';
import type { CellBox } from './chunks';
import type { ToolVolume } from './tool-volumes';

/**
 * An x-fastest array of cells on the grid's lattice: the array's local dimensions, where its cell (0, 0, 0) sits in the grid (`offset`), the grid's origin and dimensions.
 * World coordinates and undo indices are formed from the global cell indices (`offset + local`), with the same floating-point expressions on every path, so a cell gets the same bytes whether the whole grid or one chunk carried it.
 */
export interface KernelTarget {
  readonly values: Int16Array;
  /** Null paints nothing (a scratch stock). */
  readonly finish: Uint8Array | null;
  readonly figure: Int16Array;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly offset: readonly [number, number, number];
  /** The grid's origin: the world position of global cell (0, 0, 0). */
  readonly origin: readonly [number, number, number];
  readonly cell: number;
  /** The stock's clamp in fixed point. */
  readonly limit: number;
  readonly globalNx: number;
  readonly globalNy: number;
}

export interface KernelParams {
  /** The step's margin in fixed-point cells. */
  readonly marginFixed: number;
  /** The tool's finish code. */
  readonly code: number;
  /** Bit `c` set: the tool paints over finish code `c`. */
  readonly paintOver: number;
}

export interface KernelResult {
  readonly changed: number;
  /** Metres cubed. */
  readonly removed: number;
  /** Local box of the changed cells; null when nothing changed. */
  readonly box: CellBox | null;
}

const BLOCK = 4;
const HALF_DIAGONAL = Math.sqrt(3) * (BLOCK / 2);
/** Every finish code may be painted over. */
export const PAINT_OVER_ALL = 0xffff;

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

/** Accumulates undo records, in global indices; a worker keeps one sink across the blows of a chunk job and slices it per blow by the counts. */
export class UndoSink {
  readonly runs = new Growable((n) => new Uint32Array(n), 256);
  readonly indices = new Growable((n) => new Uint32Array(n), 1024);
  readonly stock = new Growable((n) => new Int16Array(n), 1024);
  readonly finish = new Growable((n) => new Uint8Array(n), 1024);
}

function occupancy(fixed: number): number {
  const o = 0.5 - fixed / FIXED_POINT;
  return o < 0 ? 0 : o > 1 ? 1 : o;
}

/** Applies `volume` to the cells of `box` (local, inclusive) of `target`, recording the old bytes of every changed cell in `sink`. */
export function carveCells(target: KernelTarget, volume: ToolVolume, box: CellBox, params: KernelParams, sink: UndoSink): KernelResult {
  const { values, finish, figure: figureValues, nx, ny, offset, origin, cell, limit, globalNx, globalNy } = target;
  const [oi, oj, ok] = offset;
  const { marginFixed, code, paintOver } = params;
  const removes = volume.removes;
  const paintReach = cell;
  const cellVolume = cell * cell * cell;
  const metresToFixed = FIXED_POINT / cell;
  const figureScale = cell / FIXED_POINT;
  const [i0, j0, k0] = box.min;
  const [i1, j1, k1] = box.max;
  const { runs, indices, stock: oldStock, finish: oldFinish } = sink;
  let runStart = -1;
  let runLength = 0;
  let removed = 0;
  let changed = 0;
  let bi0 = nx;
  let bj0 = ny;
  let bk0 = target.nz;
  let bi1 = -1;
  let bj1 = -1;
  let bk1 = -1;
  // A cell farther than band + 0.5 cells outside the volume cannot change (its new distance would be below its old one and it is out of the paint's reach); a cell deeper than band + 0.5 inside takes the clamp. The block and row tests widen those by the distance from the block centre to the farthest cell they cover, scaled by the volume's Lipschitz constant.
  const L = volume.lipschitz;
  const skipCell = (STOCK_BAND_CELLS + 1) * cell;
  const deepCell = -(STOCK_BAND_CELLS + 0.5) * cell;
  const skipBeyond = skipCell + HALF_DIAGONAL * L * cell;
  const deepWithin = deepCell - HALF_DIAGONAL * L * cell;
  const deepFixed = -(limit + 1);
  const rows = volume.distances === undefined ? null : volume.distances.bind(volume);
  const row = new Float64Array(BLOCK);
  const blocksAcross = Math.floor((i1 - i0) / BLOCK) + 1;
  // Per block along x of the current block row: the centre distance, or NaN for a block too far to matter, and whether the whole block is deep.
  const centres = new Float64Array(blocksAcross);
  const centreDeep = new Uint8Array(blocksAcross);

  for (let kb = k0; kb <= k1; kb += BLOCK) {
    const kEnd = Math.min(k1, kb + BLOCK - 1);
    const kc = (kb + kEnd) / 2;
    for (let jb = j0; jb <= j1; jb += BLOCK) {
      const jEnd = Math.min(j1, jb + BLOCK - 1);
      const jc = (jb + jEnd) / 2;
      let any = false;
      for (let ib = i0, b = 0; ib <= i1; ib += BLOCK, b += 1) {
        const iEnd = Math.min(i1, ib + BLOCK - 1);
        const ic = (ib + iEnd) / 2;
        const centreIndex = Math.round(ic) + nx * (Math.round(jc) + ny * Math.round(kc));
        const dCentre = volume.distance(origin[0] + (oi + ic) * cell, origin[1] + (oj + jc) * cell, origin[2] + (ok + kc) * cell, (figureValues[centreIndex] ?? 0) * figureScale);
        if (dCentre > skipBeyond) {
          centres[b] = Number.NaN;
          continue;
        }
        any = true;
        centres[b] = dCentre;
        centreDeep[b] = dCentre < deepWithin ? 1 : 0;
      }
      if (!any) continue;
      // Rows run the whole box in x, so a run of deep cells can span every block the row crosses.
      for (let k = kb; k <= kEnd; k += 1) {
        const z = origin[2] + (ok + k) * cell;
        const dk = k - kc;
        for (let j = jb; j <= jEnd; j += 1) {
          const y = origin[1] + (oj + j) * cell;
          const dj = j - jc;
          const rowOff = dj * dj + dk * dk;
          let rowFirst = -1;
          let rowLast = -1;
          for (let ib = i0, b = 0; ib <= i1; ib += BLOCK, b += 1) {
            const dCentre = centres[b] ?? Number.NaN;
            if (Number.isNaN(dCentre)) continue;
            const iEnd = Math.min(i1, ib + BLOCK - 1);
            const halfWidth = (iEnd - ib) / 2;
            let deep = centreDeep[b] === 1;
            if (!deep) {
              const reach = Math.sqrt(rowOff + halfWidth * halfWidth) * cell * L;
              if (dCentre - reach > skipCell) continue;
              deep = dCentre + reach < deepCell;
            }
            if (!deep && rows !== null) rows(origin[0], oi + ib, cell, iEnd - ib + 1, y, z, row);
            let index = ib + nx * (j + ny * k);
            let globalIndex = oi + ib + globalNx * (oj + j + globalNy * (ok + k));
            for (let i = ib; i <= iEnd; i += 1, index += 1, globalIndex += 1) {
              const s = values[index] ?? limit;
              if (s >= limit) continue;
              const figureFixed = figureValues[index] ?? 0;
              let tFixed = deepFixed;
              let inReach = true;
              if (!deep) {
                const t = rows === null ? volume.distance(origin[0] + (oi + i) * cell, y, z, figureFixed * figureScale) : (row[i - ib] ?? 0);
                tFixed = Math.round(t * metresToFixed);
                inReach = t < paintReach;
              }
              let next = s;
              if (removes) {
                const candidate = Math.min(-tFixed, figureFixed - marginFixed);
                if (candidate > s) next = candidate > limit ? limit : candidate;
              }
              const was = finish === null ? 0 : (finish[index] ?? 0);
              let nextFinish = was;
              if (finish !== null && inReach && next > -limit && next < limit && (paintOver & (1 << was)) !== 0) nextFinish = code;
              if (next === s && nextFinish === was) continue;
              if (s === -limit && was === 0) {
                if (runStart >= 0 && runStart + runLength === globalIndex) runLength += 1;
                else {
                  if (runStart >= 0) {
                    runs.push(runStart);
                    runs.push(runLength);
                  }
                  runStart = globalIndex;
                  runLength = 1;
                }
              } else {
                indices.push(globalIndex);
                oldStock.push(s);
                oldFinish.push(was);
              }
              changed += 1;
              if (next !== s) {
                removed += (occupancy(s) - occupancy(next)) * cellVolume;
                values[index] = next;
              }
              if (finish !== null && nextFinish !== was) finish[index] = nextFinish;
              if (rowFirst < 0) rowFirst = i;
              rowLast = i;
            }
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
  if (runStart >= 0) {
    runs.push(runStart);
    runs.push(runLength);
  }
  return { changed, removed, box: bi1 < 0 ? null : { min: [bi0, bj0, bk0], max: [bi1, bj1, bk1] } };
}
