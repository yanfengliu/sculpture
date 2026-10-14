/**
 * The 8 mm cases of the David steps, run on their own by `npm run test:slow` because they take minutes (a full plan and replay at the page's resolution) and the unit gate must stay fast (fleet R22). What a green run proves, and its bounds:
 *   1. On the synthetic figure: the whole plan holds under the spec's 60,000-blow budget at 8 mm, the engine's bulk-cut size equals the catalog's, and the undo log after the replay to the end holds under UNDO_BYTES_PER_BLOW per blow of the plan: 400 MB at the blow budget, which with the grids' 184 MB and the chunk copies of a remesh keeps the page under its 1.5 GB (docs/design/spec.md, Budgets); the plan of 2026-10-13 measured 6.2 KB per blow, 172 MB for 27,617 blows, against 10.3 KB and 284 MB with the per-index record (review C3.2 measured 351 MB at t = 21 on the David).
 *   2. On the David grid (public/model/david.json beside its data, loaded from disk; skipped with a logged reason until `npm run model` builds it): the same two budgets hold for the plan the page runs, with the block taken from the grid's lattice as the page does (review C3.4: the budget was checked only on the synthetic figure).
 * Both cases log the per-step counts, the planning and replay times, the mean apply time per blow, the undo memory and the triangle count for the record.
 * Bounds: the plan is judged by its data, not by its look; the only budgets asserted are the blow count and the undo log. The logged times are this machine's record for the handoff and assert nothing: the page's first-frame, frame-rate, jump and memory budgets have no automated measurement yet (docs/work/0_making-of/plan.md). The David case pins the plan to this grid build (cell 8 mm, the Scan the World mesh); no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, ToolPose } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
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
  const perStage = new Map<string, number>();
  for (const step of m.steps) perStage.set(step.stage, (perStage.get(step.stage) ?? 0) + step.blowCount);
  const lines = [
    `${name}: ${String(m.planLength)} blows, digest ${m.planDigest}`,
    `per stage: ${[...perStage.entries()].map(([stage, count]) => `${stage} ${String(count)}`).join(', ')}`,
    `per step: ${m.steps.map((s) => `${s.id} ${String(s.blowCount)}`).join(', ')}`,
    `figure build ${((built - built0) / 1000).toFixed(2)} s, planAll (plan, apply all, undo all) ${((planned - built) / 1000).toFixed(2)} s, replay to the end ${((replayed - planned) / 1000).toFixed(2)} s`,
    `mean apply ${(((replayed - planned) / m.planLength) * 1000).toFixed(0)} us per blow, undo log ${(m.undoBytes / 1e6).toFixed(1)} MB (${(m.undoBytes / m.planLength / 1e3).toFixed(2)} KB per blow against the ${(UNDO_BYTES_PER_BLOW / 1e3).toFixed(2)} KB budget), triangles at the end ${String(m.remesher.triangles)}`,
  ];
  console.log(lines.join('\n'));
  expect(m.planLength).toBeLessThan(BLOW_BUDGET);
  expect(m.undoBytes).toBeGreaterThan(0);
  expect(m.undoBytes).toBeLessThan(m.planLength * UNDO_BYTES_PER_BLOW);
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
