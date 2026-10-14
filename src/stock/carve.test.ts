/**
 * The carving rule and the tool volumes (src/stock/carve.ts, src/stock/tool-volumes.ts). What a green run proves, and its bounds:
 *   1. On 80 seeded random blows of every tool over a 4 cm synthetic grid the rule is monotone (no stock value falls), never passes the figure plus margin (`stock' <= max(stock, figure - margin)` in every cell), never turns a figure cell to air, and the stock bytes after the blows are the same for three random orders. The finish bytes are order-dependent by design (the last tool wins) and are not compared.
 *   2. Each removing tool struck straight into a flat face removes the volume its closed form says, within 15 percent, on a local grid fine enough for the tool (1 mm for the small tools, 4 mm for the bulk crater, 2 mm for the sculptor's cone); the painting tools remove nothing and paint their finish on the face.
 *   3. Undoing the recorded boxes in reverse restores the stock and finish bytes exactly, and the undo and the result name the same dirty chunks.
 *   4. The gilding leaf paints over tooth texture (claw, fine claw, roundel, drill) and never over polished, rasped or untouched stone (TOOL_PAINT_OVER); the other painting tools mark whatever they touch.
 *   5. Every tool volume's box is a bound of its shape at a slanted axis: with the tool axis 45 degrees off the normal and along the cube diagonal, the distance sampled on a lattice (at most 2 mm, no coarser than a hundredth of the box) over the box dilated by 5 cm is never negative outside the box, and is negative somewhere inside it (the reviewed revision's cube of the crater's reach was 36 mm short at 45 degrees; docs/work/0_making-of/reviews/0_integration.md, Bulk-crater bounds).
 *   6. A rasp blow on one face of a 7 cm hollow between two figure slabs, where the figure is near enough that the slab follows its level sets, leaves everything beyond the slab's reach above the point (its cut depth, the larger of SLAB_TOP and the size, plus the stock band the kernel updates) and the facing slab untouched (stock and finish), while it cuts the face it struck.
 * Bounds: the closed forms are the ones in src/stock/tool-volumes.ts, so this checks the carved shape against the stated geometry, not against a real chisel mark; the 45-degree strokes of the plan are exercised only by the random blows; the bound check samples a lattice, so a shape poking out of its box by less than the lattice step between samples would pass; the hollow is flat-faced, so a curved hollow's reach is not measured.
 */
import { describe, expect, it } from 'vitest';

import { FINISH, FIXED_POINT } from '../contracts/grid';
import type { Blow, ToolId, Vec3 } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { applyBlow, type CarveState, TOOL_FINISH, TOOL_PAINT_OVER, undoBlow } from './carve';
import { chunkLayout } from './chunks';
import { blockGrid, createFinishGrid, frameBlockBox, Grid } from './grid';
import { closedFormVolume, TOOL_VOLUMES, toolVolume } from './tool-volumes';

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
      let recorded = 0;
      for (const part of result.undo.parts) {
        recorded += part.indices.length;
        for (let r = 1; r < part.runs.length; r += 2) recorded += part.runs[r] ?? 0;
      }
      expect(recorded).toBe(result.changed);
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
      // The leaf bonds to tooth texture, so the face carries the fine claw's finish before the brush.
      if (tool === 'gilding') state.finish.fill(FINISH.fineClaw);
      const before = state.stock.values.slice();
      const result = applyBlow(state, figure, { tool, point: [0, 0.01, 0], normal: [0, 1, 0], direction: [0, -1, 0], size: 0, stroke: 0 }, 0);
      expect(result.removed).toBe(0);
      expect(state.stock.values).toEqual(before);
      expect(result.changed).toBeGreaterThan(0);
      expect(state.finish[state.stock.index(20, 20, 20)]).toBe(TOOL_FINISH[tool]);
      expect(TOOL_FINISH[tool]).not.toBe(FINISH.block);
    });
  }

  it('gilding paints over tooth texture only, never over polished or rasped skin', () => {
    const { state, figure } = flatFace(0.002, 0.08, 0.01);
    state.finish.fill(FINISH.polish);
    const polished = applyBlow(state, figure, { tool: 'gilding', point: [0, 0.01, 0], normal: [0, 1, 0], direction: [0, -1, 0], size: 0, stroke: 0 }, 0);
    expect(polished.changed).toBe(0);
    expect(state.finish.every((code) => code === FINISH.polish)).toBe(true);
    expect(TOOL_PAINT_OVER.gilding & (1 << FINISH.rasp)).toBe(0);
    expect(TOOL_PAINT_OVER.gilding & (1 << FINISH.block)).toBe(0);
    for (const code of [FINISH.claw, FINISH.fineClaw, FINISH.roundel, FINISH.drill]) expect(TOOL_PAINT_OVER.gilding & (1 << code)).not.toBe(0);
  });
});

