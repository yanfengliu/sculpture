/**
 * The 8 mm cases of the David steps, run on their own by `npm run test:slow` because they take minutes (a full plan and replay at the page's resolution) and the unit gate must stay fast (fleet R22). What a green run proves, and its bounds:
 *   1. On the synthetic figure: the whole plan holds under the spec's 60,000-blow budget at 8 mm, the engine's bulk-cut size equals the catalog's, and the undo log after the replay to the end holds under UNDO_BYTES_PER_BLOW per blow of the plan: 400 MB at the blow budget, which with the grids' 184 MB and the chunk copies of a remesh keeps the page under its 1.5 GB (docs/design/spec.md, Budgets); the plan of 2026-10-13 measured 6.2 KB per blow, 172 MB for 27,617 blows, against 10.3 KB and 284 MB with the per-index record (review C3.2 measured 351 MB at t = 21 on the David).
 *   2. On the David grid (public/model/david.json beside its data, loaded from disk; skipped with a logged reason until `npm run model` builds it): the same two budgets hold for the plan the page runs, with the block taken from the grid's lattice as the page does (review C3.4: the budget was checked only on the synthetic figure).
 *   3. On both: at t = N a whole-grid flood fill (src/stock/components.ts) finds no piece of stock without figure cells reaching SKIN_ROWS above the base row, neither floating nor a pillar standing on the base (the sweep of src/stock/sweep.ts at every step's end did its work on the real plan), and the pieces holding figure cells are no more than the figure grid's own pieces, so one on the mannequin (the David grid of 2026-10-13 is the statue plus six scan specks of 1 to 23 cells, so its stone ends in four figure-holding pieces). Crumbs of the block's bottom skin, pieces without figure cells lying under SKIN_ROWS (one row tall as measured on 2026-10-14: 3 crumbs of 4 cells on the mannequin, 6 of 14 on the David, all within 3 cm of the base's foot), are logged with their cells and boxes and not counted: the sweep keeps them as it keeps everything on the ground. Until the floor pass of 2026-10-14 (src/choreography/generators/floor.ts) this claim was red on both figures: the roughing left stubs and sheets of 47 to 160 cells, 4 to 10 rows tall, standing on the floor behind the base and at the block's edges, where the craters' 2 cm scratch could not see them.
 * Both cases log the per-step counts, the planning and replay times, the mean apply time per blow, the undo memory, the triangle count, the cells each step's sweep took off with its milliseconds and chunks relabelled, and the pieces at t = N for the record (2026-10-13: 77 ms per boundary on both figures, 255 to 290 ms for the first, which labels every chunk, and 11,765 cells swept on the David).
 * Bounds: the plan is judged by its data, not by its look; the budgets asserted are the blow count and the undo log, and the pieces are counted by 6-connectivity on 8 mm cells. The logged times are this machine's record for the handoff and assert nothing: the page's first-frame, frame-rate, jump and memory budgets have no automated measurement yet (docs/work/0_making-of/plan.md). The David case pins the plan to this grid build (cell 8 mm, the Scan the World mesh); no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, ToolPose } from '../contracts/making';
import { STOCK_BAND_CELLS } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { floodComponents } from '../stock/components';
import { loadFigureGrid } from '../stock/grid';
import { createMaking, type EngineMaking, type MakingOptions } from '../timeline/making';
import { BULK_CUT_SIZE_M as ENGINE_BULK_CUT_SIZE_M } from '../stock/tool-volumes';
import { BULK_CUT_SIZE_M } from '../tools/catalog';
import { DAVID_STEPS } from './david-steps';
import { STAGES } from './stages';

/** docs/design/spec.md, Budgets. */
const BLOW_BUDGET = 60_000;
/** The undo log may reach 400 MB at the blow budget, so a plan may hold this much per blow on average. */
const UNDO_BYTES_PER_BLOW = 400e6 / BLOW_BUDGET;
/** Rows above the base row a crumb of the block's bottom skin may reach: the crumbs measured on 2026-10-13 are one or two rows tall (8 to 16 mm), so the stock band, one row more, bounds them; a piece reaching this row is a pillar of waste or a floater. */
const SKIN_ROWS = STOCK_BAND_CELLS;

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(figure: Pick<MakingOptions, 'figure' | 'header'>): EngineMaking {
  return createMaking({ ...figure, steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

/** Plans everything, replays to the end, logs the record under `name` and checks the two budgets. */
function measure(name: string, build: () => EngineMaking, built0: number): void {
  const m = build();
  const built = performance.now();
  m.planAll();
  const planned = performance.now();
  m.setTime(m.N);
  const replayed = performance.now();
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
    `figure build ${((built - built0) / 1000).toFixed(2)} s, planAll (plan, apply all, undo all) ${((planned - built) / 1000).toFixed(2)} s, replay to the end ${((replayed - planned) / 1000).toFixed(2)} s`,
    `mean apply ${(((replayed - planned) / m.planLength) * 1000).toFixed(0)} us per blow, undo log ${(m.undoBytes / 1e6).toFixed(1)} MB (${(m.undoBytes / m.planLength / 1e3).toFixed(2)} KB per blow against the ${(UNDO_BYTES_PER_BLOW / 1e3).toFixed(2)} KB budget), triangles at the end ${String(m.remesher.triangles)}`,
    `swept cells per step (sweep ms, chunks relabelled): ${sweeps.map((s) => `${s.id} ${String(s.record?.cells ?? 0)} (${(s.record?.millis ?? 0).toFixed(0)} ms, ${String(s.record?.relabelled ?? 0)})`).join(', ')}`,
    `sweeps over the replay ${(sweepMillis / 1000).toFixed(2)} s in all, ${(sweepMillis / Math.max(1, m.N)).toFixed(0)} ms per boundary; stock pieces at t = N (flood fill ${((flooded - replayed) / 1000).toFixed(1)} s): ${String(statuePieces)} holding figure cells, where the figure grid itself is in ${String(figurePieces.count)} pieces (${[...figurePieces.cells].sort((a, b) => b - a).join(', ')} cells); ${String(offBase.length)} off the base row without figure cells${offBase.length > 0 ? ` (${offBase.join('; ')})` : ''}; ${String(crumbs.length)} crumbs of the bottom skin under ${String(SKIN_ROWS)} rows, ${String(crumbCells)} cells${crumbs.length > 0 ? `: ${crumbs.join('; ')}` : ''}`,
  ];
  console.log(lines.join('\n'));
  expect(m.planLength).toBeLessThan(BLOW_BUDGET);
  expect(m.undoBytes).toBeGreaterThan(0);
  expect(m.undoBytes).toBeLessThan(m.planLength * UNDO_BYTES_PER_BLOW);
  expect(offBase, 'stone off the base row that holds no figure cell at t = N').toEqual([]);
  expect(statuePieces).toBeGreaterThanOrEqual(1);
  expect(statuePieces).toBeLessThanOrEqual(figurePieces.count);
  m.dispose();
}

describe('David steps at 8 mm (slow)', () => {
  it('stays under the blow and undo budgets on the synthetic figure and logs the measurements', () => {
    expect(ENGINE_BULK_CUT_SIZE_M).toBe(BULK_CUT_SIZE_M);
    measure('David plan at 8 mm on the synthetic figure', () => making({ figure: syntheticFigure(0.008) }), performance.now());
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
    measure(`David plan on the David grid (${header.source?.title ?? 'no source named'}, cell ${String(header.cell)} m, ${header.size.join('×')})`, () => making({ figure: grid, header }), start);
  }, 1_200_000);
});
