/**
 * A pool of engine workers (docs/design/spec.md, Stock and figure): `min(8, max(1, hardwareConcurrency - 2))` workers fed by transferable buffers, each job going to the first idle worker. The same workers mesh chunk windows and carve chunk jobs (src/stock/carve-jobs.ts), so a jump's carving and the remeshing after it share one queue.
 * A worker keeps the figure chunks it has carved; the pool remembers which, and sends a chunk's figure only the first time that worker sees it. A worker that fails a job reports the failure to the job's caller (which falls back or retries from its own copy), is terminated and replaced, and its figure cache is forgotten.
 * Browser only: the worker is created through Vite's `?worker` import, so this module is never imported by the Vitest tests, which use the synchronous mesher of src/stock/remesh.ts and run carve jobs in-process.
 */
/// <reference types="vite/client" />
import type { CarveJob, CarveResult, ChunkCarver } from './carve-jobs';
import EngineWorker from './engine.worker?worker';
import type { ChunkMeshOutput } from './mesher';
import type { ChunkMesher, MeshDone } from './remesh';
import type { CarveRequest, MeshJob, MeshRequest, WorkerResult } from './worker-messages';

export const MAX_WORKERS = 8;

/** Workers to create on this machine: two cores are left for the main thread and the browser. */
export function defaultWorkerCount(): number {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 2));
}

export interface EnginePool {
  readonly mesher: ChunkMesher;
  readonly carver: ChunkCarver;
  dispose(): void;
}

type Pending = { readonly kind: 'mesh'; readonly job: MeshJob; readonly done: MeshDone; readonly fail: (error: Error) => void } | { readonly kind: 'carve'; readonly job: CarveJob; readonly done: (result: CarveResult) => void; readonly fail: (error: Error) => void };

interface Slot {
  worker: Worker;
  readonly figures: Set<number>;
  pending: Pending | null;
}

/** `figureChunk` copies a chunk's figure values for a worker that has not seen the chunk; `counts` is the chunk layout the carve jobs use. */
export function createEnginePool(count: number, figureChunk: (id: number) => Int16Array, counts: readonly [number, number, number]): EnginePool {
  const slots: Slot[] = [];
  const idle: Slot[] = [];
  const queue: Pending[] = [];
  let disposed = false;

  function send(slot: Slot, pending: Pending): void {
    slot.pending = pending;
    if (pending.kind === 'mesh') {
      const { job } = pending;
      const request: MeshRequest = { kind: 'mesh', id: job.id, values: job.values.buffer as ArrayBuffer, finish: job.finish.buffer as ArrayBuffer, cell: job.cell, origin: job.origin };
      slot.worker.postMessage(request, [request.values, request.finish]);
      return;
    }
    const { job } = pending;
    const figure = slot.figures.has(job.id) ? null : (job.figure ?? figureChunk(job.id));
    slot.figures.add(job.id);
    const request: CarveRequest = { kind: 'carve', id: job.id, lattice: job.lattice, counts, stock: job.stock.buffer as ArrayBuffer, finish: job.finish.buffer as ArrayBuffer, figure: figure === null ? null : (figure.buffer as ArrayBuffer), blows: job.blows.buffer as ArrayBuffer };
    const transfer = [request.stock, request.finish, request.blows];
    if (request.figure !== null) transfer.push(request.figure);
    slot.worker.postMessage(request, transfer);
  }

  function pump(): void {
    while (!disposed && idle.length > 0 && queue.length > 0) {
      const slot = idle.pop();
      const pending = queue.shift();
      if (slot === undefined || pending === undefined) return;
      send(slot, pending);
    }
  }

  function finish(slot: Slot, result: WorkerResult): void {
    const pending = slot.pending;
    slot.pending = null;
    idle.push(slot);
    if (pending !== null && !disposed) deliver(pending, result);
    pump();
  }

  function deliver(pending: Pending, result: WorkerResult): void {
    if (result.kind === 'failed') {
      pending.fail(new Error(`engine worker failed chunk ${String(result.id)}: ${result.message}`));
      return;
    }
    if (pending.kind === 'mesh' && result.kind === 'mesh') {
      const output: ChunkMeshOutput = { positions: new Float32Array(result.positions), finish: new Uint8Array(result.finish) };
      pending.done(result.id, output);
      return;
    }
    if (pending.kind === 'carve' && result.kind === 'carve') {
      pending.done({ id: result.id, stock: new Int16Array(result.stock), finish: new Uint8Array(result.finish), table: new Uint32Array(result.table), runs: new Uint32Array(result.runs), indices: new Uint32Array(result.indices), oldStock: new Int16Array(result.oldStock), oldFinish: new Uint8Array(result.oldFinish) });
      return;
    }
    pending.fail(new Error(`engine worker answered a ${pending.kind} job for chunk ${String(pending.job.id)} with a ${result.kind} result`));
  }

  /** A crashed worker: its job fails, it is replaced, and the figure chunks it held are sent again when needed. */
  function replace(slot: Slot, message: string): void {
    const pending = slot.pending;
    slot.pending = null;
    slot.worker.terminate();
    slot.figures.clear();
    if (!disposed) {
      slot.worker = attach(slot);
      idle.push(slot);
    }
    if (pending !== null && !disposed) pending.fail(new Error(`engine worker crashed on chunk ${String(pending.job.id)}: ${message}`));
    pump();
  }

  function attach(slot: Slot): Worker {
    const worker = new EngineWorker();
    worker.onmessage = (event: MessageEvent<WorkerResult>): void => {
      finish(slot, event.data);
    };
    worker.onerror = (event: ErrorEvent): void => {
      console.error(`engine worker failed: ${event.message}`);
      replace(slot, event.message);
    };
    return worker;
  }

  for (let n = 0; n < Math.max(1, count); n += 1) {
    const slot: Slot = { worker: undefined as unknown as Worker, figures: new Set(), pending: null };
    slot.worker = attach(slot);
    slots.push(slot);
    idle.push(slot);
  }

  function submit(pending: Pending): void {
    if (disposed) return;
    queue.push(pending);
    pump();
  }

  function dispose(): void {
    disposed = true;
    queue.length = 0;
    for (const slot of slots) slot.worker.terminate();
    slots.length = 0;
    idle.length = 0;
  }

  return {
    mesher: {
      transfers: true,
      submit(job, done, fail): void {
        submit({ kind: 'mesh', job, done, fail });
      },
      dispose,
    },
    carver: {
      submit(job, done, fail): void {
        submit({ kind: 'carve', job, done, fail });
      },
      dispose,
    },
    dispose,
  };
}
