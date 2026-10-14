/**
 * What the Making shows at a timeline position besides the stock (docs/design/spec.md, Blows, strokes and steps; Tools): the cycle in progress, the tool poses and the chips, each a pure function of `t` and the planned steps. Carried out of src/timeline/making.ts so that file keeps to its line bound; the Making passes its plans in through `TimelineView`.
 * Step `i` at local progress `f = clamp(t - i, 0, 1)` plays in visible cycles (src/timeline/cycles.ts); the blow in progress is the cycle's first blow at the position's phase inside the window. A cycle approaches from the previous cycle's first blow; a step's first cycle approaches from the last cycle of the step before when the tool is unchanged and from the bench otherwise (`previousOf`); at the integer between two steps of one tool the tool is held where that last cycle left it (`heldPoses`). Chips of a struck cycle count seconds from its strike, and a young step still shows the chips of the previous step's last strikes; at an integer `t` nothing is in flight.
 */
import { BASE_SECONDS, type Blow, type BlowCycle, type ChipState, type StepDef, STRIKE_PHASE, type ToolPose } from '../contracts/making';
import { MAX_CHIP_SECONDS } from '../tools/chip-burst';
import type { Cycles } from './cycles';

/** Seconds of playing time at 1× looked back for chips, into the previous step when the current one is young: the longest any chip lives, so no chip of a struck cycle is dropped before it has faded. */
const CHIP_WINDOW_SECONDS = MAX_CHIP_SECONDS;
/** Blows of a cycle that launch chips, spread over the cycle's run, so a long run does not flood the pool. */
const CHIP_BLOWS_PER_CYCLE = 4;

/** The planned steps as the evaluation reads them. */
export interface TimelineView {
  readonly N: number;
  readonly defs: readonly StepDef[];
  /** The step's blows; null while it is unplanned. */
  plan(step: number): readonly Blow[] | null;
  cyclesOf(step: number): Cycles;
}

interface Progress {
  readonly step: number;
  /** The cycle in progress and the position in cycles into the step. */
  readonly cycle: number;
  readonly phase: number;
  readonly position: number;
  readonly cycles: Cycles;
  readonly count: number;
}

/** The cycle in progress; null at a rest position or in an unplanned step. */
function progressAt(view: TimelineView, time: number): Progress | null {
  if (view.N === 0 || time >= view.N) return null;
  const step = Math.floor(time);
  const f = time - step;
  if (f <= 0) return null;
  const count = view.plan(step)?.length ?? 0;
  if (count === 0) return null;
  const cycles = view.cyclesOf(step);
  const position = f * cycles.cycles;
  const cycle = Math.min(Math.floor(position), cycles.cycles - 1);
  return { step, cycle, phase: Math.min(Math.max(position - cycle, 0), 1 - Number.EPSILON), position, cycles, count };
}

/** The first blow of a planned step's last visible cycle, where its tool is shown at the step's end; null when the step is unplanned or empty. */
function lastCycleBlow(view: TimelineView, step: number): Blow | null {
  const plan = view.plan(step);
  if (plan === null || plan.length === 0) return null;
  const cycles = view.cyclesOf(step);
  return plan[(cycles.cycles - 1) * cycles.group] ?? null;
}

/** The blow the cycle around blow `index` of step `step` approaches from: the first blow of the step's previous cycle (`group` blows back); else the first blow of the last cycle of the step before when that step used the same tool, which is carried on rather than set down (docs/design/spec.md, Tools); else null, the bench. */
function previousOf(view: TimelineView, step: number, index: number, group: number): Blow | null {
  if (index > 0) return view.plan(step)?.[Math.max(0, index - group)] ?? null;
  if (step <= 0 || view.defs[step - 1]?.tool !== view.defs[step]?.tool) return null;
  return lastCycleBlow(view, step - 1);
}

/** The blow in progress at `time`, the blow its cycle approaches from and its phase; null at a rest position. */
export function currentAt(view: TimelineView, time: number): { readonly blow: Blow; readonly previous: Blow | null; readonly phase: number } | null {
  const p = progressAt(view, time);
  if (p === null) return null;
  const index = p.cycle * p.cycles.group;
  const blow = view.plan(p.step)?.[index];
  return blow === undefined ? null : { blow, previous: previousOf(view, p.step, index, p.cycles.group), phase: p.phase };
}

