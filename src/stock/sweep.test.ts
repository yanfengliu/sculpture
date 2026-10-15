/**
 * The sweep (src/stock/sweep.ts) against a whole-grid flood fill (src/stock/components.ts). What a green run proves, and its bounds:
 *   1. On a 1.2 m block of 2 cm cells (72³ cells, 27 chunks) around a sphere, bulk craters applied through `applyBlow` cut three pieces free over three rounds: a top slab (across nine chunks), a column on the −x side that still stands on the base row and a column on the +x side cut from the base too. Each round's sweep removes exactly the cells of the components holding neither a figure cell nor a base cell as the flood fill finds them (the slab, nothing, then the +x column), keeps the figure's stone and the base-standing column, sets the swept cells to deep air with finish 0 and leaves every other byte alone; a last round of cones that frees nothing sweeps nothing.
 *   2. The record: undoing the sweep's parts restores the stock and finish bytes exactly, the parts hold runs for the deep cells and segments with values for the rest, and the sweep's dirty ids are exactly the chunks whose window holds a swept cell.
 *   3. Incrementality: the first sweep labels every chunk; later sweeps label only the chunks the round's blows dirtied and the chunks the previous sweep emptied, and give the same cells as the flood fill all the same.
 *   4. On a seeded random lattice of 40×35×33 cells (the z extent one past the last chunk's 32 cells, the lattice `chunkLayout` leaves a plane beyond its chunks) with a ball for the figure, two sweeps around a round of random cell changes match the flood fill cell for cell.
 * Bounds: 6-connectivity on both sides; the base row is the lowest stock row at t = 0; the bulk crater and the point cone are the only tools struck; the David's plan is not here (src/stock/connectivity.test.ts at 2 cm and the slow test at 8 mm run it).
 */
import { describe, expect, it } from 'vitest';

import type { Blow, Vec3 } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { applyBlow, type CarveState, undoBlow, undoBytes } from './carve';
import { type CellBox, chunkId, chunkLayout, chunksTouching } from './chunks';
import { floodComponents } from './components';
import { blockGrid, createFinishGrid, Grid } from './grid';
import { CHUNK_CELLS } from './mesher';
import { baseRowOf, type SweepResult, StockSweeper } from './sweep';

const CELL = 0.02;
const SPEC = { cell: CELL, size: [72, 72, 72] as const, origin: [-0.72, -0.1, -0.72] as const, band: 16 };
const BLOCK = { min: [-0.6, 0, -0.6] as Vec3, max: [0.6, 1.2, 0.6] as Vec3 };
const BULK = 0.15;

function sphereFigure(): Grid {
  const figure = new Grid(SPEC);
  figure.fill((x, y, z) => Math.hypot(x, y - 0.6, z) - 0.25);
  return figure;
}

function freshState(spec = SPEC, block = BLOCK): CarveState {
  return { stock: blockGrid(spec, block), finish: createFinishGrid(spec), chunks: chunkLayout(spec) };
}

function crater(point: Vec3, direction: Vec3, normal: Vec3): Blow {
  return { tool: 'point', point, normal, direction, size: BULK, stroke: 0 };
}

/** A slit through the block: craters along `direction` on a grid of points. */
function slit(points: readonly Vec3[], direction: Vec3, normal: Vec3): Blow[] {
  return points.map((point) => crater(point, direction, normal));
}

function grid3(xs: readonly number[], ys: readonly number[], zs: readonly number[]): Vec3[] {
  const points: Vec3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) points.push([x, y, z]);
  return points;
}

/** The cells a sweep must take off: those of the components holding neither a figure nor a base cell. */
function expectedSweep(state: CarveState, figure: Grid, baseRow: number): { mask: Uint8Array; cells: number; loose: number; baseOnly: number; components: number } {
  const found = floodComponents(state.stock, figure, baseRow);
  const mask = new Uint8Array(found.label.length);
  let cells = 0;
  let loose = 0;
  let baseOnly = 0;
  for (let c = 0; c < found.count; c += 1) {
    if (found.holdsFigure[c] === 0 && found.holdsBase[c] === 0) loose += 1;
    if (found.holdsFigure[c] === 0 && found.holdsBase[c] === 1) baseOnly += 1;
  }
  for (let n = 0; n < mask.length; n += 1) {
    const c = found.label[n] ?? 0;
    if (c === 0 || found.holdsFigure[c - 1] === 1 || found.holdsBase[c - 1] === 1) continue;
    mask[n] = 1;
    cells += 1;
  }
  return { mask, cells, loose, baseOnly, components: found.count };
}

