/**
 * Grids on the lattice of src/contracts/grid.ts (docs/design/spec.md, Stock and figure): a `Grid` holds signed distances in fixed point (cells × FIXED_POINT, Int16, clamped to ±band) and samples them in world metres as an `SdfSampler`.
 * `blockLattice` derives the lattice from the block in src/david/frame.ts; `blockGrid` is the stock at t = 0; `loadFigureGrid` reads the pipeline's files; the finish grid is one byte per cell.
 *
 * Lattice: the block is centred on the lattice, with `GRID_MARGIN_CELLS` of margin beyond each face, so a face lies between cell centres whenever the block's extent is not a whole number of cells. The pipeline's header carries the lattice it actually built, and every grid derived from it uses that one, so the two never disagree.
 */
import { DEFAULT_BAND_CELLS, FIXED_POINT, cellIndex, type GridHeader, type GridSpec } from '../contracts/grid';
import type { SdfSampler, Vec3 } from '../contracts/making';
import { BLOCK_M, GRID_MARGIN_CELLS, STOCK_BAND_CELLS } from '../david/frame';

/** Metres to fixed-point cells, rounded. */
export function toFixed(metres: number, cell: number): number {
  return Math.round((metres / cell) * FIXED_POINT);
}

/** Fixed-point cells to metres. */
export function fromFixed(value: number, cell: number): number {
  return (value / FIXED_POINT) * cell;
}

export class Grid implements SdfSampler {
  readonly spec: GridSpec;
  readonly values: Int16Array;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** ±limit is the clamp in fixed point. */
  readonly limit: number;

  constructor(spec: GridSpec, values?: Int16Array) {
    const [nx, ny, nz] = spec.size;
    const count = nx * ny * nz;
    if (values !== undefined && values.length !== count) {
      throw new Error(`grid values hold ${String(values.length)} cells but the spec ${String(nx)}×${String(ny)}×${String(nz)} needs ${String(count)}`);
    }
    this.spec = spec;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.limit = spec.band * FIXED_POINT;
    this.values = values ?? new Int16Array(count).fill(this.limit);
  }

  get cell(): number {
    return this.spec.cell;
  }

  index(i: number, j: number, k: number): number {
    return cellIndex(this.spec.size, i, j, k);
  }

  /** Fractional cell coordinates of a world point: cell (i, j, k) is centred at (i, j, k). */
  cellOf(x: number, y: number, z: number): Vec3 {
    const { origin, cell } = this.spec;
    return [(x - origin[0]) / cell, (y - origin[1]) / cell, (z - origin[2]) / cell];
  }

  /** World position of the centre of cell (i, j, k); fractional indices interpolate. */
  worldOf(i: number, j: number, k: number): Vec3 {
    const { origin, cell } = this.spec;
    return [origin[0] + i * cell, origin[1] + j * cell, origin[2] + k * cell];
  }

  /** Trilinear sample in metres; coordinates beyond the lattice take the nearest edge value, which keeps the field continuous. */
  sample(x: number, y: number, z: number): number {
    const { origin, cell } = this.spec;
    const u = clampCoordinate((x - origin[0]) / cell, this.nx);
    const v = clampCoordinate((y - origin[1]) / cell, this.ny);
    const w = clampCoordinate((z - origin[2]) / cell, this.nz);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const k = Math.floor(w);
    const fu = u - i;
    const fv = v - j;
    const fw = w - k;
    const i1 = fu > 0 ? 1 : 0;
    const j1 = fv > 0 ? this.nx : 0;
    const k1 = fw > 0 ? this.nx * this.ny : 0;
    const values = this.values;
    const base = i + this.nx * (j + this.ny * k);
    const c000 = values[base] ?? 0;
    const c100 = values[base + i1] ?? 0;
    const c010 = values[base + j1] ?? 0;
    const c110 = values[base + i1 + j1] ?? 0;
    const c001 = values[base + k1] ?? 0;
    const c101 = values[base + i1 + k1] ?? 0;
    const c011 = values[base + j1 + k1] ?? 0;
    const c111 = values[base + i1 + j1 + k1] ?? 0;
    const x00 = c000 + (c100 - c000) * fu;
    const x10 = c010 + (c110 - c010) * fu;
    const x01 = c001 + (c101 - c001) * fu;
    const x11 = c011 + (c111 - c011) * fu;
    const y0 = x00 + (x10 - x00) * fv;
    const y1 = x01 + (x11 - x01) * fv;
    return ((y0 + (y1 - y0) * fw) / FIXED_POINT) * cell;
  }

  /** Unit gradient by central differences over half a cell; +Y where the field is flat. */
  gradient(x: number, y: number, z: number): Vec3 {
    const h = this.spec.cell * 0.5;
    const gx = this.sample(x + h, y, z) - this.sample(x - h, y, z);
    const gy = this.sample(x, y + h, z) - this.sample(x, y - h, z);
    const gz = this.sample(x, y, z + h) - this.sample(x, y, z - h);
    const length = Math.hypot(gx, gy, gz);
    if (length < 1e-12) return [0, 1, 0];
    return [gx / length, gy / length, gz / length];
  }

  /** Writes `fn(x, y, z)` (metres, negative inside) into every cell, clamped to the band. */
  fill(fn: (x: number, y: number, z: number) => number): void {
    const { origin, cell } = this.spec;
    const values = this.values;
    const limit = this.limit;
    let index = 0;
    for (let k = 0; k < this.nz; k += 1) {
      const z = origin[2] + k * cell;
      for (let j = 0; j < this.ny; j += 1) {
        const y = origin[1] + j * cell;
        for (let i = 0; i < this.nx; i += 1) {
          const value = Math.round((fn(origin[0] + i * cell, y, z) / cell) * FIXED_POINT);
          values[index] = value < -limit ? -limit : value > limit ? limit : value;
          index += 1;
        }
      }
    }
  }

