/**
 * The undo record's size (src/stock/carve-kernel.ts, Undo; review C3.2: the index form held 351 MB at t = 21 on the David, 94 KB per bulk blow). What a green run proves, and its bounds:
 *   1. Nine bulk point blows of the plan's size (0.15 m, a 0.36 m crater) at the plan's 0.2 m pitch into a flat face on an 8 mm lattice, each overlapping the earlier craters as the roughing steps do, cost on average under BULK_BYTES_PER_CELL per changed cell and under BULK_BYTES_PER_BLOW per blow; the first blow, on the untouched face, is the worst per cell and is logged.
 *   2. A rasp patch on the untouched face, whose changed cells are all band cells, costs under RUBBING_BYTES_PER_CELL per changed cell: the segment form's three bytes of values plus its share of a pair, where an index with its bytes cost seven.
 *   3. Every record restores the face exactly.
 * The bounds are 1.25 times the measurements of 2026-10-13, rounded up: bulk 1.53 B per changed cell and 40.6 KB per blow (the first blow 0.78 B per cell, 33.7 KB: most of its cells are deep runs), the rasp patch 2.8 B per cell; the index form measured 3.8 B per cell and 55 KB per bulk blow on the synthetic 8 mm plan, 7.0 B per cell for the rubbing tools.
 * Bounds: a flat face, so the share of band cells is the face's, not a crater field's on the figure; src/choreography/david-steps.slow.test.ts measures the whole plan's log against the 60,000-blow budget.
 */
import { describe, expect, it } from 'vitest';

import type { Blow } from '../contracts/making';
import { DEFAULT_CELL_M, STOCK_BAND_CELLS } from '../david/frame';
import { applyBlow, type CarveState, undoBlow, undoBytes } from './carve';
import { chunkLayout } from './chunks';
import { createFinishGrid, Grid } from './grid';
import { BULK_CUT_SIZE_M } from './tool-volumes';

const BULK_BYTES_PER_CELL = 2;
const BULK_BYTES_PER_BLOW = 51_000;
const RUBBING_BYTES_PER_CELL = 3.5;
/** The roughing steps' bulk blow and pitch (src/choreography/david-steps.ts, BULK). */
const BULK_SIZE = 0.15;
const BULK_PITCH = 0.2;

/** A flat stock face at y = 0 over a lattice `extent` wide, the figure a plane deep below so no crater reaches it. */
function face(cell: number, extent: number): { state: CarveState; figure: Grid } {
  const n = Math.round(extent / cell);
  const spec = { cell, size: [n, n, n] as const, origin: [-extent / 2, -extent / 2, -extent / 2] as const, band: 16 };
  const figure = new Grid(spec);
  figure.fill((_x, y) => y + extent * 0.45);
  const stock = new Grid({ ...spec, band: STOCK_BAND_CELLS });
  stock.fill((_x, y) => y);
  return { state: { stock, finish: createFinishGrid(spec), chunks: chunkLayout(spec) }, figure };
}

describe('undo record size at 8 mm', () => {
  it('records a field of bulk craters under the per-cell and per-blow bounds and restores the face', () => {
    expect(BULK_SIZE).toBeGreaterThanOrEqual(BULK_CUT_SIZE_M);
    const { state, figure } = face(DEFAULT_CELL_M, 0.72);
    const stock0 = state.stock.values.slice();
    const finish0 = state.finish.slice();
    const blows: Blow[] = [];
    for (const x of [-BULK_PITCH, 0, BULK_PITCH]) for (const z of [-BULK_PITCH, 0, BULK_PITCH]) blows.push({ tool: 'point', point: [x, 0, z], normal: [0, 1, 0], direction: [0, -1, 0], size: BULK_SIZE, stroke: blows.length });
    const results = blows.map((blow) => applyBlow(state, figure, blow, 0));
    const bytes = results.map((r) => undoBytes(r.undo));
    const changed = results.map((r) => r.changed);
    const total = bytes.reduce((a, b) => a + b, 0);
    const cells = changed.reduce((a, b) => a + b, 0);
    const first = (bytes[0] ?? 0) / Math.max(1, changed[0] ?? 0);
    console.log(`bulk craters at ${String(DEFAULT_CELL_M)} m: ${String(blows.length)} blows, ${(total / 1e3).toFixed(1)} KB, ${(total / blows.length / 1e3).toFixed(1)} KB per blow, ${(total / cells).toFixed(2)} B per changed cell (first blow on the untouched face ${first.toFixed(2)} B per cell, ${((bytes[0] ?? 0) / 1e3).toFixed(1)} KB)`);
    expect(cells).toBeGreaterThan(100_000);
    expect(total / cells).toBeLessThan(BULK_BYTES_PER_CELL);
    expect(total / blows.length).toBeLessThan(BULK_BYTES_PER_BLOW);
    for (let n = results.length - 1; n >= 0; n -= 1) undoBlow(state, results[n]?.undo ?? { parts: [] });
    expect(state.stock.values).toEqual(stock0);
    expect(state.finish).toEqual(finish0);
  });

  it('records a rasp patch on the face under the per-cell bound', () => {
    const { state, figure } = face(DEFAULT_CELL_M, 0.32);
    const result = applyBlow(state, figure, { tool: 'rasp', point: [0, 0, 0], normal: [0, 1, 0], direction: [1, -0.17, 0], size: 0.03, stroke: 0 }, 0);
    const perCell = undoBytes(result.undo) / Math.max(1, result.changed);
    console.log(`rasp patch at ${String(DEFAULT_CELL_M)} m: ${String(result.changed)} cells, ${(undoBytes(result.undo) / 1e3).toFixed(1)} KB, ${perCell.toFixed(2)} B per changed cell`);
    expect(result.changed).toBeGreaterThan(500);
    expect(perCell).toBeLessThan(RUBBING_BYTES_PER_CELL);
  });
});
