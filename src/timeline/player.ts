/**
 * The player (docs/design/spec.md, Blows, strokes and steps): pure playback logic over the timeline position `t` in `[0, N]`, with no DOM and no clock of its own.
 *
 * Rates: step `i` takes `weights[i] × BASE_SECONDS / speed` seconds of wall time at its full length, forward and backward alike, so `update(seconds)` moves `t` by `seconds × speed / (weight × BASE_SECONDS)` steps, crossing step boundaries at each step's own rate.
 * Continuous play stops at 0 or N and clears `playing`. A step press animates at the same rate to the next integer (forward) or the previous one (backward) and stops there; a second press while moving retargets one integer further, clamped. `seek` sets `t` directly and ends any step animation but keeps `playing`.
 */
import type { PlayDirection, Player } from '../contracts/making';
import { BASE_SECONDS } from '../contracts/making';

export type Speed = Player['speed'];

export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];

export interface TimelinePlayer extends Player {
  /** The integer a step press is animating toward, or null when no step animation runs. */
  readonly target: number | null;
  /** True while continuous playback or a step animation moves `t`. */
  readonly moving: boolean;
}

const EPSILON = 1e-9;

/** `weights[i]` is the duration multiplier of step `i`; N is `weights.length`. */
export function createPlayer(weights: readonly number[], baseSeconds: number = BASE_SECONDS): TimelinePlayer {
  const N = weights.length;
  let t = 0;
  let playing: PlayDirection | null = null;
  let speed: Speed = 1;
  let target: number | null = null;

  const clamp = (value: number): number => Math.min(N, Math.max(0, value));

  /** Weight of the step `t` would traverse in `direction`, or null at the end the direction runs into. */
  function stepAhead(position: number, direction: PlayDirection): { index: number; boundary: number } | null {
    if (direction === 'forward') {
      if (position >= N - EPSILON) return null;
      const index = Math.min(N - 1, Math.floor(position + EPSILON));
      return { index, boundary: index + 1 };
    }
    if (position <= EPSILON) return null;
    const index = Math.max(0, Math.ceil(position - EPSILON) - 1);
    return { index, boundary: index };
  }

  /**
   * Moves `t` by up to `seconds` toward `stopAt` (an end of the run) and returns true when the run ended there or at an end of the timeline.
   * The seconds left after reaching a step boundary are clamped at zero: a leftover computed by subtraction can come out a hair negative, and that must not read as "ended" (the defect of 2026-10-11, pinned in player.test.ts).
   */
  function advance(seconds: number, direction: PlayDirection, stopAt: number): boolean {
    let remaining = seconds;
    while (remaining > 0) {
      const ahead = stepAhead(t, direction);
      if (ahead === null) return true;
      const weight = weights[ahead.index] ?? 1;
      const secondsPerStep = (weight * baseSeconds) / speed;
      const limit = direction === 'forward' ? Math.min(ahead.boundary, stopAt) : Math.max(ahead.boundary, stopAt);
      const stepsLeft = Math.abs(limit - t);
      const stepsNow = secondsPerStep > 0 ? remaining / secondsPerStep : Number.POSITIVE_INFINITY;
      if (stepsNow < stepsLeft - EPSILON) {
        // The whole update fits inside this step.
        t = direction === 'forward' ? t + stepsNow : t - stepsNow;
        return false;
      }
      t = limit;
      if (limit === stopAt) return true;
      remaining = Math.max(0, remaining - stepsLeft * secondsPerStep);
    }
    return false;
  }

  return {
    get t() {
      return t;
    },
    get N() {
      return N;
    },
    get playing() {
      return playing;
    },
    get speed() {
      return speed;
    },
    get target() {
      return target;
    },
    get moving() {
      return playing !== null || target !== null;
    },
    play(direction) {
      target = null;
      playing = direction;
    },
    pause() {
      playing = null;
      target = null;
    },
    stepForward() {
      playing = null;
      target = clamp(target === null ? Math.floor(t + EPSILON) + 1 : target + 1);
      if (target <= t + EPSILON) target = null;
    },
    stepBack() {
      playing = null;
      target = clamp(target === null ? Math.ceil(t - EPSILON) - 1 : target - 1);
      if (target >= t - EPSILON) target = null;
    },
    seek(value) {
      target = null;
      t = Number.isFinite(value) ? clamp(value) : t;
    },
    setSpeed(value) {
      speed = value;
    },
    update(seconds) {
      if (!(seconds > 0)) return false;
      const before = t;
      if (playing !== null) {
        if (advance(seconds, playing, playing === 'forward' ? N : 0)) playing = null;
      } else if (target !== null) {
        const direction: PlayDirection = target > t ? 'forward' : 'backward';
        if (advance(seconds, direction, target)) {
          t = target;
          target = null;
        }
      }
      return t !== before;
    },
  };
}
