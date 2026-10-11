/**
 * The bench carry over one frame (src/timeline/carry.ts; docs/design/spec.md, Blows, strokes and steps): a step's first blow spends its whole approach window at the carry's pace, from a rest position and across a step boundary alike, and nothing else is stretched.
 * Bound: a fake Making of three steps with known blow counts and a real player at speed 1 and 4; the carry is a constant per blow. It proves the splitting arithmetic, not the tools' carry times (src/tools/blow-cycle.test.ts) or the page's wiring (src/main.ts).
 * Defect pinned (2026-10-11): from `t = 1`, one 1/60 s frame at the plain pace reached phase 0.87 of the first blow, past the whole approach window; the first assertion below fails on the plain `player.update`.
 */
import { describe, expect, it } from 'vitest';

import type { Blow, Making, StepInfo } from '../contracts/making';
import { BASE_SECONDS, STRIKE_PHASE } from '../contracts/making';
import { APPROACH_END } from '../tools/blow-cycle';
import { advanceWithCarry } from './carry';
import { createPlayer } from './player';

const FRAME = 1 / 60;

function blow(step: number, index: number): Blow {
  return { tool: 'point', point: [step, index, 0], normal: [0, 0, 1], direction: [0, 0, -1], size: 0.01, stroke: 0 };
}

/** A making whose blows are `counts[i]` per step, evaluated like the engine's: blow `k` of step `i` is in progress over `[k / count, (k + 1) / count)` of the step and applied past STRIKE_PHASE of its window. */
function fakeMaking(counts: readonly number[], weights: readonly number[]): Making & { readonly setTimes: number[] } {
  let time = 0;
  const setTimes: number[] = [];
  const starts = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0));
  const steps: StepInfo[] = counts.map((count, i) => ({
    id: `step-${String(i)}`,
    stage: 'roughing',
    title: `Step ${String(i)}`,
    detail: 'test',
    tool: 'point',
    blowsPerShown: 1,
    weight: weights[i] ?? 1,
    calendar: { from: '1501-09-09', to: '1501-09-09' },
    firstBlow: starts[i] ?? 0,
    blowCount: count,
  }));
  const N = counts.length;
  const progress = (): { step: number; index: number; phase: number } | null => {
    if (time >= N) return null;
    const step = Math.floor(time);
    const f = time - step;
    const count = counts[step] ?? 0;
    if (f <= 0 || count === 0) return null;
    const position = f * count;
    const index = Math.min(Math.floor(position), count - 1);
    return { step, index, phase: position - index };
  };
  return {
    steps,
    stages: [],
    N,
    planLength: counts.reduce((a, b) => a + b, 0),
    planDigest: 'fake',
    planAll() {},
    get t() {
      return time;
    },
    setTime(t) {
      time = t;
      setTimes.push(t);
    },
    get blowsApplied() {
      const step = Math.min(Math.floor(time), N - 1);
      const f = Math.min(1, Math.max(0, time - step));
      const count = counts[step] ?? 0;
      return (starts[step] ?? 0) + Math.min(count, Math.max(0, Math.floor(f * count - STRIKE_PHASE) + 1));
    },
    dirtyChunks: 0,
    poses: [],
    chips: [],
    get current() {
      const p = progress();
      return p === null ? null : { blow: blow(p.step, p.index), phase: p.phase };
    },
    stockObject: {} as Making['stockObject'],
    onMeshed() {
      return () => {};
    },
    setTimes,
  };
}

/** Phase of the blow in progress at the making's time, or null at rest. */
function phaseOf(making: Making): number | null {
  return making.current?.phase ?? null;
}

