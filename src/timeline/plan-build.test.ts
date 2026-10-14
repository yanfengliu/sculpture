/**
 * The plan file's build (src/timeline/plan-build.ts) and a Making that runs from it (src/timeline/making.ts, `MakingOptions.plan`), on the synthetic figure at 2 cm cells with the first seven David steps (the layout, the three roughing passes of the point, the two-tooth chisel and the claw: 3,968 blows, five of the seven with an end sweep). What a green run proves, and its bounds:
 *   1. The build's snapshots hold the Making's bytes: every snapshot of the table, written into a fresh untouched block (src/stock/snapshot.ts), equals the stock and finish grids of a Making that plans in-process and is set to the snapshot's position (a step's end, or a visible cycle's start inside a step), byte for byte; the table starts at blow 0, has a snapshot at every step's end and some inside steps (the segment budget is cut to 2 ms here so that it does).
 *   2. The plan file round-trips: the decoded blows and swept cells give the header's length and digests, and the Making from the file plans nothing and reports `planSource` `file`.
 *   3. The state stays a pure function of `t` through snapshots: after a seeded history of 40 moves (plays forward and backward in small steps, integer steps, scrubs anywhere) on a Making from the file that prefers a snapshot to any replay, with its carver in-process and jumps from 4 blows, the grids and the blow count equal a Making that plans in-process and follows the same moves at every tenth move, and at the end equal a fresh in-process replay to the last `t`; snapshots were loaded both forward and backward, and the undo log started past blow 0. The same holds with a loader that answers later (a promise), where `dirtyChunks` counts the load until it lands.
 *   4. A snapshot that is missing or corrupt is set aside with a logged reason and the making replays instead, to the same bytes.
 * Bounds: the first seven steps, since the whole plan takes 13 s to replay at 2 cm and the history replays parts of it four times (the whole plan's digests are src/timeline/plan-file.test.ts's claim); the synthetic figure at 2 cm, not the David at 8 mm (scripts/build-plan.mjs builds that, and the page's jump times are measured in the page); the loader is in memory, so the page's fetch, worker inflate and SHA-256 check (src/stock/snapshot-loader.ts) are not exercised; the grids are compared, not the chunk meshes (they are a function of the grids, src/timeline/making.test.ts).
 */
import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { DAVID_STEPS } from '../choreography/david-steps';
import { STAGES } from '../choreography/stages';
import type { BlowCycle } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { chunkLayout } from '../stock/chunks';
import { blockGrid, createFinishGrid, frameBlockBox } from '../stock/grid';
import type { ChunkMesher } from '../stock/remesh';
import { applySnapshot } from '../stock/snapshot';
import { createMaking, type EngineMaking, type MakingOptions, type PlanSource } from './making';
import { buildPlan, timeOfSnapshot } from './plan-build';
import { decodedPlanProblem, decodePlan, type PlanHeader, type SnapshotEntry } from './plan-file';

const figure = syntheticFigure(0.02);
const STEPS = DAVID_STEPS.slice(0, 7);
const STILL: BlowCycle = { posesAt: () => [], chipsAt: () => [], restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }) };
const NO_MESHER: ChunkMesher = {
  transfers: false,
  submit(job, done): void {
    done(job.id, { positions: new Float32Array(0), finish: new Uint8Array(0) });
  },
  dispose(): void {
    // Nothing to release.
  },
};
const BASE: MakingOptions = { figure, steps: STEPS, stages: STAGES, blowCycle: STILL, material: new THREE.MeshBasicMaterial(), mesher: NO_MESHER };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A segment budget far under the page's, so the short synthetic steps get snapshots inside them too. */
const SEGMENT_SECONDS = 0.05;
let header: PlanHeader;
let planBytes: Uint8Array;
const files = new Map<string, Uint8Array>();

