/**
 * Marching cubes over one chunk window (docs/design/spec.md, Stock and figure): 32³ cubes from 33³ samples, Bourke's tables (src/stock/mc-tables.ts), a vertex on each crossing edge by linear interpolation, positions only plus one finish byte per vertex.
 * Inside is a sample below zero. Triangles are wound so their face normal points outward, toward positive values; the material's flat shading derives the normals. Vertices are not welded.
 * A shared edge is always interpolated from its lower corner to its higher one, so the two cubes that share it place the vertex at bit-identical coordinates.
 */
import type { Vec3 } from '../contracts/making';
import { EDGE_TABLE, TRI_TABLE } from './mc-tables';

/** Cells per chunk axis. */
export const CHUNK_CELLS = 32;
/** Samples per window axis: the chunk plus one apron sample. */
export const WINDOW_CELLS = 33;

export interface ChunkMeshInput {
  /** WINDOW_CELLS³ fixed-point distances, x fastest, negative inside. */
  readonly values: Int16Array;
  /** WINDOW_CELLS³ finish codes, x fastest. */
  readonly finish: Uint8Array;
  readonly cell: number;
  /** World metres of the centre of sample (0, 0, 0). */
  readonly origin: Vec3;
}

export interface ChunkMeshOutput {
  /** 9 floats per triangle, world metres. */
  readonly positions: Float32Array;
  /** One byte per vertex: the finish code of the nearer corner of the vertex's edge. */
  readonly finish: Uint8Array;
}

/** Corner offsets in Bourke's order: v0 (0,0,0), v1 (1,0,0), v2 (1,1,0), v3 (0,1,0), v4 (0,0,1), v5 (1,0,1), v6 (1,1,1), v7 (0,1,1). */
const CORNER_X = [0, 1, 1, 0, 0, 1, 1, 0];
const CORNER_Y = [0, 0, 1, 1, 0, 0, 1, 1];
const CORNER_Z = [0, 0, 0, 0, 1, 1, 1, 1];
/** The two corners of each edge, lower corner first along the edge's axis. */
const EDGE_LOW = [0, 1, 3, 0, 4, 5, 7, 4, 0, 1, 2, 3];
const EDGE_HIGH = [1, 2, 2, 3, 5, 6, 6, 7, 4, 5, 6, 7];

const N = WINDOW_CELLS;
const NN = N * N;
/** Sample offset of each corner within the window. */
const CORNER_OFFSET = CORNER_X.map((x, c) => x + N * ((CORNER_Y[c] ?? 0) + N * (CORNER_Z[c] ?? 0)));
const INITIAL_TRIANGLES = 2048;

export function meshChunk(input: ChunkMeshInput): ChunkMeshOutput {
  const { values, finish, cell } = input;
  const [ox, oy, oz] = input.origin;
  let positions = new Float32Array(INITIAL_TRIANGLES * 9);
  let codes = new Uint8Array(INITIAL_TRIANGLES * 3);
  let n = 0;
  const edgeX = new Float64Array(12);
  const edgeY = new Float64Array(12);
  const edgeZ = new Float64Array(12);
  const edgeCode = new Uint8Array(12);

  for (let k = 0; k < CHUNK_CELLS; k += 1) {
    for (let j = 0; j < CHUNK_CELLS; j += 1) {
      let base = N * (j + N * k);
      for (let i = 0; i < CHUNK_CELLS; i += 1, base += 1) {
        let cube = 0;
        if ((values[base] ?? 0) < 0) cube |= 1;
        if ((values[base + 1] ?? 0) < 0) cube |= 2;
        if ((values[base + 1 + N] ?? 0) < 0) cube |= 4;
        if ((values[base + N] ?? 0) < 0) cube |= 8;
        if ((values[base + NN] ?? 0) < 0) cube |= 16;
        if ((values[base + 1 + NN] ?? 0) < 0) cube |= 32;
        if ((values[base + 1 + N + NN] ?? 0) < 0) cube |= 64;
        if ((values[base + N + NN] ?? 0) < 0) cube |= 128;
        if (cube === 0 || cube === 255) continue;
        const bits = EDGE_TABLE[cube] ?? 0;
        for (let e = 0; e < 12; e += 1) {
          if ((bits & (1 << e)) === 0) continue;
          const a = EDGE_LOW[e] ?? 0;
          const b = EDGE_HIGH[e] ?? 0;
          const ia = base + (CORNER_OFFSET[a] ?? 0);
          const ib = base + (CORNER_OFFSET[b] ?? 0);
          const va = values[ia] ?? 0;
          const vb = values[ib] ?? 0;
          const t = va === vb ? 0.5 : va / (va - vb);
          edgeX[e] = ox + (i + (CORNER_X[a] ?? 0) + t * ((CORNER_X[b] ?? 0) - (CORNER_X[a] ?? 0))) * cell;
          edgeY[e] = oy + (j + (CORNER_Y[a] ?? 0) + t * ((CORNER_Y[b] ?? 0) - (CORNER_Y[a] ?? 0))) * cell;
          edgeZ[e] = oz + (k + (CORNER_Z[a] ?? 0) + t * ((CORNER_Z[b] ?? 0) - (CORNER_Z[a] ?? 0))) * cell;
          edgeCode[e] = t < 0.5 ? (finish[ia] ?? 0) : (finish[ib] ?? 0);
        }
        const row = cube * 16;
        for (let m = 0; m < 16; m += 3) {
          const e0 = TRI_TABLE[row + m] ?? -1;
          if (e0 < 0) break;
          const e1 = TRI_TABLE[row + m + 1] ?? -1;
          const e2 = TRI_TABLE[row + m + 2] ?? -1;
          if (n * 9 + 9 > positions.length) {
            const grown = new Float32Array(positions.length * 2);
            grown.set(positions);
            positions = grown;
            const grownCodes = new Uint8Array(codes.length * 2);
            grownCodes.set(codes);
            codes = grownCodes;
          }
          // The table assumes the set bit means a corner outside; ours means inside, so the winding is reversed here to keep the normals outward.
          const p = n * 9;
          positions[p] = edgeX[e0] ?? 0;
          positions[p + 1] = edgeY[e0] ?? 0;
          positions[p + 2] = edgeZ[e0] ?? 0;
          positions[p + 3] = edgeX[e2] ?? 0;
          positions[p + 4] = edgeY[e2] ?? 0;
          positions[p + 5] = edgeZ[e2] ?? 0;
          positions[p + 6] = edgeX[e1] ?? 0;
          positions[p + 7] = edgeY[e1] ?? 0;
          positions[p + 8] = edgeZ[e1] ?? 0;
          codes[n * 3] = edgeCode[e0] ?? 0;
          codes[n * 3 + 1] = edgeCode[e2] ?? 0;
          codes[n * 3 + 2] = edgeCode[e1] ?? 0;
          n += 1;
        }
      }
    }
  }
  return { positions: positions.slice(0, n * 9), finish: codes.slice(0, n * 3) };
}