describe('advanceWithCarry', () => {
  // Step 1: 10 blows over 12 s, so one blow lasts 1.2 s and its approach window 0.36 s; the carry needs 2 s.
  const COUNTS = [10, 10, 10];
  const CARRY = 2;
  const carry = (): number => CARRY;

  it('keeps the first frame from a rest position inside the approach window, where the plain pace jumped past it', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.seek(1);
    making.setTime(1);
    player.play('forward');
    advanceWithCarry(FRAME, player, making, carry);
    const phase = phaseOf(making);
    expect(phase).not.toBeNull();
    expect(phase ?? 1).toBeGreaterThan(0);
    expect(phase ?? 1).toBeLessThan(APPROACH_END);
    expect(making.t).toBe(player.t);

    const plain = createPlayer([1, 1, 1]);
    plain.seek(1);
    plain.play('forward');
    plain.update(FRAME);
    const plainMaking = fakeMaking(COUNTS, [1, 1, 1]);
    plainMaking.setTime(plain.t);
    // The plain pace: 1/60 s is 1/720 of the step, 10 blows in, phase 10/720 of a blow... which is 0.0139 of the step but 0.139 of a blow. With the reviewed step's 623 blows it was 0.87; here the window is 0.3 and the frame alone would cross a third of it.
    expect(phaseOf(plainMaking) ?? 0).toBeCloseTo(10 / 720, 6);
  });

  it('spends the carry time in the approach window, within a frame, then runs at the plain pace', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.seek(1);
    making.setTime(1);
    player.play('forward');
    let elapsed = 0;
    while ((phaseOf(making) ?? 0) < APPROACH_END && elapsed < 10) {
      advanceWithCarry(FRAME, player, making, carry);
      elapsed += FRAME;
    }
    // The window should end after CARRY seconds of wall time, not after its plain 0.36 s.
    expect(elapsed).toBeGreaterThan(CARRY - FRAME);
    expect(elapsed).toBeLessThan(CARRY + 2 * FRAME);
    // After the window: one plain second moves 1/12 of the step.
    const before = player.t;
    for (let i = 0; i < 60; i += 1) advanceWithCarry(FRAME, player, making, carry);
    expect(player.t - before).toBeCloseTo(1 / BASE_SECONDS, 3);
  });

  it('splits a frame that crosses a step boundary, so the next step starts at the carry pace', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.seek(1 - 0.001);
    making.setTime(player.t);
    player.play('forward');
    // 0.5 s: 0.012 s reach the boundary, the remaining 0.488 s run at the carry's 0.18 pace, so 0.488 × 0.18 / 12 of the step: phase 0.0732 of the first blow.
    advanceWithCarry(0.5, player, making, carry);
    expect(player.t).toBeGreaterThan(1);
    expect(phaseOf(making) ?? 1).toBeCloseTo((0.488 * (0.36 / CARRY)) / 12 * 10, 3);
  });

  it('divides the carry by the speed, so the window lasts carry / speed seconds at 4×', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.setSpeed(4);
    player.seek(1);
    making.setTime(1);
    player.play('forward');
    let elapsed = 0;
    while ((phaseOf(making) ?? 0) < APPROACH_END && elapsed < 10) {
      advanceWithCarry(FRAME, player, making, carry);
      elapsed += FRAME;
    }
    expect(elapsed).toBeGreaterThan(CARRY / 4 - FRAME);
    expect(elapsed).toBeLessThan(CARRY / 4 + 2 * FRAME);
  });

  it('stretches nothing backward, without a carry, or when the approach already lasts long enough', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.seek(2);
    making.setTime(2);
    player.play('backward');
    advanceWithCarry(0.5, player, making, carry);
    expect(player.t).toBeCloseTo(2 - 0.5 / 12, 9);

    const forward = createPlayer([1, 1, 1]);
    const plainMaking = fakeMaking(COUNTS, [1, 1, 1]);
    forward.seek(1);
    plainMaking.setTime(1);
    forward.play('forward');
    advanceWithCarry(0.5, forward, plainMaking, null);
    expect(forward.t).toBeCloseTo(1 + 0.5 / 12, 9);

    const quick = createPlayer([1, 1, 1]);
    const quickMaking = fakeMaking(COUNTS, [1, 1, 1]);
    quick.seek(1);
    quickMaking.setTime(1);
    quick.play('forward');
    // A 0.1 s carry is shorter than the 0.36 s window: the plain pace stands.
    advanceWithCarry(0.5, quick, quickMaking, () => 0.1);
    expect(quick.t).toBeCloseTo(1 + 0.5 / 12, 6);
  });

  it('stops where a step animation ends and never moves past the end of the timeline', () => {
    const making = fakeMaking(COUNTS, [1, 1, 1]);
    const player = createPlayer([1, 1, 1]);
    player.seek(1.5);
    making.setTime(1.5);
    player.stepForward();
    advanceWithCarry(60, player, making, carry);
    expect(player.t).toBe(2);
    expect(player.moving).toBe(false);
    expect(making.t).toBe(2);

    player.play('forward');
    advanceWithCarry(600, player, making, carry);
    expect(player.t).toBe(3);
    expect(player.playing).toBeNull();
  });
});
