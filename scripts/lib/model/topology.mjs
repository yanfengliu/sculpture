/**
 * Mesh checks for the model pipeline: welding a triangle soup into an indexed mesh, edge statistics (watertight and consistently wound or not), angle-weighted pseudonormals for the sign of a distance, the signed volume and the bounding box.
 * Hash tables are open addressing over typed arrays: a 1.2-million-triangle mesh has 3.6 million vertices and edges, too many for Map keys.
 */
import { faceNormal } from './stl.mjs';

const EMPTY = -1;

/** A 32-bit mix of three integers, for the vertex and edge tables. */
function hash3(a, b, c) {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77) ^ Math.imul(c + 0x165667b1, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

function tableSize(entries) {
  let size = 1024;
  while (size < entries * 2) size *= 2;
  return size;
}

/**
 * Drops triangles with a repeated vertex or no area, which have no normal and no inside.
 * @param {Float32Array} positions 9 per triangle
 * @returns {{ positions: Float32Array, dropped: number }}
 */
export function dropDegenerate(positions) {
  const count = positions.length / 9;
  const keep = new Uint8Array(count);
  let kept = 0;
  for (let t = 0; t < count; t += 1) {
    const [nx, ny, nz] = faceNormal(positions, t * 9);
    if (nx !== 0 || ny !== 0 || nz !== 0) {
      keep[t] = 1;
      kept += 1;
    }
  }
  if (kept === count) return { positions, dropped: 0 };
  const out = new Float32Array(kept * 9);
  let write = 0;
  for (let t = 0; t < count; t += 1) {
    if (keep[t] === 1) {
      out.set(positions.subarray(t * 9, t * 9 + 9), write);
      write += 9;
    }
  }
  return { positions: out, dropped: count - kept };
}

/**
 * Welds vertices: exact welding (`quantum` 0) keys on the float32 bit patterns, a tolerance weld keys on coordinates rounded to multiples of `quantum`.
 * Returns the unique vertices (the first occurrence's coordinates), the triangle indices in the soup's order and the count of vertices merged.
 * @param {Float32Array} positions 9 per triangle
 * @param {number} [quantum]
 * @returns {{ vertices: Float32Array, indices: Uint32Array, unique: number, quantum: number }}
 */
export function weld(positions, quantum = 0) {
  const vertexCount = positions.length / 3;
  const keys = new Int32Array(vertexCount * 3);
  if (quantum === 0) {
    const bits = new Int32Array(positions.buffer, positions.byteOffset, positions.length);
    for (let i = 0; i < keys.length; i += 1) keys[i] = bits[i] === -2147483648 ? 0 : bits[i];
  } else {
    for (let i = 0; i < keys.length; i += 1) keys[i] = Math.round(positions[i] / quantum);
  }
  const size = tableSize(vertexCount);
  const mask = size - 1;
  const table = new Int32Array(size).fill(EMPTY);
  const remap = new Uint32Array(vertexCount);
  const representatives = [];
  for (let v = 0; v < vertexCount; v += 1) {
    const k0 = keys[v * 3];
    const k1 = keys[v * 3 + 1];
    const k2 = keys[v * 3 + 2];
    let slot = hash3(k0, k1, k2) & mask;
    for (;;) {
      const id = table[slot];
      if (id === EMPTY) {
        table[slot] = representatives.length;
        remap[v] = representatives.length;
        representatives.push(v);
        break;
      }
      const r = representatives[id] * 3;
      if (keys[r] === k0 && keys[r + 1] === k1 && keys[r + 2] === k2) {
        remap[v] = id;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }
  const vertices = new Float32Array(representatives.length * 3);
  representatives.forEach((v, id) => {
    vertices[id * 3] = positions[v * 3];
    vertices[id * 3 + 1] = positions[v * 3 + 1];
    vertices[id * 3 + 2] = positions[v * 3 + 2];
  });
  return { vertices, indices: remap, unique: representatives.length, quantum };
}

/**
 * Rebuilds the flat triangle positions from a welded mesh, so a tolerance weld's snapped vertices are what the distance field sees.
 * @param {Float32Array} vertices
 * @param {Uint32Array} indices
 */
export function flatten(vertices, indices) {
  const positions = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i] * 3;
    positions[i * 3] = vertices[v];
    positions[i * 3 + 1] = vertices[v + 1];
    positions[i * 3 + 2] = vertices[v + 2];
  }
  return positions;
}

/** Undirected edges keyed by their two vertex ids, with the number of faces on each and how many run low-to-high, so winding consistency falls out of the count. */
export class EdgeTable {
  /** @param {Uint32Array} indices */
  constructor(indices) {
    const directed = indices.length;
    this.size = tableSize(directed);
    this.mask = this.size - 1;
    this.lo = new Int32Array(this.size).fill(EMPTY);
    this.hi = new Int32Array(this.size);
    this.faces = new Uint8Array(this.size);
    this.forward = new Uint8Array(this.size);
    this.entries = 0;
    for (let i = 0; i < directed; i += 3) {
      this.insert(indices[i], indices[i + 1]);
      this.insert(indices[i + 1], indices[i + 2]);
      this.insert(indices[i + 2], indices[i]);
    }
  }

  /** The slot of the edge {a, b}, inserting it when absent. */
  insert(a, b) {
    const slot = this.find(a, b);
    if (this.lo[slot] === EMPTY) {
      this.lo[slot] = Math.min(a, b);
      this.hi[slot] = Math.max(a, b);
      this.entries += 1;
    }
    if (this.faces[slot] < 255) this.faces[slot] += 1;
    if (a < b && this.forward[slot] < 255) this.forward[slot] += 1;
    return slot;
  }

  /** The slot holding the edge {a, b}, or the empty slot where it would go. */
  find(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let slot = hash3(lo, hi, 0x51ed270b) & this.mask;
    while (this.lo[slot] !== EMPTY && (this.lo[slot] !== lo || this.hi[slot] !== hi)) slot = (slot + 1) & this.mask;
    return slot;
  }

  /**
   * Edge counts by the number of faces sharing them. `inconsistent` counts two-face edges whose faces run the same way, so one is wound against the other.
   * @returns {{ edges: number, boundary: number, manifold: number, nonManifold: number, inconsistent: number, watertight: boolean, consistent: boolean }}
   */
  stats() {
    let boundary = 0;
    let manifold = 0;
    let nonManifold = 0;
    let inconsistent = 0;
    for (let slot = 0; slot < this.size; slot += 1) {
      if (this.lo[slot] === EMPTY) continue;
      const faces = this.faces[slot];
      if (faces === 1) boundary += 1;
      else if (faces === 2) {
        manifold += 1;
        if (this.forward[slot] !== 1) inconsistent += 1;
      } else nonManifold += 1;
    }
    return { edges: this.entries, boundary, manifold, nonManifold, inconsistent, watertight: boundary === 0 && nonManifold === 0, consistent: inconsistent === 0 };
  }
}

/**
 * Face normals per triangle, angle-weighted vertex normals per welded vertex and summed face normals per triangle edge (slots ab, bc, ca): the pseudonormals whose sign against the offset to the closest point says inside or outside (Bærentzen and Aanæs 2005).
 * None is normalised beyond the face normals: only the sign of a dot product is read.
 * @param {Float32Array} vertices
 * @param {Uint32Array} indices
 * @param {EdgeTable} edges
 * @returns {{ face: Float32Array, vertex: Float32Array, edge: Float32Array }}
 */
export function pseudonormals(vertices, indices, edges) {
  const triangles = indices.length / 3;
  const face = new Float32Array(triangles * 3);
  const vertex = new Float32Array(vertices.length);
  const edgeSum = new Float32Array(edges.size * 3);
  const edge = new Float32Array(triangles * 9);
  const positions = flatten(vertices, indices);
  for (let t = 0; t < triangles; t += 1) {
    const [nx, ny, nz] = faceNormal(positions, t * 9);
    face[t * 3] = nx;
    face[t * 3 + 1] = ny;
    face[t * 3 + 2] = nz;
    for (let corner = 0; corner < 3; corner += 1) {
      const v = indices[t * 3 + corner];
      const angle = cornerAngle(positions, t * 9, corner);
      vertex[v * 3] += angle * nx;
      vertex[v * 3 + 1] += angle * ny;
      vertex[v * 3 + 2] += angle * nz;
      const slot = edges.find(indices[t * 3 + corner], indices[t * 3 + ((corner + 1) % 3)]);
      edgeSum[slot * 3] += nx;
      edgeSum[slot * 3 + 1] += ny;
      edgeSum[slot * 3 + 2] += nz;
    }
  }
  for (let t = 0; t < triangles; t += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const slot = edges.find(indices[t * 3 + corner], indices[t * 3 + ((corner + 1) % 3)]);
      edge[t * 9 + corner * 3] = edgeSum[slot * 3];
      edge[t * 9 + corner * 3 + 1] = edgeSum[slot * 3 + 1];
      edge[t * 9 + corner * 3 + 2] = edgeSum[slot * 3 + 2];
    }
  }
  return { face, vertex, edge };
}

