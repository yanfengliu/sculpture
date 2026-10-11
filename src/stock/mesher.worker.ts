/**
 * A stateless mesher worker: receives one chunk window, runs marching cubes, returns positions and finish with their buffers transferred (docs/design/spec.md, Stock and figure).
 * Created by src/stock/pool.ts through Vite's `?worker` import.
 */
import type { MeshRequest, MeshResult } from './mesh-messages';
import { meshChunk } from './mesher';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<MeshRequest>): void => {
  const { id, values, finish, cell, origin } = event.data;
  const out = meshChunk({ values: new Int16Array(values), finish: new Uint8Array(finish), cell, origin });
  const result: MeshResult = { id, positions: out.positions.buffer as ArrayBuffer, finish: out.finish.buffer as ArrayBuffer };
  scope.postMessage(result, [result.positions, result.finish]);
};
