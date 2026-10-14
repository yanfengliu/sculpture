/**
 * The stone left above the figure after each David step (src/choreography/david-steps.ts) at the page's 8 mm cells on the synthetic figure, run by `npm run test:slow` (about two minutes). What a green run proves, and its bounds:
 *   After every step, over the figure-surface points of the step's region 2 cm apart (src/choreography/generators/surface.ts, `figureSurfacePoints`), the depth of stock standing above the figure along its normal (`stockAbove`) is measured; the run logs each step's blow count, its margin, p10, p50 and p90 of that depth in millimetres and the share of points with no stock above them. For the covering steps (fine-claw-all, rasp-flesh, file-details, pumice-flesh, tripoli-straw-leather) p90 is at most the step's margin plus one cell (docs/design/choreography.md: a margin is the stone left above the final surface at the end of the step; the review of 81acb40, C1.1, measured p50 16.7 mm at t = 21 before the covering passes). The whole plan stays under the 60,000-blow budget.
 * Bounds: the synthetic mannequin, not the David grid (the David case of the plan budget lives in david-steps.slow.test.ts); points are the figure's, so stone left where no figure point lies beneath it (a web between parts) is the connectivity test's claim, not this one's; p90, not the maximum, so a tenth of the points may stand higher.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, PlanContext, ToolPose } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { createMaking, type EngineMaking } from '../timeline/making';
import { DAVID_STEPS } from './david-steps';
import { figureSurfacePoints, stockAbove } from './generators/surface';
import { STAGES } from './stages';

/** docs/design/spec.md, Budgets. */
const BLOW_BUDGET = 60_000;
const COVERING = new Set(['fine-claw-all', 'rasp-flesh', 'file-details', 'pumice-flesh', 'tripoli-straw-leather']);
const SPACING = 0.02;
const LOOK_UP = 0.4;

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? Number.NaN;
}

describe('stone above the figure after each David step at 8 mm (slow)', () => {
  it('brings every covering step to its margin within a cell at p90', () => {
    const m = making(0.008);
    const lines = [`${'step'.padEnd(24)}${'blows'.padStart(6)}  margin   p10   p50   p90  bare  points`];
    const failures: string[] = [];
    for (let s = 0; s < m.N; s += 1) {
      const def = DAVID_STEPS[s];
      if (def === undefined) throw new Error('missing step');
      m.setTime(s + 1);
      const ctx: PlanContext = { figure: m.figure, stock: m.stock, region: def.region, margin: def.margin, seed: 0, cell: m.stock.cell };
      const depths: number[] = [];
      let bare = 0;
      let count = 0;
      for (const q of figureSurfacePoints(ctx, SPACING)) {
        count += 1;
        const above = stockAbove(ctx, q, LOOK_UP);
        if (above === null) {
          bare += 1;
          continue;
        }
        depths.push(above.depth);
      }
      depths.sort((a, b) => a - b);
      const mm = (v: number): string => (v * 1000).toFixed(1).padStart(5);
      const p90 = percentile(depths, 0.9);
      lines.push(`${def.id.padEnd(24)}${String(m.steps[s]?.blowCount ?? 0).padStart(6)}  ${mm(def.margin)}  ${mm(percentile(depths, 0.1))} ${mm(percentile(depths, 0.5))} ${mm(p90)}  ${((bare / Math.max(1, count)) * 100).toFixed(0).padStart(3)}%  ${String(count)}`);
      if (COVERING.has(def.id) && !(p90 <= def.margin + m.stock.cell)) failures.push(`${def.id}: p90 ${mm(p90)} mm above the figure against a margin of ${mm(def.margin)} mm plus the ${mm(m.stock.cell)} mm cell`);
    }
    console.log(lines.join('\n'));
    console.log(`plan ${String(m.planLength)} blows, digest ${m.planDigest}`);
    expect(failures, failures.join('; ')).toEqual([]);
    expect(m.planLength).toBeLessThan(BLOW_BUDGET);
  }, 900_000);
});
