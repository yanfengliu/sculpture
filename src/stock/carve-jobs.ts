/**
 * Chunk carve jobs (docs/design/spec.md, Undo and replay; docs/research/engine-options.md section 5): a forward jump applies its blows chunk by chunk in the workers.
 * The main thread packs, for every chunk a blow's dilated box covers, the chunk's stock and finish bytes and the blows in index order (`packBlow`, `copyChunk`); a worker runs the kernel over the chunk's cells for each blow (`runCarveJob`) and returns the new bytes with the per-blow undo records; the main thread writes the bytes back (`writeChunk`) and files the undo parts under their blows (`undoPartsOf`).
 * A cell belongs to exactly one chunk here (its own 32³, not the 33³ mesh window), so no cell is carved twice, and within a chunk the blows keep their index order, so the bytes equal the serial path's (src/stock/carve-parallel.test.ts). `runCarveJob` is pure and runs in-process in the tests.
 */
import { type GridSpec, cellIndex } from '../contracts/grid';
import type { Blow, ToolId, Vec3 } from '../contracts/making';
import { carveCells, UndoSink } from './carve-kernel';
import { dilatedBox, TOOL_FINISH, TOOL_PAINT_OVER, type UndoPart } from './carve';
import { type CellBox, chunkCoords, type ChunkLayout } from './chunks';
import { CHUNK_CELLS } from './mesher';
import { toolVolume } from './tool-volumes';

