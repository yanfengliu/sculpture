/**
 * The 8 mm case of the David steps, run on its own by `npm run test:slow` because it takes about a minute (a full plan and replay at the page's resolution) and the unit gate must stay fast (fleet R22). What a green run proves: the whole plan holds under the spec's 60,000-blow budget at 8 mm on the synthetic figure, the engine's bulk-cut size equals the catalog's, and the undo log is in use; it logs the per-step counts, the planning and replay times, the mean apply time per blow and the undo memory for the record.
 * Bounds: the plan is judged by its data on the synthetic mannequin, not by its look or on the David grid; the times are this machine's and prove the budget, not the frame rate.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, ToolPose } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { createMaking, type EngineMaking } from '../timeline/making';
import { BULK_CUT_SIZE_M as ENGINE_BULK_CUT_SIZE_M } from '../stock/tool-volumes';
import { BULK_CUT_SIZE_M } from '../tools/catalog';
import { DAVID_STEPS } from './david-steps';
import { STAGES } from './stages';

/** docs/design/spec.md, Budgets. */
const BLOW_BUDGET = 60_000;

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

describe('David steps at 8 mm (slow)', () => {
  it('stays under the blow budget at 8 mm and logs the measurements', () => {
    const start = performance.now();
    const m = making(0.008);
    const built = performance.now();
    m.planAll();
    const planned = performance.now();
    m.setTime(m.N);
    const replayed = performance.now();
    expect(ENGINE_BULK_CUT_SIZE_M).toBe(BULK_CUT_SIZE_M);
    const perStage = new Map<string, number>();
    for (const step of m.steps) perStage.set(step.stage, (perStage.get(step.stage) ?? 0) + step.blowCount);
    const lines = [
      `David plan at 8 mm: ${String(m.planLength)} blows, digest ${m.planDigest}`,
      `per stage: ${[...perStage.entries()].map(([stage, count]) => `${stage} ${String(count)}`).join(', ')}`,
      `per step: ${m.steps.map((s) => `${s.id} ${String(s.blowCount)}`).join(', ')}`,
      `figure build ${((built - start) / 1000).toFixed(2)} s, planAll (plan, apply all, undo all) ${((planned - built) / 1000).toFixed(2)} s, replay to the end ${((replayed - planned) / 1000).toFixed(2)} s`,
      `mean apply ${(((replayed - planned) / m.planLength) * 1000).toFixed(0)} us per blow, undo log ${(m.undoBytes / 1e6).toFixed(1)} MB, triangles at the end ${String(m.remesher.triangles)}`,
    ];
    console.log(lines.join('\n'));
    expect(m.planLength).toBeLessThan(BLOW_BUDGET);
    expect(m.undoBytes).toBeGreaterThan(0);
  }, 300_000);
});