beforeAll(() => {
  const built = buildPlan({
    figure,
    steps: STEPS,
    stages: STAGES,
    name: 'synthetic',
    gridSha256: '0'.repeat(64),
    segmentSeconds: SEGMENT_SECONDS,
    store: (file, bytes) => {
      files.set(file, bytes);
      return { gzipBytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    },
  });
  header = built.header;
  planBytes = built.bytes;
}, 120_000);

function source(load: (entry: SnapshotEntry) => Uint8Array | Promise<Uint8Array> = (entry) => files.get(entry.file) ?? new Uint8Array(0)): PlanSource {
  const decoded = decodePlan(planBytes);
  return { blows: decoded.blows, swept: decoded.swept, snapshots: header.snapshots, load };
}

function sameGrids(a: EngineMaking, b: EngineMaking, where: string): void {
  expect(a.blowsApplied, `blows applied ${where}`).toBe(b.blowsApplied);
  expect(Buffer.from(a.stock.values.buffer).equals(Buffer.from(b.stock.values.buffer)), `stock ${where}`).toBe(true);
  expect(Buffer.from(a.finish.buffer).equals(Buffer.from(b.finish.buffer)), `finish ${where}`).toBe(true);
}

describe('the plan file build', () => {
  it("writes snapshots that hold the making's bytes at every step's end and inside the long steps", () => {
    const table = header.snapshots;
    expect(table[0]?.blow).toBe(0);
    let end = 0;
    const ends = new Set(decodePlan(planBytes).blows.map((blows) => (end += blows.length)));
    for (const blow of ends) expect(table.some((entry) => entry.blow === blow), `a snapshot at the step end ${String(blow)}`).toBe(true);
    const inside = table.filter((entry) => entry.blow !== 0 && !ends.has(entry.blow));
    expect(inside.length).toBeGreaterThan(3);
    const reference = createMaking(BASE);
    // One state takes every snapshot in turn: a snapshot writes every cell, whatever was there.
    const state = { stock: blockGrid(figure.spec, frameBlockBox()), finish: createFinishGrid(figure.spec), chunks: chunkLayout(figure.spec) };
    for (const entry of table) {
      reference.setTime(entry.step);
      reference.setTime(timeOfSnapshot(reference, entry));
      expect(reference.blowsApplied).toBe(entry.blow);
      const bytes = files.get(entry.file);
      if (bytes === undefined) throw new Error(`no bytes stored for ${entry.file}`);
      expect(applySnapshot(bytes, state, figure).blow).toBe(entry.blow);
      expect(Buffer.from(state.stock.values.buffer).equals(Buffer.from(reference.stock.values.buffer)), `stock of ${entry.file} at blow ${String(entry.blow)}`).toBe(true);
      expect(Buffer.from(state.finish.buffer).equals(Buffer.from(reference.finish.buffer)), `finish of ${entry.file} at blow ${String(entry.blow)}`).toBe(true);
    }
    reference.dispose();
  });

  it('writes one snapshot where a step without blows ends where the step before it did', () => {
    const [nodo, layout] = STEPS;
    if (nodo === undefined || layout === undefined) throw new Error('the David steps lost their first two');
    const steps = [nodo, { ...nodo, id: 'idle', plan: () => [] }, layout];
    const table: SnapshotEntry[] = [];
    const built = buildPlan({ figure, steps, stages: STAGES, name: 'idle', gridSha256: '0'.repeat(64), store: () => ({ gzipBytes: 0, sha256: '0'.repeat(64) }) });
    table.push(...built.header.snapshots);
    expect(table.map((entry) => entry.blow)).toEqual([...new Set(table.map((entry) => entry.blow))].sort((a, b) => a - b));
    expect(built.header.planLength).toBe(decodePlan(built.bytes).blows.reduce((sum, blows) => sum + blows.length, 0));
    expect(decodePlan(built.bytes).blows[1]).toEqual([]);
  });

  it('round-trips the plan, and a making from it plans nothing', () => {
    const decoded = decodePlan(planBytes);
    expect(decodedPlanProblem(decoded, header)).toBeNull();
    const reference = createMaking(BASE);
    reference.setTime(reference.N);
    expect(header.planLength).toBe(reference.planLength);
    expect(header.planDigest).toBe(reference.planDigest);
    const fromFile = createMaking({ ...BASE, plan: source() });
    expect(fromFile.planSource).toBe('file');
    expect(reference.planSource).toBe('page');
    expect(fromFile.planLength).toBe(reference.planLength);
    expect(fromFile.planDigest).toBe(reference.planDigest);
    expect(fromFile.steps.map((s) => [s.firstBlow, s.blowCount])).toEqual(reference.steps.map((s) => [s.firstBlow, s.blowCount]));
    reference.dispose();
    fromFile.dispose();
  });
});

/** A seeded history of plays forward and backward in small steps, integer steps and scrubs anywhere. */
function history(seed: number, N: number, moves: number): number[] {
  const random = mulberry32(seed);
  const out: number[] = [];
  let t = 0;
  for (let n = 0; n < moves; n += 1) {
    const kind = random();
    if (kind < 0.3) t += 0.02 + 0.3 * random();
    else if (kind < 0.5) t -= 0.02 + 0.3 * random();
    else if (kind < 0.65) t = Math.round(t) + (random() < 0.5 ? 1 : -1);
    else t = random() * N;
    t = Math.min(Math.max(t, 0), N);
    out.push(t);
  }
  return out;
}

describe('a making that runs from the plan file', () => {
  it('stays a pure function of t through snapshot loads, plays and reversals', () => {
    const making = createMaking({ ...BASE, plan: source(), carver: 'in-process', jumpBlows: 4, snapshotLoadSeconds: 0 });
    const follower = createMaking(BASE);
    const moves = history(2026, making.N, 40);
    let backwardLoads = 0;
    let deepestBase = 0;
    moves.forEach((t, n) => {
      const before = { loads: making.snapshotLoads, cursor: making.blowsApplied };
      making.setTime(t);
      expect(making.dirtyChunks).toBe(0);
      if (making.snapshotLoads > before.loads && making.blowsApplied < before.cursor) backwardLoads += 1;
      deepestBase = Math.max(deepestBase, making.undoBase);
      if (n % 10 === 9) {
        follower.setTime(t);
        sameGrids(making, follower, `after ${String(n + 1)} moves at t = ${String(t)}`);
      }
    });
    expect(making.snapshotLoads).toBeGreaterThan(5);
    expect(backwardLoads).toBeGreaterThan(0);
    expect(deepestBase).toBeGreaterThan(0);
    const last = moves[moves.length - 1] ?? 0;
    const fresh = createMaking(BASE);
    fresh.setTime(last);
    sameGrids(making, fresh, `at the end, t = ${String(last)}`);
    for (const m of [making, follower, fresh]) m.dispose();
  });

  it('counts a load that answers later in dirtyChunks and lands on the same bytes', async () => {
    const making = createMaking({ ...BASE, plan: source((entry) => Promise.resolve(files.get(entry.file) ?? new Uint8Array(0))), snapshotLoadSeconds: 0 });
    const fresh = createMaking(BASE);
    for (const t of [making.N, 3.4, making.N - 0.5, 0.2, 5.7]) {
      making.setTime(t);
      expect(making.dirtyChunks).toBeGreaterThan(0);
      while (making.dirtyChunks > 0) await new Promise((resolve) => setTimeout(resolve, 0));
      fresh.setTime(t);
      sameGrids(making, fresh, `at t = ${String(t)}`);
    }
    expect(making.snapshotLoads).toBeGreaterThanOrEqual(4);
    making.dispose();
    fresh.dispose();
  });

  it('sets a missing or corrupt snapshot aside and replays to the same bytes', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lastFile = header.snapshots[header.snapshots.length - 1]?.file;
    const making = createMaking({
      ...BASE,
      plan: source((entry) => {
        if (entry.file === lastFile) throw new Error('404');
        const bytes = files.get(entry.file) ?? new Uint8Array(0);
        if (entry.step === 4) return bytes.slice(0, bytes.length - 7);
        return bytes;
      }),
      snapshotLoadSeconds: 0,
    });
    const fresh = createMaking(BASE);
    for (const t of [making.N, 4.5, 5, 1]) {
      making.setTime(t);
      fresh.setTime(t);
      sameGrids(making, fresh, `at t = ${String(t)}`);
    }
    expect(errors.mock.calls.some(([message]) => String(message).includes('404'))).toBe(true);
    expect(errors.mock.calls.some(([message]) => String(message).includes('truncated or malformed'))).toBe(true);
    errors.mockRestore();
    making.dispose();
    fresh.dispose();
  });
});
