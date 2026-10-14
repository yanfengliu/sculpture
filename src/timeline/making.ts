/**
 * The Making (docs/design/spec.md, Blows, strokes and steps; Undo and replay; src/contracts/making.ts): the plan, the replay and the evaluation at a timeline position `t`.
 * The plan comes from the plan file when the page found a usable one (`MakingOptions.plan`, src/timeline/plan-file.ts): every step's blows, the cells each step's end sweep takes off and the snapshot table. Without one, planning is step by step: a step's generator runs once, when the making first needs it, from the stock as the earlier steps left it, and the result is cached, so the blows at any `t` are the same whatever the history.
 * Forward moves apply blows in index order; backward moves restore the undo boxes. The undo log runs from the last snapshot the making loaded (the untouched block before any) to the cursor. With a snapshot table, a move whose target the log or a short replay cannot reach cheaply loads the latest snapshot at or before the target (src/stock/snapshot.ts), writes it into the grids, dirties the chunks that differ and replays the rest of that segment; `dirtyChunks` counts the load while it is out.
 * A forward move of fewer than JUMP_BLOWS blows applies on the calling thread at once. A longer one is a jump: its blows go chunk by chunk to the carve workers (src/timeline/jump.ts), the cursor stays until every chunk is back, `dirtyChunks` counts the chunks still out, and planning and the move toward `t` resume when the jump lands; with no pool (the tests) the jump runs in-process and `setTime` returns with the state applied.
 * A forward move never crosses a step boundary in one go: it stops at the end of the step it is in, serial or jump, and there the step's end sweep takes off every piece of stock connected to neither the figure nor the base, filed in that step's last blow's undo box (undoing that blow puts the pieces back), before the next step is planned from the swept stock: the sweep of src/stock/sweep.ts when the making plans, the plan file's list of the same cells when it has one (src/stock/swept-cells.ts).
 * Everything observable is a pure function of `t`: the grids, the chunk meshes, the poses and the chips (src/timeline/evaluate.ts), which src/timeline/making.test.ts and src/timeline/plan-build.test.ts assert after random histories.
 */
import type { Material, Object3D } from 'three';

import type { GridHeader } from '../contracts/grid';
import { BASE_SECONDS, type Blow, type BlowCycle, type ChipState, type Making, type PlanContext, type StageDef, type StepDef, type StepInfo, type ToolPose } from '../contracts/making';
import { applyBlow, type CarveState, type UndoBox, type UndoPart, undoBlow, undoBytes } from '../stock/carve';
import type { ChunkCarver } from '../stock/carve-jobs';
import { chunkLayout } from '../stock/chunks';
import { FNV_OFFSET, fnvBlow, fnvHex, seedOf } from '../stock/digest';
import { blockGrid, boxDistance, createFinishGrid, frameBlockBox, type Grid, latticeBlockBox, type WorldBox } from '../stock/grid';
import { type ChunkMesher, createDeferredMesher, createSyncMesher, Remesher } from '../stock/remesh';
import { applySnapshot } from '../stock/snapshot';
import { baseRowOf, StockSweeper } from '../stock/sweep';
import { sweptListOf, takeOffListed } from '../stock/swept-cells';
import { blowsStruck, type Cycles, cyclesOf } from './cycles';
import { chipsAt, currentAt, posesAt, type TimelineView } from './evaluate';
import { createDeferredCarver, createSyncCarver, figureChunkOf, type Jump, type JumpBlow, type JumpOutcome, startJump } from './jump';
import type { PlanSource, SnapshotEntry } from './plan-file';

export type { PlanSource } from './plan-file';
import { SNAPSHOT_LOAD_SECONDS, UNDO_BYTES_PER_SECOND } from './replay-cost';
import { SnapshotJumps } from './snapshot-jump';
import { checkSteps, stepInfo } from './step-info';

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
  /** The plan file's plan and snapshots; without it the making plans step by step and never loads a snapshot. */
  readonly plan?: PlanSource;
  /** What a snapshot load is taken to cost against a replay or an undo, seconds (SNAPSHOT_LOAD_SECONDS); the tests pass 0 to prefer snapshots. */
  readonly snapshotLoadSeconds?: number;
}

