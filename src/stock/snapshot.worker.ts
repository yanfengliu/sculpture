/**
 * The snapshot worker (docs/design/spec.md, Undo and replay): inflates a fetched snapshot (src/stock/snapshot.ts) when it is still gzipped, into a buffer of the size the plan file's table gives and never past it, checks its SHA-256 against the table and hands the bytes back transferred, so neither the inflate nor the digest runs on the page's thread.
 * Created by src/stock/snapshot-loader.ts through Vite's `?worker` import.
 */
import type { SnapshotReply, SnapshotRequest } from './snapshot-loader';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function hex(buffer: ArrayBuffer): string {
  let text = '';
  for (const byte of new Uint8Array(buffer)) text += byte.toString(16).padStart(2, '0');
  return text;
}

/** Inflates gzip bytes into exactly `size` bytes; stops and throws as soon as they would run past it. */
async function inflateInto(bytes: ArrayBuffer, size: number, file: string): Promise<ArrayBuffer> {
  const out = new Uint8Array(size);
  let at = 0;
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.byteLength > size) {
      await reader.cancel();
      throw new Error(`${file} inflates past the ${String(size)} bytes the plan's table gives it`);
    }
    out.set(value, at);
    at += value.byteLength;
  }
  if (at !== size) throw new Error(`${file} inflates to ${String(at)} bytes and the plan's table says ${String(size)}`);
  return out.buffer;
}

async function inflate(request: SnapshotRequest): Promise<ArrayBuffer> {
  if (!(request.size > 0 && request.size <= request.maxBytes)) throw new Error(`${request.file} is ${String(request.size)} bytes by the plan's table; a snapshot of this grid holds 1 to ${String(request.maxBytes)}`);
  const fetched = new Uint8Array(request.bytes);
  // A server that marks `.gz` files `Content-Encoding: gzip` (Vite's) has the browser inflate them already; only the 1f 8b magic says the bytes are still gzipped.
  const gzipped = fetched.length >= 2 && fetched[0] === 0x1f && fetched[1] === 0x8b;
  if (!gzipped && fetched.byteLength !== request.size) throw new Error(`${request.file} arrived as ${String(fetched.byteLength)} bytes and the plan's table says ${String(request.size)}`);
  const data = gzipped ? await inflateInto(request.bytes, request.size, request.file) : request.bytes;
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
