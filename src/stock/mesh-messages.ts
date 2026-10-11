/**
 * Messages between the main thread and a mesher worker (docs/design/spec.md, Stock and figure): a 33³ window in, positions and per-vertex finish out, every buffer transferred rather than copied.
 */
import type { Vec3 } from '../contracts/making';

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
  readonly id: number;
  readonly values: ArrayBuffer;
  readonly finish: ArrayBuffer;
  readonly cell: number;
  readonly origin: Vec3;
}

export interface MeshResult {
  readonly id: number;
  /** Float32 positions, 9 per triangle, world metres. */
  readonly positions: ArrayBuffer;
  /** One finish byte per vertex. */
  readonly finish: ArrayBuffer;
}
