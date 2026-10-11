/**
 * Chunks (src/stock/chunks.ts). What a green run proves, and its bounds:
 *   1. The layout counts chunks of 32 cubes per axis over a lattice, ids and coordinates round-trip.
 *   2. A cell on a chunk's first plane dirties that chunk and the one before it, a cell inside dirties one chunk, and a box spanning chunks dirties each of them once in increasing id order.
 *   3. A copied window carries the grid's values where the grid exists and air (+limit) beyond it, and the finish window carries 0 beyond the grid.
 * Bounds: no meshing here; the mesher's own test covers what a window becomes.
 */
import { describe, expect, it } from 'vitest';

import { chunkCoords, chunkId, chunkLayout, chunksTouching, copyFinishWindow, copyWindow, windowOrigin } from './chunks';
import { Grid } from './grid';
import { WINDOW_CELLS } from './mesher';

const spec = { cell: 0.01, size: [70, 33, 40] as const, origin: [0, 0, 0] as const, band: 3 };

describe('chunk layout', () => {
  const layout = chunkLayout(spec);

  it('counts chunks of 32 cubes and round-trips ids', () => {
    expect([...layout.counts]).toEqual([3, 1, 2]);
    expect(layout.total).toBe(6);
    for (let id = 0; id < layout.total; id += 1) expect(chunkId(layout, ...chunkCoords(layout, id))).toBe(id);
  });

  it('dirties the chunks whose windows hold a cell box', () => {
    expect(chunksTouching(layout, { min: [5, 5, 5], max: [5, 5, 5] })).toEqual([0]);
    expect(chunksTouching(layout, { min: [32, 5, 5], max: [32, 5, 5] })).toEqual([0, 1]);
    expect(chunksTouching(layout, { min: [33, 5, 5], max: [33, 5, 5] })).toEqual([1]);
    expect(chunksTouching(layout, { min: [31, 0, 31], max: [64, 32, 32] })).toEqual([0, 1, 2, 3, 4, 5]);
    expect(chunksTouching(layout, { min: [-5, -5, -5], max: [-1, -1, -1] })).toEqual([]);
    expect(chunksTouching(layout, { min: [68, 0, 0], max: [80, 0, 0] })).toEqual([2]);
  });
});

describe('windows', () => {
  const layout = chunkLayout(spec);
  const grid = new Grid(spec);
  grid.values.fill(-100);
  grid.values[grid.index(69, 32, 39)] = 7;

  it('copies values inside the grid and air beyond it', () => {
    const last = chunkId(layout, 2, 0, 1);
    const window = copyWindow(grid, layout, last);
    expect(window.length).toBe(WINDOW_CELLS ** 3);
    // Cell (69, 32, 39) is window sample (5, 32, 7) of the chunk at (64, 0, 32); i = 70 and k = 40 lie beyond the grid.
    expect(window[5 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(7);
    expect(window[4 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(-100);
    expect(window[6 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(grid.limit);
    expect(window[0 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(-100);
    expect(window[0 + WINDOW_CELLS * (0 + WINDOW_CELLS * 8)]).toBe(grid.limit);
    expect(windowOrigin(grid, layout, last)).toEqual([0.64, 0, 0.32]);
  });

  it('copies finish codes with 0 beyond the grid', () => {
    const finish = new Uint8Array(70 * 33 * 40).fill(9);
    const window = copyFinishWindow(finish, spec, layout, chunkId(layout, 2, 0, 1));
    expect(window[5 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(9);
    expect(window[6 + WINDOW_CELLS * (32 + WINDOW_CELLS * 7)]).toBe(0);
    expect(window[0 + WINDOW_CELLS * (0 + WINDOW_CELLS * 8)]).toBe(0);
  });
});
