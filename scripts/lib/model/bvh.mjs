/**
 * A bounding-volume hierarchy over triangles for closest-point queries, in flat typed arrays so a build in the main thread can be shared with worker threads through SharedArrayBuffers without copying.
 * Build: recursive midpoint split of the centroid bounds on their longest axis, median split when the midpoint puts everything on one side, leaves of at most LEAF_SIZE triangles; the triangles are copied into leaf order so a leaf is contiguous.
 * Query: closest point on any triangle within `maxDistance`, with the region of the triangle it lies on (face, edge or vertex) so a pseudonormal can sign the distance.
 */

export const LEAF_SIZE = 4;

/** Regions of the closest point on a triangle, as `closestPointOnTriangle` reports them. */
export const REGION = Object.freeze({ face: 0, vertexA: 1, vertexB: 2, vertexC: 3, edgeAB: 4, edgeBC: 5, edgeCA: 6 });

/** @param {number} bytes */
function shared(bytes) {
  return new SharedArrayBuffer(bytes);
}

/**
 * Builds the hierarchy. `positions` holds 9 numbers per triangle in the caller's order; the result's `positions` is the same set in leaf order and `order[i]` is the caller's index of leaf-order triangle `i`.
 * @param {Float32Array} positions
 * @returns {{ positions: Float32Array, order: Uint32Array, bounds: Float32Array, meta: Int32Array, nodeCount: number, triangles: number }}
 */
export function buildBvh(positions) {
  const triangles = positions.length / 9;
  if (triangles === 0) throw new Error('buildBvh: no triangles.');
  const centroids = new Float32Array(triangles * 3);
  const triBounds = new Float32Array(triangles * 6);
  for (let t = 0; t < triangles; t += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const a = positions[t * 9 + axis];
      const b = positions[t * 9 + 3 + axis];
      const c = positions[t * 9 + 6 + axis];
      triBounds[t * 6 + axis] = Math.min(a, b, c);
      triBounds[t * 6 + 3 + axis] = Math.max(a, b, c);
      centroids[t * 3 + axis] = (a + b + c) / 3;
    }
  }
  const order = new Uint32Array(shared(triangles * 4));
  for (let t = 0; t < triangles; t += 1) order[t] = t;
  const maxNodes = 2 * triangles;
  const bounds = new Float32Array(maxNodes * 6);
  const meta = new Int32Array(maxNodes * 2);
  let nodeCount = 1;

  const split = (node, start, end) => {
    const nb = node * 6;
    bounds[nb] = bounds[nb + 1] = bounds[nb + 2] = Infinity;
    bounds[nb + 3] = bounds[nb + 4] = bounds[nb + 5] = -Infinity;
    const cmin = [Infinity, Infinity, Infinity];
    const cmax = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i += 1) {
      const t = order[i];
      for (let axis = 0; axis < 3; axis += 1) {
        if (triBounds[t * 6 + axis] < bounds[nb + axis]) bounds[nb + axis] = triBounds[t * 6 + axis];
        if (triBounds[t * 6 + 3 + axis] > bounds[nb + 3 + axis]) bounds[nb + 3 + axis] = triBounds[t * 6 + 3 + axis];
        const c = centroids[t * 3 + axis];
        if (c < cmin[axis]) cmin[axis] = c;
        if (c > cmax[axis]) cmax[axis] = c;
      }
    }
    const count = end - start;
    if (count <= LEAF_SIZE) {
      meta[node * 2] = start;
      meta[node * 2 + 1] = count;
      return;
    }
    let axis = 0;
    for (let a = 1; a < 3; a += 1) if (cmax[a] - cmin[a] > cmax[axis] - cmin[axis]) axis = a;
    const mid = (cmin[axis] + cmax[axis]) / 2;
    let left = start;
    for (let i = start; i < end; i += 1) {
      const t = order[i];
      if (centroids[t * 3 + axis] < mid) {
        order[i] = order[left];
        order[left] = t;
        left += 1;
      }
    }
    if (left === start || left === end) {
      const slice = order.subarray(start, end);
      slice.sort((p, q) => centroids[p * 3 + axis] - centroids[q * 3 + axis]);
      left = start + (count >> 1);
    }
    const leftNode = nodeCount;
    const rightNode = nodeCount + 1;
    nodeCount += 2;
    meta[node * 2] = leftNode;
    meta[node * 2 + 1] = 0;
    split(leftNode, start, left);
    split(rightNode, left, end);
  };
  split(0, 0, triangles);

  const leafPositions = new Float32Array(shared(triangles * 36));
  for (let i = 0; i < triangles; i += 1) leafPositions.set(positions.subarray(order[i] * 9, order[i] * 9 + 9), i * 9);
  const sharedBounds = new Float32Array(shared(nodeCount * 24));
  sharedBounds.set(bounds.subarray(0, nodeCount * 6));
  const sharedMeta = new Int32Array(shared(nodeCount * 8));
  sharedMeta.set(meta.subarray(0, nodeCount * 2));
  return { positions: leafPositions, order, bounds: sharedBounds, meta: sharedMeta, nodeCount, triangles };
}

