/**
 * Snapshot loads for the Making (docs/design/spec.md, Undo and replay): which snapshot of the plan file's table reaches a target sooner than the undo log or a replay from the cursor, its load (at once, or later through the page's loader, src/stock/snapshot-loader.ts), and what happens when one cannot be used: it is set aside with a logged reason and the making replays instead, from the untouched block when the snapshot failed half written. Carried out of src/timeline/making.ts so that file keeps to its line bound.
 */
import { snapshotInfo } from '../stock/snapshot';
import type { PlanSource, SnapshotEntry } from './plan-file';
import { replaySecondsBetween } from './replay-cost';

/** What the loads need of the Making. */
export interface SnapshotHost {
  /** Blows applied, and the blow the undo log starts at. */
  cursor(): number;
  undoBase(): number;
  /** Seconds the undo log takes to restore from the cursor back to blow `target`. */
  undoSeconds(target: number): number;
  /** Writes a checked snapshot into the grids and starts the undo log again at its blow; throws when the bytes fail while being written. */
  write(entry: SnapshotEntry, bytes: Uint8Array): void;
  /** The untouched block with the undo log empty. */
  reset(): void;
  /** Moves on toward the position after a load that landed later. */
  resume(): void;
  disposed(): boolean;
}

export type Reach = 'loading' | 'applied' | 'none';

export class SnapshotJumps {
  private readonly broken = new Set<number>();
  private pending = false;
  private count = 0;

  constructor(
    private readonly source: PlanSource,
    /** What a load is taken to cost against a replay or an undo, seconds. */
    private readonly loadSeconds: number,
    private readonly host: SnapshotHost,
  ) {}

  /** True while a load is out. */
  get loading(): boolean {
    return this.pending;
  }

  /** Snapshots written so far. */
  get loads(): number {
    return this.count;
  }

  /** Starts a load when a snapshot reaches blow `target` sooner than the undo log or a replay from the cursor: 'loading' while it is out, 'applied' when it landed at once (or failed and the state moved), 'none' to move from the cursor. */
  reach(target: number): Reach {
    const cursor = this.host.cursor();
    if (target === cursor) return 'none';
    const index = this.latestAtOrBefore(target);
    const entry = this.source.snapshots[index];
    if (entry === undefined) return 'none';
    const table = this.source.snapshots;
    if (target > cursor) {
      if (entry.blow <= cursor || replaySecondsBetween(table, cursor, entry.blow) < this.loadSeconds) return 'none';
    } else if (target >= this.host.undoBase() && this.host.undoSeconds(target) < this.loadSeconds + replaySecondsBetween(table, entry.blow, target)) {
      return 'none';
    }
    let got: Uint8Array | Promise<Uint8Array>;
    try {
      got = this.source.load(entry);
    } catch (error: unknown) {
      this.failed(index, error);
      return 'applied';
    }
    if (got instanceof Uint8Array) {
      this.land(index, got);
      return 'applied';
    }
    this.pending = true;
    got.then(
      (bytes) => {
        if (this.host.disposed()) return;
        this.pending = false;
        this.land(index, bytes);
        this.host.resume();
      },
      (error: unknown) => {
        if (this.host.disposed()) return;
        this.pending = false;
        this.failed(index, error);
        this.host.resume();
      },
    );
    return 'loading';
  }

  /** The latest usable snapshot at or before blow `target`, as an index into the table; −1 when none is. */
  private latestAtOrBefore(target: number): number {
    const table = this.source.snapshots;
    for (let n = table.length - 1; n >= 0; n -= 1) if ((table[n]?.blow ?? Number.POSITIVE_INFINITY) <= target && !this.broken.has(n)) return n;
    return -1;
  }

  /** Writes a loaded snapshot: one that fails its checks is set aside; one that fails while being written leaves the grids half written, so they go back to the untouched block. */
  private land(index: number, bytes: Uint8Array): void {
    const entry = this.source.snapshots[index];
    if (entry === undefined) return;
    try {
      const info = snapshotInfo(bytes);
      if (info.blow !== entry.blow) throw new Error(`it holds the state after ${String(info.blow)} blows and the table says ${String(entry.blow)}`);
    } catch (error: unknown) {
      this.failed(index, error);
      return;
    }
    try {
      this.host.write(entry, bytes);
      this.count += 1;
    } catch (error: unknown) {
      this.failed(index, error);
      this.host.reset();
    }
  }

  private failed(index: number, error: unknown): void {
    this.broken.add(index);
    const entry = this.source.snapshots[index];
    console.error(`snapshot ${entry?.file ?? String(index)} (blow ${String(entry?.blow)}) is not used, the making replays instead: ${error instanceof Error ? error.message : String(error)}. If the plan file is stale or damaged, npm run model:plan rebuilds it with its snapshots.`);
  }
}
