/**
 * The chunk carve jobs (src/stock/carve-jobs.ts) against the serial carving rule (src/stock/carve.ts). What a green run proves, and its bounds:
 *   1. Same bytes: 120 seeded random blows of every tool over a 4 cm synthetic grid, applied serially in order, give the same stock and finish bytes as the same blows sorted into per-chunk jobs (each chunk's job holds the blows whose dilated box covers it, in index order) run through `runCarveJob` on copies of the chunks and written back, and the same bytes again when the jobs run on a shuffled chunk order.
 *   2. Same undo: the parts the jobs return, filed under their blows and undone in reverse blow order, restore the untouched block exactly, and every changed cell is recorded once.
 *   3. Chunk copies round-trip: `copyChunk` then `writeChunk` leaves a grid unchanged, including the chunks that run past the grid's edge.
 * Bounds: the jobs run in-process here, so the worker transport and the pool's queue are not exercised (src/timeline/making.test.ts runs the jump machinery with the in-process carver); the grid is 4 cm, so a chunk is a large part of it and few blows span more than two chunks on an axis.
 */
import { describe, expect, it } from 'vitest';

import { FIXED_POINT } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { applyBlow, type CarveState, dilatedBox, type UndoPart, undoBlow, volumeOf } from './carve';
import { BLOW_FIELDS, chunksCovering, copyChunk, packBlow, runCarveJob, undoPartsOf, writeChunk } from './carve-jobs';
import { chunkLayout } from './chunks';
import { blockGrid, createFinishGrid, frameBlockBox, type Grid } from './grid';

const TOOLS: readonly ToolId[] = ['charcoal', 'point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

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

function unit(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function freshState(figure: Grid): CarveState {
  return { stock: blockGrid(figure.spec, frameBlockBox()), finish: createFinishGrid(figure.spec), chunks: chunkLayout(figure.spec) };
}

function randomBlows(figure: Grid, count: number, seed: number): { blows: Blow[]; margins: number[] } {
  const random = mulberry32(seed);
  const blows: Blow[] = [];
  const margins: number[] = [];
  for (let n = 0; n < count; n += 1) {
    const tool = TOOLS[Math.floor(random() * TOOLS.length)] ?? 'point';
    const onFace = random() < 0.5;
    const x = -0.9 + 1.8 * random();
    const y = 0.2 + 4.8 * random();
    const z = onFace ? 0.7 : -0.5 + random();
    const normal = onFace ? ([0, 0, 1] as const) : figure.gradient(x, y, z);
    const tilt = random() * 0.9;
    const direction = unit(-normal[0] + tilt * (random() - 0.5), -normal[1] + tilt * (random() - 0.5), -normal[2] + tilt * (random() - 0.5));
    blows.push({ tool, point: [x, y, z], normal, direction, size: 0.005 + 0.145 * random(), stroke: n });
    margins.push(random() < 0.3 ? 0 : 0.03 * random());
  }
  return { blows, margins };
}

/** Applies the blows through per-chunk jobs in the given chunk order and returns the undo parts by blow. */
function applyChunked(state: CarveState, figure: Grid, blows: readonly Blow[], margins: readonly number[], order: (ids: number[]) => number[]): UndoPart[][] {
  const { stock, finish, chunks } = state;
  const spec = stock.spec;
  const perChunk = new Map<number, number[]>();
  blows.forEach((blow, n) => {
    const box = dilatedBox(volumeOf(figure, blow), spec);
    if (box === null) return;
    for (const id of chunksCovering(chunks, box)) {
      const list = perChunk.get(id);
      if (list === undefined) perChunk.set(id, [n]);
      else list.push(n);
    }
  });
  const parts: UndoPart[][] = blows.map(() => []);
  const lattice = { ...spec, stockLimit: stock.limit, figureBand: figure.spec.band * figure.cell };
  for (const id of order([...perChunk.keys()])) {
    const list = perChunk.get(id) ?? [];
    const packed = new Float64Array(list.length * BLOW_FIELDS);
    list.forEach((n, slot) => {
      const blow = blows[n];
      if (blow === undefined) return;
      packBlow(packed, slot, blow, Math.round(((margins[n] ?? 0) / spec.cell) * FIXED_POINT), figure.sample(blow.point[0], blow.point[1], blow.point[2]), n);
    });
    const job = {
      id,
      lattice,
      stock: copyChunk(stock.values, spec, chunks, id, stock.limit, (n) => new Int16Array(n)),
      finish: copyChunk(finish, spec, chunks, id, 0, (n) => new Uint8Array(n)),
      figure: null,
      blows: packed,
    };
    const result = runCarveJob(job, copyChunk(figure.values, spec, chunks, id, figure.limit, (n) => new Int16Array(n)), chunks);
    writeChunk(stock.values, spec, chunks, id, result.stock);
    writeChunk(finish, spec, chunks, id, result.finish);
    for (const { index, part } of undoPartsOf(result)) parts[index]?.push(part);
  }
  return parts;
}

describe('chunk carve jobs', () => {
  const figure = syntheticFigure(0.04);
  const { blows, margins } = randomBlows(figure, 120, 7);

  const serial = freshState(figure);
  for (let n = 0; n < blows.length; n += 1) {
    const blow = blows[n];
    if (blow !== undefined) applyBlow(serial, figure, blow, margins[n] ?? 0);
  }

  it('writes the same stock and finish bytes as the serial path, in any chunk order', () => {
    const chunked = freshState(figure);
    applyChunked(chunked, figure, blows, margins, (ids) => ids);
    expect(chunked.stock.values).toEqual(serial.stock.values);
    expect(chunked.finish).toEqual(serial.finish);
    const shuffled = freshState(figure);
    const random = mulberry32(99);
    applyChunked(shuffled, figure, blows, margins, (ids) => ids.sort(() => random() - 0.5));
    expect(shuffled.stock.values).toEqual(serial.stock.values);
    expect(shuffled.finish).toEqual(serial.finish);
    expect(serial.stock.values).not.toEqual(freshState(figure).stock.values);
  });

  it('returns undo parts that restore the block exactly and record every changed cell once', () => {
    const chunked = freshState(figure);
    const pristine = { stock: chunked.stock.values.slice(), finish: chunked.finish.slice() };
    const parts = applyChunked(chunked, figure, blows, margins, (ids) => ids);
    let recorded = 0;
    for (let n = parts.length - 1; n >= 0; n -= 1) {
      const blowParts = parts[n] ?? [];
      for (const part of blowParts) {
        recorded += part.indices.length;
        for (let r = 1; r < part.runs.length; r += 2) recorded += part.runs[r] ?? 0;
      }
      undoBlow(chunked, { parts: blowParts });
    }
    expect(chunked.stock.values).toEqual(pristine.stock);
    expect(chunked.finish).toEqual(pristine.finish);
    let changedSerial = 0;
    const fresh = freshState(figure);
    for (let n = 0; n < blows.length; n += 1) {
      const blow = blows[n];
      if (blow !== undefined) changedSerial += applyBlow(fresh, figure, blow, margins[n] ?? 0).changed;
    }
    expect(recorded).toBe(changedSerial);
  });

  it('copies chunks out and back without changing a grid, at its edges too', () => {
    const state = freshState(figure);
    const before = state.stock.values.slice();
    for (let id = 0; id < state.chunks.total; id += 1) {
      const chunk = copyChunk(state.stock.values, state.stock.spec, state.chunks, id, state.stock.limit, (n) => new Int16Array(n));
      writeChunk(state.stock.values, state.stock.spec, state.chunks, id, chunk);
    }
    expect(state.stock.values).toEqual(before);
  });
});
