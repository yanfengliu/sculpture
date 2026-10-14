/**
 * The 8 mm cases of the David steps, run on their own by `npm run test:slow` because they take minutes (a full plan and replay at the page's resolution) and the unit gate must stay fast (fleet R22). What a green run proves, and its bounds:
 *   1. On the synthetic figure: the whole plan holds under the spec's 60,000-blow budget at 8 mm, the engine's bulk-cut size equals the catalog's, and the undo log after the replay to the end holds under UNDO_BYTES_PER_BLOW per blow of the plan: 400 MB at the blow budget, which with the grids' 184 MB and the chunk copies of a remesh keeps the page under its 1.5 GB (docs/design/spec.md, Budgets); the plan of 2026-10-13 measured 6.2 KB per blow, 172 MB for 27,617 blows, against 10.3 KB and 284 MB with the per-index record (review C3.2 measured 351 MB at t = 21 on the David).
 *   2. On the David grid (public/model/david.json beside its data, loaded from disk; skipped with a logged reason until `npm run model` builds it): the same two budgets hold for the plan the page runs, with the block taken from the grid's lattice as the page does (review C3.4: the budget was checked only on the synthetic figure).
 *   3. On both: at t = N a whole-grid flood fill (src/stock/components.ts) finds no piece of stock without figure cells reaching SKIN_ROWS above the base row, neither floating nor a pillar standing on the base (the sweep of src/stock/sweep.ts at every step's end did its work on the real plan), and the pieces holding figure cells are no more than the figure grid's own pieces, so one on the mannequin (the David grid of 2026-10-13 is the statue plus six scan specks of 1 to 23 cells, so its stone ends in four figure-holding pieces). Crumbs of the block's bottom skin, pieces without figure cells lying under SKIN_ROWS (one row tall as measured on 2026-10-14: 3 crumbs of 4 cells on the mannequin, 6 of 14 on the David, all within 3 cm of the base's foot), are logged with their cells and boxes and not counted: the sweep keeps them as it keeps everything on the ground. Until the floor pass of 2026-10-14 (src/choreography/generators/floor.ts) this claim was red on both figures: the roughing left stubs and sheets of 47 to 160 cells, 4 to 10 rows tall, standing on the floor behind the base and at the block's edges, where the craters' 2 cm scratch could not see them.
 *   4. On both: the web cells at t = N, stone no tool reached between two parts of the figure (stock cells farther than the finest margin plus one cell from the figure, 1.5 + 8 mm, y 0.4 to 5.05, grouped into 6-connected clusters, read from the grids alone), are at most WEB_CELLS_ALLOWED: before the web-clearing step of 2026-10-14 (fine-claw-gaps) the David held 340 cells in 39 clusters and the mannequin 188 in 23, after it none on either. The census reads the block's stone at t = 0, so its zero is a measurement and not a count that never ran, and it is logged at the end of fine-claw-all and after fine-claw-gaps as well. On the David, every hole of the drill rows between the legs (between-the-legs) lands within LEG_HOLE_FROM_ROW of its row of LEG_GAPS, on the crease's walls and not across a thigh.
 * Both cases log the per-step counts, the planning and replay times, the mean apply time per blow, the undo memory, the triangle count, the cells each step's sweep took off with its milliseconds and chunks relabelled, and the pieces at t = N for the record (2026-10-13: 77 ms per boundary on both figures, 255 to 290 ms for the first, which labels every chunk, and 11,765 cells swept on the David).
 * Bounds: the plan is judged by its data, not by its look; the budgets asserted are the blow count and the undo log, and the pieces are counted by 6-connectivity on 8 mm cells; a web thinner than the census's cell of slack (stone in a crease a cell or two wide) is not counted. The logged times are this machine's record for the handoff and assert nothing: the page's first-frame, frame-rate, jump and memory budgets have no automated measurement yet (docs/work/0_making-of/plan.md). The David case pins the plan to this grid build (cell 8 mm, the Scan the World mesh); no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { FIXED_POINT } from '../contracts/grid';
import type { BlowCycle, ToolPose, Vec3 } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { floodComponents } from '../stock/components';
import { type Grid, loadFigureGrid } from '../stock/grid';
import { createMaking, type EngineMaking, type MakingOptions } from '../timeline/making';
import { BULK_CUT_SIZE_M as ENGINE_BULK_CUT_SIZE_M } from '../stock/tool-volumes';
import { BULK_CUT_SIZE_M } from '../tools/catalog';
import { DAVID_STEPS } from './david-steps';
import { LEG_GAPS } from './landmarks';
import { STAGES } from './stages';

/** docs/design/spec.md, Budgets. */
const BLOW_BUDGET = 60_000;
/** The undo log may reach 400 MB at the blow budget, so a plan may hold this much per blow on average. */
const UNDO_BYTES_PER_BLOW = 400e6 / BLOW_BUDGET;
/** Rows above the base row a crumb of the block's bottom skin may reach: the crumbs measured on 2026-10-13 are one or two rows tall (8 to 16 mm), so the stock band, one row more, bounds them; a piece reaching this row is a pillar of waste or a floater. */
const SKIN_ROWS = STOCK_BAND_CELLS;
/** The webs are counted between the rock's top and the crown's crust, metres, as src/stock/connectivity.test.ts counts them at 2 cm. */
const WEB_Y_MIN = 0.4;
const WEB_Y_MAX = 5.05;
/** The finest margin of the making (the dente di cane's 1.5 mm, fine-claw-all), metres: a web cell stands more than this plus one cell from the figure. */
const FINEST_MARGIN = 0.0015;
/** Web clusters logged, largest first. */
const WEB_CLUSTERS_SHOWN = 8;
/** Bound on the web cells at t = N on either figure at 8 mm. Before the web-clearing step of 2026-10-14 (fine-claw-gaps, src/choreography/generators/webs.ts) the David held 340 cells in 39 clusters (the largest 78 and 75 between the curls over the forehead and on the head's top, 25 and 23 in pockets of the stump) and the mannequin 188 in 23; after it, none on either. The slack is one small pocket's worth, so a change that leaves a real web goes red. */
const WEB_CELLS_ALLOWED = 20;
/** How far from its row a hole of the drill rows between the legs may land on the David, metres: the crease is at most 56 mm wide where the rows run, so its walls lie within 28 mm of the centreline, plus a cell and a half; a hole drilled across a thigh would land 20 cm or more away. Measured 2026-10-14: 3 to 22 mm. */
const LEG_HOLE_FROM_ROW = 0.04;