  /** Bytes of the values. */
  get byteLength(): number {
    return this.values.byteLength;
  }
}

function clampCoordinate(u: number, n: number): number {
  return u < 0 ? 0 : u > n - 1 ? n - 1 : u;
}

/** The lattice over the block of src/david/frame.ts at `cell` metres: the block centred, `GRID_MARGIN_CELLS` beyond each face. */
export function blockLattice(cell: number, band = DEFAULT_BAND_CELLS): GridSpec {
  const extents = [BLOCK_M.width, BLOCK_M.height, BLOCK_M.depth] as const;
  const centre = [0, BLOCK_M.height / 2, 0] as const;
  const size = extents.map((extent) => Math.ceil(extent / cell - 1e-9) + 2 * GRID_MARGIN_CELLS) as [number, number, number];
  const origin = centre.map((c, axis) => c - ((size[axis] - 1) / 2) * cell) as [number, number, number];
  return { cell, size, origin, band };
}

/** Signed distance to the block's box (negative inside), metres: x across ±width/2, y from 0 to height, z across ±depth/2. */
export function blockDistance(x: number, y: number, z: number): number {
  const qx = Math.abs(x) - BLOCK_M.width / 2;
  const qy = Math.abs(y - BLOCK_M.height / 2) - BLOCK_M.height / 2;
  const qz = Math.abs(z) - BLOCK_M.depth / 2;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0);
}

/** The stock at t = 0: the block's box on `spec`'s lattice, clamped to STOCK_BAND_CELLS. */
export function blockGrid(spec: GridSpec): Grid {
  const grid = new Grid({ ...spec, band: STOCK_BAND_CELLS });
  grid.fill(blockDistance);
  return grid;
}

/** The finish grid: one FINISH code per cell, all `block` (0) to start. */
export function createFinishGrid(spec: GridSpec): Uint8Array {
  const [nx, ny, nz] = spec.size;
  return new Uint8Array(nx * ny * nz);
}

export interface LoadedFigure {
  readonly grid: Grid;
  readonly header: GridHeader;
}

const HEADER_SUFFIX = /\.json$/;

/**
 * Loads a figure grid written by scripts/build-grid.mjs: the header at `url` (…/name.json) and the gzip data beside it (…/name.bin.gz), inflated with DecompressionStream and checked against the header's SHA-256.
 * `fetchImpl` is the page's fetch; tests pass one that serves a fixture.
 */
export async function loadFigureGrid(url: string, fetchImpl: typeof fetch = fetch): Promise<LoadedFigure> {
  if (!HEADER_SUFFIX.test(url)) throw new Error(`figure grid url ${url} must end in .json, the header file name of src/contracts/grid.ts`);
  const headerResponse = await fetchImpl(url);
  if (!headerResponse.ok) throw new Error(`figure grid header ${url} answered ${String(headerResponse.status)}`);
  const header = (await headerResponse.json()) as GridHeader;
  checkHeader(header, url);
  const dataUrl = url.replace(HEADER_SUFFIX, '.bin.gz');
  const dataResponse = await fetchImpl(dataUrl);
  if (!dataResponse.ok || dataResponse.body === null) throw new Error(`figure grid data ${dataUrl} answered ${String(dataResponse.status)} with no body`);
  const bytes = new Uint8Array(await new Response(dataResponse.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const [nx, ny, nz] = header.size;
  const expected = nx * ny * nz * 2;
  if (bytes.byteLength !== expected) {
    throw new Error(`figure grid data ${dataUrl} inflates to ${String(bytes.byteLength)} bytes but the header's ${String(nx)}×${String(ny)}×${String(nz)} Int16 cells need ${String(expected)}`);
  }
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (digest !== header.sha256.toLowerCase()) throw new Error(`figure grid data ${dataUrl} has SHA-256 ${digest}, the header says ${header.sha256}`);
  const values = new Int16Array(bytes.buffer, bytes.byteOffset, nx * ny * nz);
  if (!LITTLE_ENDIAN) swapBytes(values);
  return { grid: new Grid({ cell: header.cell, size: header.size, origin: header.origin, band: header.band }, values), header };
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function swapBytes(values: Int16Array): void {
  const view = new DataView(values.buffer, values.byteOffset, values.byteLength);
  for (let i = 0; i < values.length; i += 1) values[i] = view.getInt16(i * 2, true);
}

function checkHeader(header: GridHeader, url: string): void {
  const problems: string[] = [];
  if (header.format !== 'sculpture-grid/1') problems.push(`format ${JSON.stringify(header.format)} (expected "sculpture-grid/1")`);
  if (header.encoding !== 'int16x256') problems.push(`encoding ${JSON.stringify(header.encoding)} (expected "int16x256")`);
  if (header.order !== 'x-fastest') problems.push(`order ${JSON.stringify(header.order)} (expected "x-fastest")`);
  if (!(header.cell > 0)) problems.push('cell must be a positive number of metres');
  if (!Array.isArray(header.size) || header.size.length !== 3 || !header.size.every((n) => Number.isInteger(n) && n > 1)) problems.push('size must be three whole numbers above 1');
  if (!Array.isArray(header.origin) || header.origin.length !== 3 || !header.origin.every((n) => Number.isFinite(n))) problems.push('origin must be three finite numbers');
  if (!(header.band > 0)) problems.push('band must be a positive number of cells');
  if (typeof header.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(header.sha256)) problems.push('sha256 must be 64 hex characters');
  if (problems.length > 0) throw new Error(`figure grid header ${url} is not a sculpture-grid/1 header: ${problems.join('; ')}`);
}

function hex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += byte.toString(16).padStart(2, '0');
  return text;
}
