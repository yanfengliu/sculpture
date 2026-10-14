/**
 * The bulk crater of src/stock/tool-volumes.ts: one shown bulk blow stands for a field of about a thousand pits (docs/research/decisions.md, Time and scale), so its rim is ragged and its floor pitted. What a green run proves, and its bounds:
 *   1. Slope: over 40 seeded random bulk blows and 2,000 point pairs each, 0.2 to 4 mm apart within 1.5 crater radii of the blow point, the distance never changes faster than the volume's stated `lipschitz`, by which the carving loop widens its skips (src/stock/carve-kernel.ts), and the steepest pair comes within a fifth of it, so the constant is neither false nor idle (2026-10-14: 1.62 against the stated 1.87).
 *   2. Rim and floor: for two 6 cm blows struck straight into a flat face, the wall at half depth (the distance's zero along 72 rays from the axis, by bisection) lies between the radius over 1 + RIM_WOBBLE and the radius times 1 + RIM_WOBBLE plus PIT_DEPTH, its widest is at least 1.25 times its narrowest, and the two walls differ by more than a centimetre somewhere, since each blow draws its own phases (2026-10-14: 63 to 86 and 64 to 88 mm around the 72 mm radius, 24 mm apart at most); the floor (the zero straight down at 1,000 points within 0.75 radii of the axis, where the floor and not the wall is nearest) lies between the cut depth and the cut depth plus PIT_DEPTH, and its deepest and shallowest points differ by at least 2 mm (2026-10-14: 60.0 to 62.8 mm).
 *   3. The pits belong to the stone: on a 4 mm lattice, a second crater struck beside the first at the same depth changes none of the band cells under the shared floor (deeper than the floor, within 0.6 radii of both axes), where pits drawn per blow rewrote the cells whose new pit was the deeper (the undo cost of src/stock/undo-budget.test.ts; with the pits' seed set to the blow's, 11 of 153, red, 2026-10-14); the region holds more than 100 band cells (146).
 *   4. The mean volume six craters remove from a flat face at different points on a 4 mm lattice is within 1.5 percent of closedFormVolume, which counts the ragged rim's mean area and the pits' mean depth (2026-10-14: 0.26 percent under; the plain cylinder's closed form is 2.1 percent under the mean).
 *   5. The rim's phases come from `turn` (src/stock/tool-frame.ts), sums and products alone, since Chrome and Node round Math.cos and Math.sin differently in the last bit: over 10,000 seeded turns and the quarter-turn edges, it is within 1e-10 of Math.cos and Math.sin.
 * Bounds: claim 1 samples pairs, so a steeper spot between samples would pass; the face is flat and the axis along its normal in claims 2 to 4, so a slanted crater's box is covered only by the bound test of src/stock/carve.test.ts; claim 3 holds where the two floors coincide exactly (one face level and one axis), and a floor at another depth rewrites the band as a plain cylinder's would; the look at the page's 8 mm cells is the captures' claim, not this test's.
 */
import { describe, expect, it } from 'vitest';

import type { Blow, Vec3 } from '../contracts/making';
import { applyBlow, type CarveState } from './carve';
import { chunkLayout } from './chunks';
import { createFinishGrid, Grid } from './grid';
import { turn } from './tool-frame';
import { BULK_CUT_SIZE_M, BULK_RADIUS_RATIO, closedFormVolume, PIT_DEPTH, RIM_WOBBLE, type ToolVolume, toolVolume } from './tool-volumes';

const SIZE = 0.06;
const RADIUS = BULK_RADIUS_RATIO * SIZE;
const FACE = 0.01;

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

function unit(x: number, y: number, z: number): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** A crater struck straight down into the face y = FACE at (x, z). */
function crater(x: number, z: number): Blow {
  return { tool: 'point', point: [x, FACE, z], normal: [0, 1, 0], direction: [0, -1, 0], size: SIZE, stroke: 0 };
}

