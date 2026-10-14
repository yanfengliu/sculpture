/**
 * A parallel jump (docs/design/spec.md, Undo and replay; docs/research/engine-options.md section 5): applies a run of planned blows chunk by chunk through a `ChunkCarver`, the worker pool in the page or the in-process carver in tests.
 * The main thread sorts the blows by the chunks their dilated boxes cover, sends each touched chunk's bytes with its blows in index order (src/stock/carve-jobs.ts), writes the carved bytes back as the results arrive and files each blow's undo parts; `onDone` then gets one undo box per blow and the chunks to remesh, and the bytes equal what the serial path writes (src/stock/carve-parallel.test.ts).
 * A job the carver fails is run in-process from a fresh copy of the chunk, which still holds the state before the jump, so the outcome is the same; the failure is logged.
 */
import type { Blow } from '../contracts/making';
import { type CarveState, dilatedBox, type UndoBox, type UndoPart, volumeOf } from '../stock/carve';
import { FIXED_POINT } from '../contracts/grid';
import { BLOW_FIELDS, type CarveJob, type CarveResult, type ChunkCarver, chunksCovering, copyChunk, packBlow, runCarveJob, undoPartsOf, writeChunk } from '../stock/carve-jobs';
import { chunksTouching } from '../stock/chunks';
import type { Grid } from '../stock/grid';

export interface JumpBlow {
  readonly blow: Blow;
  /** The step's margin, metres. */
  readonly margin: number;
}

export interface JumpOutcome {
  /** One undo box per blow, in order. */
  readonly undo: readonly UndoBox[];
  readonly dirty: readonly number[];
}

export interface Jump {
  /** Chunk jobs still out. */
  readonly pending: number;
  /** Drops any result that arrives later. */
  cancel(): void;
}

/** Copies a chunk's figure values, for the carver. */
export function figureChunkOf(figure: Grid, state: CarveState): (id: number) => Int16Array {
  return (id) => copyChunk(figure.values, figure.spec, state.chunks, id, figure.limit, (n) => new Int16Array(n));
}

/** Carves jobs on the calling thread at once; the carver of the tests and the fallback. */
export function createSyncCarver(figure: Grid, state: CarveState): ChunkCarver {
  const figureChunk = figureChunkOf(figure, state);
  return {
    submit(job, done): void {
      done(runCarveJob(job, job.figure ?? figureChunk(job.id), state.chunks));
    },
    dispose(): void {
      // Nothing to release.
    },
  };
}

/** Queues jobs until a carver arrives (the worker pool loads asynchronously); falls back to the in-process carver if it never does. */
export function createDeferredCarver(ready: Promise<ChunkCarver>, fallback: ChunkCarver): ChunkCarver {
  let carver: ChunkCarver | null = null;
  let disposed = false;
  const queue: { job: CarveJob; done: (result: CarveResult) => void; fail: (error: Error) => void }[] = [];
  const adopt = (found: ChunkCarver): void => {
    if (disposed) return;
    carver = found;
    for (const { job, done, fail } of queue.splice(0)) found.submit(job, done, fail);
  };
  ready.then(adopt).catch(() => {
    adopt(fallback);
  });
  return {
    submit(job, done, fail): void {
      if (carver !== null) carver.submit(job, done, fail);
      else queue.push({ job, done, fail });
    },
    dispose(): void {
      disposed = true;
      queue.length = 0;
    },
  };
}

/** Starts the jump over `blows`, whose first blow has plan index `first`. */
export function startJump(state: CarveState, figure: Grid, carver: ChunkCarver, blows: readonly JumpBlow[], first: number, onDone: (outcome: JumpOutcome) => void): Jump {
  const { stock, finish, chunks } = state;
  const spec = stock.spec;
  const lattice = { ...spec, stockLimit: stock.limit, figureBand: figure.spec.band * figure.cell };
  const perChunk = new Map<number, number[]>();
  const figureAt = new Float64Array(blows.length);
  blows.forEach(({ blow }, n) => {
    const volume = volumeOf(figure, blow);
    const box = dilatedBox(volume, spec);
    if (box === null) return;
    figureAt[n] = figure.sample(blow.point[0], blow.point[1], blow.point[2]);
    for (const id of chunksCovering(chunks, box)) {
      const list = perChunk.get(id);
      if (list === undefined) perChunk.set(id, [n]);
      else list.push(n);
    }
  });
  const parts: UndoPart[][] = blows.map(() => []);
  const dirty = new Set<number>();
  const figureChunk = figureChunkOf(figure, state);
  // The heaviest chunks go first, so the workers finish together.
  const order = [...perChunk.entries()].sort((a, b) => b[1].length - a[1].length);
  let pending = order.length;
  let cancelled = false;

  const jobFor = (id: number, list: readonly number[]): CarveJob => {
    const packed = new Float64Array(list.length * BLOW_FIELDS);
    list.forEach((n, slot) => {
      const entry = blows[n];
      if (entry === undefined) return;
      packBlow(packed, slot, entry.blow, Math.round((entry.margin / spec.cell) * FIXED_POINT), figureAt[n] ?? 0, first + n);
    });
    return {
      id,
      lattice,
      stock: copyChunk(stock.values, spec, chunks, id, stock.limit, (n) => new Int16Array(n)),
      finish: copyChunk(finish, spec, chunks, id, 0, (n) => new Uint8Array(n)),
      figure: null,
      blows: packed,
    };
  };

  const land = (result: CarveResult): void => {
    if (cancelled) return;
    writeChunk(stock.values, spec, chunks, result.id, result.stock);
    writeChunk(finish, spec, chunks, result.id, result.finish);
    for (const { index, part } of undoPartsOf(result)) {
      parts[index - first]?.push(part);
      for (const id of chunksTouching(chunks, part.box)) dirty.add(id);
    }
    pending -= 1;
    if (pending === 0) onDone({ undo: parts.map((p) => ({ parts: p })), dirty: [...dirty].sort((a, b) => a - b) });
  };

  if (pending === 0) {
    onDone({ undo: parts.map((p) => ({ parts: p })), dirty: [] });
  } else {
    for (const [id, list] of order) {
      carver.submit(jobFor(id, list), land, (error) => {
        if (cancelled) return;
        console.error(`chunk ${String(id)} is carved on the main thread instead: ${error.message}`);
        land(runCarveJob(jobFor(id, list), figureChunk(id), chunks));
      });
    }
  }

  return {
    get pending(): number {
      return pending;
    },
    cancel(): void {
      cancelled = true;
    },
  };
}