interface WebCluster {
  readonly cells: number;
  /** Cell box: min i, j, k, then max i, j, k. */
  readonly box: readonly [number, number, number, number, number, number];
}

/** The web cells: stock cells (value below zero) whose figure distance is above FINEST_MARGIN plus one cell, with y from WEB_Y_MIN to WEB_Y_MAX, marked 1 in `mark`; stone no tool reached between two parts of the figure. Read from the grids alone, independent of the planner (src/choreography/generators/webs.ts). */
function markWebs(stock: Grid, figure: Grid): { mark: Uint8Array; cells: number } {
  const { nx, ny, nz, values } = stock;
  const figureValues = figure.values;
  const reach = Math.round(((FINEST_MARGIN + stock.cell) / stock.cell) * FIXED_POINT);
  const j0 = Math.max(0, Math.ceil((WEB_Y_MIN - stock.spec.origin[1]) / stock.cell));
  const j1 = Math.min(ny - 1, Math.floor((WEB_Y_MAX - stock.spec.origin[1]) / stock.cell));
  const mark = new Uint8Array(values.length);
  let cells = 0;
  for (let k = 0; k < nz; k += 1) {
    for (let j = j0; j <= j1; j += 1) {
      let index = nx * (j + ny * k);
      for (let i = 0; i < nx; i += 1, index += 1) {
        if ((values[index] ?? 0) < 0 && (figureValues[index] ?? 0) > reach) {
          mark[index] = 1;
          cells += 1;
        }
      }
    }
  }
  return { mark, cells };
}

