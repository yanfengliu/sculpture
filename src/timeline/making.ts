/**
 * The Making (docs/design/spec.md, Blows, strokes and steps; src/contracts/making.ts): the plan, the replay and the evaluation at a timeline position `t`.
 * Planning is step by step: a step's generator runs once, when the making first needs it, from the stock as the earlier steps left it, and the result is cached, so the blows at any `t` are the same whatever the history. Forward moves apply blows in index order; backward moves restore the undo boxes; the state is never snapshotted.
 * A forward move of fewer than JUMP_BLOWS blows applies on the calling thread at once. A longer one is a jump: its blows go chunk by chunk to the carve workers (src/timeline/jump.ts), the cursor stays until every chunk is back, `dirtyChunks` counts the chunks still out, and planning and the move toward `t` resume when the jump lands; with no pool (the tests) the jump runs in-process and `setTime` returns with the state applied.
 * Step `i` at local progress `f = clamp(t - i, 0, 1)` plays in visible cycles (src/timeline/cycles.ts): cycle `c` has the window `[c / cycles, (c + 1) / cycles)`, its blows apply in order when the position passes STRIKE_PHASE of that window, so at an integer `t` every blow of the completed steps is applied; the blow in progress is the cycle's first blow at the position's phase inside the window. Chips of a struck cycle count seconds from its strike, and a young step still shows the chips of the previous step's last strikes; at an integer `t` nothing is in flight.
 * A cycle approaches from the previous cycle's first blow; a step's first cycle approaches from the last cycle of the step before when the tool is unchanged and from the bench otherwise (`previousOf`); at the integer between two steps of one tool the tool is held where that last cycle left it (`heldPoses`), so nothing jumps across a step boundary.
 * Everything observable is a pure function of `t`: the grids, the chunk meshes, the poses and the chips, which src/timeline/making.test.ts asserts after random histories.
 */
import type { Material, Object3D } from 'three';

import type { GridHeader } from '../contracts/grid';
import { BASE_SECONDS, type Blow, type BlowCycle, type ChipState, type Making, type PlanContext, type StageDef, type StepDef, type StepInfo, STRIKE_PHASE, type ToolPose } from '../contracts/making';
import { applyBlow, type CarveState, type UndoBox, undoBlow, undoBytes } from '../stock/carve';
import type { ChunkCarver } from '../stock/carve-jobs';
import { chunkLayout } from '../stock/chunks';
import { FNV_OFFSET, fnvBlow, fnvHex, seedOf } from '../stock/digest';
import { blockGrid, createFinishGrid, frameBlockBox, type Grid, latticeBlockBox, type WorldBox } from '../stock/grid';
import { type ChunkMesher, createDeferredMesher, createSyncMesher, Remesher } from '../stock/remesh';
import { MAX_CHIP_SECONDS } from '../tools/chip-burst';
import { blowsStruck, type Cycles, cyclesOf } from './cycles';
import { createDeferredCarver, createSyncCarver, figureChunkOf, type Jump, type JumpBlow, type JumpOutcome, startJump } from './jump';

export interface MakingOptions {
  /** The figure's distance grid; the stock takes its lattice. */
  readonly figure: Grid;
  /** The figure's header when it was loaded from the pipeline's files; its lattice then implies the block. */
  readonly header?: GridHeader;
  readonly steps: readonly StepDef[];
  readonly stages: readonly StageDef[];
  readonly blowCycle: BlowCycle;
  /** The stock's material; the page passes its marble, the dev page a plain flat-shaded one. */
  readonly material: Material;
  /** Engine workers; 0 or absent meshes on the calling thread and jumps in-process (tests and the fallback). */
  readonly workers?: number;
  /** The block to carve; by default the lattice's block when a header is given, else the block of src/david/frame.ts. */
  readonly block?: WorldBox;
  /** A mesher to use instead of the pool, for tests and tools. */
  readonly mesher?: ChunkMesher;
  /** A carver to use instead of the pool, or `in-process` for the one that runs the chunk jobs on the calling thread; the tests pass it with a low `jumpBlows` to exercise the jump path synchronously. */
  readonly carver?: ChunkCarver | 'in-process';
  readonly jumpBlows?: number;
}

