/**
 * The carving rule and the tool volumes (src/stock/carve.ts, src/stock/tool-volumes.ts). What a green run proves, and its bounds:
 *   1. On 80 seeded random blows of every tool over a 4 cm synthetic grid the rule is monotone (no stock value falls), never passes the figure plus margin (`stock' <= max(stock, figure - margin)` in every cell), never turns a figure cell to air, and the stock bytes after the blows are the same for three random orders. The finish bytes are order-dependent by design (the last tool wins) and are not compared.
 *   2. Each removing tool struck straight into a flat face removes the volume its closed form says, within 15 percent, on a local grid fine enough for the tool (1 mm for the small tools, 4 mm for the bulk crater, 2 mm for the sculptor's cone); the painting tools remove nothing and paint their finish on the face.
 *   3. Undoing the recorded boxes in reverse restores the stock and finish bytes exactly, and the undo and the result name the same dirty chunks.
 * Bounds: the closed forms are the ones in src/stock/tool-volumes.ts, so this checks the carved shape against the stated geometry, not against a real chisel mark; the 45-degree strokes of the plan are exercised only by the random blows.
 */
import { describe, expect, it } from 'vitest';

import { FINISH, FIXED_POINT } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { applyBlow, type CarveState, TOOL_FINISH, undoBlow } from './carve';
import { chunkLayout } from './chunks';
import { blockGrid, createFinishGrid, frameBlockBox, Grid } from './grid';
import { closedFormVolume, TOOL_VOLUMES } from './tool-volumes';

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

/** Random blows on the block's front face and around the figure, every tool, sizes from 5 mm to 10 cm. */
function randomBlows(figure: Grid, count: number, seed: number): { blows: Blow[]; margins: number[] } {
  const random = mulberry32(seed);
  const blows: Blow[] = [];
  const margins: number[] = [];
  for (let n = 0; n < count; n += 1) {
    const tool = TOOLS[Math.floor(random() * TOOLS.length)] ?? 'point';
    const onFace = random() < 0.5;
    const x = -0.9 + 1.8 * random();
    const y = 0.2 + 4.8 * random();
    const z = onFace ? 0.7 : -0.5 + 1 * random();
    const normal = onFace ? ([0, 0, 1] as const) : figure.gradient(x, y, z);
    const tilt = random() * 0.9;
    const direction = unit(-normal[0] + tilt * (random() - 0.5), -normal[1] + tilt * (random() - 0.5), -normal[2] + tilt * (random() - 0.5));
    blows.push({ tool, point: [x, y, z], normal, direction, size: 0.005 + 0.095 * random(), stroke: n });
    margins.push(random() < 0.3 ? 0 : 0.03 * random());
  }
  return { blows, margins };
}

describe('carving rule on random blows', () => {
  const figure = syntheticFigure(0.04);
  const { blows, margins } = randomBlows(figure, 80, 11);
  const blowAt = (n: number): Blow => {
    const blow = blows[n];
    if (blow === undefined) throw new Error(`no blow ${String(n)}`);
    return blow;
  };

  it('is monotone, never passes the figure plus margin and never cuts the figure', () => {
    const state = freshState(figure);
    const limit = state.stock.limit;
    for (let n = 0; n < blows.length; n += 1) {
      const before = state.stock.values.slice();
      const result = applyBlow(state, figure, blowAt(n), margins[n] ?? 0);
      const marginFixed = Math.round(((margins[n] ?? 0) / 0.04) * FIXED_POINT);
      const after = state.stock.values;
      for (let c = 0; c < after.length; c += 1) {
        const s0 = before[c] ?? 0;
        const s1 = after[c] ?? 0;
        const f = figure.values[c] ?? 0;
        if (s1 < s0) throw new Error(`blow ${String(n)} lowered cell ${String(c)} from ${String(s0)} to ${String(s1)}`);
        if (s1 > Math.max(s0, f - marginFixed) && s1 !== s0) throw new Error(`blow ${String(n)} cut cell ${String(c)} past the figure plus margin: stock ${String(s1)}, figure ${String(f)}, margin ${String(marginFixed)}`);
        if (f < 0 && s1 >= 0) throw new Error(`blow ${String(n)} turned figure cell ${String(c)} to air`);
        if (s1 > limit || s1 < -limit) throw new Error(`blow ${String(n)} left cell ${String(c)} outside the band`);
      }
      expect(result.removed).toBeGreaterThanOrEqual(0);
      if (!TOOL_VOLUMES[blows[n]?.tool ?? 'point'].removes) expect(result.removed).toBe(0);
    }
  });

  it('gives the same stock bytes in any order', () => {
    const orders = [0, 1, 2].map((seed) => {
      const random = mulberry32(100 + seed);
      const indices = blows.map((_, i) => i);
      if (seed > 0) indices.sort(() => random() - 0.5);
      const state = freshState(figure);
      for (const i of indices) applyBlow(state, figure, blowAt(i), margins[i] ?? 0);
      return state.stock.values;
    });
    expect(orders[1]).toEqual(orders[0]);
    expect(orders[2]).toEqual(orders[0]);
    let changed = 0;
    const fresh = freshState(figure).stock.values;
    for (let c = 0; c < fresh.length; c += 1) if (fresh[c] !== orders[0]?.[c]) changed += 1;
    expect(changed).toBeGreaterThan(100);
  });

  it('undoes exactly and names the same chunks', () => {
    const state = freshState(figure);
    const stock0 = state.stock.values.slice();
    const finish0 = state.finish.slice();
    const results = blows.map((blow, n) => applyBlow(state, figure, blow, margins[n] ?? 0));
    expect(state.stock.values).not.toEqual(stock0);
    for (let n = results.length - 1; n >= 0; n -= 1) {
      const result = results[n];
      if (result === undefined) continue;
      expect(undoBlow(state, result.undo)).toEqual(result.dirty);
      let inRuns = 0;
      for (let r = 1; r < result.undo.runs.length; r += 2) inRuns += result.undo.runs[r] ?? 0;
      expect(result.undo.indices.length + inRuns).toBe(result.changed);
    }
    expect(state.stock.values).toEqual(stock0);
    expect(state.finish).toEqual(finish0);
  });
});

