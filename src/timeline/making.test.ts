/**
 * The Making (src/timeline/making.ts) on a 6 cm synthetic block with four inline steps. What a green run proves, and its bounds:
 *   1. Determinism: after a seeded random history of 50 plays, reversals, steps and scrubs, the hashes of the stock grid, the finish grid, every chunk's positions, the poses and the chips equal those of a fresh Making set straight to the same `t`, checked at 10 points of the history and at the end, in under 3 s of this test file's CPU time (1.9 to 2.2 s under the full suite on 2026-10-14; the bound reads CPU time because wall time under the suite's parallel load reached 3.35 s with the same code, and the other test files running beside it do not inflate this file's CPU).
 *   2. Rest positions: at every integer `t` the first `t` steps are complete, `current` is null and nothing is in flight; no tool is posed except, between two steps of one tool, that tool where its last blow left it; at `t = N` then `t = 0` the stock and finish are the untouched block again and the undo log is empty.
 *   3. Planning: steps are planned in order from the state the earlier steps leave (a later step's blows land on the surface the earlier one cut), `planAll` fills the plan, `planLength` and `planDigest` agree between two Makings and `steps[i]` carries the blow ranges.
 *   4. Blow `k` of a step applies when the position passes STRIKE_PHASE of its window `[k / count, (k + 1) / count)`, the blow in progress is the window's blow at its phase, and chips come from struck blows only.
 *   5. Jumps: a Making whose forward moves of 4 blows or more go through the chunk carve jobs (the in-process carver) matches a serial Making byte for byte, in the grids, the meshes, the poses and the chips, over 24 scrubs and plays, keeps `dirtyChunks` at 0 once `setTime` returns, and undoes the jumped blows back to the untouched block.
 *   6. Cycles: a step with more blows than its playing seconds allow visible strikes is cut into cycles of `group` consecutive blows; the cycle's first blow is the one in progress, the whole group applies at the cycle's strike, and the step's end applies every blow.
 *   7. Look-back: at `t = 1.01`, before the second step's first strike, the chips shown are exactly those of the first step's last strikes still within the stub cycle's 1.5 s lifetime, newest first, each at its own seconds since its strike.
 *   8. Carry-on, with the real blow cycle (src/tools/blow-cycle.ts): across the boundary between two steps of one tool the chisel and the mallet move under 2 cm from `t = k - 1e-6` to `k` to `k + 1e-6`, and `current.previous` past the boundary is the first blow of the earlier step's last cycle, where before 2026-10-13 the tool went back to the bench, over a metre away; where the tool changes, `t = k` poses nothing and the new tool starts at the bench.
 *   9. The sweep at a step's end (src/stock/sweep.ts), on a 1.2 m block of 2 cm cells around a sphere with three steps of hand-placed bulk craters: the first cuts the top slab free, the second a column from the base, the third frees nothing; at every integer `t` no piece of stock floats (the flood fill of src/stock/components.ts finds every component holding a figure or base cell), the sweep comes with the step's last strike (nothing swept before it, the slab gone just past it), `sweptCells` reports the slab and the column and 0 for the third step, a history that crosses the boundaries backward and forward ends in the same bytes, undo log and blow count as a fresh replay with nothing left dirty, the jumping Making (chunk jobs, 4 blows or more) matches a serial one byte for byte at every integer and halfway, and `t = 0` is the untouched block with an empty undo log on both.
 * Bounds: the steps here are inline rasters or hand-placed craters, not the choreography; the mesher is synchronous; the carver runs in-process, so the worker pool's transport is not exercised; nothing is rendered; claim 8 holds for the raster's blows, not the choreography's reach or angles.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { BASE_SECONDS, type Blow, type BlowCycle, type ChipState, type PlanContext, type StageDef, type StepDef, STRIKE_PHASE, type ToolId, type ToolPose, type Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { floodComponents } from '../stock/components';
import { FNV_OFFSET, fnvArray, fnvHex, fnvNumber, fnvText } from '../stock/digest';
import { blockGrid, frameBlockBox, Grid } from '../stock/grid';
import { createBlowCycle } from '../tools/blow-cycle';
import { createMaking, type EngineMaking } from './making';

const CELL = 0.06;
const figure = syntheticFigure(CELL);
const material = new THREE.MeshBasicMaterial();

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

/** Blows on the front face of the current stock: a raster of columns marched in from +Z, tilted a little by the seed. */
function rasterFront(tool: ToolId, size: number, rows: number, cols: number): (ctx: PlanContext) => Blow[] {
  return (ctx) => {
    const random = mulberry32(ctx.seed);
    const blows: Blow[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = ctx.region.min[0] + ((c + 0.5) / cols) * (ctx.region.max[0] - ctx.region.min[0]);
        const y = ctx.region.max[1] - ((r + 0.5) / rows) * (ctx.region.max[1] - ctx.region.min[1]);
        let z = ctx.region.max[2];
        while (z > ctx.region.min[2] && ctx.stock.sample(x, y, z) > 0) z -= ctx.cell / 2;
        if (ctx.figure.sample(x, y, z) - ctx.margin <= 0) continue;
        const tilt = 0.3 * (random() - 0.5);
        const length = Math.hypot(tilt, 1);
        blows.push({ tool, point: [x, y, z], normal: [0, 0, 1], direction: [tilt / length, 0, -1 / length], size, stroke: r });
      }
    }
    return blows;
  };
}

