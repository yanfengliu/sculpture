/**
 * The point's work on the David (docs/research/technique.md, Stage 2 and 4; tools.md, Subbia): the phases each point step plans with ./generators/furrows.ts, by step id, out of ./david-steps.ts so the plan-order gate (./roughing-order.test.ts) can plan a step again with the planner's marks.
 */
import type { Blow, PlanContext } from '../contracts/making';
import type { FloorOptions } from './generators/floor';
import { furrowsPhases, type FurrowsPhase } from './generators/furrows';
import { CROWN } from './regions';

/** The bulk cuts of the heavy point: one shown blow stands for a field of real pits, so its crater is flat-floored (src/stock/tool-volumes.ts); the pitch keeps neighbouring craters overlapping. */
const BULK = { pitch: 0.2, size: 0.15, angle: 85 } as const;
/** The sculptor's stroke: the point at 45 degrees, not lifted between blows (tools.md, Subbia); furrows 12 cm apart, each a run along the form. */
const STROKE = { pitch: 0.04, rowPitch: 0.12, size: 0.035, angle: 45, maxPasses: 1 } as const;
/** The bulk craters of a furrowed step stop a stroke's depth short of the step's margin, so the furrows are what finishes the layer. */
const furrowed = (margin: number) => margin + STROKE.size;
/** The floor pass of the point steps that finish their part of the block (the front, the sides, the back): chops of 6 cm struck down and in at the stone left standing on the floor beside the base (./generators/floor.ts). */
const FLOOR: FloorOptions = { size: 0.06, angle: 85 };

/** A point step's work: its phases over the faces and, for a step that finishes its part of the block, the floor pass. */
export interface PointWork {
  readonly phases: readonly FurrowsPhase[];
  readonly floor?: FloorOptions;
}

/** The point steps' work by step id, so the plan-order gate (./roughing-order.test.ts) can plan a step again with the planner's marks; each step's plan is `furrowsPhases(ctx, work.phases, work.floor)`. */
export const POINT_WORK: Readonly<Record<string, (ctx: PlanContext) => PointWork>> = {
  agostino: () => ({ phases: [{ options: { faces: ['front'], ...BULK, maxPasses: 2 } }] }),
  'hole-between-legs': () => ({ phases: [{ options: { faces: ['front'], pitch: 0.12, size: 0.08, angle: 85 } }] }),
  nodo: () => ({ phases: [{ options: { faces: ['front'], pitch: 0.2, size: 0.06, angle: 85, maxPasses: 1 } }] }),
  'high-points': () => ({ phases: [{ options: { faces: ['front'], ...BULK, maxPasses: 2 } }] }),
  'chest-and-face': () => ({ phases: [{ options: { faces: ['front'], ...BULK, maxPasses: 2 } }] }),
  'front-furrows': (ctx) => ({
    phases: [{ options: { faces: ['front'], ...BULK, margin: furrowed(ctx.margin) } }, { options: { faces: ['front'], ...STROKE } }],
    floor: FLOOR,
  }),
  'sides-point': (ctx) => ({
    phases: [{ options: { faces: ['left', 'right', 'top'], ...BULK, keep: CROWN, margin: furrowed(ctx.margin) } }, { options: { faces: ['left', 'right'], ...STROKE, pitch: 0.06, rowPitch: 0.2 } }],
    floor: FLOOR,
  }),
  'back-point': (ctx) => ({
    phases: [{ options: { faces: ['back'], ...BULK, margin: furrowed(ctx.margin) } }, { options: { faces: ['back'], ...STROKE } }],
    floor: FLOOR,
  }),
};

/** The plan of the point step `id` from POINT_WORK. */
export function pointPlan(id: string): (ctx: PlanContext) => readonly Blow[] {
  return (ctx) => {
    const work = POINT_WORK[id]?.(ctx);
    if (work === undefined) throw new Error(`no point work is defined for step "${id}"; add it to POINT_WORK`);
    return furrowsPhases(ctx, work.phases, work.floor);
  };
}

