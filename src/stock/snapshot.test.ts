/**
 * The snapshot format (src/stock/snapshot.ts). What a green run proves, and its bounds:
 *   1. Round trip: on lattices of 70×45×33 and 65×97×40 cells (edge tiles clipped on every axis, and a z extent one past the chunk layout's last 32 cells, the plane `chunkLayout` leaves beyond its chunks), after seeded blows of the point, the claw, the drill, the rasp and the gilding leaf (stone cut to the band, air left with the finish of the last tool, the leaf's paint on the claw's texture only), a snapshot written into a fresh untouched block gives the stock and finish bytes exactly, wherever the cells lie.
 *   2. Only what differs is dirtied: written into a state that differs from it in a few cells, a snapshot changes exactly those cells, counts the tiles that held them and returns exactly the chunks whose 33³ mesh window holds one (`chunksTouching` of each changed cell); written into the state it was taken from, it changes nothing and dirties nothing.
 *   5. The encoding is pinned: a fixed state built cell by cell (not carved, so only the encoder moves the pin) encodes to the SHA-256 recorded for SNAPSHOT_VERSION, and decodes back to itself.
 *   3. Uniform tiles cost a byte: a tile of air or of deep stone with finish 0 holds no runs, and the snapshot of the untouched block is mostly such tiles.
 *   4. Bytes that are not a snapshot for this lattice are refused, before any cell is written, with what is wrong: another magic or version, a truncated file, another grid size; a snapshot stays within `maxSnapshotBytes`. Bytes no encoder writes (a tile kind past the three, a run class past air with the last finish code, a value outside the stock's clamp) are refused while writing, which the Making answers by going back to the untouched block (src/timeline/plan-build.test.ts).
 * Bounds: random blows on small lattices, not a plan (src/timeline/plan-build.test.ts checks the build's snapshots against the Making on the synthetic figure); the residual against the figure is exercised with the figure the snapshot was taken on, which the page guarantees by the grid's SHA-256 in the plan file.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Blow, ToolId, Vec3 } from '../contracts/making';
import { applyBlow, type CarveState } from './carve';
import { chunkLayout, chunksTouching } from './chunks';
import { blockGrid, createFinishGrid, Grid, type WorldBox } from './grid';
import { applySnapshot, encodeSnapshot, maxSnapshotBytes, snapshotInfo, TILE } from './snapshot';
import { BULK_CUT_SIZE_M } from './tool-volumes';

/** SHA-256 of the fixed state's snapshot in format SNAPSHOT_VERSION 1. */
const SNAPSHOT_GOLDEN = 'b52ad6949e2e0933e41ffda5446e58194c6f510a91c49e79d58ae2627fc29290';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Case {
  readonly figure: Grid;
  readonly block: WorldBox;
}

/** A lattice of `size` cells of 2 cm around a ball, the block filling it less two cells a side. */
function lattice(size: readonly [number, number, number]): Case {
  const cell = 0.02;
  const spec = { cell, size, origin: [0, 0, 0] as const, band: 16 };
  const figure = new Grid(spec);
  const centre = size.map((n) => ((n - 1) * cell) / 2);
  figure.fill((x, y, z) => Math.hypot(x - (centre[0] ?? 0), y - (centre[1] ?? 0), z - (centre[2] ?? 0)) - 0.2);
  const block = { min: [1.5 * cell, 1.5 * cell, 1.5 * cell] as Vec3, max: [(size[0] - 2.5) * cell, (size[1] - 2.5) * cell, (size[2] - 2.5) * cell] as Vec3 };
  return { figure, block };
}

function freshState(c: Case): CarveState {
  return { stock: blockGrid(c.figure.spec, c.block), finish: createFinishGrid(c.figure.spec), chunks: chunkLayout(c.figure.spec) };
}

