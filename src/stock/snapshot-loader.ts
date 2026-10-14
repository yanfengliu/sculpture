/**
 * The page's snapshot loader (docs/design/spec.md, Undo and replay): fetches a snapshot of the plan file's table beside the plan (`public/model/`), on the page's thread only as far as the network goes and never more bytes than the table allows, and has src/stock/snapshot.worker.ts inflate and check it; the Making writes the bytes into its grids (src/timeline/making.ts) and disposes the loader with itself, which aborts the fetches out, fails the loads waiting and ends the worker.
 * Browser only: the worker comes through Vite's `?worker` import, so the Vitest tests load snapshots from memory instead.
 */
/// <reference types="vite/client" />
import type { SnapshotEntry } from '../timeline/plan-file';
import SnapshotWorker from './snapshot.worker?worker';

export interface SnapshotRequest {
  readonly id: number;
  /** The fetched bytes, gzipped or already inflated by the browser. */
  readonly bytes: ArrayBuffer;
  readonly file: string;
  /** The inflated size and SHA-256 the table records, and the most a snapshot of the grid can hold. */
  readonly size: number;
  readonly sha256: string;
  readonly maxBytes: number;
}

export interface SnapshotReply {
  readonly id: number;
  readonly bytes: ArrayBuffer | null;
  readonly error: string | null;
}

/** A load still out after this long fails, so a stalled fetch or a lost reply cannot hold the making still for the session. */
export const LOAD_TIMEOUT_MS = 15_000;

export interface SnapshotLoader {
  load(entry: SnapshotEntry): Promise<Uint8Array>;
  dispose(): void;
}

/** Reads a response body, failing as soon as it runs past `limit` bytes. */
async function readAtMost(response: Response, limit: number, url: string): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error(`${url} answered with no body`);
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error(`${url} runs past ${String(limit)} bytes, more than its snapshot can take`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out.buffer;
}

/** A loader of the snapshots under `directory` (relative to the page, ending in `/`) for a grid whose snapshots hold at most `maxBytes` (src/stock/snapshot.ts, `maxSnapshotBytes`). */
export function createSnapshotLoader(directory: string, maxBytes: number): SnapshotLoader {
  let worker: Worker | null = null;
  let disposed = false;
  /** Read through a call: `dispose` may run while a fetch is awaited. */
  const isDisposed = (): boolean => disposed;
  let next = 0;
  const aborts = new Set<AbortController>();
  const waiting = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();
  const failAll = (message: string): void => {
    for (const wait of waiting.values()) wait.reject(new Error(message));
    waiting.clear();
  };
  const start = (): Worker => {
    if (worker !== null) return worker;
    const created = new SnapshotWorker();
    created.onmessage = (event: MessageEvent<SnapshotReply>): void => {
      const reply = event.data;
      const wait = waiting.get(reply.id);
      waiting.delete(reply.id);
      if (reply.bytes !== null) wait?.resolve(new Uint8Array(reply.bytes));
      else wait?.reject(new Error(reply.error ?? 'the snapshot worker answered with neither bytes nor an error'));
    };
    created.onmessageerror = (): void => {
      failAll('a reply of the snapshot worker could not be read');
    };
    created.onerror = (event: ErrorEvent): void => {
      failAll(`the snapshot worker failed: ${event.message}`);
      created.terminate();
      worker = null;
    };
    worker = created;
    return created;
  };
  return {
    load(entry) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${entry.file} did not arrive within ${String(LOAD_TIMEOUT_MS / 1000)} s`));
        }, LOAD_TIMEOUT_MS);
      });
      return Promise.race([fetchAndInflate(entry), timeout]).finally(() => {
        clearTimeout(timer);
      });
    },
    dispose() {
      disposed = true;
      for (const abort of aborts) abort.abort();
      aborts.clear();
      failAll('the snapshot loader was disposed');
      worker?.terminate();
      worker = null;
    },
  };

  async function fetchAndInflate(entry: SnapshotEntry): Promise<Uint8Array> {
    if (isDisposed()) throw new Error(`the snapshot loader was disposed before ${entry.file} was asked for`);
    const url = `${directory}${entry.file}`;
    const abort = new AbortController();
    aborts.add(abort);
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
      // Gzip of incompressible bytes runs a little past them; a body past this is not the snapshot.
      bytes = await readAtMost(response, entry.bytes + Math.ceil(entry.bytes / 100) + 1024, url);
    } finally {
      aborts.delete(abort);
    }
    if (isDisposed()) throw new Error(`the snapshot loader was disposed while ${entry.file} was fetched`);
    const id = next;
    next += 1;
    return new Promise<Uint8Array>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      const request: SnapshotRequest = { id, bytes, file: entry.file, size: entry.bytes, sha256: entry.sha256, maxBytes };
      start().postMessage(request, [bytes]);
    });
  }
}
