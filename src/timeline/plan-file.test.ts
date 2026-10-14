/**
 * The plan file's format and its version (src/timeline/plan-file.ts). What a green run proves, and its bounds:
 *   1. The `.plan.bin` bytes round-trip every bit of every blow (numbers that are not short decimals, a negative zero, every tool) and every swept cell, and the decoded plan gives the digest the Making computes (`planDigestOf` is `fnvBlow` over the blows in order).
 *   2. Bytes that are not a plan are refused with what is wrong (the magic, the layout version, a truncated file, steps that do not partition the blows, refused before a blow is built, a number that is not finite), and a header the page cannot use is named with why: another format, plan version, planner fingerprint, snapshot format, block or stock band, grid, step list, no SHA-256 of the data file, a snapshot table that does not start at blow 0, repeats a blow, runs past the plan or names a path; a decoded plan whose length or digests differ from its header, or whose snapshot table names a step its blow is not in, is named too, and so are swept lists that repeat a cell, go backward or leave the grid.
 *   3. PLAN_VERSION names what the planner produces: the fingerprint of the whole David plan on the synthetic figure at 2 cm cells (src/timeline/plan-build.ts, `planFingerprint`: the plan digest, the swept cells' digest and a hash of the stock and finish halfway through and at the end of every step) equals the entry PLAN_FINGERPRINTS holds for PLAN_VERSION. A change to the generators, the carving, the tool volumes or the sweep that changes any of those states fails here until a new version's fingerprint is added; and since the build writes PLAN_FINGERPRINT into the header and the page refuses another (claim 2), a plan file built before is refused even if the entry was edited in place instead (the page then plans for itself until `npm run model:plan` rebuilds it).
 *   4. The negative control of 3: on a small block, two makings that end in the same bytes but paint a different finish code on the way (the charcoal's mark, later polished over) give different fingerprints, the change the review of 2026-10-14 found a final-state fingerprint blind to.
 * Bounds: the fingerprint is computed in Node; the page's Chrome computes some transcendental functions differently in the last bit (docs/research/decisions.md, Engine), which is why the page takes the plan from the file rather than checking its own plan against it. A planner change that leaves the synthetic figure's plan and states alone but changes the David's, or a change seen only between a step's halfway point and its end and undone by the end, is not caught; the step list is compared by id in the page.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { DAVID_STEPS } from '../choreography/david-steps';
import { STAGES } from '../choreography/stages';
import type { Blow, BlowCycle, StepDef, ToolId, Vec3 } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { TOOL_FINISH } from '../stock/carve';
import { TOOL_IDS } from '../stock/carve-jobs';
import { FNV_OFFSET, fnvBlow, fnvHex } from '../stock/digest';
import { Grid } from '../stock/grid';
import type { ChunkMesher } from '../stock/remesh';
import { createMaking, type MakingOptions } from './making';
import { planFingerprint } from './plan-build';
import { decodedPlanProblem, decodePlan, encodePlan, PLAN_FINGERPRINT, PLAN_FINGERPRINTS, PLAN_FORMAT, PLAN_VERSION, type PlanHeader, planDigestOf, planHeaderProblem, sweptDigestOf, sweptProblem } from './plan-file';
import { SNAPSHOT_VERSION } from '../stock/snapshot';

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
    planFingerprint: PLAN_FINGERPRINT,
    snapshotVersion: SNAPSHOT_VERSION,
    block: { min: [-1, 0, -0.5], max: [1, 5, 0.5] },
    stockBand: 3,
    gridSha256: 'ab'.repeat(32),
    steps: ['a', 'b', 'c'],
    planLength: plan.blows.reduce((sum, list) => sum + list.length, 0),
    planDigest: planDigestOf(plan.blows),
    sweptDigest: sweptDigestOf(plan.swept),
    sweptCells: plan.swept.map((list) => list.length),
    planSha256: 'ef'.repeat(32),
    snapshots: [
      { blow: 0, step: 0, file: 'x.snap.0.bin.gz', bytes: 10, gzipBytes: 5, sha256: 'cd'.repeat(32), replaySeconds: 0.5 },
      { blow: 9, step: 1, file: 'x.snap.1.bin.gz', bytes: 10, gzipBytes: 5, sha256: 'cd'.repeat(32), replaySeconds: 0.5 },
    ],
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

  it('refuses bytes that are not a plan and names a header, a plan or swept lists the page cannot use', () => {
    const plan = samplePlan();
    const bytes = encodePlan(plan);
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 1;
    expect(() => decodePlan(wrongMagic)).toThrow(/not a sculpture plan file/);
    const wrongLayout = bytes.slice();
    wrongLayout[4] = 7;
    expect(() => decodePlan(wrongLayout)).toThrow(/plan file layout 7/);
    expect(() => decodePlan(bytes.slice(0, bytes.length - 1))).toThrow(/needs \d+ bytes; it holds/);
    // Every step claiming the same blows: refused from the step table, before any blow is built.
    const overlapping = bytes.slice();
    const view = new DataView(overlapping.buffer);
    view.setUint32(24 + 12, 0, true);
    expect(() => decodePlan(overlapping)).toThrow(/step 1 starts at blow 0; the steps before it end at 5/);
    const infinite = bytes.slice();
    new DataView(infinite.buffer).setFloat64(24 + 3 * 12 + 4, Number.POSITIVE_INFINITY, true);
    expect(() => decodePlan(infinite)).toThrow(/plan file blow 0 has number 0 Infinity, which is not finite/);
    const good = header(plan);
    const expected = { gridSha256: good.gridSha256, steps: good.steps, block: good.block, stockBand: good.stockBand };
    expect(planHeaderProblem(good, expected)).toBeNull();
    expect(planHeaderProblem({ ...good, format: 'other' }, expected)).toMatch(/format is "other"/);
    expect(planHeaderProblem({ ...good, planVersion: PLAN_VERSION + 1 }, expected)).toMatch(/plan version/);
    expect(planHeaderProblem({ ...good, planFingerprint: 'an older planner' }, expected)).toMatch(/fingerprint "an older planner" and this page's is/);
    expect(planHeaderProblem({ ...good, snapshotVersion: SNAPSHOT_VERSION + 1 }, expected)).toMatch(/snapshots are format/);
    expect(planHeaderProblem({ ...good, block: { min: [-1, 0, -0.5], max: [1, 5, 0.5000001] } }, expected)).toMatch(/built from the block/);
    expect(planHeaderProblem({ ...good, stockBand: 4 }, expected)).toMatch(/stock band of 4 cells/);
    expect(planHeaderProblem({ ...good, gridSha256: 'ee'.repeat(32) }, expected)).toMatch(/built on the grid with SHA-256/);
    expect(planHeaderProblem({ ...good, steps: ['a', 'c', 'b'] }, expected)).toMatch(/steps \(a, c, b\) are not the page's/);
    expect(planHeaderProblem({ ...good, planSha256: undefined }, expected)).toMatch(/SHA-256 of the data file/);
    const [first, second] = good.snapshots;
    if (first === undefined || second === undefined) throw new Error('the sample header lost its snapshots');
    expect(planHeaderProblem({ ...good, snapshots: [{ ...first, blow: 4 }] }, expected)).toMatch(/does not start at blow 0/);
    expect(planHeaderProblem({ ...good, snapshots: [first, { ...second, blow: 0 }] }, expected)).toMatch(/snapshot table entry .* lacks/);
    expect(planHeaderProblem({ ...good, snapshots: [first, { ...second, blow: good.planLength + 1 }] }, expected)).toMatch(/snapshot table entry .* lacks/);
    expect(planHeaderProblem({ ...good, snapshots: [{ ...first, file: '../david.json' }] }, expected)).toMatch(/snapshot table entry .* lacks/);
    expect(planHeaderProblem(null, expected)).toMatch(/format/);
    const decoded = decodePlan(bytes);
    expect(decodedPlanProblem(decoded, { ...good, planDigest: '00000000' })).toMatch(/blows digest to [0-9a-f]{8} and the header says 00000000/);
    expect(decodedPlanProblem(decoded, { ...good, sweptDigest: '00000000' })).toMatch(/swept cells digest/);
    expect(decodedPlanProblem(decoded, { ...good, planLength: 1 })).toMatch(/holds 13 blows and the header says 1/);
    // Step 0 holds blows 0 to 5: a snapshot at blow 9 that names it is refused.
    expect(decodedPlanProblem(decoded, { ...good, snapshots: [first, { ...second, step: 0 }] })).toMatch(/names step 0, which holds blows 0 to 5/);
    expect(sweptProblem(plan.swept, 4_000_000_001)).toBeNull();
    expect(sweptProblem(plan.swept, 4_000_000_000)).toMatch(/step 0's swept cell 2 is 4000000000/);
    expect(sweptProblem([Uint32Array.from([3, 3])], 100)).toMatch(/step 0's swept cell 1 is 3, which is not past the cell before it \(3\)/);
    expect(sweptProblem([Uint32Array.from([5, 4])], 100)).toMatch(/swept cell 1 is 4/);
  });

  it('has a PLAN_VERSION whose fingerprint is the synthetic 2 cm plan of today', () => {
    const making = createMaking({ figure: syntheticFigure(0.02), steps: DAVID_STEPS, stages: STAGES, blowCycle: STILL, material: new THREE.MeshBasicMaterial(), mesher: NO_MESHER });
    const fingerprint = planFingerprint(making);
    making.dispose();
    const recorded = PLAN_FINGERPRINTS[PLAN_VERSION];
    expect(
      recorded,
      `the synthetic 2 cm plan's fingerprint is ${fingerprint} and PLAN_VERSION ${String(PLAN_VERSION)} records ${String(recorded)}: the planner, the carving or the sweep changed what it produces, so plan files built before are stale. Bump PLAN_VERSION in src/timeline/plan-file.ts to ${String(PLAN_VERSION + 1)}, add ${String(PLAN_VERSION + 1)}: '${fingerprint}' to PLAN_FINGERPRINTS there (never edit a line in place), and rebuild with npm run model:plan.`,
    ).toBe(fingerprint);
  }, 120_000);

  it('fingerprints a finish painted on the way and polished over by the end', () => {
    const spec = { cell: 0.02, size: [40, 40, 40] as const, origin: [-0.4, -0.1, -0.4] as const, band: 16 };
    const figure = new Grid(spec);
    figure.fill((x, y, z) => Math.hypot(x, y - 0.3, z) - 0.1);
    const block = { min: [-0.3, 0, -0.3] as Vec3, max: [0.3, 0.6, 0.3] as Vec3 };
    const blows = (tool: ToolId): Blow[] => [-0.1, 0, 0.1].flatMap((x) => [-0.1, 0.1].map((z, n): Blow => ({ tool, point: [x, 0.6, z], normal: [0, 1, 0], direction: [0, -1, 0], size: 0.002, stroke: n })));
    const step = (id: string, tool: ToolId): StepDef => ({ id, stage: 'polishing', title: id, detail: `${id}: inline test step, docs/research/technique.md`, tool, region: { ...block, label: 'the block' }, margin: 0, blowsPerShown: 1, weight: 1, calendar: { from: '1504-01-01', to: '1504-01-02' }, plan: () => blows(tool) });
    const options: MakingOptions = { figure, block, steps: [step('mark', 'charcoal'), step('polish', 'polish')], stages: STAGES, blowCycle: STILL, material: new THREE.MeshBasicMaterial(), mesher: NO_MESHER };
    const marks = TOOL_FINISH as Record<ToolId, number>;
    const drawn = marks.charcoal;
    const run = (): { fingerprint: string; stock: Int16Array; finish: Uint8Array } => {
      const making = createMaking(options);
      const fingerprint = planFingerprint(making);
      return { fingerprint, stock: making.stock.values.slice(), finish: making.finish.slice() };
    };
    const plain = run();
    let changed: ReturnType<typeof run>;
    try {
      marks.charcoal = (drawn + 6) % 14;
      changed = run();
    } finally {
      marks.charcoal = drawn;
    }
    // The polish paints over every cell the charcoal marked, so both end in the same bytes.
    expect(plain.finish.some((code) => code === marks.polish)).toBe(true);
    expect(Buffer.from(changed.stock.buffer).equals(Buffer.from(plain.stock.buffer))).toBe(true);
    expect(Buffer.from(changed.finish.buffer).equals(Buffer.from(plain.finish.buffer))).toBe(true);
    expect(changed.fingerprint).not.toBe(plain.fingerprint);
  });
});
