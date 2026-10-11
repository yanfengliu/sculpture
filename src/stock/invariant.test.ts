/**
 * The invariant `stock <= figure` of docs/design/spec.md (Stock and figure) on the carving rule of src/stock/carve.ts. What a green run proves, and its bounds:
 *   1. On the untouched 4 cm block and after each of 120 seeded random blows cycling through every tool, every cell where the stock is inside its band on the stone side (`stock > -limit`, with `limit = min(stock.limit, figure.limit)`, the stock's STOCK_BAND_CELLS × FIXED_POINT) has `stock <= figure` in fixed point.
 *   2. Anti-vacuity: the comparison covers more than 100,000 of the lattice's 350,880 cells at every check, the blows change stock, and at t = 0 the literal inequality fails in more than 1,000 cells: the clamped deep cells, which is what the bound is for.
 * Bounds: the comparison is made within the stock's band. The stock clamps at STOCK_BAND_CELLS (3) and the figure at DEFAULT_BAND_CELLS (16), so a cell deeper than 3 cells inside the stock reads −3 cells while the figure there may read down to −16: those cells are clamped on both sides, carry no surface and are not compared. One seed; the margins are non-negative, as the plan's are; the synthetic figure stands in for the David.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_BAND_CELLS, FIXED_POINT } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { applyBlow, type CarveState } from './carve';
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

/** Random blows on the block's front face and around the figure, the tools in turn, sizes from 5 mm to 10 cm, margins from 0 to 3 cm: the idea of src/stock/carve.test.ts with its own seed. */
function randomBlows(figure: Grid, count: number, seed: number): { blows: Blow[]; margins: number[] } {
  const random = mulberry32(seed);
  const blows: Blow[] = [];
  const margins: number[] = [];
  for (let n = 0; n < count; n += 1) {
    const tool = TOOLS[n % TOOLS.length] ?? 'point';
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

/** Checks `stock <= figure` in every cell inside the stock's band on the stone side, throws on the first cell that breaks it, and counts the cells compared and the cells where the raw inequality fails (all of them outside the bound once it returns). */
function checkWithinBand(stock: Grid, figure: Grid, label: string): { compared: number; rawFailures: number } {
  const limit = Math.min(stock.limit, figure.limit);
  let compared = 0;
  let rawFailures = 0;
  for (let c = 0; c < stock.values.length; c += 1) {
    const s = stock.values[c] ?? 0;
    const f = figure.values[c] ?? 0;
    if (s > f) rawFailures += 1;
    if (s <= -limit) continue;
    compared += 1;
    if (s > f) throw new Error(`${label}: cell ${String(c)} has stock ${String(s)} above figure ${String(f)} inside the band (limit ${String(limit)})`);
  }
  return { compared, rawFailures };
}

describe('stock <= figure within the stock band', () => {
  const figure = syntheticFigure(0.04);
  const { blows, margins } = randomBlows(figure, 120, 23);

  it('holds on the untouched block, where only the cells deeper than the band break the literal inequality', () => {
    const state = freshState(figure);
    expect(Math.min(state.stock.limit, figure.limit)).toBe(STOCK_BAND_CELLS * FIXED_POINT);
    expect(figure.limit).toBe(DEFAULT_BAND_CELLS * FIXED_POINT);
    expect(state.stock.values.length).toBe(350880);
    const { compared, rawFailures } = checkWithinBand(state.stock, figure, 't = 0');
    expect(compared).toBeGreaterThan(100000);
    expect(rawFailures).toBeGreaterThan(1000);
  });

  it('holds after every one of 120 random blows of every tool', () => {
    const state = freshState(figure);
    let changed = 0;
    for (const [n, blow] of blows.entries()) {
      changed += applyBlow(state, figure, blow, margins[n] ?? 0).changed;
      expect(checkWithinBand(state.stock, figure, `blow ${String(n)} (${blow.tool})`).compared).toBeGreaterThan(100000);
    }
    expect(new Set(blows.map((blow) => blow.tool)).size).toBe(TOOLS.length);
    expect(changed).toBeGreaterThan(1000);
  });
});