/** A flat face at y = FACE over a local lattice `extent` wide, stock below, the figure a parallel plane far below. */
function flatFace(cell: number, extent: number): CarveState & { figure: Grid } {
  const n = Math.round(extent / cell);
  const spec = { cell, size: [n, n, n] as const, origin: [-extent / 2, FACE - extent / 2, -extent / 2] as const, band: 32 };
  const figure = new Grid(spec);
  figure.fill((_x, y) => y - (FACE - extent * 0.45));
  const stock = new Grid({ ...spec, band: 3 });
  stock.fill((_x, y) => y - FACE);
  return { stock, finish: createFinishGrid(spec), chunks: chunkLayout(spec), figure };
}

/** The distance from `inside` to the volume's surface along the segment to `outside`, metres: the zero by bisection, the distance negative at `inside` and positive at `outside`. */
function zeroAlong(volume: ToolVolume, inside: Vec3, outside: Vec3): number {
  const at = (t: number): number => volume.distance(inside[0] + t * (outside[0] - inside[0]), inside[1] + t * (outside[1] - inside[1]), inside[2] + t * (outside[2] - inside[2]), 0);
  if (!(at(0) < 0 && at(1) > 0)) throw new Error(`the segment from (${inside.join(', ')}) to (${outside.join(', ')}) does not cross the volume's surface once: distance ${String(at(0))} at its start and ${String(at(1))} at its end`);
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 60; n += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) < 0) lo = mid;
    else hi = mid;
  }
  return lo * Math.hypot(outside[0] - inside[0], outside[1] - inside[1], outside[2] - inside[2]);
}