/** Tool ids by their code in a packed blow, the order of src/contracts/making.ts. */
export const TOOL_IDS: readonly ToolId[] = ['charcoal', 'point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];
/** Numbers per packed blow: tool code, point, normal, direction, size, margin (fixed point), the figure's distance at the point (metres) and the blow's index in the plan. */
export const BLOW_FIELDS = 14;
/** Numbers per row of a result's table: the blow index, its run and index ranges in the undo arrays and its changed-cell box. */
export const TABLE_FIELDS = 11;
const CHUNK_VOLUME = CHUNK_CELLS * CHUNK_CELLS * CHUNK_CELLS;

/** The lattice a job carves on. */
export interface CarveLattice extends GridSpec {
  /** The stock's clamp in fixed point. */
  readonly stockLimit: number;
  /** The figure grid's clamp in metres, which the surface-following tools need. */
  readonly figureBand: number;
}

export interface CarveJob {
  /** Chunk id. */
  readonly id: number;
  readonly lattice: CarveLattice;
  /** The chunk's CHUNK_CELLS³ stock and finish, x fastest, carved in place. */
  readonly stock: Int16Array;
  readonly finish: Uint8Array;
  /** The chunk's figure values; null when the worker already holds them. */
  readonly figure: Int16Array | null;
  /** BLOW_FIELDS numbers per blow, in index order. */
  readonly blows: Float64Array;
}

export interface CarveResult {
  readonly id: number;
  readonly stock: Int16Array;
  readonly finish: Uint8Array;
  /** TABLE_FIELDS per blow that changed a cell of the chunk. */
  readonly table: Uint32Array;
  readonly runs: Uint32Array;
  readonly indices: Uint32Array;
  readonly oldStock: Int16Array;
  readonly oldFinish: Uint8Array;
}

/** A sink of carve jobs: the worker pool in the page; the tests run `runCarveJob` themselves. */
export interface ChunkCarver {
  submit(job: CarveJob, done: (result: CarveResult) => void, fail: (error: Error) => void): void;
  dispose(): void;
}

export function packBlow(out: Float64Array, slot: number, blow: Blow, marginFixed: number, figureAtPoint: number, index: number): void {
  const at = slot * BLOW_FIELDS;
  out[at] = TOOL_IDS.indexOf(blow.tool);
  out[at + 1] = blow.point[0];
  out[at + 2] = blow.point[1];
  out[at + 3] = blow.point[2];
  out[at + 4] = blow.normal[0];
  out[at + 5] = blow.normal[1];
  out[at + 6] = blow.normal[2];
  out[at + 7] = blow.direction[0];
  out[at + 8] = blow.direction[1];
  out[at + 9] = blow.direction[2];
  out[at + 10] = blow.size;
  out[at + 11] = marginFixed;
  out[at + 12] = figureAtPoint;
  out[at + 13] = index;
}

function unpackBlow(packed: Float64Array, slot: number): { blow: Blow; marginFixed: number; figureAtPoint: number; index: number } {
  const at = slot * BLOW_FIELDS;
  const v = (n: number): number => packed[at + n] ?? 0;
  const tool = TOOL_IDS[v(0)] ?? 'point';
  return { blow: { tool, point: [v(1), v(2), v(3)], normal: [v(4), v(5), v(6)], direction: [v(7), v(8), v(9)], size: v(10), stroke: 0 }, marginFixed: v(11), figureAtPoint: v(12), index: v(13) };
}

/** The first cell of a chunk on each axis. */
export function chunkStart(layout: ChunkLayout, id: number): Vec3 {
  const [cx, cy, cz] = chunkCoords(layout, id);
  return [cx * CHUNK_CELLS, cy * CHUNK_CELLS, cz * CHUNK_CELLS];
}

/** Copies a chunk's CHUNK_CELLS³ cells out of a grid-sized array; cells beyond the grid are `fill`. */
export function copyChunk<T extends Int16Array | Uint8Array>(values: T, spec: GridSpec, layout: ChunkLayout, id: number, fill: number, make: (n: number) => T): T {
  const out = make(CHUNK_VOLUME);
  if (fill !== 0) out.fill(fill);
  const [i0, j0, k0] = chunkStart(layout, id);
  const [nx, ny, nz] = spec.size;
  const width = Math.min(CHUNK_CELLS, nx - i0);
  if (width <= 0) return out;
  for (let k = 0; k < CHUNK_CELLS && k0 + k < nz; k += 1) {
    for (let j = 0; j < CHUNK_CELLS && j0 + j < ny; j += 1) {
      const from = cellIndex(spec.size, i0, j0 + j, k0 + k);
      out.set(values.subarray(from, from + width), CHUNK_CELLS * (j + CHUNK_CELLS * k));
    }
  }
  return out;
}

/** Writes a chunk's cells back into a grid-sized array. */
export function writeChunk<T extends Int16Array | Uint8Array>(values: T, spec: GridSpec, layout: ChunkLayout, id: number, chunk: T): void {
  const [i0, j0, k0] = chunkStart(layout, id);
  const [nx, ny, nz] = spec.size;
  const width = Math.min(CHUNK_CELLS, nx - i0);
  if (width <= 0) return;
  for (let k = 0; k < CHUNK_CELLS && k0 + k < nz; k += 1) {
    for (let j = 0; j < CHUNK_CELLS && j0 + j < ny; j += 1) {
      const at = CHUNK_CELLS * (j + CHUNK_CELLS * k);
      values.set(chunk.subarray(at, at + width), cellIndex(spec.size, i0, j0 + j, k0 + k));
    }
  }
}

/** The chunks whose own cells meet a global cell box, in increasing id order. */
export function chunksCovering(layout: ChunkLayout, box: CellBox): number[] {
  const ids: number[] = [];
  const first = [0, 1, 2].map((axis) => Math.floor((box.min[axis] ?? 0) / CHUNK_CELLS));
  const last = [0, 1, 2].map((axis) => Math.min((layout.counts[axis] ?? 1) - 1, Math.floor((box.max[axis] ?? 0) / CHUNK_CELLS)));
  for (let cz = first[2] ?? 0; cz <= (last[2] ?? -1); cz += 1) {
    for (let cy = first[1] ?? 0; cy <= (last[1] ?? -1); cy += 1) {
      for (let cx = first[0] ?? 0; cx <= (last[0] ?? -1); cx += 1) ids.push(cx + layout.counts[0] * (cy + layout.counts[1] * cz));
    }
  }
  return ids;
}

/** Carves the job's blows into its chunk, in order; pure apart from the job's own arrays. `figure` is the chunk's figure values (the job's or the worker's cached copy). */
export function runCarveJob(job: CarveJob, figure: Int16Array, layout: ChunkLayout): CarveResult {
  const { lattice } = job;
  const [nx, ny, nz] = lattice.size;
  const [i0, j0, k0] = chunkStart(layout, job.id);
  const target = {
    values: job.stock,
    finish: job.finish,
    figure,
    nx: CHUNK_CELLS,
    ny: CHUNK_CELLS,
    nz: CHUNK_CELLS,
    offset: [i0, j0, k0] as const,
    origin: lattice.origin,
    cell: lattice.cell,
    limit: lattice.stockLimit,
    globalNx: nx,
    globalNy: ny,
  };
  const i1 = Math.min(nx - 1, i0 + CHUNK_CELLS - 1);
  const j1 = Math.min(ny - 1, j0 + CHUNK_CELLS - 1);
  const k1 = Math.min(nz - 1, k0 + CHUNK_CELLS - 1);
  const sink = new UndoSink();
  const table: number[] = [];
  const count = Math.floor(job.blows.length / BLOW_FIELDS);
  for (let n = 0; n < count; n += 1) {
    const { blow, marginFixed, figureAtPoint, index } = unpackBlow(job.blows, n);
    const volume = toolVolume(blow, figureAtPoint, lattice.figureBand);
    const box = dilatedBox(volume, lattice);
    if (box === null) continue;
    const local: CellBox = {
      min: [Math.max(box.min[0], i0) - i0, Math.max(box.min[1], j0) - j0, Math.max(box.min[2], k0) - k0],
      max: [Math.min(box.max[0], i1) - i0, Math.min(box.max[1], j1) - j0, Math.min(box.max[2], k1) - k0],
    };
    if (local.max[0] < local.min[0] || local.max[1] < local.min[1] || local.max[2] < local.min[2]) continue;
    const runsBefore = sink.runs.count;
    const indicesBefore = sink.indices.count;
    const result = carveCells(target, volume, local, { marginFixed, code: TOOL_FINISH[blow.tool], paintOver: TOOL_PAINT_OVER[blow.tool] }, sink);
    if (result.box === null) continue;
    table.push(index, runsBefore, sink.runs.count, indicesBefore, sink.indices.count, result.box.min[0] + i0, result.box.min[1] + j0, result.box.min[2] + k0, result.box.max[0] + i0, result.box.max[1] + j0, result.box.max[2] + k0);
  }
  return { id: job.id, stock: job.stock, finish: job.finish, table: Uint32Array.from(table), runs: sink.runs.done(), indices: sink.indices.done(), oldStock: sink.stock.done(), oldFinish: sink.finish.done() };
}

/** The undo parts a result holds, by blow index: views into the result's arrays, no copies. */
export function undoPartsOf(result: CarveResult): { index: number; part: UndoPart }[] {
  const parts: { index: number; part: UndoPart }[] = [];
  const t = result.table;
  for (let row = 0; row + TABLE_FIELDS <= t.length; row += TABLE_FIELDS) {
    const v = (n: number): number => t[row + n] ?? 0;
    parts.push({
      index: v(0),
      part: {
        runs: result.runs.subarray(v(1), v(2)),
        indices: result.indices.subarray(v(3), v(4)),
        stock: result.oldStock.subarray(v(3), v(4)),
        finish: result.oldFinish.subarray(v(3), v(4)),
        box: { min: [v(5), v(6), v(7)], max: [v(8), v(9), v(10)] },
      },
    });
  }
  return parts;
}