/** The Making plus what the engine's own tests and dev page read. */
export interface EngineMaking extends Making {
  readonly header: GridHeader | null;
  readonly figure: Grid;
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly remesher: Remesher;
  /** Bytes held by the undo log. */
  readonly undoBytes: number;
  /** Blows of a planned step, for tests and tools. */
  blowsOf(step: number): readonly Blow[];
  /** The visible cycles of a planned step. */
  cyclesOf(step: number): Cycles;
  dispose(): void;
}

const TITLE_LIMIT = 48;
const DETAIL_LIMIT = 200;
/** Seconds of playing time at 1× looked back for chips, into the previous step when the current one is young: the longest any chip lives, so no chip of a struck cycle is dropped before it has faded. */
const CHIP_WINDOW_SECONDS = MAX_CHIP_SECONDS;
/** Blows of a cycle that launch chips, spread over the cycle's run, so a long run does not flood the pool. */
const CHIP_BLOWS_PER_CYCLE = 4;
/** A forward move of this many blows or more goes to the carve workers. */
export const JUMP_BLOWS = 48;

export function createMaking(options: MakingOptions): EngineMaking {
  return new MakingImpl(options);
}

function checkSteps(steps: readonly StepDef[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(step.id)) throw new Error(`step id "${step.id}" is not kebab-case`);
    if (seen.has(step.id)) throw new Error(`step id "${step.id}" is used twice`);
    seen.add(step.id);
    if (step.title.length > TITLE_LIMIT) throw new Error(`step "${step.id}" has a title of ${String(step.title.length)} characters; the limit is ${String(TITLE_LIMIT)}`);
    if (step.detail.length > DETAIL_LIMIT) throw new Error(`step "${step.id}" has a detail of ${String(step.detail.length)} characters; the limit is ${String(DETAIL_LIMIT)}`);
    if (!(step.weight > 0)) throw new Error(`step "${step.id}" needs a positive weight`);
  }
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

class MakingImpl implements EngineMaking {
  readonly stages: readonly StageDef[];
  readonly N: number;
  readonly header: GridHeader | null;
  readonly figure: Grid;
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly remesher: Remesher;
  readonly stockObject: Object3D;
  steps: StepInfo[];
  private readonly defs: readonly StepDef[];
  private readonly blowCycle: BlowCycle;
  private readonly state: CarveState;
  private readonly carver: ChunkCarver | null;
  private readonly jumpBlows: number;
  private readonly plans: (readonly Blow[] | null)[];
  /** First blow index of each step; for an unplanned step, the count planned before it. */
  private readonly starts: number[];
  private readonly undo: UndoBox[] = [];
  private jump: Jump | null = null;
  private wantAll = false;
  private cursor = 0;
  private time = 0;
  private digest = FNV_OFFSET;
  private planned = 0;
  private undoSize = 0;
  private disposed = false;

  constructor(options: MakingOptions) {
    checkSteps(options.steps);
    this.defs = options.steps;
    this.stages = options.stages;
    this.N = options.steps.length;
    this.header = options.header ?? null;
    this.figure = options.figure;
    this.blowCycle = options.blowCycle;
    const block = options.block ?? (options.header === undefined ? frameBlockBox() : latticeBlockBox(options.figure.spec));
    this.stock = blockGrid(options.figure.spec, block);
    this.finish = createFinishGrid(options.figure.spec);
    this.state = { stock: this.stock, finish: this.finish, chunks: chunkLayout(options.figure.spec) };
    const workers = options.workers ?? 0;
    let mesher = options.mesher ?? createSyncMesher();
    let carver: ChunkCarver | null = options.carver === 'in-process' ? createSyncCarver(this.figure, this.state) : (options.carver ?? null);
    if (options.mesher === undefined && workers > 0) {
      const pool = import('../stock/pool').then((module) => module.createEnginePool(workers, figureChunkOf(this.figure, this.state), this.state.chunks.counts));
      mesher = createDeferredMesher(pool.then((p) => p.mesher));
      carver = createDeferredCarver(
        pool.then((p) => p.carver),
        createSyncCarver(this.figure, this.state),
      );
    }
    this.carver = carver;
    this.jumpBlows = options.jumpBlows ?? JUMP_BLOWS;
    this.remesher = new Remesher(this.state, options.material, mesher);
    this.stockObject = this.remesher.group;
    this.plans = options.steps.map(() => null);
    this.starts = options.steps.map(() => 0);
    this.steps = options.steps.map((step) => info(step, 0, 0));
    this.remesher.markAllDirty();
    // The first step is planned at once, so the page has its blows and the tool at rest from the first frame.
    this.advance();
  }