/** The web cells and their 6-connected clusters, largest first. */
function webClusters(stock: Grid, figure: Grid): { cells: number; clusters: WebCluster[] } {
  const { nx, ny, nz, values } = stock;
  const slice = nx * ny;
  // 1 marks a web cell not yet clustered, 2 one already taken.
  const { mark, cells } = markWebs(stock, figure);
  const queue = new Int32Array(Math.max(1, cells));
  const clusters: WebCluster[] = [];
  for (let start = 0; start < values.length; start += 1) {
    if (mark[start] !== 1) continue;
    mark[start] = 2;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    const box: [number, number, number, number, number, number] = [nx, ny, nz, -1, -1, -1];
    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      const k = Math.floor(index / slice);
      const j = Math.floor((index - k * slice) / nx);
      const i = index - k * slice - j * nx;
      box[0] = Math.min(box[0], i);
      box[1] = Math.min(box[1], j);
      box[2] = Math.min(box[2], k);
      box[3] = Math.max(box[3], i);
      box[4] = Math.max(box[4], j);
      box[5] = Math.max(box[5], k);
      const neighbours = [i > 0 ? index - 1 : -1, i + 1 < nx ? index + 1 : -1, j > 0 ? index - nx : -1, j + 1 < ny ? index + nx : -1, k > 0 ? index - slice : -1, k + 1 < nz ? index + slice : -1];
      for (const n of neighbours) {
        if (n < 0 || mark[n] !== 1) continue;
        mark[n] = 2;
        queue[tail] = n;
        tail += 1;
      }
    }
    clusters.push({ cells: tail, box });
  }
  return { cells, clusters: clusters.sort((a, b) => b.cells - a.cells) };
}

/** A cluster's cells and its box in world metres. */
function describeCluster(stock: Grid, cluster: WebCluster): string {
  const [i0, j0, k0, i1, j1, k1] = cluster.box;
  const lo = stock.worldOf(i0, j0, k0);
  const hi = stock.worldOf(i1, j1, k1);
  return `${String(cluster.cells)} [x ${lo[0].toFixed(3)}..${hi[0].toFixed(3)} y ${lo[1].toFixed(3)}..${hi[1].toFixed(3)} z ${lo[2].toFixed(3)}..${hi[2].toFixed(3)}]`;
}

/** The web census of the making's stock now: its count and clusters, as one log phrase. */
function webCensus(m: EngineMaking, when: string): { cells: number; line: string } {
  const webs = webClusters(m.stock, m.figure);
  return { cells: webs.cells, line: `${when} ${String(webs.cells)} cells in ${String(webs.clusters.length)} clusters${webs.clusters.length > 0 ? ` (largest ${webs.clusters.slice(0, WEB_CLUSTERS_SHOWN).map((c) => describeCluster(m.stock, c)).join('; ')})` : ''}` };
}

/** The index of step `id` in the making, failing with the ids it has when the step is gone. */
function stepIndex(m: EngineMaking, id: string): number {
  const index = m.steps.findIndex((step) => step.id === id);
  if (index < 0) throw new Error(`the making has no step "${id}" (it has ${m.steps.map((step) => step.id).join(', ')}); rename the step here if it moved`);
  return index;
}