/** Seeded blows on the block's faces with every kind of tool volume. */
function carve(state: CarveState, c: Case, seed: number, count: number): void {
  const random = mulberry32(seed);
  const tools: ToolId[] = ['point', 'point', 'claw', 'drill', 'rasp', 'gilding'];
  const { min, max } = c.block;
  for (let n = 0; n < count; n += 1) {
    const tool = tools[n % tools.length] ?? 'point';
    const face = Math.floor(random() * 4);
    const u = random();
    const v = random();
    const x = min[0] + u * (max[0] - min[0]);
    const y = min[1] + v * (max[1] - min[1]);
    const z = min[2] + random() * (max[2] - min[2]);
    const points: Vec3[] = [
      [x, y, max[2]],
      [x, y, min[2]],
      [max[0], y, z],
      [x, max[1], z],
    ];
    const normals: Vec3[] = [
      [0, 0, 1],
      [0, 0, -1],
      [1, 0, 0],
      [0, 1, 0],
    ];
    const normal = normals[face] ?? [0, 0, 1];
    // Every other point blow is a bulk crater, deep enough to leave air beyond the stock's band.
    const size = tool === 'point' ? (n % 4 === 0 ? 6 * BULK_CUT_SIZE_M : 0.05) : 0.02;
    const blow: Blow = { tool, point: points[face] ?? [x, y, max[2]], normal, direction: [-normal[0], -normal[1], -normal[2]], size, stroke: n };
    applyBlow(state, c.figure, blow, tool === 'rasp' ? 0 : 0.01);
  }
}

function equalBytes(a: CarveState, b: CarveState): boolean {
  return Buffer.from(a.stock.values.buffer).equals(Buffer.from(b.stock.values.buffer)) && Buffer.from(a.finish.buffer).equals(Buffer.from(b.finish.buffer));
}

