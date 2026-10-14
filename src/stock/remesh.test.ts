/**
 * The remesher's fallback (src/stock/remesh.ts) when the pool fails a job, which src/stock/pool.ts does for a worker that answers `failed` or crashes (review F7: a failed mesher job once left readiness pending). What a green run proves, and its bounds:
 *   1. With a mesher that fails every job, a flush of every chunk of a 4 cm block ends with `pending` 0, every skin chunk holding a mesh with triangles (meshed on the main thread), the `onMeshed` listener fired once, and one console.error per failed chunk naming the chunk and the fallback.
 *   2. The meshes equal, chunk for chunk, the ones the synchronous mesher gives on the same state.
 * Bounds: a stub mesher that fails at submission, not the worker pool's transport or a real crash; the carve jobs' failure path (src/timeline/jump.ts) is not covered here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { chunkLayout } from './chunks';
import { blockGrid, blockLattice, createFinishGrid, frameBlockBox } from './grid';
import { type ChunkMesher, createSyncMesher, Remesher } from './remesh';

function failingMesher(): ChunkMesher {
  return {
    transfers: true,
    submit(job, _done, fail): void {
      fail(new Error(`engine worker crashed on chunk ${String(job.id)}: stub`));
    },
    dispose(): void {
      // Nothing to release.
    },
  };
}

describe('remesher fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('meshes a chunk on the main thread when the pool fails its job, leaving nothing pending', () => {
    const spec = blockLattice(0.04);
    const state = { stock: blockGrid(spec, frameBlockBox()), finish: createFinishGrid(spec), chunks: chunkLayout(spec) };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const remesher = new Remesher(state, new THREE.MeshBasicMaterial(), failingMesher());
    let meshed = 0;
    remesher.onMeshed(() => {
      meshed += 1;
    });
    remesher.markAllDirty();
    expect(remesher.pending).toBe(state.chunks.total);
    remesher.flush();
    expect(remesher.pending).toBe(0);
    expect(meshed).toBe(1);
    expect(remesher.triangles).toBeGreaterThan(0);
    expect(errors).toHaveBeenCalledTimes(state.chunks.total);
    expect(errors.mock.calls[0]?.[0]).toMatch(/chunk 0 is meshed on the main thread instead: engine worker crashed on chunk 0: stub/);

    const reference = new Remesher(state, new THREE.MeshBasicMaterial(), createSyncMesher());
    reference.markAllDirty();
    reference.flush();
    expect(reference.group.children.length).toBeGreaterThan(0);
    expect(remesher.group.children.length).toBe(reference.group.children.length);
    for (let id = 0; id < state.chunks.total; id += 1) {
      const fallback = remesher.positionsOf(id);
      const expected = reference.positionsOf(id);
      if (expected === null) expect(fallback).toBeNull();
      else expect(fallback).toEqual(expected);
    }
    remesher.dispose();
    reference.dispose();
  });
});