const REGION = { min: [-0.9, 2.5, -0.6] as const, max: [0.9, 5.2, 0.8] as const, label: 'upper front' };
const CALENDAR = { from: '1501-09-13', to: '1501-10-01' };

function step(id: string, tool: ToolId, size: number, margin: number, rows: number, cols: number): StepDef {
  return { id, stage: 'roughing', title: id, detail: `${id}: inline test step, docs/research/technique.md`, tool, region: REGION, margin, blowsPerShown: 10, weight: 1, calendar: CALENDAR, plan: rasterFront(tool, size, rows, cols) };
}

const STEPS: readonly StepDef[] = [step('bulk', 'point', 0.12, 0.05, 4, 6), step('furrows', 'point', 0.08, 0.02, 4, 6), step('comb', 'claw', 0.004, 0.004, 3, 4), step('rasp', 'rasp', 0.002, 0, 2, 3)];
const STAGES: readonly StageDef[] = [{ id: 'roughing', title: 'Roughing', detail: 'test' }];

const cycle: BlowCycle = {
  posesAt(blow, previous, phase): ToolPose[] {
    const back = previous === null ? 0 : 1;
    return [
      { tool: blow.tool, position: [blow.point[0] + phase * 0.1, blow.point[1] + back * 0.01, blow.point[2]], quaternion: [0, 0, 0, 1] },
      { tool: 'mallet', position: [blow.point[0], blow.point[1] + 0.3 * (1 - phase), blow.point[2]], quaternion: [0, 0, 0, 1] },
    ];
  },
  chipsAt(blow, secondsSince): ChipState[] {
    if (secondsSince < 0 || secondsSince > 1.5) return [];
    return [{ position: [blow.point[0], blow.point[1] + secondsSince, blow.point[2]], quaternion: [0, 0, 0, 1], scale: 0.02, life: 1 - secondsSince / 1.5 }];
  },
  restPose(tool): ToolPose {
    return { tool, position: [2, 0.5, 2], quaternion: [0, 0, 0, 1] };
  },
};

function fresh(): EngineMaking {
  return createMaking({ figure, steps: STEPS, stages: STAGES, blowCycle: cycle, material });
}

function hashOf(making: EngineMaking): string {
  let h = fnvArray(FNV_OFFSET, making.stock.values);
  h = fnvArray(h, making.finish);
  for (let id = 0; id < making.remesher.group.children.length + 2000; id += 1) {
    const positions = making.remesher.positionsOf(id);
    if (positions !== null) h = fnvArray(fnvNumber(h, id), positions);
  }
  for (const pose of making.poses) h = fnvText(fnvArray(fnvArray(h, pose.position), pose.quaternion), pose.tool);
  for (const chip of making.chips) h = fnvNumber(fnvArray(h, chip.position), chip.life);
  return fnvHex(h);
}

