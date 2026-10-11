/**
 * Chunks of 32³ cells over a grid (docs/design/spec.md, Stock and figure): ids, the cells a blow dirties, and the 33³ windows the mesher reads.
 * A chunk's window covers cells 32c to 32c + 32 inclusive on each axis, so a cell on a chunk's first plane also belongs to the window of the chunk before it; `chunksTouching` returns both. Cells beyond the grid read as air (+limit) so the surface closes at the lattice's edge.
 */
import type { GridSpec } from '../contracts/grid';
import type { Vec3 } from '../contracts/making';
import type { Grid } from './grid';
import { CHUNK_CELLS, WINDOW_CELLS } from './mesher';

export interface ChunkLayout {
  readonly size: readonly [number, number, number];
  /** Chunks per axis. */
  readonly counts: readonly [number, number, number];
  readonly total: number;
}

/** Inclusive cell box [min, max] on each axis. */
export interface CellBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function chunkLayout(spec: GridSpec): ChunkLayout {
  const counts = spec.size.map((n) => Math.max(1, Math.ceil((n - 1) / CHUNK_CELLS))) as [number, number, number];
  return { size: spec.size, counts, total: counts[0] * counts[1] * counts[2] };
}

export function chunkId(layout: ChunkLayout, cx: number, cy: number, cz: number): number {
  return cx + layout.counts[0] * (cy + layout.counts[1] * cz);
}

export function chunkCoords(layout: ChunkLayout, id: number): [number, number, number] {
  const [ncx, ncy] = layout.counts;
  const cx = id % ncx;
  const cy = Math.floor(id / ncx) % ncy;
  const cz = Math.floor(id / (ncx * ncy));
  return [cx, cy, cz];
}

/** Ids of the chunks whose window holds any cell of `box`, in increasing id order. */
export function chunksTouching(layout: ChunkLayout, box: CellBox): number[] {
  const ids: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const min = Math.max(box.min[axis] ?? 0, 0);
    const max = Math.min(box.max[axis] ?? 0, (layout.size[axis] ?? 1) - 1);
    if (max < min) return ids;
    const first = Math.max(0, Math.floor((min - 1) / CHUNK_CELLS));
    const last = Math.min((layout.counts[axis] ?? 1) - 1, Math.floor(max / CHUNK_CELLS));
    lo.push(first);
    hi.push(last);
  }
  for (let cz = lo[2] ?? 0; cz <= (hi[2] ?? -1); cz += 1) {
    for (let cy = lo[1] ?? 0; cy <= (hi[1] ?? -1); cy += 1) {
      for (let cx = lo[0] ?? 0; cx <= (hi[0] ?? -1); cx += 1) ids.push(chunkId(layout, cx, cy, cz));
    }
  }
  return ids;
}

/** World position of the centre of the window's first sample. */
export function windowOrigin(grid: Grid, layout: ChunkLayout, id: number): Vec3 {
  const [cx, cy, cz] = chunkCoords(layout, id);
  return grid.worldOf(cx * CHUNK_CELLS, cy * CHUNK_CELLS, cz * CHUNK_CELLS);
}

const WINDOW_VOLUME = WINDOW_CELLS * WINDOW_CELLS * WINDOW_CELLS;

/** Copies the chunk's 33³ window of stock values; samples beyond the grid are air. */
export function copyWindow(grid: Grid, layout: ChunkLayout, id: number, out = new Int16Array(WINDOW_VOLUME)): Int16Array {
  const [cx, cy, cz] = chunkCoords(layout, id);
  const { nx, ny, nz, values, limit } = grid;
  const i0 = cx * CHUNK_CELLS;
  const j0 = cy * CHUNK_CELLS;
  const k0 = cz * CHUNK_CELLS;
  const width = Math.min(WINDOW_CELLS, nx - i0);
  let w = 0;
  for (let k = 0; k < WINDOW_CELLS; k += 1) {
    const kk = k0 + k;
    for (let j = 0; j < WINDOW_CELLS; j += 1) {
      const jj = j0 + j;
      if (kk >= nz || jj >= ny || width <= 0) {
        out.fill(limit, w, w + WINDOW_CELLS);
      } else {
        const base = i0 + nx * (jj + ny * kk);
        out.set(values.subarray(base, base + width), w);
        if (width < WINDOW_CELLS) out.fill(limit, w + width, w + WINDOW_CELLS);
      }
      w += WINDOW_CELLS;
    }
  }
  return out;
}

/** Copies the chunk's 33³ window of finish codes; samples beyond the grid are the untouched block (0). */
export function copyFinishWindow(finish: Uint8Array, spec: GridSpec, layout: ChunkLayout, id: number, out = new Uint8Array(WINDOW_VOLUME)): Uint8Array {
  const [cx, cy, cz] = chunkCoords(layout, id);
  const [nx, ny, nz] = spec.size;
  const i0 = cx * CHUNK_CELLS;
  const j0 = cy * CHUNK_CELLS;
  const k0 = cz * CHUNK_CELLS;
  const width = Math.min(WINDOW_CELLS, nx - i0);
  let w = 0;
  for (let k = 0; k < WINDOW_CELLS; k += 1) {
    const kk = k0 + k;
    for (let j = 0; j < WINDOW_CELLS; j += 1) {
      const jj = j0 + j;
      if (kk >= nz || jj >= ny || width <= 0) {
        out.fill(0, w, w + WINDOW_CELLS);
      } else {
        const base = i0 + nx * (jj + ny * kk);
        out.set(finish.subarray(base, base + width), w);
        if (width < WINDOW_CELLS) out.fill(0, w + width, w + WINDOW_CELLS);
      }
      w += WINDOW_CELLS;
    }
  }
  return out;
}
