/**
 * How long the page's worker pool takes to replay a run of blows (docs/design/spec.md, Budgets; Undo and replay): the build (src/timeline/plan-build.ts) places a snapshot inside a step wherever a segment's replay would otherwise exceed SEGMENT_SECONDS, and the Making weighs a snapshot load against a replay or an undo with the same figures.
 * The estimate is deterministic, so a rebuild places the snapshots where the last build did: a jump carves each chunk its blows touch in one worker job (src/timeline/jump.ts), so a run of blows costs the larger of its kernel time spread over the pool and its busiest chunk's kernel time, plus the main thread's share per chunk job and per blow. Kernel time is the cells of each blow's dilated box inside each chunk times its tool's nanoseconds per cell, measured single-threaded in Node over the David plan of 2026-10-14 (KERNEL_NS_PER_CELL). The pool's figures are set on the safe side: the segments of that plan sum to 19.2 s estimated, and the page's eight workers replayed the whole plan in about 14 s, so an estimate runs about 1.4 times the replay on this machine (scripts/build-plan.mjs logs every segment's estimate).
 */
import type { GridSpec } from '../contracts/grid';
import type { Blow, ToolId } from '../contracts/making';
import { dilatedBox, volumeOf } from '../stock/carve';
import { chunksCovering, chunkStart } from '../stock/carve-jobs';
import type { ChunkLayout } from '../stock/chunks';
import type { Grid } from '../stock/grid';
import { CHUNK_CELLS } from '../stock/mesher';
import type { SnapshotEntry } from './plan-file';

/** A segment between two snapshots is estimated to replay in about this long on the page's pool (about 0.35 s measured on this machine): with 1 s the slowest of the spec's random jumps took 3.1 s while the other worktrees ran their suites (2026-10-14), the replay being the part of a jump the snapshots can shorten. */
export const SEGMENT_SECONDS = 0.5;
/** What a snapshot load is taken to cost the page beyond the replay after it: the fetch, the inflate and SHA-256 check in a worker and the write into the grids of a 12 to 20 MB snapshot; a load at t = N was ready about 1 s after the first frame on 2026-10-14, remeshing included. */
export const SNAPSHOT_LOAD_SECONDS = 0.35;
/** How fast the undo log restores bytes, remeshing included (about 175 MB from t = N to 0 in 1.9 to 2.7 s, measured 2026-10-13 and 14). */
export const UNDO_BYTES_PER_SECOND = 80e6;
/** Kernel nanoseconds per dilated-box cell, by tool, single-threaded in Node 24 on the David plan of 2026-10-14: each step's kernel milliseconds over its blows' box cells (30 to 176 ns), rounded up. */
const KERNEL_NS_PER_CELL: Readonly<Record<ToolId, number>> = {
  charcoal: 170,
  point: 65,
  'two-tooth': 50,
  claw: 45,
  'fine-claw': 80,
  roundel: 140,
  flat: 50,
  drill: 145,
  rasp: 65,
  file: 100,
  pumice: 110,
  polish: 120,
  gilding: 180,
};
/** The speed-up the page's pool (src/stock/pool.ts, at most 8 workers) is taken to give over one thread: well under 8, since the jobs wait on the main thread's copies and share the memory bus. */
const POOL_SPEEDUP = 4;
/** Main-thread seconds per chunk job (copy out, write back, file the undo parts) and per blow (its box and chunks). */
const JOB_SECONDS = 0.0006;
const BLOW_SECONDS = 0.00002;

/** Accumulates a run of blows and estimates its replay on the page's pool. */
export class ReplayEstimate {
  private readonly perChunk = new Map<number, number>();
  private kernelNs = 0;
  private blows = 0;

  constructor(
    private readonly figure: Grid,
    private readonly spec: GridSpec,
    private readonly layout: ChunkLayout,
  ) {}

  add(blow: Blow): void {
    this.blows += 1;
    const box = dilatedBox(volumeOf(this.figure, blow), this.spec);
    if (box === null) return;
    const ns = KERNEL_NS_PER_CELL[blow.tool];
    for (const id of chunksCovering(this.layout, box)) {
      const start = chunkStart(this.layout, id);
      let cells = 1;
      for (let axis = 0; axis < 3; axis += 1) {
        const lo = Math.max(box.min[axis] ?? 0, start[axis] ?? 0);
        const hi = Math.min(box.max[axis] ?? 0, (start[axis] ?? 0) + CHUNK_CELLS - 1);
        cells *= Math.max(0, hi - lo + 1);
      }
      this.perChunk.set(id, (this.perChunk.get(id) ?? 0) + cells * ns);
      this.kernelNs += cells * ns;
    }
  }

  /** Estimated seconds for the run so far. */
  get seconds(): number {
    let busiest = 0;
    for (const ns of this.perChunk.values()) if (ns > busiest) busiest = ns;
    return Math.max(this.kernelNs / POOL_SPEEDUP, busiest) * 1e-9 + this.perChunk.size * JOB_SECONDS + this.blows * BLOW_SECONDS;
  }

  reset(): void {
    this.perChunk.clear();
    this.kernelNs = 0;
    this.blows = 0;
  }
}

/** Estimated seconds to replay blows [from, to) by the snapshot table's segment estimates, each segment's share in proportion to its blows. */
export function replaySecondsBetween(table: readonly SnapshotEntry[], from: number, to: number): number {
  let seconds = 0;
  for (let n = 0; n + 1 < table.length; n += 1) {
    const a = table[n]?.blow ?? 0;
    const b = table[n + 1]?.blow ?? 0;
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi <= lo || b <= a) continue;
    seconds += ((table[n]?.replaySeconds ?? 0) * (hi - lo)) / (b - a);
  }
  return seconds;
}