describe('the bulk crater', () => {
  it('never changes faster than its stated Lipschitz constant, and comes within a fifth of it', () => {
    const random = mulberry32(17);
    let steepest = 0;
    let stated = 0;
    for (let n = 0; n < 40; n += 1) {
      const normal = unit(random() - 0.5, random() - 0.5, random() - 0.5);
      const direction = unit(-normal[0] + 0.3 * (random() - 0.5), -normal[1] + 0.3 * (random() - 0.5), -normal[2] + 0.3 * (random() - 0.5));
      const size = BULK_CUT_SIZE_M + 0.15 * random();
      const blow: Blow = { tool: 'point', point: [2 * random() - 1, 5 * random(), 2 * random() - 1], normal, direction, size, stroke: 0 };
      const volume = toolVolume(blow, 1, 0.128);
      stated = volume.lipschitz;
      const reach = 1.5 * BULK_RADIUS_RATIO * size;
      for (let k = 0; k < 2000; k += 1) {
        const p: Vec3 = [blow.point[0] + reach * (2 * random() - 1), blow.point[1] + reach * (2 * random() - 1), blow.point[2] + reach * (2 * random() - 1)];
        const gap = 0.0002 + 0.0038 * random();
        const along = unit(random() - 0.5, random() - 0.5, random() - 0.5);
        const q: Vec3 = [p[0] + gap * along[0], p[1] + gap * along[1], p[2] + gap * along[2]];
        const rate = Math.abs(volume.distance(p[0], p[1], p[2], 0) - volume.distance(q[0], q[1], q[2], 0)) / Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (rate > steepest) steepest = rate;
      }
    }
    expect(steepest, `the steepest sampled rate, ${String(steepest)}, against the stated ${String(stated)}`).toBeLessThanOrEqual(stated * (1 + 1e-9));
    expect(steepest).toBeGreaterThan(0.8 * stated);
  });

  it('wanders around its axis and is pitted on its floor, each blow its own rim', () => {
    const walls = [crater(0, 0), crater(0.013, -0.021)].map((blow) => {
      const volume = toolVolume(blow, 1, 0.128);
      const [x, , z] = blow.point;
      const y = FACE - SIZE / 2;
      return Array.from({ length: 72 }, (_, k) => {
        const angle = (k / 72) * 2 * Math.PI;
        return zeroAlong(volume, [x, y, z], [x + 2 * RADIUS * Math.cos(angle), y, z + 2 * RADIUS * Math.sin(angle)]);
      });
    });
    for (const wall of walls) {
      const widest = Math.max(...wall);
      const narrowest = Math.min(...wall);
      expect(narrowest).toBeGreaterThanOrEqual(RADIUS / (1 + RIM_WOBBLE) - 1e-9);
      expect(widest).toBeLessThanOrEqual(RADIUS * (1 + RIM_WOBBLE) + PIT_DEPTH + 1e-9);
      expect(widest / narrowest, `the wall at half depth runs from ${String(narrowest)} to ${String(widest)} m from the axis`).toBeGreaterThan(1.25);
    }
    const [first = [], second = []] = walls;
    expect(Math.max(...first.map((r, k) => Math.abs(r - (second[k] ?? r))))).toBeGreaterThan(0.01);
    const volume = toolVolume(crater(0, 0), 1, 0.128);
    const random = mulberry32(5);
    const depths = Array.from({ length: 1000 }, () => {
      const r = 0.75 * RADIUS * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      const [x, z] = [r * Math.cos(angle), r * Math.sin(angle)];
      return SIZE / 2 + zeroAlong(volume, [x, FACE - SIZE / 2, z], [x, FACE - 2 * SIZE, z]);
    });
    const deepest = Math.max(...depths);
    const shallowest = Math.min(...depths);
    expect(shallowest).toBeGreaterThanOrEqual(SIZE - 1e-9);
    expect(deepest).toBeLessThanOrEqual(SIZE + PIT_DEPTH + 1e-9);
    expect(deepest - shallowest, `the floor runs from ${String(shallowest)} to ${String(deepest)} m deep`).toBeGreaterThan(0.002);
  });

  it('cuts pits fixed in the stone, so a second crater at the same depth leaves the band under the shared floor as the first left it', () => {
    const state = flatFace(0.004, 0.32);
    const first = crater(-0.03, 0);
    const second = crater(0.03, 0.01);
    applyBlow(state, state.figure, first, 0);
    const stock = state.stock.values.slice();
    const finish = state.finish.slice();
    applyBlow(state, state.figure, second, 0);
    const { nx, ny, nz, limit } = state.stock;
    let shared = 0;
    let rewritten = 0;
    for (let k = 0; k < nz; k += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const [x, y, z] = state.stock.worldOf(i, j, k);
          const index = state.stock.index(i, j, k);
          if (y > FACE - SIZE || (stock[index] ?? -limit) <= -limit) continue;
          if (Math.hypot(x - first.point[0], z - first.point[2]) > 0.6 * RADIUS || Math.hypot(x - second.point[0], z - second.point[2]) > 0.6 * RADIUS) continue;
          shared += 1;
          if (state.stock.values[index] !== stock[index] || state.finish[index] !== finish[index]) rewritten += 1;
        }
      }
    }
    expect(shared).toBeGreaterThan(100);
    expect(rewritten, `${String(rewritten)} of the ${String(shared)} band cells under the shared floor were rewritten by the second crater`).toBe(0);
  });

  it('removes on average the volume of closedFormVolume, ragged rim and pits included', () => {
    const points: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [0.013, -0.021],
      [0.051, 0.033],
      [-0.07, 0.02],
      [0.031, 0.06],
      [-0.04, -0.05],
    ];
    const removed = points.map(([x, z]) => {
      const state = flatFace(0.004, 0.36);
      return applyBlow(state, state.figure, crater(x, z), 0).removed;
    });
    const mean = removed.reduce((sum, v) => sum + v, 0) / removed.length;
    const expected = closedFormVolume('point', SIZE);
    expect(Math.abs(mean / expected - 1), `mean removed ${String(mean)} m³ against the closed form's ${String(expected)} m³`).toBeLessThan(0.015);
  });

  it('draws its phases by sums and products within 1e-10 of Math.cos and Math.sin', () => {
    const random = mulberry32(7);
    const us = [0, 0.25, 0.5, 0.75, 1 - 1e-12, 0.125, ...Array.from({ length: 10_000 }, () => random())];
    let worst = 0;
    for (const u of us) {
      const [c, s] = turn(u);
      worst = Math.max(worst, Math.abs(c - Math.cos(2 * Math.PI * u)), Math.abs(s - Math.sin(2 * Math.PI * u)));
    }
    expect(worst).toBeLessThan(1e-10);
  });
});