/** The Making plus what the engine's own tests, the build and the dev page read. */
export interface EngineMaking extends Making {
  readonly header: GridHeader | null;
  readonly figure: Grid;
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly remesher: Remesher;
  /** Bytes held by the undo log, and the blow index it starts at (the last snapshot loaded, 0 before any). */
  readonly undoBytes: number;
  readonly undoBase: number;
  /** Snapshots written into the grids so far. */
  readonly snapshotLoads: number;
  /** Where the plan came from: the plan file, or the generators in this process. */
  readonly planSource: 'file' | 'page';
  /** The block's lowest stone row at t = 0, a cell index along y: what the sweep counts as standing on the ground. */
  readonly baseRow: number;
  /** Blows of a planned step, for tests and tools. */
  blowsOf(step: number): readonly Blow[];
  /** The visible cycles of a planned step. */
  cyclesOf(step: number): Cycles;
  /** Cells the step's end sweep took off, once the cursor has reached that end; 0 before. */
  sweptCells(step: number): number;
  /** The step's end sweep as last run: its cells, milliseconds and chunks relabelled; null until the cursor has reached the step's end. */
  sweepOf(step: number): SweepRecord | null;
  dispose(): void;
}

export interface SweepRecord {
  readonly cells: number;
  readonly millis: number;
  readonly relabelled: number;
  /** The cells taken off, ascending global indices: what the plan file records. */
  readonly list: Uint32Array;
}

/** A forward move of this many blows or more goes to the carve workers. */
export const JUMP_BLOWS = 48;
const NO_CELLS = new Uint32Array(0);

export function createMaking(options: MakingOptions): EngineMaking {
  return new MakingImpl(options);
}

