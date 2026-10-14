/**
 * The sweep (docs/design/spec.md, Stock and figure): the stock components connected to neither the figure nor the block's base come off at every step boundary, so no flake floats in the air at a rest position (the loose stock around the David's head and right side at t = 21 on 2026-10-13) and the state at any `t` stays a pure function of `t`: src/timeline/making.ts runs it when the cursor reaches a step's end and files the swept bytes in that step's last blow's undo box.
 * Components are kept incrementally, chunk by chunk (the 32³ chunks of src/stock/chunks.ts; the last chunk on an axis also takes the grid's last plane when the lattice runs one cell past it). A chunk's own cells are labelled into 6-connected local components by runs along x united across rows, with a flag per local for holding a figure cell (figure value below zero) or a base cell (the block's lowest stone row at t = 0), and a chunk is labelled again only when `markDirty` named it since its last labelling. A sweep unites the locals across every chunk face into one union-find, keeps every root reachable from a flagged local and sets every cell of every other local to deep air with finish 0, recording the old bytes per chunk in the undo format of src/stock/carve.ts (deep cells as runs, the rest as segments with their values).
 * Cost: labelling is linear in the dirtied chunks' cells (a tenth of a millisecond for a solid chunk), the face unions read the 32×32 cell pairs on every chunk face (4 M reads on the David grid, a few milliseconds), so a sweep costs in proportion to what changed since the last one, never a whole-grid flood fill (36.7 M cells and seconds, at 21 boundaries). The labels take two bytes per cell, 73 MB at 8 mm.
 */
import type { CarveState, UndoPart } from './carve';
import { chunkCoords, type ChunkLayout, chunksTouching } from './chunks';
import type { Grid } from './grid';
import { CHUNK_CELLS } from './mesher';

export interface SweepResult {
  /** The old bytes of the swept cells, one part per chunk that lost cells, each with its changed-cell box; none when nothing was swept. */
  readonly parts: readonly UndoPart[];
  readonly cells: number;
  /** The chunks whose window holds a swept cell, in increasing id order: the chunks to remesh. */
  readonly dirty: readonly number[];
  /** Chunks labelled afresh for this sweep. */
  readonly relabelled: number;
  readonly millis: number;
}

const HOLDS_FIGURE = 1;
const HOLDS_BASE = 2;
/** A chunk's longest span per axis: its CHUNK_CELLS cells, plus the grid's last plane when `chunkLayout` leaves it past the last chunk. */
const MAX_SPAN = CHUNK_CELLS + 1;
const MAX_ROWS = MAX_SPAN * MAX_SPAN;
/** Runs of stock along a row alternate with air, so a row holds at most this many. */
const MAX_RUNS = MAX_ROWS * Math.ceil(MAX_SPAN / 2);
const NO_FLAGS = new Uint8Array(0);

/** The cells a chunk owns, exclusive ends. */
interface ChunkRange {
  readonly i0: number;
  readonly i1: number;
  readonly j0: number;
  readonly j1: number;
  readonly k0: number;
  readonly k1: number;
}

/** The lowest cell row along y holding any stock cell: the block's base at t = 0; −1 when the stock is empty. */
export function baseRowOf(stock: Grid): number {
  const { nx, ny, nz, values } = stock;
  for (let j = 0; j < ny; j += 1) {
    for (let k = 0; k < nz; k += 1) {
      const base = nx * (j + ny * k);
      for (let i = 0; i < nx; i += 1) if ((values[base + i] ?? 0) < 0) return j;
    }
  }
  return -1;
}

export class StockSweeper {
  /** The block's lowest stone row at t = 0, a cell index along y; −1 when the stock started empty. */
  readonly baseRow: number;
  private readonly stock: Grid;
  private readonly finish: Uint8Array;
  private readonly figure: Grid;
  private readonly layout: ChunkLayout;
  /** Local component per cell, 1-based within its chunk; 0 is air. */
  private readonly labels: Uint16Array;
  /** Locals per chunk, and each local's HOLDS_ flags. */
  private readonly counts: Int32Array;
  private readonly flags: Uint8Array[];
  private readonly dirty = new Set<number>();
  private readonly runStart = new Int32Array(MAX_RUNS);
  private readonly runEnd = new Int32Array(MAX_RUNS);
  private readonly runBase = new Int32Array(MAX_RUNS);
  private readonly runParent = new Int32Array(MAX_RUNS);
  private readonly runFlags = new Uint8Array(MAX_RUNS);
  private readonly runLabel = new Int32Array(MAX_RUNS);
  private readonly rowFirst = new Int32Array(MAX_ROWS);
  private readonly rowEnd = new Int32Array(MAX_ROWS);
  /** Per local of the chunk being swept (index = label): 1 when its cells come off. */
  private readonly unkept = new Uint8Array(MAX_RUNS + 1);

