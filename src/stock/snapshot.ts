/**
 * Snapshots of the carving state (docs/design/spec.md, Undo and replay; docs/research/decisions.md, Engine): the stock and finish grids at one blow index of the plan, written by scripts/build-plan.mjs beside the plan and written back into the grids by the page's Making when a jump lands nearer to it than a replay would.
 *
 * Format `sculpture-snapshot/1`, little-endian, gzipped on disk (`public/model/<name>.snap.<i>.bin.gz`):
 * - a header of HEADER_WORDS (12) Uint32 words: magic, version, the grid's three sizes, TILE, the stock's clamp (fixed point), the blow index, the tile count, the run count, the value count and a zero;
 * - the run lengths (Uint16 per run), the value cells' stock residuals (Int16 per value: the stock minus the figure at the cell, which is 0 wherever a pass stopped on the figure and the step's margin wherever it stopped at it, so the band compresses to almost nothing where the stone has reached its allowance), then the tile kinds (a byte per tile), the run classes (a byte per run) and the value cells' finish codes (a byte per value).
 * The grid is cut into TILE³ tiles (ceil(n / TILE) per axis, so the lattice's last plane is covered too), in tile order x fastest; a tile is all air with finish 0 (TILE_AIR), all deep stone with finish 0 (TILE_DEEP), or runs (TILE_RUNS) over its cells in x-fastest order clipped to the grid: a run of deep stone with finish 0 (RUN_DEEP), of band cells stored as values (RUN_VALUES), or of air with one finish code (RUN_AIR + code; air keeps the code of the last tool that touched it while it was in the band). Only the band cells carry values, so a snapshot costs about three bytes per band cell before gzip.
 * `applySnapshot` writes a snapshot into a carve state, cell by cell, and returns the chunks whose window holds a cell that changed, so only those are remeshed; the bytes it writes are exactly the encoded state (src/stock/snapshot.test.ts).
 */
import { FINISH } from '../contracts/grid';
import type { CarveState } from './carve';
import { type CellBox, chunksTouching } from './chunks';
import type { Grid } from './grid';

export const SNAPSHOT_MAGIC = 0x4e534353;
export const SNAPSHOT_VERSION = 1;
/** Cells per tile edge: the meshing chunk's edge (src/stock/mesher.ts). */
export const TILE = 32;
const HEADER_WORDS = 12;
export const TILE_AIR = 0;
export const TILE_DEEP = 1;
export const TILE_RUNS = 2;
export const RUN_DEEP = 0;
export const RUN_VALUES = 1;
export const RUN_AIR = 2;
const MAX_RUN = 0xffff;
/** The highest finish code (src/contracts/grid.ts, FINISH): a run class or value past it is not a snapshot's. */
const MAX_FINISH = Math.max(...Object.values(FINISH));

export interface SnapshotInfo {
  readonly blow: number;
  readonly size: readonly [number, number, number];
  readonly limit: number;
  readonly tiles: number;
  readonly runs: number;
  readonly values: number;
}

class Bytes {
  array: Uint8Array;
  count = 0;
  constructor(capacity: number) {
    this.array = new Uint8Array(capacity);
  }
  push(value: number): void {
    if (this.count === this.array.length) {
      const grown = new Uint8Array(this.array.length * 2);
      grown.set(this.array);
      this.array = grown;
    }
    this.array[this.count] = value;
    this.count += 1;
  }
}

class Words {
  array: Uint16Array | Int16Array;
  count = 0;
  constructor(private readonly signed: boolean) {
    this.array = signed ? new Int16Array(1 << 16) : new Uint16Array(1 << 16);
  }
  push(value: number): void {
    if (this.count === this.array.length) {
      const grown = this.signed ? new Int16Array(this.array.length * 2) : new Uint16Array(this.array.length * 2);
      grown.set(this.array);
      this.array = grown;
    }
    this.array[this.count] = value;
    this.count += 1;
  }
}

/** The most bytes a snapshot of a grid of `size` cells can hold: its header, a byte per tile, and at most one run and one value per cell. */
export function maxSnapshotBytes(size: readonly [number, number, number]): number {
  const [tx, ty, tz] = tileCounts(size);
  return HEADER_WORDS * 4 + tx * ty * tz + 6 * size[0] * size[1] * size[2];
}

function tileCounts(size: readonly [number, number, number]): [number, number, number] {
  return [Math.ceil(size[0] / TILE), Math.ceil(size[1] / TILE), Math.ceil(size[2] / TILE)];
}

