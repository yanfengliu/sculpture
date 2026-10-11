/**
 * The carving rule on the main thread (docs/design/spec.md, Stock and figure): `applyBlow` runs the kernel of src/stock/carve-kernel.ts over the blow's volume box dilated by the stock band on the whole grid, paints the tool's finish, records an undo box (the old stock and finish of every changed cell) and reports the changed cells, the removed volume and the dirty chunks; `undoBlow` restores the bytes.
 * An undo box holds one part per array that applied the blow: one on the serial path, one per chunk on the parallel path (src/stock/carve-jobs.ts), each with its changed-cell box so undo can dirty the chunks again.
 */
import { FINISH, FIXED_POINT, type FinishCode, type GridSpec } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { carveCells, type KernelParams, PAINT_OVER_ALL, UndoSink } from './carve-kernel';
import { type CellBox, type ChunkLayout, chunksTouching } from './chunks';
import type { Grid } from './grid';
import { type ToolVolume, toolVolume } from './tool-volumes';

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

function mask(...codes: readonly FinishCode[]): number {
  let bits = 0;
  for (const code of codes) bits |= 1 << code;
  return bits;
}

/** The finish codes each tool paints over: the gilding leaf bonds only to the tooth texture the sling and the stump keep (docs/design/choreography.md, Known compromises); every other tool marks whatever it touches. */
export const TOOL_PAINT_OVER: Readonly<Record<ToolId, number>> = {
  charcoal: PAINT_OVER_ALL,
  point: PAINT_OVER_ALL,
  'two-tooth': PAINT_OVER_ALL,
  claw: PAINT_OVER_ALL,
  'fine-claw': PAINT_OVER_ALL,
  roundel: PAINT_OVER_ALL,
  flat: PAINT_OVER_ALL,
  drill: PAINT_OVER_ALL,
  rasp: PAINT_OVER_ALL,
  file: PAINT_OVER_ALL,
  pumice: PAINT_OVER_ALL,
  polish: PAINT_OVER_ALL,
  gilding: mask(FINISH.point, FINISH.twoTooth, FINISH.claw, FINISH.fineClaw, FINISH.roundel, FINISH.drill, FINISH.gilt),
};

export interface CarveState {
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly chunks: ChunkLayout;
}

/** The old bytes of the cells one array changed for one blow. */
export interface UndoPart {
  /** Pairs of (first global index, length): cells that were deep stock, −limit with finish 0. */
  readonly runs: Uint32Array;
  /** Every other changed cell, global index, with its old stock and finish. */
  readonly indices: Uint32Array;
  readonly stock: Int16Array;
  readonly finish: Uint8Array;
  /** Global cell box of the changed cells, for dirtying chunks on undo. */
  readonly box: CellBox;
}

/** The old bytes of every cell a blow changed, for exact undo; no parts when nothing changed. */
export interface UndoBox {
  readonly parts: readonly UndoPart[];
}

export interface ApplyResult {
  readonly changed: number;
  /** Metres cubed. */
  readonly removed: number;
  readonly dirty: readonly number[];
  readonly undo: UndoBox;
}

export const EMPTY_UNDO: UndoBox = { parts: [] };

/** The kernel parameters of a blow at a step margin (metres). */
export function kernelParams(blow: Blow, margin: number, cell: number): KernelParams {
  return { marginFixed: Math.round((margin / cell) * FIXED_POINT), code: TOOL_FINISH[blow.tool], paintOver: TOOL_PAINT_OVER[blow.tool] };
}

/** The blow's removed volume on `figure`'s lattice. */
export function volumeOf(figure: Grid, blow: Blow): ToolVolume {
  return toolVolume(blow, figure.sample(blow.point[0], blow.point[1], blow.point[2]), figure.spec.band * figure.cell);
}

/** The cells a volume can change on a lattice: its bounds dilated by the stock band, clamped to the grid; null when it misses the grid. */
export function dilatedBox(volume: ToolVolume, spec: GridSpec): CellBox | null {
  const { cell, origin, size } = spec;
  const i0 = Math.max(0, Math.floor((volume.min[0] - origin[0]) / cell) - STOCK_BAND_CELLS);
  const j0 = Math.max(0, Math.floor((volume.min[1] - origin[1]) / cell) - STOCK_BAND_CELLS);
  const k0 = Math.max(0, Math.floor((volume.min[2] - origin[2]) / cell) - STOCK_BAND_CELLS);
  const i1 = Math.min(size[0] - 1, Math.ceil((volume.max[0] - origin[0]) / cell) + STOCK_BAND_CELLS);
  const j1 = Math.min(size[1] - 1, Math.ceil((volume.max[1] - origin[1]) / cell) + STOCK_BAND_CELLS);
  const k1 = Math.min(size[2] - 1, Math.ceil((volume.max[2] - origin[2]) / cell) + STOCK_BAND_CELLS);
  if (i1 < i0 || j1 < j0 || k1 < k0) return null;
  return { min: [i0, j0, k0], max: [i1, j1, k1] };
}

/** Applies one blow to the whole grid and returns what changed. `margin` is the step's allowance above the figure, metres. */
export function applyBlow(state: CarveState, figure: Grid, blow: Blow, margin: number): ApplyResult {
  const { stock, finish } = state;
  const volume = volumeOf(figure, blow);
  const box = dilatedBox(volume, stock.spec);
  if (box === null) return { changed: 0, removed: 0, dirty: [], undo: EMPTY_UNDO };
  const sink = new UndoSink();
  const result = carveCells(
    { values: stock.values, finish, figure: figure.values, nx: stock.nx, ny: stock.ny, nz: stock.nz, offset: [0, 0, 0], origin: stock.spec.origin, cell: stock.cell, limit: stock.limit, globalNx: stock.nx, globalNy: stock.ny },
    volume,
    box,
    kernelParams(blow, margin, stock.cell),
    sink,
  );
  if (result.box === null) return { changed: 0, removed: 0, dirty: [], undo: EMPTY_UNDO };
  const part: UndoPart = { runs: sink.runs.done(), indices: sink.indices.done(), stock: sink.stock.done(), finish: sink.finish.done(), box: result.box };
  return { changed: result.changed, removed: result.removed, dirty: chunksTouching(state.chunks, result.box), undo: { parts: [part] } };
}

/** Restores the bytes an `applyBlow` changed and returns the chunks to remesh. */
export function undoBlow(state: CarveState, undo: UndoBox): number[] {
  const values = state.stock.values;
  const deep = -state.stock.limit;
  const dirty: number[] = [];
  for (const part of undo.parts) {
    const { runs, indices, stock, finish } = part;
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
    dirty.push(...chunksTouching(state.chunks, part.box));
  }
  return undo.parts.length > 1 ? [...new Set(dirty)] : dirty;
}

/** Bytes an undo box holds. */
export function undoBytes(undo: UndoBox): number {
  let bytes = 0;
  for (const part of undo.parts) bytes += part.runs.byteLength + part.indices.byteLength + part.stock.byteLength + part.finish.byteLength;
  return bytes;
}
