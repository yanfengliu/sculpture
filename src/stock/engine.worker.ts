/**
 * An engine worker (docs/design/spec.md, Stock and figure): meshes one chunk window by marching cubes, or carves one chunk's bytes with a run of blows (src/stock/carve-jobs.ts), returning the buffers transferred. Stateless apart from a cache of the figure chunks it has carved, which the pool keeps consistent per worker.
 * Created by src/stock/pool.ts through Vite's `?worker` import.
 */
import { runCarveJob } from './carve-jobs';
import { meshChunk } from './mesher';
import type { WorkerRequest, WorkerResult } from './worker-messages';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const figures = new Map<number, Int16Array>();

function answer(result: WorkerResult, transfer: ArrayBuffer[]): void {
  scope.postMessage(result, transfer);
}

scope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  try {
    if (request.kind === 'mesh') {
      const out = meshChunk({ values: new Int16Array(request.values), finish: new Uint8Array(request.finish), cell: request.cell, origin: request.origin });
      const positions = out.positions.buffer as ArrayBuffer;
      const finish = out.finish.buffer as ArrayBuffer;
      answer({ kind: 'mesh', id: request.id, positions, finish }, [positions, finish]);
      return;
    }
    if (request.figure !== null) figures.set(request.id, new Int16Array(request.figure));
    const figure = figures.get(request.id);
    if (figure === undefined) throw new Error(`carve job for chunk ${String(request.id)} arrived without its figure values and none are cached`);
    const layout = { size: request.lattice.size, counts: request.counts, total: request.counts[0] * request.counts[1] * request.counts[2] };
    const result = runCarveJob({ id: request.id, lattice: request.lattice, stock: new Int16Array(request.stock), finish: new Uint8Array(request.finish), figure: null, blows: new Float64Array(request.blows) }, figure, layout);
    const buffers = [result.stock.buffer, result.finish.buffer, result.table.buffer, result.runs.buffer, result.indices.buffer, result.oldStock.buffer, result.oldFinish.buffer] as ArrayBuffer[];
    answer({ kind: 'carve', id: request.id, stock: buffers[0] as ArrayBuffer, finish: buffers[1] as ArrayBuffer, table: buffers[2] as ArrayBuffer, runs: buffers[3] as ArrayBuffer, indices: buffers[4] as ArrayBuffer, oldStock: buffers[5] as ArrayBuffer, oldFinish: buffers[6] as ArrayBuffer }, buffers);
  } catch (error: unknown) {
    answer({ kind: 'failed', id: request.id, message: error instanceof Error ? error.message : String(error) }, []);
  }
};