/** Checks a sweep's result against the flood fill's mask taken before it, on the state after it. */
function checkSweep(state: CarveState, result: SweepResult, before: { stock: Int16Array; finish: Uint8Array }, mask: Uint8Array, cells: number): void {
  const { stock, finish, chunks } = state;
  expect(result.cells).toBe(cells);
  const limit = stock.limit;
  const dirty = new Set<number>();
  for (let n = 0; n < mask.length; n += 1) {
    if (mask[n] === 1) {
      if (stock.values[n] !== limit || finish[n] !== 0) throw new Error(`swept cell ${String(n)} holds ${String(stock.values[n])}, finish ${String(finish[n])}`);
      const i = n % stock.nx;
      const j = Math.floor(n / stock.nx) % stock.ny;
      const k = Math.floor(n / (stock.nx * stock.ny));
      for (const id of chunksTouching(chunks, { min: [i, j, k], max: [i, j, k] })) dirty.add(id);
    } else if (stock.values[n] !== before.stock[n] || finish[n] !== before.finish[n]) throw new Error(`cell ${String(n)} outside the sweep changed from ${String(before.stock[n])} to ${String(stock.values[n])}`);
  }
  expect(result.dirty).toEqual([...dirty].sort((a, b) => a - b));
  // The record restores the bytes, on a copy of the swept state.
  const copy: CarveState = { stock: new Grid(stock.spec, stock.values.slice()), finish: finish.slice(), chunks };
  undoBlow(copy, { parts: result.parts });
  expect(copy.stock.values).toEqual(before.stock);
  expect(copy.finish).toEqual(before.finish);
  expect(undoBytes({ parts: result.parts }) > 0).toBe(cells > 0);
  for (const part of result.parts) {
    expect(part.runs.length % 2).toBe(0);
    expect(part.indices.length % 2).toBe(0);
    expect(part.stock.length).toBe(part.finish.length);
    let segmentCells = 0;
    for (let r = 1; r < part.indices.length; r += 2) segmentCells += part.indices[r] ?? 0;
    expect(part.stock.length).toBe(segmentCells);
  }
}

/** The chunk that owns a cell. */
function ownerOf(layout: ReturnType<typeof chunkLayout>, box: CellBox): number {
  const at = (axis: 0 | 1 | 2): number => Math.min(layout.counts[axis] - 1, Math.floor(box.min[axis] / CHUNK_CELLS));
  return chunkId(layout, at(0), at(1), at(2));
}

function snapshot(state: CarveState): { stock: Int16Array; finish: Uint8Array } {
  return { stock: state.stock.values.slice(), finish: state.finish.slice() };
}