/** The interior angle of the triangle at `base` at its `corner` (0, 1 or 2). */
function cornerAngle(positions, base, corner) {
  const a = base + corner * 3;
  const b = base + ((corner + 1) % 3) * 3;
  const c = base + ((corner + 2) % 3) * 3;
  const ux = positions[b] - positions[a];
  const uy = positions[b + 1] - positions[a + 1];
  const uz = positions[b + 2] - positions[a + 2];
  const vx = positions[c] - positions[a];
  const vy = positions[c + 1] - positions[a + 1];
  const vz = positions[c + 2] - positions[a + 2];
  const dot = ux * vx + uy * vy + uz * vz;
  const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  return Math.atan2(cross, dot);
}

/**
 * Signed volume by the divergence theorem, Σ a · (b × c) / 6: positive for outward windings, in the positions' cubic units.
 * @param {ArrayLike<number>} positions 9 per triangle
 */
export function signedVolume(positions) {
  let sum = 0;
  for (let base = 0; base < positions.length; base += 9) {
    const ax = positions[base];
    const ay = positions[base + 1];
    const az = positions[base + 2];
    const bx = positions[base + 3];
    const by = positions[base + 4];
    const bz = positions[base + 5];
    const cx = positions[base + 6];
    const cy = positions[base + 7];
    const cz = positions[base + 8];
    sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}

/**
 * Axis-aligned bounds of a flat xyz array.
 * @param {ArrayLike<number>} positions
 * @returns {{ min: [number, number, number], max: [number, number, number], extent: [number, number, number] }}
 */
export function boundingBox(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]], extent: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