/** A flat face at y = top over a local lattice, stock below, the figure a parallel plane far below. */
function flatFace(cell: number, extent: number, top: number): { state: CarveState; figure: Grid } {
  const n = Math.round(extent / cell);
  const spec = { cell, size: [n, n, n] as const, origin: [-extent / 2, top - extent / 2, -extent / 2] as const, band: 32 };
  const figure = new Grid(spec);
  figure.fill((_x, y) => y - (top - extent * 0.45));
  const stock = new Grid({ ...spec, band: 3 });
  stock.fill((_x, y) => y - top);
  return { state: { stock, finish: createFinishGrid(spec), chunks: chunkLayout(spec) }, figure };
}

describe('tool volumes on a flat face', () => {
  const cases: ReadonlyArray<{ tool: ToolId; size: number; cell: number; extent: number }> = [
    { tool: 'point', size: 0.06, cell: 0.004, extent: 0.32 },
    { tool: 'point', size: 0.03, cell: 0.002, extent: 0.12 },
    { tool: 'two-tooth', size: 0.004, cell: 0.001, extent: 0.08 },
    { tool: 'claw', size: 0.003, cell: 0.001, extent: 0.08 },
    { tool: 'fine-claw', size: 0.002, cell: 0.001, extent: 0.08 },
    { tool: 'roundel', size: 0.002, cell: 0.0005, extent: 0.05 },
    { tool: 'flat', size: 0.002, cell: 0.001, extent: 0.08 },
    { tool: 'drill', size: 0.015, cell: 0.0005, extent: 0.04 },
    { tool: 'rasp', size: 0.002, cell: 0.001, extent: 0.14 },
    { tool: 'file', size: 0.001, cell: 0.0005, extent: 0.09 },
    { tool: 'pumice', size: 0.0005, cell: 0.0005, extent: 0.11 },
  ];

  for (const { tool, size, cell, extent } of cases) {
    it(`${tool} at ${String(size)} m removes its closed-form volume`, () => {
      const { state, figure } = flatFace(cell, extent, 0.01);
      const blow: Blow = { tool, point: [0, 0.01, 0], normal: [0, 1, 0], direction: [0, -1, 0], size, stroke: 0 };
      const result = applyBlow(state, figure, blow, 0);
      const expected = closedFormVolume(tool, size);
      expect(expected).toBeGreaterThan(0);
      expect(Math.abs(result.removed - expected) / expected, `${tool}: removed ${String(result.removed)} m³, closed form ${String(expected)} m³`).toBeLessThan(0.15);
      expect(result.changed).toBeGreaterThan(0);
      expect(result.dirty.length).toBeGreaterThan(0);
      expect(new Set(state.finish).has(TOOL_FINISH[tool])).toBe(true);
    });
  }

  for (const tool of ['charcoal', 'polish', 'gilding'] as const) {
    it(`${tool} removes nothing and paints its finish`, () => {
      const { state, figure } = flatFace(0.002, 0.08, 0.01);
      const before = state.stock.values.slice();
      const result = applyBlow(state, figure, { tool, point: [0, 0.01, 0], normal: [0, 1, 0], direction: [0, -1, 0], size: 0, stroke: 0 }, 0);
      expect(result.removed).toBe(0);
      expect(state.stock.values).toEqual(before);
      expect(result.changed).toBeGreaterThan(0);
      expect(state.finish[state.stock.index(20, 20, 20)]).toBe(TOOL_FINISH[tool]);
      expect(TOOL_FINISH[tool]).not.toBe(FINISH.block);
    });
  }
});