  get planLength(): number {
    return this.planned;
  }

  get planDigest(): string {
    return fnvHex(this.digest);
  }

  get t(): number {
    return this.time;
  }

  get blowsApplied(): number {
    return this.cursor;
  }

  get dirtyChunks(): number {
    return this.remesher.pending + (this.jump?.pending ?? 0);
  }

  get undoBytes(): number {
    return this.undoSize;
  }

  blowsOf(step: number): readonly Blow[] {
    return this.plans[step] ?? [];
  }

  cyclesOf(step: number): Cycles {
    return cyclesOf(this.plans[step]?.length ?? 0, (this.defs[step]?.weight ?? 1) * BASE_SECONDS);
  }

  onMeshed(listener: () => void): () => void {
    return this.remesher.onMeshed(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.jump?.cancel();
    this.jump = null;
    this.remesher.dispose();
    this.carver?.dispose();
  }

  planAll(): void {
    this.wantAll = true;
    this.advance();
  }

  setTime(t: number): void {
    if (!Number.isFinite(t)) return;
    this.time = Math.min(Math.max(t, 0), this.N);
    this.advance();
  }

  /** The cycle in progress; null at a rest position or in an unplanned step. */
  private progress(): Progress | null {
    if (this.N === 0 || this.time >= this.N) return null;
    const step = Math.floor(this.time);
    const f = this.time - step;
    if (f <= 0) return null;
    const count = this.plans[step]?.length ?? 0;
    if (count === 0) return null;
    const cycles = this.cyclesOf(step);
    const position = f * cycles.cycles;
    const cycle = Math.min(Math.floor(position), cycles.cycles - 1);
    return { step, cycle, phase: Math.min(Math.max(position - cycle, 0), 1 - Number.EPSILON), position, cycles, count };
  }

  get current(): { readonly blow: Blow; readonly previous: Blow | null; readonly phase: number } | null {
    const p = this.progress();
    if (p === null) return null;
    const index = p.cycle * p.cycles.group;
    const blow = this.plans[p.step]?.[index];
    return blow === undefined ? null : { blow, previous: this.previousOf(p.step, index, p.cycles.group), phase: p.phase };
  }

  /** The tools in use; at a rest position the tool the next step carries on, where its last blow left it (`heldPoses`); the page rests every tool not posed. */
  get poses(): readonly ToolPose[] {
    const p = this.progress();
    if (p === null) return this.heldPoses();
    const index = p.cycle * p.cycles.group;
    const blow = this.plans[p.step]?.[index];
    if (blow === undefined) return [];
    return this.blowCycle.posesAt(blow, this.previousOf(p.step, index, p.cycles.group), p.phase);
  }

  /** The blow the cycle around blow `index` of step `step` approaches from: the first blow of the step's previous cycle (`group` blows back); else the first blow of the last cycle of the step before when that step used the same tool, which is carried on rather than set down (docs/design/spec.md, Tools); else null, the bench. */
  private previousOf(step: number, index: number, group: number): Blow | null {
    if (index > 0) return this.plans[step]?.[Math.max(0, index - group)] ?? null;
    if (step <= 0 || this.defs[step - 1]?.tool !== this.defs[step]?.tool) return null;
    return this.lastCycleBlow(step - 1);
  }

  /** The first blow of a planned step's last visible cycle, where its tool is shown at the step's end; null when the step is unplanned or empty. */
  private lastCycleBlow(step: number): Blow | null {
    const plan = this.plans[step];
    if (plan === null || plan === undefined || plan.length === 0) return null;
    const cycles = this.cyclesOf(step);
    return plan[(cycles.cycles - 1) * cycles.group] ?? null;
  }

  /** At an integer `t = k` inside the timeline where steps `k - 1` and `k` use one tool and both have blows: that tool and its mallet where step `k - 1`'s last cycle left them, the pose step `k`'s first blow starts from, so nothing jumps across the boundary (the 3.8 m jump to the bench of 2026-10-11, pinned in making.test.ts). Empty at every other rest position: the tools are down. */
  private heldPoses(): readonly ToolPose[] {
    const k = this.time;
    if (!Number.isInteger(k) || k <= 0 || k >= this.N) return [];
    if ((this.plans[k]?.length ?? 0) === 0 || this.defs[k - 1]?.tool !== this.defs[k]?.tool) return [];
    const last = this.lastCycleBlow(k - 1);
    if (last === null) return [];
    const cycles = this.cyclesOf(k - 1);
    return this.blowCycle.posesAt(last, this.previousOf(k - 1, (cycles.cycles - 1) * cycles.group, cycles.group), 1 - Number.EPSILON);
  }

  get chips(): readonly ChipState[] {
    const p = this.progress();
    if (p === null) return [];
    const chips: ChipState[] = [];
    const secondsPerCycle = ((this.defs[p.step]?.weight ?? 1) * BASE_SECONDS) / p.cycles.cycles;
    const struckCycles = Math.min(p.cycles.cycles, Math.max(0, Math.floor(p.position - STRIKE_PHASE) + 1));
    const collect = (step: number, cycle: number, cycles: Cycles, secondsSince: number): void => {
      const plan = this.plans[step] ?? [];
      const first = cycle * cycles.group;
      const size = Math.min(cycles.group, plan.length - first);
      const stride = Math.max(1, Math.ceil(size / CHIP_BLOWS_PER_CYCLE));
      for (let j = first; j < first + size; j += stride) {
        const blow = plan[j];
        if (blow === undefined) break;
        chips.push(...this.blowCycle.chipsAt(blow, secondsSince));
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
    if (previous < 0 || this.plans[previous] === null) return chips;
    const before = this.cyclesOf(previous);
    const elapsed = p.position * secondsPerCycle;
    const secondsPerPrevious = ((this.defs[previous]?.weight ?? 1) * BASE_SECONDS) / Math.max(1, before.cycles);
    for (let c = before.cycles - 1; c >= 0; c -= 1) {
      const secondsSince = elapsed + (before.cycles - (c + STRIKE_PHASE)) * secondsPerPrevious;
      if (secondsSince > CHIP_WINDOW_SECONDS) break;
      collect(previous, c, before, secondsSince);
    }
    return chips;
  }

  /** The blow count a position asks for, once its step is planned. */
  private targetFor(t: number): number {
    if (this.N === 0) return 0;
    const step = Math.min(Math.floor(t), this.N - 1);
    const f = Math.min(Math.max(t - step, 0), 1);
    const count = this.plans[step]?.length ?? 0;
    const cycles = this.cyclesOf(step);
    return (this.starts[step] ?? 0) + blowsStruck(f * cycles.cycles, cycles, count);
  }

  /** The next thing to do toward `time` and the plan: a step to plan (with the blow count its start needs applied), or the final target. */
  private nextGoal(): { target: number; plan: number | null } | null {
    if (this.N === 0) return null;
    const last = this.wantAll ? this.N - 1 : Math.min(Math.floor(this.time), this.N - 1);
    for (let s = 0; s <= last; s += 1) {
      if (this.plans[s] !== null) continue;
      const start = s === 0 ? 0 : (this.starts[s - 1] ?? 0) + (this.plans[s - 1]?.length ?? 0);
      return { target: start, plan: s };
    }
    return { target: this.targetFor(this.time), plan: null };
  }

  /** Moves the state toward `time`, planning the steps on the way; returns early when a jump is in flight, and resumes when it lands. */
  private advance(): void {
    if (this.jump !== null || this.disposed) return;
    for (;;) {
      const goal = this.nextGoal();
      if (goal === null) break;
      if (!this.moveTo(goal.target)) return;
      if (goal.plan === null) break;
      this.planStep(goal.plan, goal.target);
    }
    this.remesher.flush();
  }

  private planStep(s: number, start: number): void {
    const def = this.defs[s];
    if (def === undefined) return;
    const context: PlanContext = { figure: this.figure, stock: this.stock, region: def.region, margin: def.margin, seed: seedOf(def.id), cell: this.stock.cell };
    const blows = def.plan(context);
    this.plans[s] = blows;
    this.starts[s] = start;
    for (const blow of blows) this.digest = fnvBlow(this.digest, blow);
    this.planned += blows.length;
    this.steps = this.steps.map((entry, index) => (index === s ? info(def, start, blows.length) : entry));
  }

  private stepOfBlow(index: number): number {
    let step = 0;
    while (step + 1 < this.N && this.plans[step + 1] !== null && (this.starts[step + 1] ?? 0) <= index) step += 1;
    return step;
  }

  /** The planned blows from `from` to `to` with their steps' margins. */
  private blowsBetween(from: number, to: number): JumpBlow[] {
    const out: JumpBlow[] = [];
    let step = this.stepOfBlow(from);
    for (let n = from; n < to; n += 1) {
      while (step + 1 < this.N && this.plans[step + 1] !== null && (this.starts[step + 1] ?? 0) <= n) step += 1;
      const def = this.defs[step];
      const blow = this.plans[step]?.[n - (this.starts[step] ?? 0)];
      if (def === undefined || blow === undefined) throw new Error(`blow ${String(n)} is not planned; the plan holds ${String(this.planned)} blows`);
      out.push({ blow, margin: def.margin });
    }
    return out;
  }

  /** Applies or undoes blows until `target` are applied; false when the move went to the workers as a jump and is still out. */
  private moveTo(target: number): boolean {
    while (this.cursor > target) {
      const box = this.undo.pop();
      if (box === undefined) break;
      this.undoSize -= undoBytes(box);
      this.remesher.markDirty(undoBlow(this.state, box));
      this.cursor -= 1;
    }
    if (this.cursor >= target) return true;
    if (this.carver !== null && target - this.cursor >= this.jumpBlows) return this.launchJump(target);
    for (const { blow, margin } of this.blowsBetween(this.cursor, target)) {
      const result = applyBlow(this.state, this.figure, blow, margin);
      this.undo.push(result.undo);
      this.undoSize += undoBytes(result.undo);
      this.remesher.markDirty(result.dirty);
      this.cursor += 1;
    }
    return true;
  }

  /** Sends blows [cursor, target) to the carver; true when the carver finished at once (the in-process one). */
  private launchJump(target: number): boolean {
    if (this.carver === null) return true;
    let synchronous = true;
    const landed: { outcome: JumpOutcome | null } = { outcome: null };
    const jump = startJump(this.state, this.figure, this.carver, this.blowsBetween(this.cursor, target), this.cursor, (outcome) => {
      if (synchronous) {
        landed.outcome = outcome;
        return;
      }
      if (this.disposed) return;
      this.jump = null;
      this.land(outcome);
      this.advance();
    });
    synchronous = false;
    if (landed.outcome !== null) {
      this.land(landed.outcome);
      return true;
    }
    this.jump = jump;
    return false;
  }

  private land(outcome: JumpOutcome): void {
    for (const box of outcome.undo) {
      this.undo.push(box);
      this.undoSize += undoBytes(box);
      this.cursor += 1;
    }
    this.remesher.markDirty(outcome.dirty);
  }
}

function info(step: StepDef, firstBlow: number, blowCount: number): StepInfo {
  return {
    id: step.id,
    stage: step.stage,
    title: step.title,
    detail: step.detail,
    tool: step.tool,
    blowsPerShown: step.blowsPerShown,
    weight: step.weight,
    calendar: step.calendar,
    ...(step.focus === undefined ? {} : { focus: step.focus }),
    firstBlow,
    blowCount,
  };
}