/** Squared distance from a point to an axis-aligned box, 0 inside. */
function boxDistanceSquared(bounds, nb, px, py, pz) {
  const dx = Math.max(bounds[nb] - px, 0, px - bounds[nb + 3]);
  const dy = Math.max(bounds[nb + 1] - py, 0, py - bounds[nb + 4]);
  const dz = Math.max(bounds[nb + 2] - pz, 0, pz - bounds[nb + 5]);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Closest point on the triangle at `base` in `positions` to (px, py, pz), after Ericson, Real-Time Collision Detection 5.1.5, written into `out` as [x, y, z, squared distance, region].
 * @param {Float32Array} positions
 * @param {number} base
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {Float64Array} out
 */
export function closestPointOnTriangle(positions, base, px, py, pz, out) {
  const ax = positions[base];
  const ay = positions[base + 1];
  const az = positions[base + 2];
  const abx = positions[base + 3] - ax;
  const aby = positions[base + 4] - ay;
  const abz = positions[base + 5] - az;
  const acx = positions[base + 6] - ax;
  const acy = positions[base + 7] - ay;
  const acz = positions[base + 8] - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let region = REGION.face;
  let qx;
  let qy;
  let qz;
  if (d1 <= 0 && d2 <= 0) {
    region = REGION.vertexA;
    qx = ax;
    qy = ay;
    qz = az;
  } else {
    const bpx = px - positions[base + 3];
    const bpy = py - positions[base + 4];
    const bpz = pz - positions[base + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
      region = REGION.vertexB;
      qx = positions[base + 3];
      qy = positions[base + 4];
      qz = positions[base + 5];
    } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        region = REGION.edgeAB;
        qx = ax + abx * v;
        qy = ay + aby * v;
        qz = az + abz * v;
      } else {
        const cpx = px - positions[base + 6];
        const cpy = py - positions[base + 7];
        const cpz = pz - positions[base + 8];
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) {
          region = REGION.vertexC;
          qx = positions[base + 6];
          qy = positions[base + 7];
          qz = positions[base + 8];
        } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            region = REGION.edgeCA;
            qx = ax + acx * w;
            qy = ay + acy * w;
            qz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              region = REGION.edgeBC;
              qx = positions[base + 3] + (positions[base + 6] - positions[base + 3]) * w;
              qy = positions[base + 4] + (positions[base + 7] - positions[base + 4]) * w;
              qz = positions[base + 5] + (positions[base + 8] - positions[base + 5]) * w;
            } else {
              const denom = 1 / (va + vb + vc);
              const v = vb * denom;
              const w = vc * denom;
              qx = ax + abx * v + acx * w;
              qy = ay + aby * v + acy * w;
              qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  out[0] = qx;
  out[1] = qy;
  out[2] = qz;
  out[3] = dx * dx + dy * dy + dz * dz;
  out[4] = region;
}

/** Reusable state for queries on one hierarchy: the traversal stack and the scratch outputs. */
export class ClosestPointQuery {
  /** @param {{ positions: Float32Array, bounds: Float32Array, meta: Int32Array }} bvh */
  constructor(bvh) {
    this.bvh = bvh;
    this.stack = new Int32Array(128);
    this.scratch = new Float64Array(5);
    /** Leaf-order index of the closest triangle, -1 when none is within the cap. */
    this.triangle = -1;
    this.region = 0;
    this.distance = Infinity;
    this.point = new Float64Array(3);
  }

  /**
   * Finds the closest triangle within `maxDistance`; returns the distance (or `maxDistance` when none is nearer) and fills `triangle`, `region` and `point`.
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @param {number} maxDistance
   */
  query(px, py, pz, maxDistance) {
    const { positions, bounds, meta } = this.bvh;
    const stack = this.stack;
    const scratch = this.scratch;
    let best = maxDistance * maxDistance;
    this.triangle = -1;
    let top = 0;
    stack[top] = 0;
    top += 1;
    while (top > 0) {
      top -= 1;
      const node = stack[top];
      if (boxDistanceSquared(bounds, node * 6, px, py, pz) >= best) continue;
      const first = meta[node * 2];
      const count = meta[node * 2 + 1];
      if (count > 0) {
        for (let i = first; i < first + count; i += 1) {
          closestPointOnTriangle(positions, i * 9, px, py, pz, scratch);
          if (scratch[3] < best) {
            best = scratch[3];
            this.triangle = i;
            this.region = scratch[4];
            this.point[0] = scratch[0];
            this.point[1] = scratch[1];
            this.point[2] = scratch[2];
          }
        }
      } else {
        const leftDistance = boxDistanceSquared(bounds, first * 6, px, py, pz);
        const rightDistance = boxDistanceSquared(bounds, (first + 1) * 6, px, py, pz);
        if (leftDistance < rightDistance) {
          if (rightDistance < best) stack[top++] = first + 1;
          stack[top++] = first;
        } else {
          if (leftDistance < best) stack[top++] = first;
          stack[top++] = first + 1;
        }
      }
    }
    this.distance = this.triangle === -1 ? maxDistance : Math.sqrt(best);
    return this.distance;
  }
}

/**
 * The pseudonormal of the feature the last query's closest point lies on, read from the per-vertex, per-edge and per-face arrays of `pseudonormals()` through the leaf order; writes it into `out`.
 * @param {ClosestPointQuery} query
 * @param {{ order: Uint32Array, indices: Uint32Array, face: Float32Array, vertex: Float32Array, edge: Float32Array }} normals
 * @param {Float64Array} out
 */
export function featureNormal(query, normals, out) {
  const t = normals.order[query.triangle];
  const region = query.region;
  let source;
  let offset;
  if (region === REGION.face) {
    source = normals.face;
    offset = t * 3;
  } else if (region <= REGION.vertexC) {
    source = normals.vertex;
    offset = normals.indices[t * 3 + (region - 1)] * 3;
  } else {
    source = normals.edge;
    offset = t * 9 + (region - REGION.edgeAB) * 3;
  }
  out[0] = source[offset];
  out[1] = source[offset + 1];
  out[2] = source[offset + 2];
}