describe('tool volume bounds at a slanted axis', () => {
  const normal: Vec3 = [0, 1, 0];
  const axes: ReadonlyArray<{ name: string; direction: Vec3 }> = [
    { name: '45 degrees off the normal', direction: unit(1, -1, 0) },
    { name: 'the cube diagonal', direction: unit(1, -1, 1) },
  ];
  // One blow per shape of src/stock/tool-volumes.ts: the bulk crater, the sculptor's cone, the wedges, the combing patch, the scoop, the drill, the rubbing slabs and the paint footprints.
  const shapes: ReadonlyArray<{ tool: ToolId; size: number }> = [
    { tool: 'point', size: 0.06 },
    { tool: 'point', size: 0.03 },
    { tool: 'two-tooth', size: 0.012 },
    { tool: 'claw', size: 0.008 },
    { tool: 'fine-claw', size: 0.004 },
    { tool: 'fine-claw', size: 0.04 },
    { tool: 'roundel', size: 0.004 },
    { tool: 'flat', size: 0.01 },
    { tool: 'drill', size: 0.015 },
    { tool: 'rasp', size: 0.03 },
    { tool: 'file', size: 0.02 },
    { tool: 'pumice', size: 0.004 },
    { tool: 'charcoal', size: 0 },
    { tool: 'polish', size: 0 },
    { tool: 'gilding', size: 0 },
  ];
  const PAD = 0.05;

  for (const { name, direction } of axes) {
    for (const { tool, size } of shapes) {
      it(`${tool} at ${String(size)} m, axis ${name}: never negative outside its box`, () => {
        const blow: Blow = { tool, point: [0.013, 0.021, -0.007], normal, direction, size, stroke: 0 };
        // The figure is far from the point, so the rubbing slabs take the tangent plane, not the figure's level sets, and the sampled figure value is not read.
        const volume = toolVolume(blow, 1, 0.128);
        const extent = Math.max(volume.max[0] - volume.min[0], volume.max[1] - volume.min[1], volume.max[2] - volume.min[2]);
        expect(extent).toBeGreaterThan(0);
        const step = Math.max(0.002, extent / 100);
        let outside = 0;
        let inside = 0;
        let worst = Number.POSITIVE_INFINITY;
        for (let x = volume.min[0] - PAD; x <= volume.max[0] + PAD; x += step) {
          for (let y = volume.min[1] - PAD; y <= volume.max[1] + PAD; y += step) {
            for (let z = volume.min[2] - PAD; z <= volume.max[2] + PAD; z += step) {
              const d = volume.distance(x, y, z, 1);
              const inBox = x >= volume.min[0] && x <= volume.max[0] && y >= volume.min[1] && y <= volume.max[1] && z >= volume.min[2] && z <= volume.max[2];
              if (inBox) {
                if (d < 0) inside += 1;
              } else if (d < 0) {
                outside += 1;
                if (d < worst) worst = d;
              }
            }
          }
        }
        expect(outside, `${String(outside)} samples outside the box are inside the volume, the deepest ${String(worst)} m`).toBe(0);
        expect(inside).toBeGreaterThan(0);
      });
    }
  }
});

/** Two parallel slabs of figure `gap` apart along y, face A at y = 0 facing up and face B at y = gap facing down, with uncut stone everywhere, the hollow included; the figure band is 16 cells, wide enough that a blow on face A follows the figure's level sets. */
function hollow(cell: number, extent: number, gap: number): { state: CarveState; figure: Grid } {
  const n = Math.round(extent / cell);
  const spec = { cell, size: [n, n, n] as const, origin: [-extent / 2, gap / 2 - extent / 2, -extent / 2] as const, band: 16 };
  const figure = new Grid(spec);
  figure.fill((_x, y) => Math.min(y, gap - y));
  const stock = new Grid({ ...spec, band: STOCK_BAND_CELLS });
  stock.fill(() => -1);
  return { state: { stock, finish: createFinishGrid(spec), chunks: chunkLayout(spec) }, figure };
}

describe('a rubbing tool in a hollow', () => {
  it('rasps the face it strikes and never the facing surface 7 cm away', () => {
    const cell = 0.004;
    const gap = 0.07;
    const { state, figure } = hollow(cell, 0.24, gap);
    expect(figure.sample(0, 0, 0)).toBeLessThan(0.1 * figure.spec.band * cell);
    const before = state.stock.values.slice();
    const tilt = 10 * (Math.PI / 180);
    const blow: Blow = { tool: 'rasp', point: [0, 0, 0], normal: [0, 1, 0], direction: unit(Math.cos(tilt), -Math.sin(tilt), 0), size: 0.03, stroke: 0 };
    const result = applyBlow(state, figure, blow, 0);
    expect(result.changed).toBeGreaterThan(0);
    const cellOf = (x: number, y: number, z: number): number => state.stock.index(Math.round((x - state.stock.spec.origin[0]) / cell), Math.round((y - state.stock.spec.origin[1]) / cell), Math.round((z - state.stock.spec.origin[2]) / cell));
    expect(state.stock.values[cellOf(0, cell, 0)]).toBeGreaterThan(-state.stock.limit);
    const { nx, ny, nz } = state.stock;
    let farChanged = 0;
    let farCells = 0;
    // The slab reaches its cut depth above the point and the kernel updates the band beyond that; the stone past both must be as it was.
    const reach = blow.size + (STOCK_BAND_CELLS + 1) * cell;
    expect(reach).toBeLessThan(gap);
    for (let k = 0; k < nz; k += 1) {
      for (let j = 0; j < ny; j += 1) {
        const y = state.stock.spec.origin[1] + j * cell;
        if (y < reach) continue;
        for (let i = 0; i < nx; i += 1) {
          const index = state.stock.index(i, j, k);
          farCells += 1;
          if (state.stock.values[index] !== before[index] || state.finish[index] !== 0) farChanged += 1;
        }
      }
    }
    expect(farCells).toBeGreaterThan(0);
    expect(farChanged, `${String(farChanged)} cells beyond the slab's reach in the hollow or in the facing slab changed`).toBe(0);
  });
});
