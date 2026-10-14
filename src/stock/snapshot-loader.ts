/**
 * The page's snapshot loader (docs/design/spec.md, Undo and replay): fetches a snapshot of the plan file's table beside the plan (`public/model/`), on the page's thread only as far as the network goes, and has src/stock/snapshot.worker.ts inflate and check it; the Making writes the bytes into its grids (src/timeline/making.ts).
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
  /** The inflated size and SHA-256 the table records. */
  readonly size: number;
  readonly sha256: string;
}

export interface SnapshotReply {
  readonly id: number;
  readonly bytes: ArrayBuffer | null;
  readonly error: string | null;
}

/** A loader of the snapshots under `directory` (relative to the page, ending in `/`). */
export function createSnapshotLoader(directory: string): (entry: SnapshotEntry) => Promise<Uint8Array> {
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();
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
    created.onerror = (event: ErrorEvent): void => {
      for (const wait of waiting.values()) wait.reject(new Error(`the snapshot worker failed: ${event.message}`));
      waiting.clear();
      created.terminate();
      worker = null;
    };
    worker = created;
    return created;
  };
  return async (entry) => {
    const url = `${directory}${entry.file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
    const bytes = await response.arrayBuffer();
    const id = next;
    next += 1;
    return new Promise<Uint8Array>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      const request: SnapshotRequest = { id, bytes, file: entry.file, size: entry.bytes, sha256: entry.sha256 };
      start().postMessage(request, [bytes]);
    });
  };
}
