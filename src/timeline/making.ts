/**
 * The Making (docs/design/spec.md, Blows, strokes and steps; src/contracts/making.ts): the plan, the replay and the evaluation at a timeline position `t`.
 * Planning is step by step: a step's generator runs once, when the making first needs it, from the stock as the earlier steps left it, and the result is cached, so the blows at any `t` are the same whatever the history. Forward moves apply blows in index order; backward moves restore the undo boxes; the state is never snapshotted.
 * Step `i` at local progress `f = clamp(t - i, 0, 1)` has blow `k` in its window `[k / count, (k + 1) / count)`; the blow's cut applies when the position passes STRIKE_PHASE of that window, so at an integer `t` every blow of the completed steps is applied, and its cycle phase is the fractional position inside the window. Chips of a struck blow count seconds from its strike.
 * Everything observable is a pure function of `t`: the grids, the chunk meshes, the poses and the chips, which src/timeline/making.test.ts asserts after random histories.
 */
import type { Material, Object3D } from 'three';

import type { GridHeader } from '../contracts/grid';
import { BASE_SECONDS, type Blow, type BlowCycle, type ChipState, type Making, type PlanContext, type StageDef, type StepDef, type StepInfo, STRIKE_PHASE, type ToolPose } from '../contracts/making';
import { applyBlow, type CarveState, type UndoBox, undoBlow, undoBytes } from '../stock/carve';
import { chunkLayout } from '../stock/chunks';
import { FNV_OFFSET, fnvBlow, fnvHex, seedOf } from '../stock/digest';
import { blockGrid, createFinishGrid, frameBlockBox, type Grid, latticeBlockBox, type WorldBox } from '../stock/grid';
import { type ChunkMesher, createDeferredMesher, createSyncMesher, Remesher } from '../stock/remesh';

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
  /** Mesher workers; 0 or absent meshes on the calling thread (tests and the fallback). */
  readonly workers?: number;
  /** The block to carve; by default the lattice's block when a header is given, else the block of src/david/frame.ts. */
  readonly block?: WorldBox;
  /** A mesher to use instead of the pool, for tests and tools. */
  readonly mesher?: ChunkMesher;
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
  dispose(): void;
}