describe('snapshots', () => {
  for (const size of [
    [70, 45, 33],
    [65, 97, 40],
  ] as const) {
    it(`round-trips a carved ${size.join('×')} lattice into a fresh block`, () => {
      const c = lattice(size);
      const carved = freshState(c);
      carve(carved, c, 7 + size[0], 160);
      const air = carved.stock.values.filter((v) => v === carved.stock.limit).length;
      const painted = carved.finish.filter((f) => f !== 0).length;
      expect(painted).toBeGreaterThan(100);
      expect(air).toBeGreaterThan(1000);
      const bytes = encodeSnapshot(carved.stock, carved.finish, c.figure, 160);
      const info = snapshotInfo(bytes);
      expect(info.blow).toBe(160);
      expect(info.tiles).toBe(Math.ceil(size[0] / TILE) * Math.ceil(size[1] / TILE) * Math.ceil(size[2] / TILE));
      const target = freshState(c);
      const outcome = applySnapshot(bytes, target, c.figure);
      expect(outcome.blow).toBe(160);
      expect(equalBytes(target, carved)).toBe(true);
      // Written into the state it holds, it changes nothing.
      const again = applySnapshot(bytes, target, c.figure);
      expect(again.changedTiles).toBe(0);
      expect(again.dirty).toEqual([]);
    });
  }

  it('changes exactly the cells that differ and dirties exactly the chunks whose window holds one', () => {
    const c = lattice([65, 97, 40]);
    const carved = freshState(c);
    carve(carved, c, 99, 120);
    const bytes = encodeSnapshot(carved.stock, carved.finish, c.figure, 120);
    const target = freshState(c);
    applySnapshot(bytes, target, c.figure);
    const [nx, ny, nz] = c.figure.spec.size;
    const random = mulberry32(5);
    // One cell in each of six tiles, so each changed tile's box is its one cell.
    const tilesTouched: (readonly [number, number, number])[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 1, 0],
      [0, 2, 1],
      [1, 3, 1],
      [2, 3, 1],
    ];
    const touched = tilesTouched.map(([tx, ty, tz], n) => {
      const pick = (t: number, size: number): number => Math.min(size - 1, t * TILE + Math.floor(random() * TILE));
      const index = pick(tx, nx) + nx * (pick(ty, ny) + ny * pick(tz, nz));
      if (n % 2 === 0) target.stock.values[index] = (target.stock.values[index] ?? 0) === 0 ? 1 : 0;
      else target.finish[index] = ((target.finish[index] ?? 0) + 1) % 14;
      return index;
    });
    const expected = new Set<number>();
    for (const index of touched) {
      const i = index % nx;
      const j = Math.floor(index / nx) % ny;
      const k = Math.floor(index / (nx * ny));
      for (const id of chunksTouching(target.chunks, { min: [i, j, k], max: [i, j, k] })) expected.add(id);
    }
    const outcome = applySnapshot(bytes, target, c.figure);
    expect(equalBytes(target, carved)).toBe(true);
    expect(outcome.changedTiles).toBe(tilesTouched.length);
    expect(outcome.dirty).toEqual([...expected].sort((a, b) => a - b));
  });

  it('stores uniform tiles as a byte', () => {
    const c = lattice([130, 97, 70]);
    const block = freshState(c);
    const bytes = encodeSnapshot(block.stock, block.finish, c.figure, 0);
    const info = snapshotInfo(bytes);
    const { values, limit } = block.stock;
    const band = values.filter((v) => v > -limit && v < limit).length;
    // Only the band cells of the block's faces carry values; the rest are runs and uniform tiles.
    expect(info.values).toBe(band);
    expect(band).toBeGreaterThan(0);
    // The inner tiles are deep stone and the outer ones air: a byte each, no runs, so the runs are those of the tiles the faces cross.
    const [tx, ty, tz] = [Math.ceil(130 / TILE), Math.ceil(97 / TILE), Math.ceil(70 / TILE)];
    const inner = Math.max(0, tx - 2) * Math.max(0, ty - 2) * Math.max(0, tz - 2);
    expect(info.tiles).toBe(tx * ty * tz);
    expect(inner).toBeGreaterThan(0);
    expect(info.runs).toBeLessThan((info.tiles - inner) * TILE * TILE * 3);
    expect(bytes.byteLength).toBeLessThan(3 * band + 4 * info.runs + info.tiles + 64);
  });

  it('refuses bytes that are not a snapshot of this lattice before writing a cell', () => {
    const c = lattice([70, 45, 33]);
    const carved = freshState(c);
    carve(carved, c, 3, 40);
    const bytes = encodeSnapshot(carved.stock, carved.finish, c.figure, 40);
    const target = freshState(c);
    const before = Buffer.from(target.stock.values.buffer).toString('base64');
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 0;
    expect(() => applySnapshot(wrongMagic, target, c.figure)).toThrow(/not a sculpture snapshot/);
    const wrongVersion = bytes.slice();
    wrongVersion[4] = 9;
    expect(() => applySnapshot(wrongVersion, target, c.figure)).toThrow(/format version 9/);
    expect(() => applySnapshot(bytes.slice(0, bytes.length - 1), target, c.figure)).toThrow(/truncated or malformed/);
    const other = lattice([65, 97, 40]);
    expect(() => applySnapshot(bytes, freshState(other), other.figure)).toThrow(/70×45×33 grid/);
    expect(Buffer.from(target.stock.values.buffer).toString('base64')).toBe(before);
    expect(bytes.byteLength).toBeLessThanOrEqual(maxSnapshotBytes(c.figure.spec.size));
  });

  it('encodes a fixed state to the bytes it always has', () => {
    // A state built cell by cell, not carved, so the pin moves with the encoding alone: SNAPSHOT_VERSION names it, the plan header records it, and the page refuses snapshots of another.
    const c = lattice([40, 35, 33]);
    const state = freshState(c);
    const random = mulberry32(31);
    const { values, limit } = state.stock;
    for (let n = 0; n < values.length; n += 1) {
      const roll = random();
      values[n] = roll < 0.4 ? -limit : roll < 0.8 ? limit : Math.round((random() * 2 - 1) * (limit - 1));
      state.finish[n] = values[n] === -limit ? 0 : Math.floor(random() * 14);
    }
    const bytes = encodeSnapshot(state.stock, state.finish, c.figure, 7);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(digest, `the snapshot encoding changed (SHA-256 ${digest}): if on purpose, bump SNAPSHOT_VERSION in src/stock/snapshot.ts, pin the new digest here and rebuild the plan with npm run model:plan`).toBe(SNAPSHOT_GOLDEN);
    const back = freshState(c);
    applySnapshot(bytes, back, c.figure);
    expect(equalBytes(back, state)).toBe(true);
  });

  it('refuses a tile kind, a run class or a value no encoder writes, while writing', () => {
    const c = lattice([70, 45, 33]);
    const carved = freshState(c);
    carve(carved, c, 11, 60);
    const bytes = encodeSnapshot(carved.stock, carved.finish, c.figure, 60);
    const info = snapshotInfo(bytes);
    const residualAt = 48 + info.runs * 2;
    const kindsAt = residualAt + info.values * 2;
    const classesAt = kindsAt + info.tiles;
    const badKind = bytes.slice();
    badKind[kindsAt] = 255;
    expect(() => applySnapshot(badKind, freshState(c), c.figure)).toThrow(/tile 0 has kind 255, which is none of 0/);
    const badClass = bytes.slice();
    badClass[classesAt] = 200;
    expect(() => applySnapshot(badClass, freshState(c), c.figure)).toThrow(/has class 200, past air with the last finish code/);
    const badValue = bytes.slice();
    new DataView(badValue.buffer).setInt16(residualAt, 32000, true);
    expect(() => applySnapshot(badValue, freshState(c), c.figure)).toThrow(/outside the clamp/);
  });
});