/** The cells of tile (tx, ty, tz), exclusive ends, clipped to the grid. */
function tileRange(size: readonly [number, number, number], tx: number, ty: number, tz: number): [number, number, number, number, number, number] {
  return [tx * TILE, Math.min(size[0], (tx + 1) * TILE), ty * TILE, Math.min(size[1], (ty + 1) * TILE), tz * TILE, Math.min(size[2], (tz + 1) * TILE)];
}

/** Encodes the state of `stock` and `finish` (on `figure`'s lattice) after `blow` blows; the bytes before gzip. */
export function encodeSnapshot(stock: Grid, finish: Uint8Array, figure: Grid, blow: number): Uint8Array {
  const size = stock.spec.size;
  if (figure.values.length !== stock.values.length || finish.length !== stock.values.length) throw new Error(`snapshot grids disagree: stock ${String(stock.values.length)} cells, finish ${String(finish.length)}, figure ${String(figure.values.length)}`);
  const [tx, ty, tz] = tileCounts(size);
  const [nx, ny] = size;
  const limit = stock.limit;
  const deep = -limit;
  const values = stock.values;
  const figureValues = figure.values;
  const kinds = new Uint8Array(tx * ty * tz);
  const runClass = new Bytes(1 << 16);
  const runLength = new Words(false);
  const residual = new Words(true);
  const valueFinish = new Bytes(1 << 16);
  let tile = 0;
  for (let cz = 0; cz < tz; cz += 1) {
    for (let cy = 0; cy < ty; cy += 1) {
      for (let cx = 0; cx < tx; cx += 1, tile += 1) {
        const [i0, i1, j0, j1, k0, k1] = tileRange(size, cx, cy, cz);
        const runsBefore = runClass.count;
        const valuesBefore = residual.count;
        let open = -1;
        let length = 0;
        const close = (): void => {
          if (open < 0) return;
          runClass.push(open);
          runLength.push(length);
        };
        for (let k = k0; k < k1; k += 1) {
          for (let j = j0; j < j1; j += 1) {
            const base = nx * (j + ny * k);
            for (let i = i0; i < i1; i += 1) {
              const index = base + i;
              const s = values[index] ?? limit;
              const f = finish[index] ?? 0;
              let cls: number;
              if (s === deep && f === 0) cls = RUN_DEEP;
              else if (s === limit) cls = RUN_AIR + f;
              else {
                cls = RUN_VALUES;
                residual.push(s - (figureValues[index] ?? 0));
                valueFinish.push(f);
              }
              if (cls === open && length < MAX_RUN) length += 1;
              else {
                close();
                open = cls;
                length = 1;
              }
            }
          }
        }
        // A tile of one run of deep stone or of unpainted air is stored as its kind alone.
        if (runClass.count === runsBefore && residual.count === valuesBefore && (open === RUN_DEEP || open === RUN_AIR)) {
          kinds[tile] = open === RUN_DEEP ? TILE_DEEP : TILE_AIR;
          continue;
        }
        close();
        kinds[tile] = TILE_RUNS;
      }
    }
  }
  const runs = runClass.count;
  const valueCount = residual.count;
  const headerBytes = HEADER_WORDS * 4;
  const lengthsAt = headerBytes;
  const residualAt = lengthsAt + runs * 2;
  const kindsAt = residualAt + valueCount * 2;
  const classesAt = kindsAt + kinds.length;
  const finishAt = classesAt + runs;
  const out = new Uint8Array(finishAt + valueCount);
  const header = new DataView(out.buffer);
  const words = [SNAPSHOT_MAGIC, SNAPSHOT_VERSION, size[0], size[1], size[2], TILE, limit, blow, kinds.length, runs, valueCount, 0];
  words.forEach((word, n) => {
    header.setUint32(n * 4, word, true);
  });
  const view = new DataView(out.buffer);
  for (let n = 0; n < runs; n += 1) view.setUint16(lengthsAt + n * 2, runLength.array[n] ?? 0, true);
  for (let n = 0; n < valueCount; n += 1) view.setInt16(residualAt + n * 2, residual.array[n] ?? 0, true);
  out.set(kinds, kindsAt);
  out.set(runClass.array.subarray(0, runs), classesAt);
  out.set(valueFinish.array.subarray(0, valueCount), finishAt);
  return out;
}