const TITLE_LIMIT = 48;
const DETAIL_LIMIT = 200;
/** Blows looked back for chips after the one in progress. */
const CHIP_LOOKBACK = 64;

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
  private readonly plans: (readonly Blow[] | null)[];
  /** First blow index of each step; for an unplanned step, the count planned before it. */
  private readonly starts: number[];
  private readonly undo: UndoBox[] = [];
  private cursor = 0;
  private time = 0;
  private digest = FNV_OFFSET;
  private planned = 0;
  private undoSize = 0;

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
    const mesher = options.mesher ?? (workers > 0 ? createDeferredMesher(import('../stock/pool').then((pool) => pool.createMesherPool(workers))) : createSyncMesher());
    this.remesher = new Remesher(this.state, options.material, mesher);
    this.stockObject = this.remesher.group;
    this.plans = options.steps.map(() => null);
    this.starts = options.steps.map(() => 0);
    this.steps = options.steps.map((step) => info(step, 0, 0));
    this.remesher.markAllDirty();
    // The first step is planned at once, so the page has its blows and the tool at rest from the first frame.
    this.moveTo(this.targetFor(0));
    this.remesher.flush();
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
    return this.remesher.pending;
  }

  get undoBytes(): number {
    return this.undoSize;
  }

  blowsOf(step: number): readonly Blow[] {
    return this.plans[step] ?? [];
  }

  onMeshed(listener: () => void): () => void {
    return this.remesher.onMeshed(listener);
  }

  dispose(): void {
    this.remesher.dispose();
  }

  planAll(): void {
    this.ensurePlanned(this.N - 1);
    this.moveTo(this.targetFor(this.time));
    this.remesher.flush();
  }

  setTime(t: number): void {
    if (!Number.isFinite(t)) return;
    this.time = Math.min(Math.max(t, 0), this.N);
    this.moveTo(this.targetFor(this.time));
    this.remesher.flush();
  }

  /** The blow in progress: step `i`, blow `index` within it, its phase and the step's position in blows; null at a rest position. */
  private progress(): { step: number; index: number; phase: number; count: number; position: number } | null {
    if (this.N === 0 || this.time >= this.N) return null;
    const step = Math.floor(this.time);
    const f = this.time - step;
    if (f <= 0) return null;
    const count = this.plans[step]?.length ?? 0;
    if (count === 0) return null;
    const position = f * count;
    const index = Math.min(Math.floor(position), count - 1);
    return { step, index, phase: Math.min(Math.max(position - index, 0), 1 - Number.EPSILON), count, position };
  }

  /** Blows of a step struck by `position` (blows into the step): those whose strike phase the position has passed. */
  private static struck(position: number, count: number): number {
    return Math.min(count, Math.max(0, Math.floor(position - STRIKE_PHASE) + 1));
  }

  get current(): { readonly blow: Blow; readonly phase: number } | null {
    const p = this.progress();
    if (p === null) return null;
    const blow = this.plans[p.step]?.[p.index];
    return blow === undefined ? null : { blow, phase: p.phase };
  }

  /** The tools in use; at a rest position none, and the page rests every tool not posed. */
  get poses(): readonly ToolPose[] {
    const p = this.progress();
    if (p === null) return [];
    const plan = this.plans[p.step] ?? [];
    const blow = plan[p.index];
    if (blow === undefined) return [];
    return this.blowCycle.posesAt(blow, p.index > 0 ? (plan[p.index - 1] ?? null) : null, p.phase);
  }

  get chips(): readonly ChipState[] {
    const p = this.progress();
    if (p === null) return [];
    const def = this.defs[p.step];
    const plan = this.plans[p.step] ?? [];
    if (def === undefined) return [];
    const secondsPerBlow = (def.weight * BASE_SECONDS) / p.count;
    const chips: ChipState[] = [];
    let emptyRun = 0;
    const struck = MakingImpl.struck(p.position, p.count);
    for (let j = struck - 1; j >= 0 && j >= struck - CHIP_LOOKBACK; j -= 1) {
      const blow = plan[j];
      if (blow === undefined) break;
      const secondsSince = (p.position - (j + STRIKE_PHASE)) * secondsPerBlow;
      const some = this.blowCycle.chipsAt(blow, secondsSince);
      if (some.length === 0) {
        emptyRun += 1;
        if (emptyRun >= 2) break;
        continue;
      }
      emptyRun = 0;
      chips.push(...some);
    }
    return chips;
  }

  /** The blow count a position asks for, planning the steps it needs on the way. */
  private targetFor(t: number): number {
    if (this.N === 0) return 0;
    const step = Math.min(Math.floor(t), this.N - 1);
    const f = Math.min(Math.max(t - step, 0), 1);
    this.ensurePlanned(step);
    const count = this.plans[step]?.length ?? 0;
    return (this.starts[step] ?? 0) + MakingImpl.struck(f * count, count);
  }

  /** Plans every step up to `last` that is not planned yet, each from the state the steps before it leave. */
  private ensurePlanned(last: number): void {
    for (let s = 0; s <= last && s < this.N; s += 1) {
      if (this.plans[s] !== null) continue;
      const start = s === 0 ? 0 : (this.starts[s - 1] ?? 0) + (this.plans[s - 1]?.length ?? 0);
      this.moveTo(start);
      this.planStep(s, start);
    }
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

  /** Applies or undoes blows until `target` are applied. */
  private moveTo(target: number): void {
    while (this.cursor > target) {
      const box = this.undo.pop();
      if (box === undefined) break;
      this.undoSize -= undoBytes(box);
      this.remesher.markDirty(undoBlow(this.state, box));
      this.cursor -= 1;
    }
    let step = this.cursor < target ? this.stepOfBlow(this.cursor) : 0;
    while (this.cursor < target) {
      while (step + 1 < this.N && this.plans[step + 1] !== null && (this.starts[step + 1] ?? 0) <= this.cursor) step += 1;
      const def = this.defs[step];
      const blow = this.plans[step]?.[this.cursor - (this.starts[step] ?? 0)];
      if (def === undefined || blow === undefined) throw new Error(`blow ${String(this.cursor)} is not planned; the plan holds ${String(this.planned)} blows`);
      const result = applyBlow(this.state, this.figure, blow, def.margin);
      this.undo.push(result.undo);
      this.undoSize += undoBytes(result.undo);
      this.remesher.markDirty(result.dirty);
      this.cursor += 1;
    }
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
