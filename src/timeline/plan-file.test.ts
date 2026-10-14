/**
 * The plan file's format and its version (src/timeline/plan-file.ts). What a green run proves, and its bounds:
 *   1. The `.plan.bin` bytes round-trip every bit of every blow (numbers that are not short decimals, a negative zero, every tool) and every swept cell, and the decoded plan gives the digest the Making computes (`planDigestOf` is `fnvBlow` over the blows in order).
 *   2. Bytes that are not a plan are refused with what is wrong (the magic, the layout version, a truncated file), and a header the page cannot use is named with why: another format, plan version, grid, step list, or no snapshot at blow 0; a decoded plan whose length or digests differ from its header is named too.
 *   3. PLAN_VERSION names what the planner produces: the fingerprint of the whole David plan on the synthetic figure at 2 cm cells (the plan digest, the swept cells' digest and the FNV-1a of the stock and finish at t = N) equals the entry FINGERPRINTS holds for PLAN_VERSION. A change to the generators, the carving, the tool volumes or the sweep changes the fingerprint and fails here until PLAN_VERSION is bumped and the new fingerprint added, so a plan file built before the change is not used by the page (the page then plans for itself until `npm run model` rebuilds it).
 * Bounds: the fingerprint is computed in Node; the page's Chrome computes some transcendental functions differently in the last bit (docs/research/decisions.md, Engine), which is why the page takes the plan from the file rather than checking its own plan against it. A planner change that leaves the synthetic figure's plan and state alone but changes the David's is not caught; the step list is compared by id in the page.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { DAVID_STEPS } from '../choreography/david-steps';
import { STAGES } from '../choreography/stages';
import type { Blow, BlowCycle } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { TOOL_IDS } from '../stock/carve-jobs';
import { FNV_OFFSET, fnvArray, fnvBlow, fnvHex } from '../stock/digest';
import type { ChunkMesher } from '../stock/remesh';
import { createMaking } from './making';
import { decodedPlanProblem, decodePlan, encodePlan, PLAN_FORMAT, PLAN_VERSION, type PlanHeader, planDigestOf, planHeaderProblem, sweptDigestOf } from './plan-file';

/** PLAN_VERSION to the fingerprint of the synthetic 2 cm plan it was built with. Add a line, never change one. */
const FINGERPRINTS: Readonly<Record<number, string>> = {
  1: '02f19b94-2266b800-b89a561d',
};

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

function samplePlan(): { blows: Blow[][]; swept: Uint32Array[] } {
  const blows: Blow[][] = [[], [], []];
  TOOL_IDS.forEach((tool, n) => {
    blows[n % 3]?.push({ tool, point: [0.1 + n / 3, -0, 1 / 7], normal: [Math.SQRT1_2, 0, -Math.SQRT1_2], direction: [Math.PI / 10, 1e-300, -5e-324], size: 0.035 + n * 1e-17, stroke: n });
  });
  return { blows, swept: [Uint32Array.from([3, 9, 4_000_000_000]), new Uint32Array(0), Uint32Array.from([12])] };
}

function header(plan: { blows: Blow[][]; swept: Uint32Array[] }): PlanHeader {
  return {
    format: PLAN_FORMAT,
    planVersion: PLAN_VERSION,
    gridSha256: 'ab'.repeat(32),
    steps: ['a', 'b', 'c'],
    planLength: plan.blows.reduce((sum, list) => sum + list.length, 0),
    planDigest: planDigestOf(plan.blows),
    sweptDigest: sweptDigestOf(plan.swept),
    sweptCells: plan.swept.map((list) => list.length),
    snapshots: [{ blow: 0, step: 0, file: 'x.snap.0.bin.gz', bytes: 10, gzipBytes: 5, sha256: 'cd'.repeat(32), replaySeconds: 0.5 }],
  };
}