  /** Reads the base row from `state`, which must be the untouched block. Every chunk starts dirty. */
  constructor(state: CarveState, figure: Grid) {
    this.stock = state.stock;
    this.finish = state.finish;
    this.figure = figure;
    this.layout = state.chunks;
    this.labels = new Uint16Array(this.stock.values.length);
    this.counts = new Int32Array(this.layout.total);
    this.flags = Array.from({ length: this.layout.total }, () => NO_FLAGS);
    this.baseRow = baseRowOf(this.stock);
    for (let id = 0; id < this.layout.total; id += 1) this.dirty.add(id);
  }

  /** Chunks whose cells changed since the last sweep; the 33³-window ids of `chunksTouching` are a superset of the owners and are fine. */
  markDirty(ids: Iterable<number>): void {
    for (const id of ids) if (id >= 0 && id < this.layout.total) this.dirty.add(id);
  }

  /** Takes off every stock component connected to neither the figure nor the base row and returns the record. */
  sweep(): SweepResult {
    const started = performance.now();
    const relabelled = this.dirty.size;
    for (const id of this.dirty) this.label(id);
    this.dirty.clear();
    const { total } = this.layout;
    const [ncx, ncy, ncz] = this.layout.counts;
    const offsets = new Int32Array(total);
    let nodes = 0;
    for (let id = 0; id < total; id += 1) {
      offsets[id] = nodes;
      nodes += this.counts[id] ?? 0;
    }
    const parent = new Int32Array(nodes);
    for (let n = 0; n < nodes; n += 1) parent[n] = n;
    const find = (x: number): number => {
      let node = x;
      for (;;) {
        const p = parent[node] ?? node;
        if (p === node) return node;
        const g = parent[p] ?? p;
        parent[node] = g;
        node = g;
      }
    };
    const unite = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let id = 0; id < total; id += 1) {
      if ((this.counts[id] ?? 0) === 0) continue;
      const [cx, cy, cz] = chunkCoords(this.layout, id);
      const range = this.range(id);
      const offA = (offsets[id] ?? 0) - 1;
      if (cx + 1 < ncx && (this.counts[id + 1] ?? 0) > 0) this.uniteFace(range, 0, offA, (offsets[id + 1] ?? 0) - 1, unite);
      if (cy + 1 < ncy && (this.counts[id + ncx] ?? 0) > 0) this.uniteFace(range, 1, offA, (offsets[id + ncx] ?? 0) - 1, unite);
      if (cz + 1 < ncz && (this.counts[id + ncx * ncy] ?? 0) > 0) this.uniteFace(range, 2, offA, (offsets[id + ncx * ncy] ?? 0) - 1, unite);
    }
    const kept = new Uint8Array(nodes);
    for (let id = 0; id < total; id += 1) {
      const flags = this.flags[id] ?? NO_FLAGS;
      const offset = offsets[id] ?? 0;
      for (let l = 0; l < flags.length; l += 1) if ((flags[l] ?? 0) !== 0) kept[find(offset + l)] = 1;
    }
    const parts: UndoPart[] = [];
    const dirty = new Set<number>();
    let cells = 0;
    for (let id = 0; id < total; id += 1) {
      const count = this.counts[id] ?? 0;
      if (count === 0) continue;
      const offset = offsets[id] ?? 0;
      let any = false;
      for (let l = 1; l <= count; l += 1) {
        const comesOff = kept[find(offset + l - 1)] === 0 ? 1 : 0;
        this.unkept[l] = comesOff;
        if (comesOff === 1) any = true;
      }
      if (!any) continue;
      const swept = this.sweepChunk(id);
      if (swept === null) continue;
      parts.push(swept.part);
      cells += swept.cells;
      for (const n of chunksTouching(this.layout, swept.part.box)) dirty.add(n);
      this.dirty.add(id);
    }
    return { parts, cells, dirty: [...dirty].sort((a, b) => a - b), relabelled, millis: performance.now() - started };
  }

  private range(id: number): ChunkRange {
    const [cx, cy, cz] = chunkCoords(this.layout, id);
    const [nx, ny, nz] = this.layout.size;
    const [ncx, ncy, ncz] = this.layout.counts;
    return {
      i0: cx * CHUNK_CELLS,
      i1: cx + 1 === ncx ? nx : Math.min(nx, (cx + 1) * CHUNK_CELLS),
      j0: cy * CHUNK_CELLS,
      j1: cy + 1 === ncy ? ny : Math.min(ny, (cy + 1) * CHUNK_CELLS),
      k0: cz * CHUNK_CELLS,
      k1: cz + 1 === ncz ? nz : Math.min(nz, (cz + 1) * CHUNK_CELLS),
    };
  }

  private findRun(x: number): number {
    const parent = this.runParent;
    let run = x;
    for (;;) {
      const p = parent[run] ?? run;
      if (p === run) return run;
      const g = parent[p] ?? p;
      parent[run] = g;
      run = g;
    }
  }

  /** Unites every run of row a with every run of row b it shares a cell column with; both rows' runs are in increasing x order. */
  private uniteRows(aFirst: number, aEnd: number, bFirst: number, bEnd: number): void {
    const { runStart, runEnd, runParent } = this;
    let a = aFirst;
    let b = bFirst;
    while (a < aEnd && b < bEnd) {
      const aStop = runEnd[a] ?? 0;
      const bStop = runEnd[b] ?? 0;
      if (aStop <= (runStart[b] ?? 0)) a += 1;
      else if (bStop <= (runStart[a] ?? 0)) b += 1;
      else {
        const ra = this.findRun(a);
        const rb = this.findRun(b);
        if (ra !== rb) runParent[ra] = rb;
        if (aStop < bStop) a += 1;
        else b += 1;
      }
    }
  }

  /** Labels the chunk's own cells afresh: runs of stock along each row, united with the overlapping runs of the row before along y and along z. */
  private label(id: number): void {
    const { i0, i1, j0, j1, k0, k1 } = this.range(id);
    const { nx, ny, values } = this.stock;
    const figureValues = this.figure.values;
    const { labels, runStart, runEnd, runBase, runParent, runFlags, runLabel, rowFirst, rowEnd, baseRow } = this;
    const rowsJ = j1 - j0;
    let runs = 0;
    for (let k = k0; k < k1; k += 1) {
      for (let j = j0; j < j1; j += 1) {
        const r = (k - k0) * rowsJ + (j - j0);
        const base = nx * (j + ny * k);
        labels.fill(0, base + i0, base + i1);
        rowFirst[r] = runs;
        let i = i0;
        while (i < i1) {
          if ((values[base + i] ?? 0) >= 0) {
            i += 1;
            continue;
          }
          const start = i;
          let flags = j === baseRow ? HOLDS_BASE : 0;
          while (i < i1 && (values[base + i] ?? 0) < 0) {
            if ((figureValues[base + i] ?? 0) < 0) flags |= HOLDS_FIGURE;
            i += 1;
          }
          runStart[runs] = start;
          runEnd[runs] = i;
          runBase[runs] = base;
          runParent[runs] = runs;
          runFlags[runs] = flags;
          runs += 1;
        }
        rowEnd[r] = runs;
        if (j > j0) this.uniteRows(rowFirst[r] ?? 0, runs, rowFirst[r - 1] ?? 0, rowEnd[r - 1] ?? 0);
        if (k > k0) this.uniteRows(rowFirst[r] ?? 0, runs, rowFirst[r - rowsJ] ?? 0, rowEnd[r - rowsJ] ?? 0);
      }
    }
    runLabel.fill(0, 0, runs);
    let count = 0;
    for (let run = 0; run < runs; run += 1) {
      const root = this.findRun(run);
      if (runLabel[root] === 0) {
        count += 1;
        runLabel[root] = count;
      }
    }
    const flags = count === 0 ? NO_FLAGS : new Uint8Array(count);
    for (let run = 0; run < runs; run += 1) {
      const l = runLabel[this.findRun(run)] ?? 0;
      const base = runBase[run] ?? 0;
      labels.fill(l, base + (runStart[run] ?? 0), base + (runEnd[run] ?? 0));
      flags[l - 1] = (flags[l - 1] ?? 0) | (runFlags[run] ?? 0);
    }
    this.counts[id] = count;
    this.flags[id] = flags;
  }

  /** Unites the locals across the chunk's face toward its neighbour along `axis`, cell pair by cell pair; `offA` and `offB` turn a label into a node. */
  private uniteFace(r: ChunkRange, axis: 0 | 1 | 2, offA: number, offB: number, unite: (a: number, b: number) => void): void {
    const { nx, ny } = this.stock;
    const labels = this.labels;
    let lastA = 0;
    let lastB = 0;
    const pair = (index: number, step: number): void => {
      const a = labels[index] ?? 0;
      if (a === 0) return;
      const b = labels[index + step] ?? 0;
      if (b === 0 || (a === lastA && b === lastB)) return;
      lastA = a;
      lastB = b;
      unite(offA + a, offB + b);
    };
    if (axis === 0) {
      const i = r.i1 - 1;
      for (let k = r.k0; k < r.k1; k += 1) for (let j = r.j0; j < r.j1; j += 1) pair(i + nx * (j + ny * k), 1);
    } else if (axis === 1) {
      const j = r.j1 - 1;
      for (let k = r.k0; k < r.k1; k += 1) {
        const base = nx * (j + ny * k);
        for (let i = r.i0; i < r.i1; i += 1) pair(base + i, nx);
      }
    } else {
      const k = r.k1 - 1;
      for (let j = r.j0; j < r.j1; j += 1) {
        const base = nx * (j + ny * k);
        for (let i = r.i0; i < r.i1; i += 1) pair(base + i, nx * ny);
      }
    }
  }

  /** Sets every cell of the chunk's `unkept` locals to deep air and records the old bytes; null when none had a cell. */
  private sweepChunk(id: number): { part: UndoPart; cells: number } | null {
    const { i0, i1, j0, j1, k0, k1 } = this.range(id);
    const { nx, ny, limit, values } = this.stock;
    const { finish, labels, unkept } = this;
    const deep = -limit;
    const runs: number[] = [];
    const indices: number[] = [];
    const oldStock: number[] = [];
    const oldFinish: number[] = [];
    let runStart = -1;
    let runLength = 0;
    let segStart = -1;
    let segLength = 0;
    let cells = 0;
    let bi0 = i1;
    let bj0 = j1;
    let bk0 = k1;
    let bi1 = -1;
    let bj1 = -1;
    let bk1 = -1;
    for (let k = k0; k < k1; k += 1) {
      for (let j = j0; j < j1; j += 1) {
        const base = nx * (j + ny * k);
        for (let i = i0; i < i1; i += 1) {
          const index = base + i;
          const l = labels[index] ?? 0;
          if (l === 0 || unkept[l] === 0) continue;
          const s = values[index] ?? limit;
          const f = finish[index] ?? 0;
          if (s === deep && f === 0) {
            if (runStart >= 0 && runStart + runLength === index) runLength += 1;
            else {
              if (runStart >= 0) runs.push(runStart, runLength);
              runStart = index;
              runLength = 1;
            }
          } else {
            if (segStart >= 0 && segStart + segLength === index) segLength += 1;
            else {
              if (segStart >= 0) indices.push(segStart, segLength);
              segStart = index;
              segLength = 1;
            }
            oldStock.push(s);
            oldFinish.push(f);
          }
          values[index] = limit;
          finish[index] = 0;
          labels[index] = 0;
          cells += 1;
          if (i < bi0) bi0 = i;
          if (i > bi1) bi1 = i;
          if (j < bj0) bj0 = j;
          if (j > bj1) bj1 = j;
          if (k < bk0) bk0 = k;
          if (k > bk1) bk1 = k;
        }
      }
    }
    if (cells === 0) return null;
    if (runStart >= 0) runs.push(runStart, runLength);
    if (segStart >= 0) indices.push(segStart, segLength);
    return {
      part: { runs: Uint32Array.from(runs), indices: Uint32Array.from(indices), stock: Int16Array.from(oldStock), finish: Uint8Array.from(oldFinish), box: { min: [bi0, bj0, bk0], max: [bi1, bj1, bk1] } },
      cells,
    };
  }
}
