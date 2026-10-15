/**
 * The web-clearing planner (./webs.ts) on a fixture: two legs 4 cm apart at 5 mm cells, the stock at the margin everywhere but for a slab of stone left between them, open at its front, back, top and bottom, as the claws' bands leave a web. What a green run proves, and its bounds:
 *   1. The plan clears the web: replayed blow by blow with the engine's carving rule (src/stock/carve.ts, applyBlow) on a copy of the stock, the cells of stone farther than the margin plus half a cell from the figure, counted here from the grids alone, fall from the fixture's count to none.
 *   2. Every blow is the step's tool at an angle inside the toothed chisels' 35 to 60 degrees to its own normal, with its tip within one cell of the stock surface and its shaft in air at 1 to 16 cm behind the tip, read on the replayed stock just before the blow, as src/choreography/shaft.test.ts reads the whole plan; stroke numbers are consecutive.
 *   3. A web walled in at its open sides by figure is left: a pocket in a closed box of figure has no open side for a shaft, and nothing is planned for it. A stock already at its margin plans nothing.
 * Bounds: one hand-built fixture on its own lattice, not the David (david-steps.slow.test.ts counts the webs there at t = N); trilinear reads along the shaft's axis only, so the tool's width is not checked.
 */
import { describe, expect, it } from 'vitest';

import { FIXED_POINT, type GridSpec } from '../../contracts/grid';
import type { Blow, PlanContext, Vec3 } from '../../contracts/making';
import { STOCK_BAND_CELLS } from '../../david/frame';
import { applyBlow, type CarveState } from '../../stock/carve';
import { chunkLayout } from '../../stock/chunks';
import { boxDistance, createFinishGrid, Grid, type WorldBox } from '../../stock/grid';
import { webs } from './webs';

const CELL = 0.005;
const MARGIN = 0.0015;
const SPEC: GridSpec = { cell: CELL, size: [101, 81, 61], origin: [-0.25, 0, -0.15], band: 16 };
const LEG_RADIUS = 0.05;
/** The legs' axes run up at x ±0.07: their faces are 4 cm apart across x 0. */
const LEGS: readonly (readonly [number, number])[] = [
  [-0.07, 0],
  [0.07, 0],
];
const WEB: WorldBox = { min: [-0.03, 0.12, -0.03], max: [0.03, 0.25, 0.03] };
/** The sealed case's hollow ball: its wall's mid radius and half thickness, and the balls of stone in its cavity (the first fills it), metres. */
const SHELL_RADIUS = 0.08;
const SHELL_HALF_THICKNESS = 0.005;
const CAVITY_STONE_RADII = [0.08, 0.05];
const SHAFT_M = [0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.16];

function capsule(x: number, y: number, z: number, ax: number, az: number): number {
  const t = Math.min(0.35, Math.max(0.05, y));
  return Math.hypot(x - ax, y - t, z - az) - LEG_RADIUS;
}

function legsFigure(): Grid {
  const figure = new Grid(SPEC);
  figure.fill((x, y, z) => Math.min(...LEGS.map(([ax, az]) => capsule(x, y, z, ax, az))));
  return figure;
}

/** The stock at the margin over `figure`, with the stone of `boxes` standing where it was left. */
function stockWith(figure: Grid, boxes: readonly WorldBox[]): Grid {
  const stock = new Grid({ ...SPEC, band: STOCK_BAND_CELLS });
  stock.fill((x, y, z) => Math.min(figure.sample(x, y, z) - MARGIN, ...boxes.map((box) => boxDistance(box, x, y, z))));
  return stock;
}

function context(figure: Grid, stock: Grid): PlanContext {
  return { figure, stock, region: { label: 'fixture', min: [-0.25, 0, -0.15], max: [0.25, 0.4, 0.15] }, margin: MARGIN, seed: 1, cell: CELL };
}

/** Stone cells farther than the margin plus half a cell from the figure. */
function webCount(stock: Grid, figure: Grid): number {
  const reach = Math.round(((MARGIN + CELL / 2) / CELL) * FIXED_POINT);
  let count = 0;
  for (let n = 0; n < stock.values.length; n += 1) if ((stock.values[n] ?? 0) < 0 && (figure.values[n] ?? 0) > reach) count += 1;
  return count;
}

