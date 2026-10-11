/**
 * The bench carry (docs/design/spec.md, Blows, strokes and steps): a step's first blow gets a carry from the bench, so while that blow is in its approach window and playback runs forward, wall time runs slower and the window lasts the tools' carry time divided by the speed. Captures, backward playback and shot mode get no carry.
 * `advanceWithCarry` moves the player by one frame's wall time in pieces: across a rest position by a hair first, so the incoming blow is in progress and its carry can be measured (at an integer `t` the making has no blow in progress); then through the approach window at the carry's pace; then at the plain pace, but no further than the end of the step, so the next step's first blow starts its own carry inside the same frame. Without the split, one frame from a rest position jumped past the whole approach window (the defect of 2026-10-11, pinned in carry.test.ts).
 * Page logic over the contract only (src/contracts/making.ts): the making's `current`, `steps`, `blowsApplied` and `setTime`, the player's `t`, `speed`, `playing`, `target` and `update`.
 */
import type { Blow, Making } from '../contracts/making';
import { BASE_SECONDS } from '../contracts/making';
import { APPROACH_END } from '../tools/blow-cycle';
import type { TimelinePlayer } from './player';

/** Seconds a hand needs to carry the tool from the bench to `blow`; null when the page gives no carry (shot mode, or a bundle without one). */
export type CarrySeconds = ((blow: Blow) => number) | null;

const EPSILON = 1e-9;
/** Wall seconds spent crossing a rest position, so the first blow of the step is in progress at a phase of nearly 0 before its carry is measured. */
const NUDGE_SECONDS = 1e-6;
/** Pieces one frame is split into at most: a rest crossing, an approach window and a plain run per step boundary the frame crosses. */
const MAX_PIECES = 12;

/** True while the player moves `t` forward: continuous forward playback or a step animation toward a later integer. */
export function movingForward(player: TimelinePlayer): boolean {
  return player.playing === 'forward' || (player.target !== null && player.target > player.t);
}

/**
 * How much slower wall time runs for the first blow of the step `t` is in, while that blow is in its approach window: `approachWall / needed`, where `approachWall` is the window's plain wall time and `needed` the carry time at the player's speed; 1 when the window already lasts long enough. Null outside a first blow's approach window.
 */
function carryScale(making: Making, player: TimelinePlayer, carry: (blow: Blow) => number): { readonly scale: number; readonly windowEnd: number } | null {
  const current = making.current;
  if (current === null || current.phase >= APPROACH_END) return null;
  const index = Math.floor(player.t);
  const step = making.steps[index];
  if (step === undefined || step.blowCount === 0 || making.blowsApplied !== step.firstBlow) return null;
  const approachWall = (APPROACH_END * step.weight * BASE_SECONDS) / step.blowCount / player.speed;
  const needed = carry(current.blow) / player.speed;
  return { scale: needed > approachWall ? approachWall / needed : 1, windowEnd: index + APPROACH_END / step.blowCount };
}

/**
 * Advances the player by `seconds` of wall time and keeps the making at the player's position, stretching each step's first approach to its carry.
 * Backward moves, a null `carry` and a player at rest take the plain pace in one piece.
 */
export function advanceWithCarry(seconds: number, player: TimelinePlayer, making: Making, carry: CarrySeconds): void {
  if (!(seconds > 0)) return;
  let remaining = seconds;
  if (carry !== null && movingForward(player)) {
    for (let piece = 0; piece < MAX_PIECES && remaining > 0 && player.moving && movingForward(player); piece += 1) {
      const t = player.t;
      const index = Math.floor(t + EPSILON);
      const step = making.steps[index];
      if (step === undefined) break;
      if (Math.abs(t - index) <= EPSILON) {
        // At a rest position: cross it by a hair, so the incoming blow is in progress and its carry can be measured.
        player.update(NUDGE_SECONDS);
        remaining -= NUDGE_SECONDS;
        making.setTime(player.t);
        continue;
      }
      const secondsPerStep = (step.weight * BASE_SECONDS) / player.speed;
      const window = carryScale(making, player, carry);
      if (window !== null && window.scale < 1 && window.windowEnd > t + EPSILON) {
        // Inside the stretched approach window: at most to its end at the carry's pace.
        const wallToEnd = ((window.windowEnd - t) * secondsPerStep) / window.scale;
        if (remaining <= wallToEnd) {
          player.update(remaining * window.scale);
          remaining = 0;
          break;
        }
        player.update(wallToEnd * window.scale);
        remaining -= wallToEnd;
        making.setTime(player.t);
        continue;
      }
      // Plain pace, but no further than the end of this step, so the next step's first blow gets its own carry.
      const wallToBoundary = (index + 1 - t) * secondsPerStep;
      if (remaining <= wallToBoundary + EPSILON) {
        player.update(remaining);
        remaining = 0;
        break;
      }
      player.update(wallToBoundary);
      remaining -= wallToBoundary;
      making.setTime(player.t);
    }
  }
  if (remaining > 0) player.update(remaining);
  if (making.t !== player.t) making.setTime(player.t);
}
