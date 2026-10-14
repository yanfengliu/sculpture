/**
 * The orbit-limit check for explicit camera poses (src/viewer/orbit-limits.ts).
 * Bound: it pins the geometry (distance and polar angle) and that every preset of src/viewer/presets.ts passes; whether the page then reports a refused pose is tests/e2e/query.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { MAX_DISTANCE, MAX_POLAR_ANGLE, MIN_DISTANCE, describePose, poseProblem } from './orbit-limits';
import { PRESETS } from './presets';

describe('poseProblem', () => {
  it('keeps every preset pose', () => {
    for (const preset of PRESETS) expect(poseProblem(preset.pose), preset.id).toBeNull();
  });

  it('keeps a pose that looks down at its target from inside the limits', () => {
    expect(poseProblem({ position: [0, 3.2, 10.5], target: [0, 2.625, 0] })).toBeNull();
    expect(describePose({ position: [0, 3, 4], target: [0, 0, 0] })).toEqual({ distance: 5, polarDegrees: expect.closeTo(53.13, 2) as number });
  });

  it('refuses a camera below its target, naming the polar limit and the pose', () => {
    const problem = poseProblem({ position: [0, 1, 10], target: [0, 3, 0] });
    expect(problem).toBe(`the orbit keeps the camera 0.2 to 80 m from its target and at most ${((MAX_POLAR_ANGLE * 180) / Math.PI).toFixed(1)}° from straight above it (above the target's horizon); this pose is 10.20 m away at 101.3°`);
  });

  it('refuses a camera too close or too far', () => {
    expect(poseProblem({ position: [0, 2.1, 0.1], target: [0, 2, 0] })).toContain(`this pose is ${Math.hypot(0.1, 0.1).toFixed(2)} m away`);
    expect(poseProblem({ position: [0, 2.01, MAX_DISTANCE + 1], target: [0, 2, 0] })).toContain('m away');
    expect(poseProblem({ position: [0, 2.01, MIN_DISTANCE + 0.01], target: [0, 2, 0] })).toBeNull();
  });
});
