/**
 * Sampling the signed distance of a mesh on the grid lattice (src/contracts/grid.ts): the lattice from a block box, the per-row closest-point loop, the flood-fill sign from the lattice boundary, and the volume the grid encloses.
 * Distances are in cells. A query is capped at the band, seeded from the previous cell's distance plus one cell (a signed distance is 1-Lipschitz), so far cells cost almost nothing and near cells prune hard.
 * Sign from the pseudonormal of the closest feature is written into the sampled value; the flood fill decides the sign of every cell farther than half a cell from the surface and `resolveSign` says which one is authoritative.
 */
import { ClosestPointQuery, featureNormal } from './bvh.mjs';

const SURFACE_HALF_CELL = 0.5;
/** One cell of seed slack plus a little for float32 rounding, so the seeded cap never undercuts the true distance. */
const LIPSCHITZ_SLACK = 1.001;

/**
 * The lattice covering `block` plus `margin` cells on every side, with cell (margin, margin, margin) starting at the block's minimum corner; `origin` is the centre of cell (0, 0, 0) (src/contracts/grid.ts, GridSpec).
 * @param {{ min: number[], max: number[] }} block world metres
 * @param {number} cell metres
 * @param {number} margin cells
 * @param {number} band cells
 * @returns {{ cell: number, size: number[], origin: number[], band: number }}
 */
export function latticeFor(block, cell, margin, band) {
  const size = [0, 1, 2].map((axis) => Math.ceil((block.max[axis] - block.min[axis]) / cell - 1e-9) + 2 * margin);
  const origin = [0, 1, 2].map((axis) => block.min[axis] + (0.5 - margin) * cell);
  return { cell, size: [size[0], size[1], size[2]], origin: [origin[0], origin[1], origin[2]], band };
}

/**
 * Samples the rows (every i) of the z-slabs listed in `slabs` into `out` (signed distance in cells, positive outside by the pseudonormal, clamped to `band`), for one worker.
 * @param {{ positions: Float32Array, bounds: Float32Array, meta: Int32Array }} bvh
 * @param {{ order: Uint32Array, indices: Uint32Array, face: Float32Array, vertex: Float32Array, edge: Float32Array }} normals
 * @param {{ cell: number, size: number[], origin: number[], band: number }} lattice
 * @param {ArrayLike<number>} slabs
 * @param {Float32Array} out
 * @returns {number} cells sampled
 */
export function sampleSlabs(bvh, normals, lattice, slabs, out) {
  const query = new ClosestPointQuery(bvh);
  const normal = new Float64Array(3);
  const { cell, size, origin, band } = lattice;
  const [nx, ny] = size;
  const cap = band * cell;
  let sampled = 0;
  for (let s = 0; s < slabs.length; s += 1) {
    const k = slabs[s];
    const z = origin[2] + k * cell;
    for (let j = 0; j < ny; j += 1) {
      const y = origin[1] + j * cell;
      let previous = cap;
      let index = nx * (j + ny * k);
      for (let i = 0; i < nx; i += 1, index += 1) {
        const x = origin[0] + i * cell;
        const limit = Math.min(cap, previous + cell * LIPSCHITZ_SLACK);
        const distance = query.query(x, y, z, limit);
        let signed = band;
        if (query.triangle !== -1) {
          featureNormal(query, normals, normal);
          const side = (x - query.point[0]) * normal[0] + (y - query.point[1]) * normal[1] + (z - query.point[2]) * normal[2];
          signed = side < 0 ? -distance / cell : distance / cell;
        }
        out[index] = signed;
        // A miss says only that the distance is at least `limit`, which bounds nothing above: the next cell searches the whole band.
        previous = query.triangle === -1 ? cap : distance;
        sampled += 1;
      }
    }
  }
  return sampled;
}

/**
 * Flood fill from the lattice boundary through cells farther than half a cell from the surface (|value| > 0.5), six-connected. Returns one byte per cell: 1 reached from outside, 0 not.
 * @param {Float32Array} values signed or unsigned distances in cells
 * @param {number[]} size
 */
export function floodFromBoundary(values, size) {
  const [nx, ny, nz] = size;
  const total = nx * ny * nz;
  const reached = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const push = (index) => {
    if (reached[index] === 0 && Math.abs(values[index]) > SURFACE_HALF_CELL) {
      reached[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(i + nx * (j + ny * k));
      }
    }
  }
  const slab = nx * ny;
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const i = index % nx;
    const j = Math.floor(index / nx) % ny;
    const k = Math.floor(index / slab);
    if (i > 0) push(index - 1);
    if (i < nx - 1) push(index + 1);
    if (j > 0) push(index - nx);
    if (j < ny - 1) push(index + nx);
    if (k > 0) push(index - slab);
    if (k < nz - 1) push(index + slab);
  }
  return { reached, reachedCount: tail };
}

/**
 * Final signs in place. Cells within half a cell of the surface keep the pseudonormal sign. Beyond that, `authority` 'pseudonormal' keeps the sampled sign except where the query hit nothing (then the flood fill decides), and 'flood' takes the flood fill everywhere; the counts say how often the two disagreed.
 * @param {Float32Array} values
 * @param {Uint8Array} reached
 * @param {number} band
 * @param {'pseudonormal' | 'flood'} authority
 */
export function resolveSign(values, reached, band, authority) {
  let floodInsideNormalOutside = 0;
  let floodOutsideNormalInside = 0;
  let inside = 0;
  let surface = 0;
  let far = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const magnitude = Math.abs(value);
    if (magnitude <= SURFACE_HALF_CELL) {
      surface += 1;
      if (value < 0) inside += 1;
      continue;
    }
    const outside = reached[index] === 1;
    if (magnitude >= band) {
      far += 1;
      values[index] = outside ? band : -band;
      if (!outside) inside += 1;
      continue;
    }
    const normalOutside = value > 0;
    if (outside !== normalOutside) {
      if (outside) floodOutsideNormalInside += 1;
      else floodInsideNormalOutside += 1;
    }
    const finalOutside = authority === 'flood' ? outside : normalOutside;
    values[index] = finalOutside ? magnitude : -magnitude;
    if (!finalOutside) inside += 1;
  }
  return { inside, surface, far, floodInsideNormalOutside, floodOutsideNormalInside };
}

/**
 * The volume the grid encloses, cubic metres: `counted` from negative cells alone, `corrected` with a half-cell surface correction (a cell at signed distance d in cells is taken as a fraction clamp(0.5 − d, 0, 1) inside, exact for a plane).
 * @param {Float32Array} values signed distances in cells
 * @param {number} cell metres
 */
export function gridVolume(values, cell) {
  let negative = 0;
  let fraction = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value < 0) negative += 1;
    fraction += Math.min(1, Math.max(0, 0.5 - value));
  }
  const unit = cell * cell * cell;
  return { counted: negative * unit, corrected: fraction * unit, negativeCells: negative };
}