class MakingImpl implements EngineMaking, TimelineView {
  readonly stages: readonly StageDef[];
  readonly N: number;
  readonly header: GridHeader | null;
  readonly figure: Grid;
  readonly stock: Grid;
  readonly finish: Uint8Array;
  readonly remesher: Remesher;
  readonly stockObject: Object3D;
  readonly baseRow: number;
  readonly planSource: 'file' | 'page';
  steps: StepInfo[];
  readonly defs: readonly StepDef[];
  private readonly blowCycle: BlowCycle;
  private readonly block: WorldBox;
  private readonly state: CarveState;
  private readonly carver: ChunkCarver | null;
  private readonly jumpBlows: number;
  private readonly source: PlanSource | null;
  private readonly plans: (readonly Blow[] | null)[];
  /** First blow index of each step; for an unplanned step, the count planned before it. */
  private readonly starts: number[];
  private readonly undo: UndoBox[] = [];
  /** The sweeper labels components when the making plans; with a plan file the swept cells come listed and it is never built. */
  private readonly sweeper: StockSweeper | null;
  private readonly sweeps: (SweepRecord | null)[];
  private readonly jumps: SnapshotJumps | null;
  private jump: Jump | null = null;
  private wantAll = false;
  private cursor = 0;
  private base = 0;
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
    this.block = options.block ?? (options.header === undefined ? frameBlockBox() : latticeBlockBox(options.figure.spec));
    this.stock = blockGrid(options.figure.spec, this.block);
    this.finish = createFinishGrid(options.figure.spec);
    this.state = { stock: this.stock, finish: this.finish, chunks: chunkLayout(options.figure.spec) };
    this.source = options.plan ?? null;
    this.planSource = this.source === null ? 'page' : 'file';
    if (this.source !== null && (this.source.blows.length !== this.N || this.source.swept.length !== this.N)) {
      throw new Error(`the plan file holds ${String(this.source.blows.length)} steps and ${String(this.source.swept.length)} swept lists; the making runs ${String(this.N)} steps`);
    }
    this.sweeper = this.source === null ? new StockSweeper(this.state, this.figure) : null;
    this.baseRow = this.sweeper?.baseRow ?? baseRowOf(this.stock);
    this.sweeps = options.steps.map(() => null);
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
    this.jumpBlows = Math.max(1, options.jumpBlows ?? JUMP_BLOWS);
    this.remesher = new Remesher(this.state, options.material, mesher);
    this.stockObject = this.remesher.group;
    this.plans = options.steps.map(() => null);
    this.starts = options.steps.map(() => 0);
    this.steps = options.steps.map((step) => stepInfo(step, 0, 0));
    if (this.source !== null) this.source.blows.forEach((blows, s) => { this.adopt(s, this.planned, blows); });
    const host = { cursor: () => this.cursor, undoBase: () => this.base, undoSeconds: (target: number) => this.undoSeconds(target), write: (entry: SnapshotEntry, bytes: Uint8Array) => { this.writeSnapshot(entry, bytes); }, reset: () => { this.resetToBlock(); }, resume: () => { this.advance(); }, disposed: () => this.disposed };
    this.jumps = this.source === null ? null : new SnapshotJumps(this.source, options.snapshotLoadSeconds ?? SNAPSHOT_LOAD_SECONDS, host);
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
    return this.remesher.pending + (this.jump?.pending ?? 0) + (this.jumps?.loading === true ? 1 : 0);
  }

  get undoBytes(): number {
    return this.undoSize;
  }

  get undoBase(): number {
    return this.base;
  }

  get snapshotLoads(): number {
    return this.jumps?.loads ?? 0;
  }

  plan(step: number): readonly Blow[] | null {
    return this.plans[step] ?? null;
  }

  blowsOf(step: number): readonly Blow[] {
    return this.plans[step] ?? [];
  }

  sweptCells(step: number): number {
    return this.sweeps[step]?.cells ?? 0;
  }

  sweepOf(step: number): SweepRecord | null {
    return this.sweeps[step] ?? null;
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

  get current(): { readonly blow: Blow; readonly previous: Blow | null; readonly phase: number } | null {
    return currentAt(this, this.time);
  }

  /** The tools in use; at a rest position the tool the next step carries on, where its last blow left it; the page rests every tool not posed. */
  get poses(): readonly ToolPose[] {
    return posesAt(this, this.time, this.blowCycle);
  }

  get chips(): readonly ChipState[] {
    return chipsAt(this, this.time, this.blowCycle);
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

  /** Moves the state toward `time`, planning the steps on the way; returns early when a jump or a snapshot load is out, and resumes when it lands. */
  private advance(): void {
    if (this.jump !== null || this.jumps?.loading === true || this.disposed) return;
    for (;;) {
      const goal = this.nextGoal();
      if (goal === null) break;
      if (goal.plan === null) {
        const via = this.jumps?.reach(goal.target) ?? 'none';
        if (via === 'loading') return;
        if (via === 'applied') continue;
      }
      if (!this.moveTo(goal.target)) return;
      if (goal.plan === null) break;
      this.planStep(goal.plan, goal.target);
    }
    this.remesher.flush();
  }

  private adopt(s: number, start: number, blows: readonly Blow[]): void {
    const def = this.defs[s];
    if (def === undefined) return;
    this.plans[s] = blows;
    this.starts[s] = start;
    for (const blow of blows) this.digest = fnvBlow(this.digest, blow);
    this.planned += blows.length;
    this.steps = this.steps.map((entry, index) => (index === s ? stepInfo(def, start, blows.length) : entry));
  }

  private planStep(s: number, start: number): void {
    const def = this.defs[s];
    if (def === undefined) return;
    const context: PlanContext = { figure: this.figure, stock: this.stock, region: def.region, margin: def.margin, seed: seedOf(def.id), cell: this.stock.cell };
    this.adopt(s, start, def.plan(context));
  }

  /** Seconds the undo log takes to restore from the cursor back to blow `target`. */
  private undoSeconds(target: number): number {
    let bytes = 0;
    for (let n = Math.max(target, this.base); n < this.cursor; n += 1) {
      const box = this.undo[n - this.base];
      if (box !== undefined) bytes += undoBytes(box);
    }
    return bytes / UNDO_BYTES_PER_SECOND;
  }

  /** Writes a checked snapshot into the grids; the undo log starts again at its blow. */
  private writeSnapshot(entry: SnapshotEntry, bytes: Uint8Array): void {
    const outcome = applySnapshot(bytes, this.state, this.figure);
    this.cursor = entry.blow;
    this.base = entry.blow;
    this.undo.length = 0;
    this.undoSize = 0;
    this.dirty(outcome.dirty);
  }

  /** The untouched block, the undo log empty: where a backward move goes when neither the log nor a snapshot reaches its target. */
  private resetToBlock(): void {
    const block = this.block;
    this.stock.fill((x, y, z) => boxDistance(block, x, y, z));
    this.finish.fill(0);
    this.cursor = 0;
    this.base = 0;
    this.undo.length = 0;
    this.undoSize = 0;
    const all = Array.from({ length: this.state.chunks.total }, (_, id) => id);
    this.dirty(all);
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

  /** The plan index where the step holding blow `index` ends. */
  private stepEndAt(index: number): number {
    const step = this.stepOfBlow(index);
    const end = (this.starts[step] ?? 0) + (this.plans[step]?.length ?? 0);
    if (end <= index) throw new Error(`blow ${String(index)} is not planned; the plan holds ${String(this.planned)} blows`);
    return end;
  }

  /** Chunks whose cells changed: to remesh, and to label again before the next sweep. */
  private dirty(ids: readonly number[]): void {
    this.remesher.markDirty(ids);
    this.sweeper?.markDirty(ids);
  }

  /** Applies or undoes blows until `target` are applied, a step at a time with the sweep at each step's end; false when a move went to the workers as a jump and is still out. */
  private moveTo(target: number): boolean {
    while (this.cursor > target) {
      const box = this.undo.pop();
      if (box === undefined) {
        // The log starts at the last snapshot loaded; with no snapshot to reach `target` the making starts over from the block.
        this.resetToBlock();
        break;
      }
      this.undoSize -= undoBytes(box);
      this.dirty(undoBlow(this.state, box));
      this.cursor -= 1;
    }
    while (this.cursor < target) {
      const stop = Math.min(target, this.stepEndAt(this.cursor));
      if (this.carver !== null && stop - this.cursor >= this.jumpBlows) {
        if (!this.launchJump(stop)) return false;
        continue;
      }
      for (const { blow, margin } of this.blowsBetween(this.cursor, stop)) {
        const result = applyBlow(this.state, this.figure, blow, margin);
        this.undo.push(result.undo);
        this.undoSize += undoBytes(result.undo);
        this.dirty(result.dirty);
        this.cursor += 1;
      }
      this.sweepAtEnd();
    }
    return true;
  }

  /** When the blow just applied ended its step, takes the loose stock off and files the swept bytes after that blow's own parts in its undo box, so the box restores both; the next step then plans from the swept stock. */
  private sweepAtEnd(): void {
    const step = this.stepOfBlow(this.cursor - 1);
    if (this.cursor !== (this.starts[step] ?? 0) + (this.plans[step]?.length ?? 0)) return;
    const box = this.undo[this.undo.length - 1];
    if (box === undefined) return;
    const started = performance.now();
    let parts: readonly UndoPart[];
    let dirty: readonly number[];
    let list: Uint32Array;
    let relabelled = 0;
    if (this.sweeper === null) {
      list = this.source?.swept[step] ?? NO_CELLS;
      ({ parts, dirty } = takeOffListed(this.state, list));
    } else {
      const result = this.sweeper.sweep();
      ({ parts, dirty, relabelled } = result);
      list = sweptListOf(parts);
    }
    this.sweeps[step] = { cells: list.length, millis: performance.now() - started, relabelled, list };
    if (list.length === 0) return;
    this.undo[this.undo.length - 1] = { parts: [...box.parts, ...parts] };
    this.undoSize += undoBytes({ parts });
    this.dirty(dirty);
  }

  /** Sends blows [cursor, target) to the carver, never past the end of the cursor's step; true when the carver finished at once (the in-process one). */
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
    this.dirty(outcome.dirty);
    if (outcome.undo.length > 0) this.sweepAtEnd();
  }
}