/** At an integer `t = k` inside the timeline where steps `k - 1` and `k` use one tool and both have blows: that tool and its mallet where step `k - 1`'s last cycle left them, the pose step `k`'s first blow starts from, so nothing jumps across the boundary (the 3.8 m jump to the bench of 2026-10-11, pinned in making.test.ts). Empty at every other rest position: the tools are down. */
function heldPoses(view: TimelineView, time: number, blowCycle: BlowCycle): readonly ToolPose[] {
  const k = time;
  if (!Number.isInteger(k) || k <= 0 || k >= view.N) return [];
  if ((view.plan(k)?.length ?? 0) === 0 || view.defs[k - 1]?.tool !== view.defs[k]?.tool) return [];
  const last = lastCycleBlow(view, k - 1);
  if (last === null) return [];
  const cycles = view.cyclesOf(k - 1);
  return blowCycle.posesAt(last, previousOf(view, k - 1, (cycles.cycles - 1) * cycles.group, cycles.group), 1 - Number.EPSILON);
}

/** The tools in use at `time`; at a rest position the tool the next step carries on, where its last blow left it (`heldPoses`). */
export function posesAt(view: TimelineView, time: number, blowCycle: BlowCycle): readonly ToolPose[] {
  const p = progressAt(view, time);
  if (p === null) return heldPoses(view, time, blowCycle);
  const index = p.cycle * p.cycles.group;
  const blow = view.plan(p.step)?.[index];
  if (blow === undefined) return [];
  return blowCycle.posesAt(blow, previousOf(view, p.step, index, p.cycles.group), p.phase);
}

/** The chips in flight or at rest at `time`. */
export function chipsAt(view: TimelineView, time: number, blowCycle: BlowCycle): readonly ChipState[] {
  const p = progressAt(view, time);
  if (p === null) return [];
  const chips: ChipState[] = [];
  const secondsPerCycle = ((view.defs[p.step]?.weight ?? 1) * BASE_SECONDS) / p.cycles.cycles;
  const struckCycles = Math.min(p.cycles.cycles, Math.max(0, Math.floor(p.position - STRIKE_PHASE) + 1));
  const collect = (step: number, cycle: number, cycles: Cycles, secondsSince: number): void => {
    const plan = view.plan(step) ?? [];
    const first = cycle * cycles.group;
    const size = Math.min(cycles.group, plan.length - first);
    const stride = Math.max(1, Math.ceil(size / CHIP_BLOWS_PER_CYCLE));
    for (let j = first; j < first + size; j += stride) {
      const blow = plan[j];
      if (blow === undefined) break;
      chips.push(...blowCycle.chipsAt(blow, secondsSince));
    }
  };
  // Every struck cycle within the window, newest first: a chip's life is its own, so an older cycle's chips may outlive a newer one's, and only the window ends the walk.
  for (let c = struckCycles - 1; c >= 0; c -= 1) {
    const secondsSince = (p.position - (c + STRIKE_PHASE)) * secondsPerCycle;
    if (secondsSince > CHIP_WINDOW_SECONDS) return chips;
    collect(p.step, c, p.cycles, secondsSince);
  }
  // The previous step's last strikes are still in the air when this step is young.
  const previous = p.step - 1;
  if (previous < 0 || view.plan(previous) === null) return chips;
  const before = view.cyclesOf(previous);
  const elapsed = p.position * secondsPerCycle;
  const secondsPerPrevious = ((view.defs[previous]?.weight ?? 1) * BASE_SECONDS) / Math.max(1, before.cycles);
  for (let c = before.cycles - 1; c >= 0; c -= 1) {
    const secondsSince = elapsed + (before.cycles - (c + STRIKE_PHASE)) * secondsPerPrevious;
    if (secondsSince > CHIP_WINDOW_SECONDS) break;
    collect(previous, c, before, secondsSince);
  }
  return chips;
}