describe('the sweep on pieces cut free by craters', () => {
  const figure = sphereFigure();
  const state = freshState();
  const sweeper = new StockSweeper(state, figure);
  const total = state.chunks.total;
  const baseRow = sweeper.baseRow;
  expect(total).toBe(27);
  expect(baseRow).toBe(6);
  expect(baseRowOf(state.stock)).toBe(6);
  const dirtied = new Set<number>();
  const apply = (blows: readonly Blow[]): void => {
    for (const blow of blows) {
      const result = applyBlow(state, figure, blow, 0);
      expect(result.changed).toBeGreaterThan(0);
      sweeper.markDirty(result.dirty);
      for (const id of result.dirty) dirtied.add(id);
    }
  };
  let previousSwept: number[] = [];

  it('takes the top slab off once a horizontal slit cuts it free, and nothing else', () => {
    apply(slit(grid3([-0.5, -0.25, 0, 0.25, 0.5], [0.95], [-0.45, -0.15, 0.15, 0.45]), [1, 0, 0], [0, 1, 0]));
    const before = snapshot(state);
    const expected = expectedSweep(state, figure, baseRow);
    expect(expected.loose).toBe(1);
    expect(expected.cells).toBeGreaterThan(5000);
    const result = sweeper.sweep();
    expect(result.relabelled).toBe(total);
    checkSweep(state, result, before, expected.mask, expected.cells);
    const after = expectedSweep(state, figure, baseRow);
    expect(after.loose).toBe(0);
    expect(after.components).toBe(1);
    previousSwept = result.parts.map((part) => ownerOf(state.chunks, part.box));
    dirtied.clear();
  });

  const ys = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const zs = [-0.45, -0.15, 0.15, 0.45];

  it('keeps a column that a vertical slit cuts from the body while it stands on the base, labelling only the dirtied chunks', () => {
    apply(slit(grid3([-0.35], ys, zs), [0, 0, 1], [-1, 0, 0]));
    const before = snapshot(state);
    const expected = expectedSweep(state, figure, baseRow);
    expect(expected.loose).toBe(0);
    expect(expected.baseOnly).toBe(1);
    expect(expected.components).toBe(2);
    const result = sweeper.sweep();
    expect(result.relabelled).toBe(new Set([...dirtied, ...previousSwept]).size);
    expect(result.relabelled).toBeLessThan(total);
    checkSweep(state, result, before, expected.mask, 0);
    expect(result.parts).toEqual([]);
    expect(expectedSweep(state, figure, baseRow).components).toBe(2);
    previousSwept = [];
    dirtied.clear();
  });

  it('takes a column cut from the body and from the base, labelling only the dirtied chunks', () => {
    apply(slit(grid3([0.35], ys, zs), [0, 0, 1], [1, 0, 0]));
    apply(slit(grid3([0.57], [-0.05], zs), [0, 0, 1], [1, 0, 0]));
    const before = snapshot(state);
    const expected = expectedSweep(state, figure, baseRow);
    expect(expected.loose).toBe(1);
    expect(expected.baseOnly).toBe(1);
    expect(expected.components).toBe(3);
    expect(expected.cells).toBeGreaterThan(1000);
    const result = sweeper.sweep();
    expect(result.relabelled).toBe(new Set([...dirtied, ...previousSwept]).size);
    expect(result.relabelled).toBeLessThan(total);
    checkSweep(state, result, before, expected.mask, expected.cells);
    const after = expectedSweep(state, figure, baseRow);
    expect(after.loose).toBe(0);
    expect(after.baseOnly).toBe(1);
    expect(after.components).toBe(2);
    previousSwept = result.parts.map((part) => ownerOf(state.chunks, part.box));
    dirtied.clear();
  });

  it('sweeps nothing after blows that free nothing, labelling only what they touched', () => {
    // The cones strike the stone between the slits: until 2026-10-14 the outer two stood at x = ±0.2 in the slits' air and touched only the walls' band, and the crater's rim wobble (src/stock/tool-volumes.ts) moved the x = 0.35 slit's wall past the x = 0.2 cone.
    const cones: Blow[] = [-0.1, 0, 0.1].map((x) => ({ tool: 'point', point: [x, 0.76, 0.35], normal: [0, 1, 0], direction: [0, -1, 0], size: 0.02, stroke: 0 }));
    apply(cones);
    const before = snapshot(state);
    const expected = expectedSweep(state, figure, baseRow);
    expect(expected.loose).toBe(0);
    const result = sweeper.sweep();
    expect(result.relabelled).toBe(new Set([...dirtied, ...previousSwept]).size);
    expect(result.relabelled).toBeLessThan(total);
    expect(result.parts).toEqual([]);
    expect(result.dirty).toEqual([]);
    checkSweep(state, result, before, expected.mask, 0);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the sweep on a random lattice that runs a plane past its last chunk', () => {
  it('matches the flood fill over two sweeps around random changes', () => {
    const spec = { cell: 0.01, size: [40, 35, 33] as const, origin: [0, 0, 0] as const, band: 4 };
    const layout = chunkLayout(spec);
    expect(layout.counts).toEqual([2, 2, 1]);
    const figure = new Grid({ ...spec, band: 16 });
    figure.fill((x, y, z) => Math.hypot(x - 0.2, y - 0.17, z - 0.16) - 0.06);
    const stock = new Grid({ ...spec, band: STOCK_BAND_CELLS });
    const random = mulberry32(7);
    const limit = stock.limit;
    for (let n = 0; n < stock.values.length; n += 1) stock.values[n] = random() < 0.6 ? -limit : limit;
    const state: CarveState = { stock, finish: createFinishGrid(spec), chunks: layout };
    for (let n = 0; n < state.finish.length; n += 1) if (random() < 0.1) state.finish[n] = 4;
    const sweeper = new StockSweeper(state, figure);
    expect(sweeper.baseRow).toBe(baseRowOf(stock));
    for (let round = 0; round < 2; round += 1) {
      if (round > 0) {
        for (let n = 0; n < 2000; n += 1) {
          const index = Math.floor(random() * stock.values.length);
          stock.values[index] = random() < 0.5 ? limit : -Math.round(random() * limit);
          const i = index % stock.nx;
          const j = Math.floor(index / stock.nx) % stock.ny;
          const k = Math.floor(index / (stock.nx * stock.ny));
          sweeper.markDirty(chunksTouching(layout, { min: [i, j, k], max: [i, j, k] }));
        }
      }
      const before = snapshot(state);
      const expected = expectedSweep(state, figure, sweeper.baseRow);
      expect(expected.loose).toBeGreaterThan(10);
      const result = sweeper.sweep();
      checkSweep(state, result, before, expected.mask, expected.cells);
      expect(expectedSweep(state, figure, sweeper.baseRow).loose).toBe(0);
    }
  });
});
