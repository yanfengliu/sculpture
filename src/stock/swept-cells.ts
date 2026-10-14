/**
 * A step's end sweep as a list of cells (docs/design/spec.md, Undo and replay): the build (src/timeline/plan-build.ts) records the cells the sweep of src/stock/sweep.ts took off at each step's end in the plan file, and the page takes the same cells off from the list, with no labelling and no 73 MB of labels, so a step boundary costs it a few milliseconds instead of a sweep.
 * `sweptListOf` turns a sweep's undo parts into the ascending list of their cells; `takeOffListed` sets the listed cells to deep air with finish 0 and records their old bytes in the undo format of src/stock/carve.ts, one part per 32³ tile, so undoing them restores the bytes exactly.
 */
import type { CarveState, UndoPart } from './carve';
import { chunksTouching } from './chunks';

const TILE_SHIFT = 5;

/** The cells a sweep's parts hold (their deep runs and their segments), ascending. */
export function sweptListOf(parts: readonly UndoPart[]): Uint32Array {
  const cells: number[] = [];
  for (const part of parts) {
    for (const pairs of [part.runs, part.indices]) {
      for (let r = 0; r < pairs.length; r += 2) {
        const start = pairs[r] ?? 0;
        const length = pairs[r + 1] ?? 0;
        for (let n = 0; n < length; n += 1) cells.push(start + n);
      }
    }
  }
  return Uint32Array.from(cells).sort();
}

export interface ListedSweep {
  readonly parts: readonly UndoPart[];
  readonly cells: number;
  /** Chunks whose window holds a swept cell, ascending. */
  readonly dirty: readonly number[];
}

/** Takes the listed cells off: deep air, finish 0; the old bytes go into the returned parts. */
export function takeOffListed(state: CarveState, list: Uint32Array): ListedSweep {
  const { stock, finish, chunks } = state;
  const { nx, ny, limit, values } = stock;
  const deep = -limit;
  const tiles = new Map<number, number[]>();
  const [tx, ty] = [(nx + 31) >> TILE_SHIFT, (ny + 31) >> TILE_SHIFT];
  for (const index of list) {
    const i = index % nx;
    const j = Math.floor(index / nx) % ny;
    const k = Math.floor(index / (nx * ny));
    const tile = (i >> TILE_SHIFT) + tx * ((j >> TILE_SHIFT) + ty * (k >> TILE_SHIFT));
    const cells = tiles.get(tile);
    if (cells === undefined) tiles.set(tile, [index]);
    else cells.push(index);
  }
  const parts: UndoPart[] = [];
  const dirty = new Set<number>();
  for (const cells of tiles.values()) {
    const runs: number[] = [];
    const indices: number[] = [];
    const oldStock: number[] = [];
    const oldFinish: number[] = [];
    let runStart = -1;
    let runLength = 0;
    let segStart = -1;
    let segLength = 0;
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [-1, -1, -1];
    for (const index of cells) {
      const s = values[index] ?? limit;
      const f = finish[index] ?? 0;
      if (s === deep && f === 0) {
        if (runStart >= 0 && runStart + runLength === index) runLength += 1;
        else {
          if (runStart >= 0) runs.push(runStart, runLength);
          runStart = index;
          runLength = 1;
        }
      } else {
        if (segStart >= 0 && segStart + segLength === index) segLength += 1;
        else {
          if (segStart >= 0) indices.push(segStart, segLength);
          segStart = index;
          segLength = 1;
        }
        oldStock.push(s);
        oldFinish.push(f);
      }
      values[index] = limit;
      finish[index] = 0;
      const coords = [index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny))];
      for (let axis = 0; axis < 3; axis += 1) {
        const c = coords[axis] ?? 0;
        if (c < (min[axis] ?? 0)) min[axis] = c;
        if (c > (max[axis] ?? 0)) max[axis] = c;
      }
    }
    if (runStart >= 0) runs.push(runStart, runLength);
    if (segStart >= 0) indices.push(segStart, segLength);
    const box = { min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0] as const, max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0] as const };
    parts.push({ runs: Uint32Array.from(runs), indices: Uint32Array.from(indices), stock: Int16Array.from(oldStock), finish: Uint8Array.from(oldFinish), box });
    for (const id of chunksTouching(chunks, box)) dirty.add(id);
  }
  return { parts, cells: list.length, dirty: [...dirty].sort((a, b) => a - b) };
}
