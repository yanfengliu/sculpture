/**
 * Builds the plan file and its snapshots (docs/design/spec.md, Undo and replay; src/timeline/plan-file.ts): scripts/build-plan.mjs runs it in Node over the David grid, src/timeline/plan-build.test.ts over the synthetic figure.
 * A Making with no mesher plans the steps as the page would and replays them forward once; the build records every step's blows and the cells its end sweep took off, and writes a snapshot (src/stock/snapshot.ts) at blow 0, at every step's end, and inside a step at the start of a visible cycle wherever the segment since the last snapshot would otherwise take the page's pool longer than SEGMENT_SECONDS to replay (src/timeline/replay-cost.ts), so a jump anywhere loads one snapshot and replays at most about that long.
 */
import { MeshBasicMaterial } from 'three';

import type { GridHeader } from '../contracts/grid';
import { type BlowCycle, type StageDef, type StepDef, STRIKE_PHASE } from '../contracts/making';
import { chunkLayout } from '../stock/chunks';
import type { Grid, WorldBox } from '../stock/grid';
import type { ChunkMesher } from '../stock/remesh';
import { FNV_OFFSET, fnvHex } from '../stock/digest';
import { encodeSnapshot } from '../stock/snapshot';
import type { Cycles } from './cycles';
import { createMaking, type EngineMaking, type MakingOptions } from './making';
import { encodePlan, PLAN_FORMAT, PLAN_VERSION, type PlanHeader, type SnapshotEntry, sweptDigestOf } from './plan-file';
import { ReplayEstimate, SEGMENT_SECONDS } from './replay-cost';

export interface BuildPlanOptions {
  readonly figure: Grid;
  /** The figure's header, as the page passes it: its lattice implies the block. */
  readonly header?: GridHeader;
  readonly block?: WorldBox;
  readonly steps: readonly StepDef[];
  readonly stages: readonly StageDef[];
  /** File-name prefix: `<name>.snap.<i>.bin.gz`. */
  readonly name: string;
  /** SHA-256 of the figure grid, recorded so the page can tell a plan built on another grid. */
  readonly gridSha256: string;
  /** Stores one snapshot's bytes (before gzip) under `file` and says what the table records of it. */
  readonly store: (file: string, bytes: Uint8Array) => { readonly gzipBytes: number; readonly sha256: string };
  /** SHA-256 of some bytes, hex: the plan data's, recorded in its header. */
  readonly sha256: (bytes: Uint8Array) => string;
  readonly segmentSeconds?: number;
  readonly log?: (line: string) => void;
}

export interface BuiltPlan {
  readonly header: PlanHeader;
  /** The `.plan.bin` bytes. */
  readonly bytes: Uint8Array;
}

