/**
 * Visible cycles of a step (docs/design/spec.md, Product; docs/research/decisions.md, Time and scale): the mallet strikes about STRIKES_PER_SECOND times a second at 1×, and each visible strike applies a run of planned blows along the stroke's path.
 * A step with `count` planned blows playing for `seconds` at 1× is cut into cycles of `group` consecutive blows; cycle `c` occupies the window `[c / cycles, (c + 1) / cycles)` of the step's local progress, and every blow of the group applies, in order, when the position passes STRIKE_PHASE of that window. A short step (fewer blows than strikes) keeps one blow per cycle.
 * Pure arithmetic, so the Making's evaluation stays a function of `t`.
 */
import { STRIKE_PHASE } from '../contracts/making';

/** Visible strikes a second at 1× (docs/research/decisions.md, Time and scale). */
export const STRIKES_PER_SECOND = 4;

export interface Cycles {
  /** Visible cycles in the step. */
  readonly cycles: number;
  /** Planned blows each cycle applies; the last cycle may apply fewer. */
  readonly group: number;
}

export function cyclesOf(count: number, seconds: number): Cycles {
  if (count <= 0) return { cycles: 0, group: 1 };
  const wanted = Math.max(1, Math.round(seconds * STRIKES_PER_SECOND));
  const group = Math.max(1, Math.ceil(count / wanted));
  return { cycles: Math.ceil(count / group), group };
}

/** Blows applied by `position` cycles into the step: every blow of the cycles whose strike phase the position has passed. */
export function blowsStruck(position: number, cycles: Cycles, count: number): number {
  const struck = Math.min(cycles.cycles, Math.max(0, Math.floor(position - STRIKE_PHASE) + 1));
  return Math.min(count, struck * cycles.group);
}