describe('the plan file', () => {
  it('round-trips every bit of every blow and swept cell', () => {
    const plan = samplePlan();
    const decoded = decodePlan(encodePlan(plan));
    expect(decoded.blows).toEqual(plan.blows);
    expect(Object.is(decoded.blows[0]?.[0]?.point[1], -0)).toBe(true);
    expect(decoded.swept).toEqual(plan.swept);
    let hash = FNV_OFFSET;
    for (const list of plan.blows) for (const blow of list) hash = fnvBlow(hash, blow);
    expect(planDigestOf(decoded.blows)).toBe(fnvHex(hash));
    expect(decodedPlanProblem(decoded, header(plan))).toBeNull();
  });

  it('refuses bytes that are not a plan and names a header or a plan the page cannot use', () => {
    const plan = samplePlan();
    const bytes = encodePlan(plan);
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 1;
    expect(() => decodePlan(wrongMagic)).toThrow(/not a sculpture plan file/);
    const wrongLayout = bytes.slice();
    wrongLayout[4] = 7;
    expect(() => decodePlan(wrongLayout)).toThrow(/plan file layout 7/);
    expect(() => decodePlan(bytes.slice(0, bytes.length - 1))).toThrow(/needs \d+ bytes; it holds/);
    const good = header(plan);
    const expected = { gridSha256: good.gridSha256, steps: good.steps };
    expect(planHeaderProblem(good, expected)).toBeNull();
    expect(planHeaderProblem({ ...good, format: 'other' }, expected)).toMatch(/format is "other"/);
    expect(planHeaderProblem({ ...good, planVersion: PLAN_VERSION + 1 }, expected)).toMatch(/plan version/);
    expect(planHeaderProblem({ ...good, gridSha256: 'ee'.repeat(32) }, expected)).toMatch(/built on the grid with SHA-256/);
    expect(planHeaderProblem({ ...good, steps: ['a', 'c', 'b'] }, expected)).toMatch(/steps \(a, c, b\) are not the page's/);
    expect(planHeaderProblem({ ...good, snapshots: [{ ...good.snapshots[0], blow: 4 }] }, expected)).toMatch(/does not start at blow 0/);
    expect(planHeaderProblem(null, expected)).toMatch(/format/);
    expect(decodedPlanProblem(decodePlan(bytes), { ...good, planDigest: '00000000' })).toMatch(/blows digest to [0-9a-f]{8} and the header says 00000000/);
    expect(decodedPlanProblem(decodePlan(bytes), { ...good, sweptDigest: '00000000' })).toMatch(/swept cells digest/);
    expect(decodedPlanProblem(decodePlan(bytes), { ...good, planLength: 1 })).toMatch(/holds 13 blows and the header says 1/);
  });

  it('has a PLAN_VERSION whose fingerprint is the synthetic 2 cm plan of today', () => {
    const making = createMaking({ figure: syntheticFigure(0.02), steps: DAVID_STEPS, stages: STAGES, blowCycle: STILL, material: new THREE.MeshBasicMaterial(), mesher: NO_MESHER });
    making.setTime(making.N);
    const swept = DAVID_STEPS.map((_, s) => making.sweepOf(s)?.list ?? new Uint32Array(0));
    const state = fnvHex(fnvArray(fnvArray(FNV_OFFSET, making.stock.values), making.finish));
    const fingerprint = `${making.planDigest}-${sweptDigestOf(swept)}-${state}`;
    making.dispose();
    const recorded = FINGERPRINTS[PLAN_VERSION];
    expect(
      recorded,
      `the synthetic 2 cm plan's fingerprint is ${fingerprint} and PLAN_VERSION ${String(PLAN_VERSION)} records ${String(recorded)}: the planner, the carving or the sweep changed what it produces, so plan files built before are stale. Bump PLAN_VERSION in src/timeline/plan-file.ts to ${String(PLAN_VERSION + 1)}, add ${String(PLAN_VERSION + 1)}: '${fingerprint}' to FINGERPRINTS here, and rebuild with npm run model.`,
    ).toBe(fingerprint);
  }, 120_000);
});
