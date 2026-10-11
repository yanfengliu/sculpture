/**
 * Budgets without WebGL (docs/design/spec.md, Budgets). What a green run proves, and its bounds:
 *   1. Memory: the three grids at 8 mm on the block's lattice (figure and stock as Int16, finish as bytes) hold under 250 MB, far under the page's 1.5 GB.
 *   2. Triangles: the untouched block at 8 mm meshes, single-threaded, to under 2.5 million triangles over its skin chunks, and the time it takes is logged as the single-threaded full remesh.
 *   3. The chunk count at 8 mm stays under 1,500, the bound the worker pool and the undo bookkeeping are sized for.
 * Bounds: the triangle count at the finished state comes from the dev plan (src/choreography/dev-steps.test.ts logs it); frame rate, GPU memory and the worker pool are measured in the browser, not here.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { DEFAULT_CELL_M } from '../david/frame';
import { chunkLayout } from './chunks';
import { blockGrid, blockLattice, createFinishGrid, frameBlockBox } from './grid';
import { createSyncMesher, Remesher } from './remesh';

describe('budgets at 8 mm', () => {
  const spec = blockLattice(DEFAULT_CELL_M);
  const cells = spec.size[0] * spec.size[1] * spec.size[2];

  it('keeps the grids under 250 MB', () => {
    const bytes = cells * (2 + 2 + 1);
    console.log(`grids at ${String(DEFAULT_CELL_M)} m: ${spec.size.join('×')} = ${(cells / 1e6).toFixed(1)} M cells, ${(bytes / 1e6).toFixed(0)} MB for figure, stock and finish`);
    expect(bytes).toBeLessThan(250e6);
    expect(chunkLayout(spec).total).toBeLessThan(1500);
  });

  it('meshes the untouched block to under 2.5 million triangles', () => {
    const stock = blockGrid(spec, frameBlockBox());
    const state = { stock, finish: createFinishGrid(spec), chunks: chunkLayout(spec) };
    const remesher = new Remesher(state, new THREE.MeshBasicMaterial(), createSyncMesher());
    remesher.markAllDirty();
    const start = performance.now();
    remesher.flush();
    const seconds = (performance.now() - start) / 1000;
    const triangles = remesher.triangles;
    console.log(`block skin at ${String(DEFAULT_CELL_M)} m: ${String(state.chunks.total)} chunks, ${String(remesher.group.children.length)} with surface, ${String(triangles)} triangles, full remesh single-threaded ${seconds.toFixed(2)} s`);
    expect(remesher.pending).toBe(0);
    expect(triangles).toBeGreaterThan(500_000);
    expect(triangles).toBeLessThan(2_500_000);
    remesher.dispose();
  });
});
