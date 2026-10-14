/**
 * Connectivity of the stock after each David step (src/choreography/david-steps.ts) on the synthetic figure at 2 cm cells: the loose slivers seen in the captures of 2026-10-11, measured. What a green run proves, and its bounds:
 *   After every step the stock cells (fixed-point distance below zero) are labelled into 6-connected components by an iterative flood fill, and at the end of the making (t = N) the statue lies in one component, every other component stands on the block's base row (the sweep of src/stock/sweep.ts takes the floating ones off at each step's end) and the stone apart from the main component is at most CRUMB_CELLS_ALLOWED cells. The run logs, per step, the component count, the main component's count of sheet cells (stock with air on both sides along an axis: walls one cell thick), the cells the step's end sweep took off and the three largest components other than the main one, with their cell counts, their boxes in world metres and whether they hold statue cells (figure distance below zero) or base-row cells, so a red run names the step that sets what adrift.
 *   At t = N the webs are measured: the stock cells between the rock's top and the crown's crust (y 0.4 to 5.05) that stand more than the finest margin plus one cell from the figure (figure distance above 1.5 mm + 2 cm), which is stone no tool reached between two parts of the figure (the review of 81acb40, C2.3: between the feet, behind the right leg, at the inner thigh, the hand at the thigh, the right arm); the run logs their count and the three largest clusters' boxes and asserts the count under WEB_CELLS_ALLOWED.
 * Bounds: 6-connectivity on 2 cm cells, so a piece that touches the body only across an edge or a corner counts as floating and a flake thinner than a cell may be missed; the 8 mm page follows only by inference; the synthetic mannequin, not the David grid, so the David's stump and sling gaps are not here (src/choreography/david-steps.slow.test.ts counts the David's webs at 8 mm); the mesher is synchronous and nothing is rendered.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { DAVID_STEPS } from '../choreography/david-steps';
import { STAGES } from '../choreography/stages';
import type { BlowCycle, ToolPose, Vec3 } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { createMaking, type EngineMaking } from '../timeline/making';
import { FIXED_POINT } from '../contracts/grid';
import type { Grid } from './grid';

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

interface Component {
  readonly cells: number;
  /** Cells with air on both sides along some axis: walls one cell thick. */
  readonly sheet: number;
  /** Holds at least one cell inside the figure. */
  readonly statue: boolean;
  /** Holds at least one cell of the block's lowest stone row: it stands on the ground. */
  readonly base: boolean;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** The 6-connected components of the stock cells, largest first. `seen` and `queue` are scratch arrays of the grid's cell count. */