const STILL: BlowCycle = {
  posesAt: () => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

const NO_MESHER: ChunkMesher = {
  transfers: false,
  submit(job, done): void {
    done(job.id, { positions: new Float32Array(0), finish: new Uint8Array(0) });
  },
  dispose(): void {
    // Nothing to release.
  },
};

/** A timeline position where step `step` has struck exactly its first `cycle` visible cycles (cycle ≥ 1): past that cycle's strike, before the next one's. */
export function timeAtCycle(step: number, cycle: number, cycles: Cycles): number {
  return step + (cycle - 1 + STRIKE_PHASE + (1 - STRIKE_PHASE) / 2) / cycles.cycles;
}

/** The timeline position whose state a snapshot holds, on a Making that has planned its step: a step's end, or a cycle start inside it. */
export function timeOfSnapshot(making: EngineMaking, entry: SnapshotEntry): number {
  if (entry.blow === 0) return 0;
  const step = making.steps[entry.step];
  if (step === undefined) throw new Error(`snapshot at blow ${String(entry.blow)} names step ${String(entry.step)}, which the making does not have`);
  const into = entry.blow - step.firstBlow;
  if (into === step.blowCount) return entry.step + 1;
  const cycles = making.cyclesOf(entry.step);
  if (into <= 0 || into % cycles.group !== 0) throw new Error(`snapshot at blow ${String(entry.blow)} is ${String(into)} blows into step ${step.id}, not at the start of a visible cycle of ${String(cycles.group)} blows`);
  return timeAtCycle(entry.step, into / cycles.group, cycles);
}

export function buildPlan(options: BuildPlanOptions): BuiltPlan {
  const { figure, steps, name, store } = options;
  const log = options.log ?? ((): void => undefined);
  const budget = options.segmentSeconds ?? SEGMENT_SECONDS;
  const makingOptions: MakingOptions = { figure, steps, stages: options.stages, blowCycle: STILL, material: new MeshBasicMaterial(), mesher: NO_MESHER, ...(options.header === undefined ? {} : { header: options.header }), ...(options.block === undefined ? {} : { block: options.block }) };
  const making = createMaking(makingOptions);
  const estimate = new ReplayEstimate(figure, figure.spec, chunkLayout(figure.spec));
  const table: SnapshotEntry[] = [];

  /** Writes the snapshot of the state at `t`, which must hold `blow` blows; the previous entry's segment ends here and costs `previousSeconds`. */
  const snapshot = (t: number, blow: number, step: number, previousSeconds: number): void => {
    making.setTime(t);
    if (making.blowsApplied !== blow) throw new Error(`the build asked for the state after ${String(blow)} blows at t = ${String(t)} and the making holds ${String(making.blowsApplied)}`);
    const previous = table[table.length - 1];
    // A step without blows ends where the step before it did, whose snapshot holds that state already.
    if (previous?.blow === blow) return;
    if (previous !== undefined) table[table.length - 1] = { ...previous, replaySeconds: Number(previousSeconds.toFixed(3)) };
    const file = `${name}.snap.${String(table.length)}.bin.gz`;
    const bytes = encodeSnapshot(making.stock, making.finish, figure, blow);
    const stored = store(file, bytes);
    table.push({ blow, step, file, bytes: bytes.byteLength, gzipBytes: stored.gzipBytes, sha256: stored.sha256, replaySeconds: 0 });
  };

  snapshot(0, 0, 0, 0);
  for (let s = 0; s < making.N; s += 1) {
    const started = performance.now();
    making.setTime(s);
    const info = making.steps[s];
    if (info === undefined) break;
    const blows = making.blowsOf(s);
    const cycles = making.cyclesOf(s);
    const inside: number[] = [];
    let segmentCycles = 0;
    for (let c = 0; c < cycles.cycles; c += 1) {
      const group = blows.slice(c * cycles.group, (c + 1) * cycles.group);
      const before = estimate.seconds;
      for (const blow of group) estimate.add(blow);
      if (estimate.seconds > budget && segmentCycles > 0) {
        // The segment is full before this cycle: a snapshot at its start, and the cycle opens the next segment.
        const blow = info.firstBlow + c * cycles.group;
        snapshot(timeAtCycle(s, c, cycles), blow, s, before);
        estimate.reset();
        for (const b of group) estimate.add(b);
        segmentCycles = 0;
        inside.push(blow);
      }
      segmentCycles += 1;
    }
    const tail = estimate.seconds;
    snapshot(s + 1, info.firstBlow + info.blowCount, s, tail);
    estimate.reset();
    const last = table[table.length - 1];
    log(`${info.id}: ${String(info.blowCount)} blows in ${String(cycles.cycles)} cycles of ${String(cycles.group)}; ${String(inside.length)} snapshot${inside.length === 1 ? '' : 's'} inside${inside.length > 0 ? ` (blows ${inside.join(', ')})` : ''}, last segment ${tail.toFixed(2)} s; swept ${String(making.sweptCells(s))} cells; end snapshot ${((last?.bytes ?? 0) / 1e6).toFixed(1)} MB before gzip; ${((performance.now() - started) / 1000).toFixed(1)} s`);
  }

  const blows = steps.map((_, s) => making.blowsOf(s));
  const swept = steps.map((_, s) => making.sweepOf(s)?.list ?? new Uint32Array(0));
  const bytes = encodePlan({ blows, swept });
  const header: PlanHeader = {
    format: PLAN_FORMAT,
    planVersion: PLAN_VERSION,
    gridSha256: options.gridSha256,
    steps: steps.map((step) => step.id),
    planLength: making.planLength,
    planDigest: making.planDigest,
    sweptDigest: sweptDigestOf(swept),
    sweptCells: swept.map((list) => list.length),
    planSha256: options.sha256(bytes),
    snapshots: table,
  };
  making.dispose();
  return { header, bytes };
}

/** FNV-1a over a grid's 16-bit values and a finish grid's bytes, folded into `hash`. */
function hashGrids(hash: number, values: Int16Array, finish: Uint8Array): number {
  let h = hash;
  for (let n = 0; n < values.length; n += 1) h = Math.imul(h ^ ((values[n] ?? 0) & 0xffff), 0x01000193) >>> 0;
  for (let n = 0; n < finish.length; n += 1) h = Math.imul(h ^ (finish[n] ?? 0), 0x01000193) >>> 0;
  return h;
}

/**
 * What a plan file built by this planner would hold, as one string: the plan digest, the swept cells' digest and a hash of the stock and finish halfway through every step and at its end, replayed on `making` (which must be a fresh Making that plans for itself). src/timeline/plan-file.test.ts keeps PLAN_VERSION's on the synthetic figure: a change to the planner, the carving or the sweep that changes any step's halfway or end state changes it, also when the end of the making stays the same.
 * Bound: states between the halfway point and the end of a step are read only through the end state, so a change seen only there and undone by the step's end is missed.
 */
export function planFingerprint(making: EngineMaking): string {
  let hash = FNV_OFFSET;
  for (let k = 0; k < making.N; k += 1) {
    for (const t of [k + 0.5, k + 1]) {
      making.setTime(t);
      hash = hashGrids(hash, making.stock.values, making.finish);
    }
  }
  const swept = making.steps.map((_, s) => making.sweepOf(s)?.list ?? new Uint32Array(0));
  return `${making.planDigest}-${sweptDigestOf(swept)}-${fnvHex(hash)}`;
}