function angleToSurface(blow: Blow): number {
  const into = -(blow.direction[0] * blow.normal[0] + blow.direction[1] * blow.normal[1] + blow.direction[2] * blow.normal[2]);
  return (Math.asin(Math.min(1, Math.max(-1, into))) * 180) / Math.PI;
}

/** Replays `blows` on a copy of `stock` and returns the copy with each blow's tip and deepest shaft reading before it. */
function replay(stock: Grid, figure: Grid, blows: readonly Blow[]): { after: Grid; tips: number[]; shafts: number[] } {
  const after = new Grid(stock.spec, stock.values.slice());
  const state: CarveState = { stock: after, finish: createFinishGrid(SPEC), chunks: chunkLayout(SPEC) };
  const tips: number[] = [];
  const shafts: number[] = [];
  for (const blow of blows) {
    tips.push(after.sample(blow.point[0], blow.point[1], blow.point[2]));
    const along = (d: number): Vec3 => [blow.point[0] - blow.direction[0] * d, blow.point[1] - blow.direction[1] * d, blow.point[2] - blow.direction[2] * d];
    shafts.push(Math.min(...SHAFT_M.map((d) => after.sample(...along(d)))));
    applyBlow(state, figure, blow, MARGIN);
  }
  return { after, tips, shafts };
}

describe('webs', () => {
  const figure = legsFigure();
  const options = { tool: 'fine-claw', size: 0.04, angles: [45, 60, 35] } as const;

  it('clears a web between two legs from its open sides, every blow at its angle with the tip on the stone and the shaft in air', () => {
    const stock = stockWith(figure, [WEB]);
    const before = webCount(stock, figure);
    expect(before, 'the fixture holds a web').toBeGreaterThan(100);
    const blows = webs(context(figure, stock), options);
    expect(blows.length).toBeGreaterThan(0);
    const { after, tips, shafts } = replay(stock, figure, blows);
    expect(webCount(after, figure), `web cells left of ${String(before)} after ${String(blows.length)} blows`).toBe(0);
    blows.forEach((blow, n) => {
      const label = `blow ${String(n)} at ${blow.point.map((v) => v.toFixed(3)).join(', ')}`;
      expect(blow.tool, label).toBe('fine-claw');
      expect(angleToSurface(blow), label).toBeGreaterThanOrEqual(35 - 1e-6);
      expect(angleToSurface(blow), label).toBeLessThanOrEqual(60 + 1e-6);
      expect(Math.abs(tips[n] ?? 0), `${label}: tip off the stone`).toBeLessThanOrEqual(CELL);
      expect(shafts[n] ?? 0, `${label}: shaft in stone`).toBeGreaterThanOrEqual(-CELL / 2);
      expect(blow.stroke - (blows[n - 1]?.stroke ?? blow.stroke), `${label}: stroke numbers skip`).toBeGreaterThanOrEqual(0);
      expect(blow.stroke - (blows[n - 1]?.stroke ?? blow.stroke), `${label}: stroke numbers skip`).toBeLessThanOrEqual(1);
    });
  });

  it('leaves a pocket walled in by the figure and plans nothing on a stock at its margin', () => {
    // A hollow ball of figure 1 cm thick (thinner than the planner's search for an open side) round stone in its cavity: filling it, the stone touches no air and the way out runs through the figure; as a smaller ball, it touches only the cavity's air, from which no shaft gets out.
    const shell = new Grid(SPEC);
    shell.fill((x, y, z) => Math.abs(Math.hypot(x, y - 0.2, z) - SHELL_RADIUS) - SHELL_HALF_THICKNESS);
    for (const radius of CAVITY_STONE_RADII) {
      const sealed = new Grid({ ...SPEC, band: STOCK_BAND_CELLS });
      sealed.fill((x, y, z) => Math.min(shell.sample(x, y, z) - MARGIN, Math.hypot(x, y - 0.2, z) - radius));
      expect(webCount(sealed, shell), `the cavity holds a ball of stone of radius ${String(radius)} m`).toBeGreaterThan(100);
      expect(webs(context(shell, sealed), options), `a ball of stone of radius ${String(radius)} m in the cavity`).toEqual([]);
    }
    expect(webs(context(figure, stockWith(figure, [])), options)).toEqual([]);
  });
});
