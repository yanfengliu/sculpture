/**
 * The Making (src/timeline/making.ts) on a 6 cm synthetic block with four inline steps. What a green run proves, and its bounds:
 *   1. Determinism: after a seeded random history of 50 plays, reversals, steps and scrubs, the hashes of the stock grid, the finish grid, every chunk's positions, the poses and the chips equal those of a fresh Making set straight to the same `t`, checked at 10 points of the history and at the end, in under 3 s (about 1.2 s alone; the bound leaves room for the other test files running beside it).
 *   2. Rest positions: at every integer `t` the first `t` steps are complete, `current` is null, no tool is posed and nothing is in flight; at `t = N` then `t = 0` the stock and finish are the untouched block again and the undo log is empty.
 *   3. Planning: steps are planned in order from the state the earlier steps leave (a later step's blows land on the surface the earlier one cut), `planAll` fills the plan, `planLength` and `planDigest` agree between two Makings and `steps[i]` carries the blow ranges.
 *   4. Blow `k` of a step applies when the position passes STRIKE_PHASE of its window `[k / count, (k + 1) / count)`, the blow in progress is the window's blow at its phase, and chips come from struck blows only.
 * Bounds: the steps here are inline rasters, not the choreography; the mesher is synchronous; nothing is rendered.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { type Blow, type BlowCycle, type ChipState, type PlanContext, type StageDef, type StepDef, STRIKE_PHASE, type ToolId, type ToolPose } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { FNV_OFFSET, fnvArray, fnvHex, fnvNumber, fnvText } from '../stock/digest';
import { blockGrid, frameBlockBox } from '../stock/grid';
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
    const start = performance.now();
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
    expect(performance.now() - start).toBeLessThan(3000);
  });

  it('rests at integer t with the first t steps complete, and returns to the untouched block', () => {
    const making = fresh();
    making.planAll();
    const counts = making.steps.map((s) => s.blowCount);
    for (let k = 0; k <= making.N; k += 1) {
      making.setTime(k);
      expect(making.current).toBeNull();
      expect(making.blowsApplied).toBe(counts.slice(0, k).reduce((a, b) => a + b, 0));
      expect(making.poses).toEqual([]);
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
    // The step's end applies its last blow.
    making.setTime(1);
    expect(making.blowsApplied).toBe(count);
    expect(making.poses).toEqual([]);
  });
});