describe('making', () => {
  it('is a pure function of t after a random history of plays, reversals, steps and scrubs', () => {
    const start = process.cpuUsage();
    const making = fresh();
    const N = making.N;
    const random = mulberry32(2026);
    let t = 0;
    const checks: number[] = [];
    for (let n = 0; n < 50; n += 1) {
      const kind = random();
      if (kind < 0.35) t += 0.1 + 0.6 * random();
      else if (kind < 0.6) t -= 0.1 + 0.6 * random();
      else if (kind < 0.8) t = Math.round(t) + (random() < 0.5 ? 1 : -1);
      else t = random() * N;
      t = Math.min(Math.max(t, 0), N);
      making.setTime(t);
      expect(making.dirtyChunks).toBe(0);
      if (n % 5 === 4) {
        const reference = fresh();
        reference.setTime(t);
        expect(hashOf(making), `after ${String(n + 1)} moves at t = ${String(t)}`).toBe(hashOf(reference));
        expect(making.blowsApplied).toBe(reference.blowsApplied);
        checks.push(t);
      }
    }
    expect(checks.length).toBe(10);
    const used = process.cpuUsage(start);
    const cpuMs = (used.user + used.system) / 1000;
    console.log(`determinism case: ${cpuMs.toFixed(0)} ms of this test file's CPU`);
    expect(cpuMs).toBeLessThan(3000);
  });

  it('rests at integer t with the first t steps complete, and returns to the untouched block', () => {
    const making = fresh();
    making.planAll();
    const counts = making.steps.map((s) => s.blowCount);
    for (let k = 0; k <= making.N; k += 1) {
      making.setTime(k);
      expect(making.current).toBeNull();
      expect(making.blowsApplied).toBe(counts.slice(0, k).reduce((a, b) => a + b, 0));
      // Between two steps of one tool (bulk and furrows, both the point) that tool is held where its last blow left it; everywhere else the tools are down.
      const held = k > 0 && k < making.N && making.steps[k - 1]?.tool === making.steps[k]?.tool;
      expect(making.poses.map((pose) => pose.tool)).toEqual(held ? [making.steps[k]?.tool, 'mallet'] : []);
      expect(making.chips).toEqual([]);
      expect(making.dirtyChunks).toBe(0);
    }
    expect(making.blowsApplied).toBe(making.planLength);
    const pristine = blockGrid(figure.spec, frameBlockBox());
    expect(making.stock.values).not.toEqual(pristine.values);
    making.setTime(0);
    expect(making.stock.values).toEqual(pristine.values);
    expect(making.finish.every((code) => code === 0)).toBe(true);
    expect(making.undoBytes).toBe(0);
    expect(making.stockObject.children.length).toBeGreaterThan(0);
    making.dispose();
  });

  it('plans step by step from the state the earlier steps leave, with a stable length and digest', () => {
    const a = fresh();
    expect(a.planLength).toBeGreaterThan(0);
    expect(a.steps[1]?.blowCount).toBe(0);
    a.setTime(1.5);
    expect(a.steps[1]?.blowCount).toBeGreaterThan(0);
    expect(a.steps[2]?.blowCount).toBe(0);
    const bulk = a.blowsOf(0);
    const furrows = a.blowsOf(1);
    const deepest = Math.min(...furrows.map((b) => b.point[2]));
    expect(deepest).toBeLessThan(BLOCK_M.depth / 2 - 0.05);
    expect(bulk.every((b) => Math.abs(b.point[2] - BLOCK_M.depth / 2) < CELL)).toBe(true);
    a.planAll();
    const b = fresh();
    b.planAll();
    expect(a.planLength).toBe(b.planLength);
    expect(a.planDigest).toBe(b.planDigest);
    expect(a.planDigest).toMatch(/^[0-9a-f]{8}$/);
    expect(a.steps.map((s) => s.firstBlow)).toEqual(a.steps.map((_, i) => a.steps.slice(0, i).reduce((sum, s) => sum + s.blowCount, 0)));
    expect(a.steps.map((s) => s.blowCount).reduce((x, y) => x + y, 0)).toBe(a.planLength);
    expect(a.stages).toBe(STAGES);
    expect(a.t).toBe(1.5);
  });

  it('applies a blow at the strike phase of its window, poses the blow in progress, and launches chips from the struck ones', () => {
    const making = fresh();
    const count = making.steps[0]?.blowCount ?? 0;
    expect(count).toBeGreaterThan(2);
    // Inside the first window before the strike: nothing applied, the first blow in progress at its phase, no chips.
    making.setTime(0.25 / count);
    expect(making.blowsApplied).toBe(0);
    expect(making.current?.blow).toBe(making.blowsOf(0)[0]);
    expect(making.current?.phase).toBeCloseTo(0.25, 9);
    expect(making.poses.length).toBe(2);
    expect(making.poses[0]?.tool).toBe('point');
    expect(making.chips).toEqual([]);
    // Just past the strike of the first window: the first blow is applied and its chips fly.
    making.setTime((STRIKE_PHASE + 0.05) / count);
    expect(making.blowsApplied).toBe(1);
    expect(making.current?.blow).toBe(making.blowsOf(0)[0]);
    expect(making.chips.length).toBeGreaterThan(0);
    // Mid-step: the blows whose strike the position has passed.
    making.setTime(0.5);
    const position = 0.5 * count;
    expect(making.blowsApplied).toBe(Math.floor(position - STRIKE_PHASE) + 1);
    expect(making.current?.blow).toBe(making.blowsOf(0)[Math.floor(position)]);
    expect(making.current?.phase).toBeCloseTo(position - Math.floor(position), 9);
    // The step's end applies its last blow; nothing is in progress, and the point is held for the second step, which uses it too.
    making.setTime(1);
    expect(making.blowsApplied).toBe(count);
    expect(making.current).toBeNull();
    expect(making.poses.map((pose) => pose.tool)).toEqual(['point', 'mallet']);
  });

  it('carries an unchanged tool on across a step boundary, where it once went back to the bench, and sets a changed tool down', () => {
    const real = createBlowCycle();
    const making = createMaking({ figure, steps: STEPS, stages: STAGES, blowCycle: real, material });
    making.planAll();
    const EPS = 1e-6;
    const positions = (t: number): Map<string, Vec3> => {
      making.setTime(t);
      return new Map(making.poses.map((pose) => [pose.tool, pose.position]));
    };
    const distance = (a: Vec3 | undefined, b: Vec3 | undefined): number => (a === undefined || b === undefined ? Number.POSITIVE_INFINITY : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    // bulk → furrows, both the point: the tool and the mallet stay where the last blow left them, through the rest position and into the next approach.
    const before = positions(1 - EPS);
    const held = positions(1);
    const after = positions(1 + EPS);
    expect([...held.keys()]).toEqual(['point', 'mallet']);
    for (const tool of ['point', 'mallet']) {
      expect(distance(before.get(tool), held.get(tool)), `${tool} across t = 1`).toBeLessThan(0.02);
      expect(distance(held.get(tool), after.get(tool)), `${tool} into the second step`).toBeLessThan(0.02);
    }
    const bulk = making.blowsOf(0);
    expect(making.current?.previous).toBe(bulk[bulk.length - 1]);
    // The bench is over a metre from the stone: the jump the carry-on removes.
    expect(distance(before.get('point'), real.restPose('point').position)).toBeGreaterThan(1);
    // furrows → comb: the point is set down and the claw starts at the bench.
    expect(positions(2).size).toBe(0);
    const claw = positions(2 + EPS);
    expect(making.current?.previous).toBeNull();
    expect(distance(claw.get('claw'), real.restPose('claw').position)).toBeLessThan(0.02);
    making.dispose();
  });

  it("shows the previous step's last strikes' chips when the next step is young", () => {
    const making = fresh();
    making.setTime(1.01);
    // Step 1 is a hundredth in, before its first strike, so every chip is step 0's: its last strikes, newest first, as long as the stub still shows them.
    expect(making.blowsApplied).toBe(making.steps[0]?.blowCount);
    const { cycles, group } = making.cyclesOf(0);
    expect(group).toBe(1);
    const elapsed = (making.t - 1) * BASE_SECONDS;
    const secondsPerCycle = BASE_SECONDS / cycles;
    const expected: ChipState[] = [];
    for (let c = cycles - 1; c >= 0; c -= 1) {
      const blow = making.blowsOf(0)[c];
      if (blow !== undefined) expected.push(...cycle.chipsAt(blow, elapsed + (cycles - (c + STRIKE_PHASE)) * secondsPerCycle));
    }
    expect(expected.length).toBeGreaterThan(1);
    expect(expected.length).toBeLessThan(cycles);
    expect(making.chips.length).toBe(expected.length);
    making.chips.forEach((chip, i) => {
      const want = expected[i] as ChipState;
      for (let axis = 0; axis < 3; axis += 1) expect(chip.position[axis]).toBeCloseTo(want.position[axis] ?? Number.NaN, 9);
      expect(chip.life).toBeCloseTo(want.life, 9);
    });
    expect(making.chips[0]?.position[0]).toBe(making.blowsOf(0)[cycles - 1]?.point[0]);
  });

  it('jumps through chunk jobs to the same bytes as the serial path, with exact undo', () => {
    const serial = fresh();
    const jumping = createMaking({ figure, steps: STEPS, stages: STAGES, blowCycle: cycle, material, carver: 'in-process', jumpBlows: 4 });
    const N = serial.N;
    const random = mulberry32(77);
    let t = 0;
    for (let n = 0; n < 24; n += 1) {
      t = n % 3 === 0 ? random() * N : Math.min(Math.max(t + (random() - 0.5) * 1.5, 0), N);
      serial.setTime(t);
      jumping.setTime(t);
      expect(jumping.dirtyChunks).toBe(0);
      expect(jumping.blowsApplied).toBe(serial.blowsApplied);
      expect(hashOf(jumping), `at t = ${String(t)}`).toBe(hashOf(serial));
    }
    expect(jumping.planLength).toBe(serial.planLength);
    expect(jumping.planDigest).toBe(serial.planDigest);
    jumping.setTime(N);
    expect(jumping.blowsApplied).toBe(jumping.planLength);
    jumping.setTime(0);
    expect(jumping.stock.values).toEqual(blockGrid(figure.spec, frameBlockBox()).values);
    expect(jumping.finish.every((code) => code === 0)).toBe(true);
    expect(jumping.undoBytes).toBe(0);
  });

  it('groups a long step into visible cycles of consecutive blows that apply together at the strike', () => {
    const long = step('long', 'point', 0.05, 0.02, 12, 20);
    const making = createMaking({ figure, steps: [{ ...long, weight: 0.5 }], stages: STAGES, blowCycle: cycle, material });
    const count = making.steps[0]?.blowCount ?? 0;
    const { cycles, group } = making.cyclesOf(0);
    expect(count).toBeGreaterThan(100);
    expect(group).toBeGreaterThan(1);
    expect(cycles).toBe(Math.ceil(count / group));
    expect(cycles).toBeLessThanOrEqual(Math.round(0.5 * 12 * 4));
    // Cycle 2 mid-approach: cycles 0 and 1 are applied in full, the cycle's first blow is in progress.
    making.setTime((2 + 0.3) / cycles);
    expect(making.blowsApplied).toBe(2 * group);
    expect(making.current?.blow).toBe(making.blowsOf(0)[2 * group]);
    expect(making.current?.phase).toBeCloseTo(0.3, 9);
    expect(making.poses[0]?.position[0]).toBeCloseTo((making.blowsOf(0)[2 * group]?.point[0] ?? 0) + 0.3 * 0.1, 9);
    // Just past the strike of cycle 2: its whole group is applied and its chips fly.
    making.setTime((2 + STRIKE_PHASE + 0.01) / cycles);
    expect(making.blowsApplied).toBe(3 * group);
    expect(making.chips.length).toBeGreaterThan(0);
    making.setTime(1);
    expect(making.blowsApplied).toBe(count);
  });
});

/** A 1.2 m block of 2 cm cells around a sphere, and bulk craters that cut pieces of it free: the horizontal slit frees the top slab, the vertical slits a column on each side, the bottom cut the +x column from the base. */
const CUT_SPEC = { cell: 0.02, size: [72, 72, 72] as const, origin: [-0.72, -0.1, -0.72] as const, band: 16 };
const CUT_BLOCK = { min: [-0.6, 0, -0.6] as Vec3, max: [0.6, 1.2, 0.6] as Vec3 };
const CUT_REGION = { min: CUT_BLOCK.min, max: CUT_BLOCK.max, label: 'the block' };

function craters(xs: readonly number[], ys: readonly number[], zs: readonly number[], direction: Vec3, normal: Vec3, size = 0.15): Blow[] {
  const blows: Blow[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) blows.push({ tool: 'point', point: [x, y, z], normal, direction, size, stroke: 0 });
  return blows;
}

function cutStep(id: string, blows: readonly Blow[]): StepDef {
  return { id, stage: 'roughing', title: id, detail: `${id}: hand-placed craters, docs/research/technique.md`, tool: 'point', region: CUT_REGION, margin: 0, blowsPerShown: 1, weight: 1, calendar: CALENDAR, plan: () => blows };
}

const CUT_YS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const CUT_ZS = [-0.45, -0.15, 0.15, 0.45];
const CUT_STEPS: readonly StepDef[] = [
  cutStep('slab', craters([-0.5, -0.25, 0, 0.25, 0.5], [0.95], CUT_ZS, [1, 0, 0], [0, 1, 0])),
  cutStep('columns', [...craters([-0.35], CUT_YS, CUT_ZS, [0, 0, 1], [-1, 0, 0]), ...craters([0.35], CUT_YS, CUT_ZS, [0, 0, 1], [1, 0, 0]), ...craters([0.57], [-0.05], CUT_ZS, [0, 0, 1], [1, 0, 0])]),
  cutStep('cones', craters([-0.2, 0, 0.2], [0.76], [0.35], [0, -1, 0], [0, 1, 0], 0.02)),
];

function cutMaking(jumping = false): EngineMaking {
  const sphere = new Grid(CUT_SPEC);
  sphere.fill((x, y, z) => Math.hypot(x, y - 0.6, z) - 0.25);
  return createMaking({ figure: sphere, block: CUT_BLOCK, steps: CUT_STEPS, stages: STAGES, blowCycle: cycle, material, ...(jumping ? { carver: 'in-process' as const, jumpBlows: 4 } : {}) });
}

/** Components of the stock that hold neither a figure cell nor a base cell: what must be gone at a rest position. */
function loosePieces(making: EngineMaking): number {
  const found = floodComponents(making.stock, making.figure, making.baseRow);
  let loose = 0;
  for (let c = 0; c < found.count; c += 1) if (found.holdsFigure[c] === 0 && found.holdsBase[c] === 0) loose += 1;
  return loose;
}

describe('the sweep at a step boundary', () => {
  it('takes the pieces a step cuts free off at its end, the same after any history and through the jump path, and puts them back on undo', () => {
    const reference = cutMaking();
    reference.setTime(reference.N);
    expect(reference.sweptCells(0)).toBeGreaterThan(5000);
    expect(reference.sweptCells(1)).toBeGreaterThan(1000);
    expect(reference.sweptCells(2)).toBe(0);
    expect(reference.sweepOf(0)?.relabelled).toBe(27);
    const atRest = [1, 2, 3].map((k) => {
      const fresh = cutMaking();
      fresh.setTime(k);
      expect(loosePieces(fresh), `loose stock at t = ${String(k)}`).toBe(0);
      return { k, hash: hashOf(fresh), blows: fresh.blowsApplied, undo: fresh.undoBytes };
    });
    // The sweep comes with the step's last strike, not with the integer: before that strike nothing is swept, just past it the slab is gone.
    const mid = cutMaking();
    const count = mid.steps[0]?.blowCount ?? 0;
    mid.setTime((count - 1 + 0.3) / count);
    expect(mid.blowsApplied).toBe(count - 1);
    expect(mid.sweptCells(0)).toBe(0);
    mid.setTime((count - 1 + 0.7) / count);
    expect(mid.blowsApplied).toBe(count);
    expect(mid.sweptCells(0)).toBe(reference.sweptCells(0));
    expect(loosePieces(mid)).toBe(0);
    mid.dispose();
    // A history across the boundaries, backward and forward.
    const making = cutMaking();
    for (const t of [3, 0.5, 2, 1, 2.5, 1.5, 3, 1, 3]) {
      making.setTime(t);
      expect(making.dirtyChunks).toBe(0);
      const rest = atRest.find((entry) => entry.k === t);
      if (rest === undefined) continue;
      expect(hashOf(making), `after the history at t = ${String(t)}`).toBe(rest.hash);
      expect(making.blowsApplied).toBe(rest.blows);
      expect(making.undoBytes).toBe(rest.undo);
    }
    expect(making.sweptCells(0)).toBe(reference.sweptCells(0));
    expect(making.sweptCells(1)).toBe(reference.sweptCells(1));
    // The jump path: every step goes to the chunk jobs and the sweep runs when it lands.
    const jumping = cutMaking(true);
    for (const t of [1, 0.5, 2, 1.5, 3, 2.5, 1, 3]) {
      jumping.setTime(t);
      expect(jumping.dirtyChunks).toBe(0);
      const serial = cutMaking();
      serial.setTime(t);
      expect(hashOf(jumping), `jumping at t = ${String(t)}`).toBe(hashOf(serial));
      expect(jumping.blowsApplied).toBe(serial.blowsApplied);
      serial.dispose();
    }
    expect(jumping.sweptCells(1)).toBe(reference.sweptCells(1));
    // Undo to the block: the swept cells come back with the blows' own.
    const pristine = blockGrid(CUT_SPEC, CUT_BLOCK);
    for (const m of [making, jumping]) {
      m.setTime(0);
      expect(m.stock.values).toEqual(pristine.values);
      expect(m.finish.every((code) => code === 0)).toBe(true);
      expect(m.undoBytes).toBe(0);
      m.dispose();
    }
    reference.dispose();
  });
});