function components(stock: Grid, figure: Grid, baseRow: number, seen: Uint8Array, queue: Int32Array): Component[] {
  const { nx, ny, nz, values } = stock;
  const slice = nx * ny;
  const figureValues = figure.values;
  seen.fill(0);
  const out: Component[] = [];
  for (let start = 0; start < values.length; start += 1) {
    if (seen[start] === 1 || (values[start] ?? 0) >= 0) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let cells = 0;
    let sheet = 0;
    let statue = false;
    let base = false;
    let i0 = nx;
    let j0 = ny;
    let k0 = nz;
    let i1 = -1;
    let j1 = -1;
    let k1 = -1;
    const visit = (n: number): void => {
      if (seen[n] === 0 && (values[n] ?? 0) < 0) {
        seen[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    };
    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      cells += 1;
      if ((figureValues[index] ?? 0) < 0) statue = true;
      const k = Math.floor(index / slice);
      const j = Math.floor((index - k * slice) / nx);
      const i = index - k * slice - j * nx;
      if (j === baseRow) base = true;
      const airX = (i === 0 || (values[index - 1] ?? 0) >= 0) && (i + 1 === nx || (values[index + 1] ?? 0) >= 0);
      const airY = (j === 0 || (values[index - nx] ?? 0) >= 0) && (j + 1 === ny || (values[index + nx] ?? 0) >= 0);
      const airZ = (k === 0 || (values[index - slice] ?? 0) >= 0) && (k + 1 === nz || (values[index + slice] ?? 0) >= 0);
      if (airX || airY || airZ) sheet += 1;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (k < k0) k0 = k;
      if (k > k1) k1 = k;
      if (i > 0) visit(index - 1);
      if (i + 1 < nx) visit(index + 1);
      if (j > 0) visit(index - nx);
      if (j + 1 < ny) visit(index + nx);
      if (k > 0) visit(index - slice);
      if (k + 1 < nz) visit(index + slice);
    }
    out.push({ cells, sheet, statue, base, min: stock.worldOf(i0, j0, k0), max: stock.worldOf(i1, j1, k1) });
  }
  return out.sort((a, b) => b.cells - a.cells);
}

function box(c: Component): string {
  const span = (axis: 0 | 1 | 2): string => `${c.min[axis].toFixed(2)}..${c.max[axis].toFixed(2)}`;
  return `x ${span(0)} y ${span(1)} z ${span(2)}`;
}

/** The web cells at t = N and their 6-connected clusters, largest first: stock cells between the rock's top and the crown with figure distance above WEB_REACH; `seen` and `queue` are scratch arrays. */
function webCells(stock: Grid, figure: Grid, seen: Uint8Array, queue: Int32Array): { cells: number; clusters: Component[] } {
  const { nx, ny, nz, values } = stock;
  const slice = nx * ny;
  const reach = Math.round((WEB_REACH / stock.cell) * FIXED_POINT);
  const isWeb = (index: number): boolean => {
    if ((values[index] ?? 0) >= 0 || (figure.values[index] ?? 0) <= reach) return false;
    const y = stock.worldOf(0, Math.floor((index % slice) / nx), 0)[1];
    return y >= WEB_Y_MIN && y <= WEB_Y_MAX;
  };
  seen.fill(0);
  const clusters: Component[] = [];
  let total = 0;
  for (let start = 0; start < values.length; start += 1) {
    if (seen[start] === 1 || !isWeb(start)) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let cells = 0;
    let i0 = nx;
    let j0 = ny;
    let k0 = nz;
    let i1 = -1;
    let j1 = -1;
    let k1 = -1;
    const visit = (n: number): void => {
      if (seen[n] === 0 && isWeb(n)) {
        seen[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    };
    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      cells += 1;
      const k = Math.floor(index / slice);
      const j = Math.floor((index - k * slice) / nx);
      const i = index - k * slice - j * nx;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (k < k0) k0 = k;
      if (k > k1) k1 = k;
      if (i > 0) visit(index - 1);
      if (i + 1 < nx) visit(index + 1);
      if (j > 0) visit(index - nx);
      if (j + 1 < ny) visit(index + nx);
      if (k > 0) visit(index - slice);
      if (k + 1 < nz) visit(index + slice);
    }
    total += cells;
    clusters.push({ cells, sheet: 0, statue: false, base: false, min: stock.worldOf(i0, j0, k0), max: stock.worldOf(i1, j1, k1) });
  }
  return { cells: total, clusters: clusters.sort((a, b) => b.cells - a.cells) };
}

/** Cell size of the run, metres: 2 cm keeps the test under 30 s; 0.008, the page's resolution, takes minutes and a gigabyte (src/choreography/david-steps.slow.test.ts counts the pieces there), so a gate for the page belongs in that slow test. */
const CELL = 0.02;
/** Bound on the crumbs apart from the main stone at t = N, cells at 2 cm: with the sweep at every step's end (2026-10-13) the measurement is 6 cells in 4 crumbs, each one to three cells of the block's bottom edge standing on the base row (x −0.98..−0.94 and −0.06..−0.02 at y 0, z −0.54..−0.50), which the sweep keeps as it keeps everything on the ground; before the sweep it was 170 cells in 71 crumbs of the block's edge skin where a crater's rim met the face, 203 on 2026-10-11, and thousands with the plan before. On 2026-10-14 it is 1 cell in 1 crumb (x −0.02, y 0, z −0.54) both before and after the web-clearing step (fine-claw-gaps). A rise above this is a regression. */
const CRUMB_CELLS_ALLOWED = 20;
/** Bound on the web cells at t = N: the measurement of 2026-10-13 with the sweep found none; before it, 132 cells in 57 clusters, every one a floating crumb of the block's edge skin that the sweep now takes, and none between two parts of the mannequin, whose gaps are wide. The web-clearing pass of the review's C2.3 is planned since 2026-10-14 (fine-claw-gaps, src/choreography/generators/webs.ts: 109 shown blows here on the pockets the fine claw leaves, the count at t = N still none); the David's narrow gaps (the stump behind the calf, the hand at the thigh) are not here, and its webs are counted at 8 mm in src/choreography/david-steps.slow.test.ts (340 cells before that step, none after). */
const WEB_CELLS_ALLOWED = 20;
const WEB_Y_MIN = 0.4;
const WEB_Y_MAX = 5.05;
const WEB_REACH = 0.0015 + CELL;

describe('stock connectivity over the David steps at 2 cm', () => {
  it('leaves one connected piece of stone at the end of the making', () => {
    const m = making(CELL);
    const total = m.stock.values.length;
    const seen = new Uint8Array(total);
    const queue = new Int32Array(total);
    const lines: string[] = [`step                    comps  main sheet cells  extra cells  swept cells  three largest extra components (cells, statue?, base?, box in metres)`];
    let final: Component[] = [];
    for (let s = 0; s < m.N; s += 1) {
      m.setTime(s + 1);
      final = components(m.stock, m.figure, m.baseRow, seen, queue);
      const extras = final.slice(1);
      const extraCells = extras.reduce((sum, c) => sum + c.cells, 0);
      const shown = extras
        .slice(0, 3)
        .map((c) => `${String(c.cells)}${c.statue ? ' statue' : ''}${c.base ? ' base' : ''} [${box(c)}]`)
        .join('; ');
      lines.push(`${(DAVID_STEPS[s]?.id ?? String(s)).padEnd(24)}${String(final.length).padStart(5)}  ${String(final[0]?.sheet ?? 0).padStart(16)}  ${String(extraCells).padStart(11)}  ${String(m.sweptCells(s)).padStart(11)}  ${shown}`);
    }
    const largest = final[0];
    lines.push(`main component at t = N: ${String(largest?.cells ?? 0)} cells, ${largest === undefined ? 'none' : box(largest)}; ${String(final.filter((c) => c.statue).length)} components hold statue cells; ${String(final.slice(1).filter((c) => c.base).length)} of ${String(final.length - 1)} crumbs stand on the base row; swept over the making ${String(m.steps.reduce((sum, _, s) => sum + m.sweptCells(s), 0))} cells`);
    const webs = webCells(m.stock, m.figure, seen, queue);
    lines.push(`webs at t = N (stock more than ${String(Math.round(WEB_REACH * 1000))} mm from the figure, y ${String(WEB_Y_MIN)} to ${String(WEB_Y_MAX)}): ${String(webs.cells)} cells in ${String(webs.clusters.length)} clusters; largest ${webs.clusters.slice(0, 3).map((c) => `${String(c.cells)} [${box(c)}]`).join('; ')}`);
    console.log(lines.join('\n'));
    expect(webs.cells, `${String(webs.cells)} web cells stand more than ${String(Math.round(WEB_REACH * 1000))} mm from the figure at t = N`).toBeLessThanOrEqual(WEB_CELLS_ALLOWED);
    const extraCells = final.slice(1).reduce((sum, component) => sum + component.cells, 0);
    expect(final.filter((component) => component.statue).length, 'the statue lies in one piece of stone').toBe(1);
    expect(final.slice(1).filter((component) => !component.base).length, 'every crumb apart from the main stone stands on the base row: the sweep took the floating ones').toBe(0);
    expect(extraCells, `${String(final.length - 1)} crumbs of ${String(extraCells)} cells stand apart from the main stone at t = N`).toBeLessThanOrEqual(CRUMB_CELLS_ALLOWED);
  }, 300_000);
});
