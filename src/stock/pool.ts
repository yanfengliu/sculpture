/**
 * A pool of mesher workers (docs/design/spec.md, Stock and figure): `min(8, max(1, hardwareConcurrency - 2))` stateless workers fed by transferable buffers, each job going to the first idle worker.
 * Browser only: the worker is created through Vite's `?worker` import, so this module is never imported by the Vitest tests, which use the synchronous mesher of src/stock/remesh.ts instead.
 */
/// <reference types="vite/client" />
import MesherWorker from './mesher.worker?worker';
import type { MeshJob, MeshRequest, MeshResult } from './mesh-messages';
import type { ChunkMeshOutput } from './mesher';
import type { ChunkMesher, MeshDone } from './remesh';

export const MAX_WORKERS = 8;

/** Workers to create on this machine: two cores are left for the main thread and the browser. */
export function defaultWorkerCount(): number {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 2));
}

interface Pending {
  readonly job: MeshJob;
  readonly done: MeshDone;
}

export function createMesherPool(count: number): ChunkMesher {
  const workers: Worker[] = [];
  const idle: Worker[] = [];
  const queue: Pending[] = [];
  const busy = new Map<Worker, Pending>();
  let disposed = false;

  function pump(): void {
    while (!disposed && idle.length > 0 && queue.length > 0) {
      const worker = idle.pop();
      const pending = queue.shift();
      if (worker === undefined || pending === undefined) return;
      busy.set(worker, pending);
      const { job } = pending;
      const request: MeshRequest = { id: job.id, values: job.values.buffer as ArrayBuffer, finish: job.finish.buffer as ArrayBuffer, cell: job.cell, origin: job.origin };
      worker.postMessage(request, [request.values, request.finish]);
    }
  }

  for (let n = 0; n < Math.max(1, count); n += 1) {
    const worker = new MesherWorker();
    worker.onmessage = (event: MessageEvent<MeshResult>): void => {
      const pending = busy.get(worker);
      busy.delete(worker);
      idle.push(worker);
      if (pending !== undefined && !disposed) {
        const { id, positions, finish } = event.data;
        const output: ChunkMeshOutput = { positions: new Float32Array(positions), finish: new Uint8Array(finish) };
        pending.done(id, output);
      }
      pump();
    };
    worker.onerror = (event: ErrorEvent): void => {
      console.error(`mesher worker failed: ${event.message}`);
      busy.delete(worker);
      idle.push(worker);
      pump();
    };
    workers.push(worker);
    idle.push(worker);
  }

  return {
    transfers: true,
    submit(job, done): void {
      if (disposed) return;
      queue.push({ job, done });
      pump();
    },
    dispose(): void {
      disposed = true;
      queue.length = 0;
      for (const worker of workers) worker.terminate();
      workers.length = 0;
      idle.length = 0;
      busy.clear();
    },
  };
}
