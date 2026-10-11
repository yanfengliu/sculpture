/**
 * Plan integrity of the provisional dev steps (src/choreography/dev-steps.ts) over the synthetic figure. What a green run proves, and its bounds:
 *   At 2 cm cells: the step ids are unique kebab-case, every stage id of StageId appears in order, every step changes the stock or the finish, every blow lies inside the block and within the scaffold's reach (src/tools/blow-cycle.ts), every blow's tool axis points into the stock at an angle inside the tool catalog's documented range (the point's bulk range for sizes at or above BULK_CUT_SIZE_M), blows within a stroke are consecutive, and two fresh Makings give the same length and digest.
 * Bounds: the plan is judged by its data, not by its look; the 2 cm case takes about 20 s. The 8 mm case, the page's resolution, lives in dev-steps.slow.test.ts and runs through `npm run test:slow`.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, StageId, ToolPose } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { createMaking, type EngineMaking } from '../timeline/making';
import { isReachable } from '../tools/blow-cycle';
import { BULK_CUT_SIZE_M, TOOL_CATALOG } from '../tools/catalog';
import { DEV_STAGES, DEV_STEPS } from './dev-steps';

const STAGE_ORDER: readonly StageId[] = ['setup', 'layout', 'roughing', 'coarse-claw', 'fine-claw', 'drilling', 'rasping', 'polishing', 'on-site'];

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DEV_STEPS, stages: DEV_STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

function differs(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return true;
  return false;
}

/** Degrees between the tool axis and the surface, from the direction's component into the stock. */
function angleToSurface(direction: readonly [number, number, number], normal: readonly [number, number, number]): number {
  const into = -(direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]);
  return (Math.asin(Math.min(Math.max(into, -1), 1)) * 180) / Math.PI;
}

describe('dev steps', () => {
  it('lists every stage in order with unique ids and sourced details', () => {
    expect(DEV_STAGES.map((s) => s.id)).toEqual(STAGE_ORDER);
    const ids = DEV_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const stagesSeen = [...new Set(DEV_STEPS.map((s) => s.stage))];
    expect(stagesSeen).toEqual(STAGE_ORDER);
    for (const step of DEV_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(48);
      expect(step.detail.length).toBeLessThanOrEqual(200);
      expect(step.detail).toMatch(/technique\.md/);
      expect(step.calendar.from <= step.calendar.to).toBe(true);
    }
  });

  it('plans blows that change the stock or finish, inside the block, reachable, at the documented angles, with a stable digest', () => {
    const a = making(0.02);
    let stock = a.stock.values.slice();
    let finish = a.finish.slice();
    for (let s = 0; s < a.N; s += 1) {
      a.setTime(s + 1);
      const step = DEV_STEPS[s];
      if (step === undefined) throw new Error('missing step');
      const blows = a.blowsOf(s);
      expect(blows.length, `${step.id} plans no blows`).toBeGreaterThan(0);
      const stockChanged = differs(a.stock.values, stock);
      const finishChanged = differs(a.finish, finish);
      expect(stockChanged || finishChanged, `${step.id} changes neither stock nor finish`).toBe(true);
      stock = a.stock.values.slice();
      finish = a.finish.slice();
      const spec = TOOL_CATALOG[step.tool];
      let lastStroke = -1;
      const strokesSeen = new Set<number>();
      for (const blow of blows) {
        expect(blow.tool).toBe(step.tool);
        expect(Math.abs(blow.point[0])).toBeLessThanOrEqual(BLOCK_M.width / 2 + 0.02);
        expect(blow.point[1]).toBeGreaterThanOrEqual(-0.02);
        expect(blow.point[1]).toBeLessThanOrEqual(BLOCK_M.height + 0.02);
        expect(Math.abs(blow.point[2])).toBeLessThanOrEqual(BLOCK_M.depth / 2 + 0.02);
        expect(isReachable(blow.point), `${step.id}: blow at ${blow.point.join(', ')} is out of reach`).toBe(true);
        const angle = angleToSurface(blow.direction, blow.normal);
        const range = step.tool === 'point' ? (blow.size >= BULK_CUT_SIZE_M ? [60, 90] : [30, 50]) : step.tool === 'drill' ? [35, 90] : [spec.angle?.min ?? 0, spec.angle?.max ?? 90];
        expect(angle, `${step.id}: angle ${String(angle)} outside ${range.join('-')}`).toBeGreaterThanOrEqual((range[0] ?? 0) - 1e-6);
        expect(angle).toBeLessThanOrEqual((range[1] ?? 90) + 1e-6);
        if (blow.stroke !== lastStroke) {
          expect(strokesSeen.has(blow.stroke), `${step.id}: stroke ${String(blow.stroke)} is not consecutive`).toBe(false);
          strokesSeen.add(blow.stroke);
          lastStroke = blow.stroke;
        }
      }
    }
    expect(a.blowsApplied).toBe(a.planLength);
    const b = making(0.02);
    b.planAll();
    expect(b.planLength).toBe(a.planLength);
    expect(b.planDigest).toBe(a.planDigest);
  }, 120_000);
});
