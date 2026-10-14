/**
 * The step checks and the real-blows rule of src/timeline/step-info.ts (docs/design/spec.md, Blows, strokes and steps; docs/research/decisions.md, the real-blows rule). What a green run proves, and its bounds:
 *   1. `realBlowsPerShown` gives a step's direct count whatever its plan, 0 for a rate step not planned yet, and otherwise the calendar days (at least one) × WORK_HOURS_PER_DAY × 3600 s × the rate ÷ the planned blows, rounded and at least 1, on hand-made steps whose numbers are worked out here.
 *   2. `checkSteps` refuses a rate that is not positive, a direct count that is not a whole number of at least 1, a day that is not YYYY-MM-DD or does not exist (1501-02-30) and a span that runs backward, each with a message naming the step and what would satisfy it.
 * Bounds: hand-made steps; the David steps' values over a real plan are src/choreography/david-steps.test.ts's claim.
 */
import { describe, expect, it } from 'vitest';

import { type StepDef, WORK_HOURS_PER_DAY } from '../contracts/making';
import { checkSteps, realBlowsPerShown, stepInfo } from './step-info';

function step(overrides: Partial<StepDef>): StepDef {
  return {
    id: 'a-step',
    stage: 'roughing',
    title: 'A step',
    detail: 'A step (technique.md, stage 2).',
    tool: 'point',
    region: { label: 'r', min: [0, 0, 0], max: [1, 1, 1] },
    margin: 0.01,
    rate: 1,
    weight: 1,
    calendar: { from: '1501-09-20', to: '1501-10-20' },
    plan: () => [],
    ...overrides,
  };
}

describe('the real-blows rule', () => {
  it('takes a direct count as given, waits for the plan, and otherwise divides the days of work by the planned blows', () => {
    expect(realBlowsPerShown(step({ realPerShown: 3 }), 0)).toBe(3);
    expect(realBlowsPerShown(step({ realPerShown: 3 }), 500)).toBe(3);
    expect(realBlowsPerShown(step({}), 0)).toBe(0);
    // 30 days at WORK_HOURS_PER_DAY and one blow a second over 1,000 planned blows.
    expect(realBlowsPerShown(step({}), 1000)).toBe(Math.round((30 * WORK_HOURS_PER_DAY * 3600) / 1000));
    expect(realBlowsPerShown(step({ rate: 1.5 }), 1000)).toBe(Math.round((30 * WORK_HOURS_PER_DAY * 3600 * 1.5) / 1000));
    // A step dated on one day is a day's work; a huge plan still stands for at least one real blow a shown one.
    expect(realBlowsPerShown(step({ calendar: { from: '1501-09-09', to: '1501-09-09' } }), 100)).toBe(Math.round((WORK_HOURS_PER_DAY * 3600) / 100));
    expect(realBlowsPerShown(step({ calendar: { from: '1501-09-09', to: '1501-09-09' } }), 10_000_000)).toBe(1);
    expect(stepInfo(step({}), 7, 1000).blowsPerShown).toBe(realBlowsPerShown(step({}), 1000));
    expect(stepInfo(step({}), 7, 1000).firstBlow).toBe(7);
  });

  it('refuses a rate, a direct count or a date the rule cannot use, naming the step', () => {
    expect(() => { checkSteps([step({ rate: 0 })]); }).toThrow(/step "a-step" has a rate of 0 real blows a second; give a positive number/);
    expect(() => { checkSteps([step({ rate: Number.NaN })]); }).toThrow(/give a positive number/);
    expect(() => { checkSteps([step({ realPerShown: 1.5 })]); }).toThrow(/step "a-step" gives 1.5 real blows per shown blow; a direct count is a whole number of at least 1/);
    expect(() => { checkSteps([step({ realPerShown: 0 })]); }).toThrow(/a whole number of at least 1/);
    expect(() => { checkSteps([step({ calendar: { from: '1501-13-40', to: '1501-10-20' } })]); }).toThrow(/step "a-step" has the calendar 1501-13-40 to 1501-10-20; give days that exist as YYYY-MM-DD/);
    expect(() => { checkSteps([step({ calendar: { from: '1501-02-30', to: '1501-10-20' } })]); }).toThrow(/give days that exist/);
    expect(() => { checkSteps([step({ calendar: { from: '1501/09/09', to: '1501-10-20' } })]); }).toThrow(/give days that exist/);
    expect(() => { checkSteps([step({ calendar: { from: '1501-10-20', to: '1501-09-20' } })]); }).toThrow(/step "a-step" runs backward, from 1501-10-20 to 1501-09-20/);
    expect(() => { checkSteps([step({})]); }).not.toThrow();
  });
});
