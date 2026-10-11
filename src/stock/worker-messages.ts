/**
 * Messages between the main thread and an engine worker (docs/design/spec.md, Stock and figure): a mesh request carries a 33³ window and answers with positions and per-vertex finish; a carve request carries a chunk's bytes and packed blows (src/stock/carve-jobs.ts) and answers with the carved bytes and the undo records; a job that throws answers `failed`. Every buffer is transferred rather than copied.
 */
import type { Vec3 } from '../contracts/making';
import type { CarveLattice } from './carve-jobs';

export interface MeshJob {
  /** Chunk id, echoed in the result. */
  readonly id: number;
  /** WINDOW_CELLS³ fixed-point stock values, x fastest. */
  readonly values: Int16Array;
  /** WINDOW_CELLS³ finish codes, x fastest. */
  readonly finish: Uint8Array;
  readonly cell: number;
  /** World metres of the window's first sample. */
  readonly origin: Vec3;
}

export interface MeshRequest {
  readonly kind: 'mesh';
  readonly id: number;
  readonly values: ArrayBuffer;
  readonly finish: ArrayBuffer;
  readonly cell: number;
  readonly origin: Vec3;
}

export interface MeshResult {
  readonly kind: 'mesh';
  readonly id: number;
  /** Float32 positions, 9 per triangle, world metres. */
  readonly positions: ArrayBuffer;
  /** One finish byte per vertex. */
  readonly finish: ArrayBuffer;
}

export interface CarveRequest {
  readonly kind: 'carve';
  readonly id: number;
  readonly lattice: CarveLattice;
  readonly counts: readonly [number, number, number];
  readonly stock: ArrayBuffer;
  readonly finish: ArrayBuffer;
  /** Null when the worker holds the chunk's figure from an earlier job. */
  readonly figure: ArrayBuffer | null;
  readonly blows: ArrayBuffer;
}

export interface CarveResultMessage {
  readonly kind: 'carve';
  readonly id: number;
  readonly stock: ArrayBuffer;
  readonly finish: ArrayBuffer;
  readonly table: ArrayBuffer;
  readonly runs: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly oldStock: ArrayBuffer;
  readonly oldFinish: ArrayBuffer;
}

export interface FailedResult {
  readonly kind: 'failed';
  readonly id: number;
  readonly message: string;
}

export type WorkerRequest = MeshRequest | CarveRequest;
export type WorkerResult = MeshResult | CarveResultMessage | FailedResult;
