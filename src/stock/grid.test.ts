/**
 * Grids (src/stock/grid.ts). What a green run proves, and its bounds:
 *   1. `blockLattice` covers the block plus GRID_MARGIN_CELLS on every side and `latticeBlockBox` recovers the block from it to within a cell.
 *   2. Trilinear `sample` reproduces an analytic sphere field between cell centres to within a cell's curvature, `gradient` of a plane is its unit normal, and both are continuous across the lattice's edge.
 *   3. `blockGrid` is negative inside the block, positive outside and clamped to STOCK_BAND_CELLS.
 *   4. `loadFigureGrid` reads a fixture written here per the format of src/contracts/grid.ts (header JSON, gzip of little-endian Int16, SHA-256) and rejects a wrong digest, a wrong size and a bad header with a message naming the problem.
 * Bounds: the fixture is this test's own writing of the format; the pipeline's real file is checked at integration. No network: `fetch` is a fake serving the fixture.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { DEFAULT_BAND_CELLS, FIXED_POINT, type GridHeader } from '../contracts/grid';
import { BLOCK_M, GRID_MARGIN_CELLS, STOCK_BAND_CELLS } from '../david/frame';
import { blockGrid, blockLattice, frameBlockBox, fromFixed, Grid, latticeBlockBox, loadFigureGrid, toFixed } from './grid';

describe('block lattice', () => {
  it('covers the block plus the margin and gives the block back', () => {
    const cell = 0.05;
    const spec = blockLattice(cell);
    expect(spec.band).toBe(DEFAULT_BAND_CELLS);
    expect(spec.size[0]).toBe(Math.ceil(BLOCK_M.width / cell) + 2 * GRID_MARGIN_CELLS);
    expect(spec.size[1]).toBe(Math.ceil(BLOCK_M.height / cell) + 2 * GRID_MARGIN_CELLS);
    expect(spec.size[2]).toBe(Math.ceil(BLOCK_M.depth / cell) + 2 * GRID_MARGIN_CELLS);
    const box = latticeBlockBox(spec);
    const frame = frameBlockBox();
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.abs((box.min[axis] ?? 0) - (frame.min[axis] ?? 0))).toBeLessThan(cell);
      expect(Math.abs((box.max[axis] ?? 0) - (frame.max[axis] ?? 0))).toBeLessThan(cell);
      expect(box.min[axis] ?? 0).toBeLessThanOrEqual(frame.min[axis] ?? 0);
      expect(box.max[axis] ?? 0).toBeGreaterThanOrEqual(frame.max[axis] ?? 0);
    }
  });

  it('converts metres and fixed point both ways', () => {
    expect(toFixed(0.008, 0.008)).toBe(FIXED_POINT);
    expect(fromFixed(FIXED_POINT * 2, 0.008)).toBeCloseTo(0.016, 12);
  });
});

describe('sampling', () => {
  const cell = 0.02;
  const spec = { cell, size: [20, 22, 24] as const, origin: [-0.1, 0.05, -0.2] as const, band: 8 };
  const centre = [0.1, 0.25, 0.03] as const;
  const radius = 0.11;
  const sphere = (x: number, y: number, z: number): number => Math.hypot(x - centre[0], y - centre[1], z - centre[2]) - radius;

  it('samples an analytic sphere between cell centres', () => {
    const grid = new Grid(spec);
    grid.fill(sphere);
    let worst = 0;
    for (let n = 0; n < 500; n += 1) {
      const x = -0.08 + 0.3 * ((n * 7919) % 1000) / 1000;
      const y = 0.07 + 0.35 * ((n * 104729) % 1000) / 1000;
      const z = -0.18 + 0.4 * ((n * 1299709) % 1000) / 1000;
      if (Math.abs(sphere(x, y, z)) > 6 * cell) continue;
      worst = Math.max(worst, Math.abs(grid.sample(x, y, z) - sphere(x, y, z)));
    }
    expect(worst).toBeLessThan(0.25 * cell);
  });

  it('takes the unit normal of a plane as its gradient and stays continuous past the edge', () => {
    const grid = new Grid(spec);
    const normal = [0.6, 0.8, 0] as const;
    grid.fill((x, y, z) => (x - 0.1) * normal[0] + (y - 0.25) * normal[1] + z * normal[2]);
    const [gx, gy, gz] = grid.gradient(0.05, 0.2, 0.01);
    // Fixed point rounds each sample to 1/256 cell, so the central difference is good to about half a percent.
    expect(gx).toBeCloseTo(normal[0], 2);
    expect(gy).toBeCloseTo(normal[1], 2);
    expect(gz).toBeCloseTo(normal[2], 2);
    const edge = grid.sample(spec.origin[0], 0.2, 0.01);
    const beyond = grid.sample(spec.origin[0] - 0.5, 0.2, 0.01);
    expect(beyond).toBe(edge);
  });
});

describe('block grid', () => {
  it('is the block box clamped to the stock band', () => {
    const spec = blockLattice(0.1);
    const grid = blockGrid(spec, frameBlockBox());
    expect(grid.spec.band).toBe(STOCK_BAND_CELLS);
    expect(grid.sample(0, BLOCK_M.height / 2, 0)).toBeLessThan(0);
    expect(grid.sample(0, BLOCK_M.height / 2, 0)).toBeCloseTo(-STOCK_BAND_CELLS * 0.1, 6);
    // Trilinear interpolation across a face that is not on a cell boundary is good to a few thousandths of a metre at a 10 cm cell.
    expect(grid.sample(0, BLOCK_M.height + 0.05, 0)).toBeCloseTo(0.05, 2);
    expect(grid.sample(BLOCK_M.width / 2 + 0.05, 1, 0)).toBeCloseTo(0.05, 2);
    expect(grid.sample(0, -0.05, 0)).toBeCloseTo(0.05, 2);
    // The margin is GRID_MARGIN_CELLS wide, so no cell lies a full band outside the block, while the interior reaches the clamp.
    expect(Math.max(...grid.values)).toBeLessThanOrEqual(STOCK_BAND_CELLS * FIXED_POINT);
    expect(Math.max(...grid.values)).toBeGreaterThan(2 * FIXED_POINT);
    expect(Math.min(...grid.values)).toBe(-STOCK_BAND_CELLS * FIXED_POINT);
  });
});

describe('figure grid loader', () => {
  const size = [5, 6, 7] as const;
  const values = new Int16Array(size[0] * size[1] * size[2]);
  for (let n = 0; n < values.length; n += 1) values[n] = ((n * 37) % 2001) - 1000;
  const raw = new Uint8Array(values.length * 2);
  new DataView(raw.buffer).setInt16(0, 0, true);
  for (let n = 0; n < values.length; n += 1) new DataView(raw.buffer).setInt16(n * 2, values[n] ?? 0, true);
  const gz = gzipSync(raw);
  const header: GridHeader = {
    format: 'sculpture-grid/1',
    encoding: 'int16x256',
    order: 'x-fastest',
    cell: 0.008,
    size,
    origin: [-1.1, -0.06, -0.8],
    band: 32,
    sha256: createHash('sha256').update(raw).digest('hex'),
    source: { title: 'fixture', author: 'test', url: 'about:fixture', licence: 'CC0', licenceUrl: 'about:cc0', sha1: '0', attribution: 'fixture', fetchedAt: '2026-10-11' },
  };

  function serve(files: Record<string, GridHeader | Uint8Array | number>): typeof fetch {
    return (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const file = files[url];
      if (file === undefined) return Promise.resolve(new Response(null, { status: 404 }));
      if (typeof file === 'number') return Promise.resolve(new Response(null, { status: file }));
      if (file instanceof Uint8Array) return Promise.resolve(new Response(new Uint8Array(file).buffer, { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify(file), { status: 200 }));
    };
  }

  it('reads the fixture back byte for byte with its header', async () => {
    const loaded = await loadFigureGrid('model/fixture.json', serve({ 'model/fixture.json': header, 'model/fixture.bin.gz': gz }));
    expect(loaded.header.source?.title).toBe('fixture');
    expect([...loaded.grid.spec.size]).toEqual([...size]);
    expect(loaded.grid.spec.cell).toBe(0.008);
    expect(loaded.grid.values).toEqual(values);
    expect(loaded.grid.sample(-1.1, -0.06, -0.8)).toBeCloseTo(fromFixed(values[0] ?? 0, 0.008), 9);
  });

  it('rejects a wrong digest, a wrong size and a bad header, naming the problem', async () => {
    const wrongDigest = { ...header, sha256: header.sha256.replace(/./g, '0') };
    await expect(loadFigureGrid('model/a.json', serve({ 'model/a.json': wrongDigest, 'model/a.bin.gz': gz }))).rejects.toThrow(/SHA-256/);
    const wrongSize = { ...header, size: [5, 6, 8] as const };
    await expect(loadFigureGrid('model/b.json', serve({ 'model/b.json': wrongSize, 'model/b.bin.gz': gz }))).rejects.toThrow(/inflates to 420 bytes/);
    const badHeader = { ...header, format: 'other', band: 0 } as unknown as GridHeader;
    await expect(loadFigureGrid('model/c.json', serve({ 'model/c.json': badHeader }))).rejects.toThrow(/format "other".*band must be/);
    await expect(loadFigureGrid('model/d.json', serve({ 'model/d.json': 500 }))).rejects.toThrow(/answered 500/);
    await expect(loadFigureGrid('model/e.bin', serve({}))).rejects.toThrow(/must end in \.json/);
  });
});
