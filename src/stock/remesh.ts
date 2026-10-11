/**
 * Remeshing of dirty chunks (docs/design/spec.md, Stock and figure): keeps the set of chunks a blow touched, sends each as a 33³ window to a `ChunkMesher` (the worker pool in the page, the synchronous mesher in tests and as a fallback) and swaps the chunk's `Mesh` under one `Group` when its geometry returns.
 * A chunk dirtied again while its job is out is meshed again when the stale result returns. A job the pool fails is logged and meshed on the main thread from a fresh window, so readiness never waits on a crashed worker. `onMeshed` listeners fire whenever the pending count reaches zero after work.
 */
import * as THREE from 'three';

import type { CarveState } from './carve';
import { copyFinishWindow, copyWindow, windowOrigin } from './chunks';
import { type ChunkMeshOutput, meshChunk, WINDOW_CELLS } from './mesher';
import type { MeshJob } from './worker-messages';

export type MeshDone = (id: number, out: ChunkMeshOutput) => void;
export type MeshFail = (error: Error) => void;

export interface ChunkMesher {
  /** True when the mesher takes the job's buffers away (a worker pool), so the caller must not reuse them. */
  readonly transfers: boolean;
  submit(job: MeshJob, done: MeshDone, fail: MeshFail): void;
  dispose(): void;
}

/** Meshes on the calling thread, synchronously; the fallback and the mesher of the tests. */
export function createSyncMesher(): ChunkMesher {
  return {
    transfers: false,
    submit(job, done): void {
      done(job.id, meshChunk(job));
    },
    dispose(): void {
      // Nothing to release.
    },
  };
}

/** Queues jobs until a mesher arrives (the worker pool loads asynchronously); falls back to the synchronous mesher if it never does. */
export function createDeferredMesher(ready: Promise<ChunkMesher>): ChunkMesher {
  let mesher: ChunkMesher | null = null;
  let disposed = false;
  const queue: { job: MeshJob; done: MeshDone; fail: MeshFail }[] = [];
  const adopt = (found: ChunkMesher): void => {
    if (disposed) {
      found.dispose();
      return;
    }
    mesher = found;
    for (const { job, done, fail } of queue.splice(0)) found.submit(job, done, fail);
  };
  ready.then(adopt).catch((error: unknown) => {
    console.error(`engine pool failed to start, meshing on the main thread instead: ${error instanceof Error ? error.message : String(error)}`);
    adopt(createSyncMesher());
  });
  return {
    transfers: true,
    submit(job, done, fail): void {
      if (mesher !== null) mesher.submit(job, done, fail);
      else queue.push({ job, done, fail });
    },
    dispose(): void {
      disposed = true;
      queue.length = 0;
      mesher?.dispose();
    },
  };
}

const WINDOW_VOLUME = WINDOW_CELLS * WINDOW_CELLS * WINDOW_CELLS;

export class Remesher {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly dirty = new Set<number>();
  /** Chunk id to whether it was dirtied again while its job was out. */
  private readonly inFlight = new Map<number, boolean>();
  private readonly listeners = new Set<() => void>();
  private readonly scratchValues = new Int16Array(WINDOW_VOLUME);
  private readonly scratchFinish = new Uint8Array(WINDOW_VOLUME);
  private readonly fallback = createSyncMesher();
  private worked = false;
  private disposed = false;

  constructor(
    private readonly state: CarveState,
    private readonly material: THREE.Material,
    private readonly mesher: ChunkMesher,
  ) {
    this.group.name = 'stock';
  }

  /** Chunks waiting or out for meshing. */
  get pending(): number {
    return this.dirty.size + this.inFlight.size;
  }

  /** Triangles across every chunk mesh. */
  get triangles(): number {
    let count = 0;
    for (const mesh of this.meshes.values()) count += mesh.geometry.getAttribute('position').count / 3;
    return count;
  }

  /** The chunk's positions, or null when it has no surface. */
  positionsOf(id: number): Float32Array | null {
    const mesh = this.meshes.get(id);
    if (mesh === undefined) return null;
    return mesh.geometry.getAttribute('position').array as Float32Array;
  }

  markDirty(ids: Iterable<number>): void {
    for (const id of ids) {
      if (this.inFlight.has(id)) this.inFlight.set(id, true);
      else this.dirty.add(id);
    }
  }

  markAllDirty(): void {
    for (let id = 0; id < this.state.chunks.total; id += 1) this.markDirty([id]);
  }

  /** Sends every waiting chunk to the mesher. */
  flush(): void {
    if (this.disposed) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    this.worked = this.worked || ids.length > 0;
    for (const id of ids) this.submit(id);
    this.settle();
  }

  onMeshed(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.meshes.clear();
    this.dirty.clear();
    this.inFlight.clear();
    this.mesher.dispose();
  }

  private submit(id: number, mesher: ChunkMesher = this.mesher): void {
    const { stock, finish, chunks } = this.state;
    const reuse = !mesher.transfers;
    const values = copyWindow(stock, chunks, id, reuse ? this.scratchValues : undefined);
    const codes = copyFinishWindow(finish, stock.spec, chunks, id, reuse ? this.scratchFinish : undefined);
    this.inFlight.set(id, false);
    mesher.submit(
      { id, values, finish: codes, cell: stock.cell, origin: windowOrigin(stock, chunks, id) },
      (done, out) => {
        this.receive(done, out);
      },
      (error) => {
        if (this.disposed) return;
        console.error(`chunk ${String(id)} is meshed on the main thread instead: ${error.message}`);
        this.inFlight.delete(id);
        this.submit(id, this.fallback);
      },
    );
  }

  private receive(id: number, out: ChunkMeshOutput): void {
    if (this.disposed) return;
    const stale = this.inFlight.get(id);
    this.inFlight.delete(id);
    if (stale === true) {
      this.submit(id);
      return;
    }
    this.apply(id, out);
    this.settle();
  }

  private settle(): void {
    if (this.worked && this.pending === 0) {
      this.worked = false;
      for (const listener of this.listeners) listener();
    }
  }

  private apply(id: number, out: ChunkMeshOutput): void {
    const existing = this.meshes.get(id);
    if (out.positions.length === 0) {
      if (existing !== undefined) {
        existing.geometry.dispose();
        this.group.remove(existing);
        this.meshes.delete(id);
      }
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(out.positions, 3));
    geometry.setAttribute('finish', new THREE.Uint8BufferAttribute(out.finish, 1, false));
    geometry.computeBoundingSphere();
    if (existing !== undefined) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      return;
    }
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `chunk-${String(id)}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    this.meshes.set(id, mesh);
    this.group.add(mesh);
  }
}