/** The header of an inflated snapshot; throws naming what is wrong with bytes that are not one. */
export function snapshotInfo(bytes: Uint8Array): SnapshotInfo {
  if (bytes.byteLength < HEADER_WORDS * 4) throw new Error(`a snapshot holds at least ${String(HEADER_WORDS * 4)} header bytes; these are ${String(bytes.byteLength)}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (n: number): number => view.getUint32(n * 4, true);
  if (word(0) !== SNAPSHOT_MAGIC) throw new Error(`not a sculpture snapshot: the magic is ${word(0).toString(16)}, expected ${SNAPSHOT_MAGIC.toString(16)}`);
  if (word(1) !== SNAPSHOT_VERSION) throw new Error(`snapshot format version ${String(word(1))}; this engine reads version ${String(SNAPSHOT_VERSION)}`);
  if (word(5) !== TILE) throw new Error(`snapshot tiles of ${String(word(5))} cells; this engine reads tiles of ${String(TILE)}`);
  const info: SnapshotInfo = { size: [word(2), word(3), word(4)], limit: word(6), blow: word(7), tiles: word(8), runs: word(9), values: word(10) };
  const [tx, ty, tz] = tileCounts(info.size);
  const expected = HEADER_WORDS * 4 + info.runs * 3 + info.values * 3 + info.tiles;
  if (info.tiles !== tx * ty * tz) throw new Error(`snapshot at blow ${String(info.blow)} is malformed: it holds ${String(info.tiles)} tiles and a ${info.size.join('×')} grid has ${String(tx * ty * tz)} of ${String(TILE)}³`);
  if (bytes.byteLength !== expected) throw new Error(`snapshot at blow ${String(info.blow)} is truncated or malformed: ${String(bytes.byteLength)} bytes for ${String(info.tiles)} tiles, ${String(info.runs)} runs and ${String(info.values)} values, which need ${String(expected)}`);
  return info;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** The run lengths and residuals as typed arrays: views when the bytes are aligned and the host little-endian, copies otherwise. */
function wordViews(bytes: Uint8Array, lengthsAt: number, runs: number, residualAt: number, values: number): { lengths: Uint16Array; residuals: Int16Array } {
  if (LITTLE_ENDIAN && bytes.byteOffset % 2 === 0) {
    return { lengths: new Uint16Array(bytes.buffer, bytes.byteOffset + lengthsAt, runs), residuals: new Int16Array(bytes.buffer, bytes.byteOffset + residualAt, values) };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lengths = new Uint16Array(runs);
  const residuals = new Int16Array(values);
  for (let n = 0; n < runs; n += 1) lengths[n] = view.getUint16(lengthsAt + n * 2, true);
  for (let n = 0; n < values; n += 1) residuals[n] = view.getInt16(residualAt + n * 2, true);
  return { lengths, residuals };
}

export interface ApplyOutcome {
  readonly blow: number;
  /** Tiles whose cells changed. */
  readonly changedTiles: number;
  /** Chunks whose 33³ window holds a changed cell, in increasing id order: the chunks to remesh. */
  readonly dirty: readonly number[];
}

/** Writes the snapshot into `state` (on `figure`'s lattice) and returns what changed; throws when the snapshot is not for this lattice. */
export function applySnapshot(bytes: Uint8Array, state: CarveState, figure: Grid): ApplyOutcome {
  const info = snapshotInfo(bytes);
  const { stock, finish, chunks } = state;
  const size = stock.spec.size;
  if (info.size[0] !== size[0] || info.size[1] !== size[1] || info.size[2] !== size[2] || info.limit !== stock.limit) {
    throw new Error(`snapshot at blow ${String(info.blow)} is for a ${info.size.join('×')} grid clamped at ${String(info.limit)}; the stock is ${size.join('×')} clamped at ${String(stock.limit)}`);
  }
  const lengthsAt = HEADER_WORDS * 4;
  const residualAt = lengthsAt + info.runs * 2;
  const kindsAt = residualAt + info.values * 2;
  const classesAt = kindsAt + info.tiles;
  const finishAt = classesAt + info.runs;
  const { lengths, residuals } = wordViews(bytes, lengthsAt, info.runs, residualAt, info.values);
  const [tx, ty, tz] = tileCounts(size);
  const [nx, ny] = size;
  const limit = stock.limit;
  const values = stock.values;
  const figureValues = figure.values;
  const dirty = new Set<number>();
  let run = 0;
  let value = 0;
  let changedTiles = 0;
  let tile = 0;
  for (let cz = 0; cz < tz; cz += 1) {
    for (let cy = 0; cy < ty; cy += 1) {
      for (let cx = 0; cx < tx; cx += 1, tile += 1) {
        const [i0, i1, j0, j1, k0, k1] = tileRange(size, cx, cy, cz);
        const kind = bytes[kindsAt + tile] ?? TILE_AIR;
        if (kind !== TILE_AIR && kind !== TILE_DEEP && kind !== TILE_RUNS) throw new Error(`snapshot at blow ${String(info.blow)}: tile ${String(tile)} has kind ${String(kind)}, which is none of ${String(TILE_AIR)} (air), ${String(TILE_DEEP)} (deep stone) and ${String(TILE_RUNS)} (runs)`);
        // The box of the tile's changed cells.
        let bi0 = i1;
        let bi1 = -1;
        let bj0 = j1;
        let bj1 = -1;
        let bk0 = k1;
        let bk1 = -1;
        // The current run: its class and the cells left in it.
        let cls = kind === TILE_DEEP ? RUN_DEEP : RUN_AIR;
        let left = kind === TILE_RUNS ? 0 : Number.POSITIVE_INFINITY;
        for (let k = k0; k < k1; k += 1) {
          for (let j = j0; j < j1; j += 1) {
            const base = nx * (j + ny * k);
            let i = i0;
            let first = -1;
            let last = -1;
            while (i < i1) {
              if (left === 0) {
                cls = bytes[classesAt + run] ?? RUN_DEEP;
                left = lengths[run] ?? 0;
                run += 1;
                if (left === 0) throw new Error(`snapshot at blow ${String(info.blow)} has an empty run in tile ${String(tile)}`);
                if (cls > RUN_AIR + MAX_FINISH) throw new Error(`snapshot at blow ${String(info.blow)}: run ${String(run - 1)} in tile ${String(tile)} has class ${String(cls)}, past air with the last finish code (${String(RUN_AIR + MAX_FINISH)})`);
              }
              const end = Math.min(i1, i + left);
              const to = base + end;
              if (cls === RUN_VALUES) {
                for (let index = base + i; index < to; index += 1, value += 1) {
                  const s = (residuals[value] ?? 0) + (figureValues[index] ?? 0);
                  const f = bytes[finishAt + value] ?? 0;
                  if (s < -limit || s > limit || f > MAX_FINISH) throw new Error(`snapshot at blow ${String(info.blow)}: value ${String(value)} gives stock ${String(s)} and finish ${String(f)}, outside the clamp ±${String(limit)} or past the last finish code ${String(MAX_FINISH)}`);
                  if (values[index] !== s || finish[index] !== f) {
                    values[index] = s;
                    finish[index] = f;
                    if (first < 0) first = index - base;
                    last = index - base;
                  }
                }
              } else {
                const s = cls === RUN_DEEP ? -limit : limit;
                const f = cls === RUN_DEEP ? 0 : cls - RUN_AIR;
                let a = -1;
                let b = -1;
                for (let index = base + i; index < to; index += 1) {
                  if (values[index] !== s || finish[index] !== f) {
                    if (a < 0) a = index;
                    b = index;
                  }
                }
                if (a >= 0) {
                  values.fill(s, a, b + 1);
                  finish.fill(f, a, b + 1);
                  if (first < 0 || a - base < first) first = a - base;
                  if (b - base > last) last = b - base;
                }
              }
              left -= end - i;
              i = end;
            }
            if (first >= 0) {
              if (first < bi0) bi0 = first;
              if (last > bi1) bi1 = last;
              if (j < bj0) bj0 = j;
              if (j > bj1) bj1 = j;
              if (k < bk0) bk0 = k;
              if (k > bk1) bk1 = k;
            }
          }
        }
        if (kind === TILE_RUNS && left !== 0) throw new Error(`snapshot at blow ${String(info.blow)}: tile ${String(tile)}'s runs end ${String(left)} cells past its last cell`);
        if (bi1 < 0) continue;
        changedTiles += 1;
        const box: CellBox = { min: [bi0, bj0, bk0], max: [bi1, bj1, bk1] };
        for (const id of chunksTouching(chunks, box)) dirty.add(id);
      }
    }
  }
  if (run !== info.runs || value !== info.values) throw new Error(`snapshot at blow ${String(info.blow)} read ${String(run)} of ${String(info.runs)} runs and ${String(value)} of ${String(info.values)} values`);
  return { blow: info.blow, changedTiles, dirty: [...dirty].sort((a, b) => a - b) };
}