/** Distance from `point` to the nearest drill row of LEG_GAPS, metres. */
function fromLegRows(point: Vec3): number {
  let best = Number.POSITIVE_INFINITY;
  for (const row of LEG_GAPS) {
    for (let n = 0; n + 1 < row.length; n += 1) {
      const a = row[n];
      const b = row[n + 1];
      if (a === undefined || b === undefined) continue;
      const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * d[0] + (point[1] - a[1]) * d[1] + (point[2] - a[2]) * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])));
      best = Math.min(best, Math.hypot(point[0] - a[0] - d[0] * t, point[1] - a[1] - d[1] * t, point[2] - a[2] - d[2] * t));
    }
  }
  return best;
}

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(figure: Pick<MakingOptions, 'figure' | 'header'>): EngineMaking {
  return createMaking({ ...figure, steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

/** What a case asserts beyond the budgets and the pieces: the web cells allowed at t = N, and, on the David, how far from its row a hole of the drill rows between the legs may land. */
interface CaseBounds {
  readonly webCells: number;
  readonly legHoleFromRow?: number;
}

/** Plans everything, replays to the end with the web census before and after the web-clearing step, logs the record under `name` and checks the budgets, the pieces, the webs and the case's `bounds`. */
function measure(name: string, build: () => EngineMaking, built0: number, bounds: CaseBounds): void {
  const m = build();
  const built = performance.now();
  m.planAll();
  const planned = performance.now();
  // The census reads stone: at t = 0 the whole block between the rock's top and the crown stands farther than the margin from the figure, so a zero later is a measurement, not a count that never ran.
  const atStart = markWebs(m.stock, m.figure).cells;
  const gaps = stepIndex(m, 'fine-claw-gaps');
  m.setTime(gaps);
  const beforeGaps = webCensus(m, `at the end of ${m.steps[gaps - 1]?.id ?? 'the step before'}`);
  m.setTime(gaps + 1);
  const afterGaps = webCensus(m, 'after fine-claw-gaps');
  m.setTime(m.N);
  const replayed = performance.now();
  const webs = webCensus(m, 'at t = N');
  const legHoles = m.blowsOf(stepIndex(m, 'between-the-legs'));
  const farthestHole = Math.max(0, ...legHoles.map((blow) => fromLegRows(blow.point)));
  const pieces = floodComponents(m.stock, m.figure, m.baseRow);
  const flooded = performance.now();
  const figurePieces = floodComponents(m.figure, m.figure, -1);
  // Each piece without figure cells is either a crumb of the bottom skin (under SKIN_ROWS above the base row) or stone off the base: a pillar standing on it, or floating.
  let statuePieces = 0;
  const offBase: string[] = [];
  const crumbs: string[] = [];
  let crumbCells = 0;
  for (let c = 0; c < pieces.count; c += 1) {
    if (pieces.holdsFigure[c] === 1) {
      statuePieces += 1;
      continue;
    }
    const box = pieces.boxes.subarray(6 * c, 6 * c + 6);
    const where = `${String(pieces.cells[c])} cells at x ${m.stock.worldOf(box[0] ?? 0, 0, 0)[0].toFixed(3)}..${m.stock.worldOf(box[3] ?? 0, 0, 0)[0].toFixed(3)} y ${m.stock.worldOf(0, box[1] ?? 0, 0)[1].toFixed(3)}..${m.stock.worldOf(0, box[4] ?? 0, 0)[1].toFixed(3)} z ${m.stock.worldOf(0, 0, box[2] ?? 0)[2].toFixed(3)}..${m.stock.worldOf(0, 0, box[5] ?? 0)[2].toFixed(3)}`;
    if ((box[4] ?? 0) >= m.baseRow + SKIN_ROWS) offBase.push(`${where}, ${pieces.holdsBase[c] === 1 ? 'standing on the base row' : 'floating'}`);
    else {
      crumbs.push(where);
      crumbCells += pieces.cells[c] ?? 0;
    }
  }
  const perStage = new Map<string, number>();
  for (const step of m.steps) perStage.set(step.stage, (perStage.get(step.stage) ?? 0) + step.blowCount);
  const sweeps = m.steps.map((s, i) => ({ id: s.id, record: m.sweepOf(i) }));
  const sweepMillis = sweeps.reduce((sum, s) => sum + (s.record?.millis ?? 0), 0);
  const lines = [
    `${name}: ${String(m.planLength)} blows, digest ${m.planDigest}`,
    `per stage: ${[...perStage.entries()].map(([stage, count]) => `${stage} ${String(count)}`).join(', ')}`,
    `per step: ${m.steps.map((s) => `${s.id} ${String(s.blowCount)}`).join(', ')}`,
    `figure build ${((built - built0) / 1000).toFixed(2)} s, planAll (plan, apply all, undo all) ${((planned - built) / 1000).toFixed(2)} s, replay to the end (with three web censuses) ${((replayed - planned) / 1000).toFixed(2)} s`,
    `mean apply ${(((replayed - planned) / m.planLength) * 1000).toFixed(0)} us per blow, undo log ${(m.undoBytes / 1e6).toFixed(1)} MB (${(m.undoBytes / m.planLength / 1e3).toFixed(2)} KB per blow against the ${(UNDO_BYTES_PER_BLOW / 1e3).toFixed(2)} KB budget), triangles at the end ${String(m.remesher.triangles)}`,
    `swept cells per step (sweep ms, chunks relabelled): ${sweeps.map((s) => `${s.id} ${String(s.record?.cells ?? 0)} (${(s.record?.millis ?? 0).toFixed(0)} ms, ${String(s.record?.relabelled ?? 0)})`).join(', ')}`,
    `sweeps over the replay ${(sweepMillis / 1000).toFixed(2)} s in all, ${(sweepMillis / Math.max(1, m.N)).toFixed(0)} ms per boundary; stock pieces at t = N (flood fill ${((flooded - replayed) / 1000).toFixed(1)} s): ${String(statuePieces)} holding figure cells, where the figure grid itself is in ${String(figurePieces.count)} pieces (${[...figurePieces.cells].sort((a, b) => b - a).join(', ')} cells); ${String(offBase.length)} off the base row without figure cells${offBase.length > 0 ? ` (${offBase.join('; ')})` : ''}; ${String(crumbs.length)} crumbs of the bottom skin under ${String(SKIN_ROWS)} rows, ${String(crumbCells)} cells${crumbs.length > 0 ? `: ${crumbs.join('; ')}` : ''}`,
    `webs (stock more than ${((FINEST_MARGIN + m.stock.cell) * 1000).toFixed(1)} mm from the figure, y ${String(WEB_Y_MIN)} to ${String(WEB_Y_MAX)}): ${String(atStart)} cells at t = 0; ${beforeGaps.line}; ${afterGaps.line}; ${webs.line}`,
    `between-the-legs: ${String(legHoles.length)} holes, the farthest ${(farthestHole * 1000).toFixed(1)} mm from its row of LEG_GAPS`,
  ];
  console.log(lines.join('\n'));
  expect(m.planLength).toBeLessThan(BLOW_BUDGET);
  expect(m.undoBytes).toBeGreaterThan(0);
  expect(m.undoBytes).toBeLessThan(m.planLength * UNDO_BYTES_PER_BLOW);
  expect(offBase, 'stone off the base row that holds no figure cell at t = N').toEqual([]);
  expect(statuePieces).toBeGreaterThanOrEqual(1);
  expect(statuePieces).toBeLessThanOrEqual(figurePieces.count);
  expect(atStart, "the web census reads the block's stone at t = 0").toBeGreaterThan(0);
  expect(webs.cells, `web cells at t = N: ${webs.line}`).toBeLessThanOrEqual(bounds.webCells);
  if (bounds.legHoleFromRow !== undefined) {
    expect(legHoles.length, 'the drill rows between the legs drill no hole').toBeGreaterThan(0);
    expect(farthestHole, 'a hole of the drill rows between the legs lands this far from its row, off the crease').toBeLessThanOrEqual(bounds.legHoleFromRow);
  }
  m.dispose();
}

describe('David steps at 8 mm (slow)', () => {
  it('stays under the blow and undo budgets on the synthetic figure and logs the measurements', () => {
    expect(ENGINE_BULK_CUT_SIZE_M).toBe(BULK_CUT_SIZE_M);
    measure('David plan at 8 mm on the synthetic figure', () => making({ figure: syntheticFigure(0.008) }), performance.now(), { webCells: WEB_CELLS_ALLOWED });
  }, 600_000);
});

const DAVID_HEADER = fileURLToPath(new URL('../../public/model/david.json', import.meta.url));
const hasDavid = existsSync(DAVID_HEADER);
if (!hasDavid) console.log(`david-steps.slow.test.ts: ${DAVID_HEADER} is not built (npm run model), so the David case is skipped`);

describe.skipIf(!hasDavid)('David steps on the David grid (slow)', () => {
  const fetchFromDisk: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = join(dirname(DAVID_HEADER), url.slice(Math.max(url.lastIndexOf('/'), url.lastIndexOf('\\')) + 1));
    return Promise.resolve(new Response(new Uint8Array(readFileSync(path)).buffer, { status: 200 }));
  };

  it('stays under the blow and undo budgets on the David grid, the block from its lattice, and logs the measurements', async () => {
    const start = performance.now();
    const { grid, header } = await loadFigureGrid(DAVID_HEADER, fetchFromDisk);
    measure(`David plan on the David grid (${header.source?.title ?? 'no source named'}, cell ${String(header.cell)} m, ${header.size.join('×')})`, () => making({ figure: grid, header }), start, { webCells: WEB_CELLS_ALLOWED, legHoleFromRow: LEG_HOLE_FROM_ROW });
  }, 1_200_000);
});
