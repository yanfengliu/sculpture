/**
 * The snapshot worker (docs/design/spec.md, Undo and replay): inflates a fetched snapshot (src/stock/snapshot.ts) when it is still gzipped, checks its size and SHA-256 against the plan file's table and hands the bytes back transferred, so neither the inflate nor the digest runs on the page's thread.
 * Created by src/stock/snapshot-loader.ts through Vite's `?worker` import.
 */
import type { SnapshotReply, SnapshotRequest } from './snapshot-loader';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function hex(buffer: ArrayBuffer): string {
  let text = '';
  for (const byte of new Uint8Array(buffer)) text += byte.toString(16).padStart(2, '0');
  return text;
}

async function inflate(request: SnapshotRequest): Promise<ArrayBuffer> {
  const fetched = new Uint8Array(request.bytes);
  // A server that marks `.gz` files `Content-Encoding: gzip` (Vite's) has the browser inflate them already; only the 1f 8b magic says the bytes are still gzipped.
  const data = fetched.length >= 2 && fetched[0] === 0x1f && fetched[1] === 0x8b ? await new Response(new Blob([request.bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : request.bytes;
  if (data.byteLength !== request.size) throw new Error(`${request.file} inflates to ${String(data.byteLength)} bytes and the plan's table says ${String(request.size)}`);
  const digest = hex(await crypto.subtle.digest('SHA-256', data));
  if (digest !== request.sha256.toLowerCase()) throw new Error(`${request.file} has SHA-256 ${digest} and the plan's table says ${request.sha256}`);
  return data;
}

scope.onmessage = (event: MessageEvent<SnapshotRequest>): void => {
  const request = event.data;
  inflate(request).then(
    (bytes) => {
      const reply: SnapshotReply = { id: request.id, bytes, error: null };
      scope.postMessage(reply, [bytes]);
    },
    (error: unknown) => {
      const reply: SnapshotReply = { id: request.id, bytes: null, error: error instanceof Error ? error.message : String(error) };
      scope.postMessage(reply);
    },
  );
};
