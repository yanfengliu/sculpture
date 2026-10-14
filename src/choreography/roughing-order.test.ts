/**
 * The plan-order gate for the owner's report "chipping away row by row?" (docs/learning/defect-register.md, second entry; fleet R17): the three roughing steps of the front on the synthetic figure at 2 cm, planned again with the planner's marks (src/choreography/generators/furrows.ts, planFurrows) from the stock each step starts from, held to the record's order (docs/research/technique.md, Stage 2: the highest points first, the furrows along the form). What a green run proves, and its bounds:
 *   1. The instrument is the plan the page plays: the replanned blows equal the Making's own for each step, blow for blow.
 *   2. Highest points first: in every layer of bulk craters (one pass over one face, at least MIN_LAYER blows), the first blow lies where the figure stands highest under the face: the figure's depth below the block's face at the first blow, found by this test's own march along the face's inward axis, is within the shallowest FIRST_SHARE of the depths under the layer's blows.
 *   3. Outward spread: in every such layer the mean distance in the face's plane from the layer's first blow grows from the layer's first quarter of blows to its last.
 *   4. The furrows follow the form: every run of the sculptor's 45-degree point whose contour is defined (the figure's normal under the run's first blow leans at least CONTOUR_LEAN into the face's plane) runs within CONTOUR_DEGREES of that contour, and under AXIS_SHARE of the runs lie within AXIS_DEGREES of a world axis.
 *   5. The checks are live: the same layers in raster order (rows from the top, then left to right) fail claim 2, and the same runs turned to the world's x axis fail claim 4.
 * Bounds: the synthetic mannequin at 2 cm and the front's three roughing steps; the sides and the back run the same code but are not checked here; layers are the planner's own passes (its marks), so a planner that mislabels its passes would hide a raster inside one; the look stays the owner's check through the captures and the video.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { Blow, BlowCycle, PlanContext, ToolPose, Vec3 } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { seedOf } from '../stock/digest';
import type { Grid } from '../stock/grid';
import { createMaking } from '../timeline/making';
import { DAVID_STEPS } from './david-steps';
import { type FurrowMark, planFurrows } from './generators/furrows';
import { POINT_WORK } from './point-work';
import { STAGES } from './stages';

const CELL = 0.02;
const ROUGHING = ['high-points', 'chest-and-face', 'front-furrows'] as const;
/** Layers with fewer blows are not judged: a pass that tidies a few columns has no order to speak of. */
const MIN_LAYER = 12;
const FIRST_SHARE = 0.1;
const CONTOUR_LEAN = 0.25;
const CONTOUR_DEGREES = 35;
const AXIS_DEGREES = 10;
const AXIS_SHARE = 0.5;
/** A move between consecutive blows of a layer longer than this, metres, is logged as a hop (no bound: the record says the work spreads, not how far a hand moves). */
const HOP = 0.4;

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

/** Depth below `zFace` along −z at (x, y) where the figure's field drops to 0: how far the figure stands from the face there; Infinity when the column meets no figure. */
function figureDepth(figure: Grid, x: number, y: number, zFace: number, zEnd: number): number {
  const step = figure.cell / 2;
  for (let z = zFace; z >= zEnd; z -= step) if (figure.sample(x, y, z) <= 0) return zFace - z;
  return Number.POSITIVE_INFINITY;
}

interface Layer {
  readonly key: string;
  readonly blows: Blow[];
}

function layersOf(blows: readonly Blow[], marks: readonly FurrowMark[]): Layer[] {
  const layers = new Map<string, Blow[]>();
  blows.forEach((blow, n) => {
    const mark = marks[n];
    if (mark === undefined || mark.kind !== 'bulk') return;
    const key = `${mark.face} phase ${String(mark.phase)} pass ${String(mark.pass)}`;
    const list = layers.get(key) ?? [];
    list.push(blow);
    layers.set(key, list);
  });
  return [...layers.entries()].map(([key, list]) => ({ key, blows: list }));
}

/** Claim 2 for one layer: the share of the layer's blows standing strictly higher (shallower) than its first. */
function higherThanFirst(figure: Grid, layer: readonly Blow[], zFace: number, zEnd: number): number {
  const depths = layer.map((b) => figureDepth(figure, b.point[0], b.point[1], zFace, zEnd));
  const first = depths[0] ?? Number.POSITIVE_INFINITY;
  return depths.filter((d) => d < first).length / depths.length;
}

/** Claim 3 for one layer: the mean in-face distance from the first blow over the first quarter and the last quarter of the layer. */
function spread(layer: readonly Blow[]): { first: number; last: number } {
  const origin = layer[0]?.point ?? [0, 0, 0];
  const d = layer.map((b) => Math.hypot(b.point[0] - origin[0], b.point[1] - origin[1]));
  const q = Math.max(1, Math.floor(d.length / 4));
  const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  return { first: mean(d.slice(0, q)), last: mean(d.slice(d.length - q)) };
}

/** The run's line in the face's plane: the tool axis without its part along the blow's normal, then without z. */
function runLine(blow: Blow): [number, number] {
  const { direction: d, normal: n } = blow;
  const along = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  const u: Vec3 = [d[0] - along * n[0], d[1] - along * n[1], d[2] - along * n[2]];
  const length = Math.hypot(u[0], u[1]);
  return length < 1e-9 ? [1, 0] : [u[0] / length, u[1] / length];
}

/** The contour in the face's plane under (x, y): perpendicular to the figure normal's part in the plane, at the margin surface below the face; null where that part is under CONTOUR_LEAN or no figure lies below. */
function contourAt(figure: Grid, x: number, y: number, margin: number, zFace: number, zEnd: number): [number, number] | null {
  const step = figure.cell / 2;
  for (let z = zFace; z >= zEnd; z -= step) {
    if (figure.sample(x, y, z) - margin > 0) continue;
    const g = figure.gradient(x, y, z + step);
    const lean = Math.hypot(g[0], g[1]);
    return lean < CONTOUR_LEAN ? null : [-g[1] / lean, g[0] / lean];
  }
  return null;
}

function degreesBetweenLines(a: readonly [number, number], b: readonly [number, number]): number {
  return (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI;
}

describe('the roughing order on the synthetic figure at 2 cm', () => {
  it('starts each layer at the highest points, spreads outward and runs the furrows along the form', () => {
    const m = createMaking({ figure: syntheticFigure(CELL), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
    const lines: string[] = [];
    const failures: string[] = [];
    const rasterFailures: string[] = [];
    let runsJudged = 0;
    let runsOnAxis = 0;
    let runsTotal = 0;
    let axisMutantFailures = 0;
    for (const id of ROUGHING) {
      const index = DAVID_STEPS.findIndex((s) => s.id === id);
      const def = DAVID_STEPS[index];
      const work = POINT_WORK[id];
      if (def === undefined || work === undefined) throw new Error(`step ${id} is not in DAVID_STEPS or POINT_WORK`);
      m.setTime(index);
      const ctx: PlanContext = { figure: m.figure, stock: m.stock, region: def.region, margin: def.margin, seed: seedOf(def.id), cell: m.stock.cell };
      const { phases, floor } = work(ctx);
      const plan = planFurrows(ctx, phases, floor);
      expect(plan.blows, `${id}: the replanned blows are the Making's`).toEqual(m.blowsOf(index));
      expect(plan.marks.length).toBe(plan.blows.length);
      const zFace = def.region.max[2];
      const zEnd = def.region.min[2];
      for (const layer of layersOf(plan.blows, plan.marks)) {
        if (layer.blows.length < MIN_LAYER) continue;
        const higher = higherThanFirst(m.figure, layer.blows, zFace, zEnd);
        const s = spread(layer.blows);
        const f = layer.blows[0]?.point ?? [0, 0, 0];
        const hops = layer.blows.filter((b, n) => n > 0 && Math.hypot(b.point[0] - (layer.blows[n - 1]?.point[0] ?? 0), b.point[1] - (layer.blows[n - 1]?.point[1] ?? 0)) > HOP).length;
        lines.push(`${id} ${layer.key}: ${String(layer.blows.length)} blows from (${f[0].toFixed(2)}, ${f[1].toFixed(2)}), ${(higher * 100).toFixed(0)}% higher than the first, mean distance from it ${s.first.toFixed(2)} m over the first quarter and ${s.last.toFixed(2)} m over the last, ${String(hops)} moves over ${String(HOP)} m`);
        if (higher > FIRST_SHARE) failures.push(`${id} ${layer.key}: ${(higher * 100).toFixed(0)}% of the layer's ${String(layer.blows.length)} blows stand higher than its first (at most ${String(FIRST_SHARE * 100)}%)`);
        if (!(s.last > s.first)) failures.push(`${id} ${layer.key}: the mean distance from the first blow falls from ${s.first.toFixed(2)} to ${s.last.toFixed(2)} m over the layer`);
        const raster = [...layer.blows].sort((a, b) => b.point[1] - a.point[1] || a.point[0] - b.point[0]);
        if (higherThanFirst(m.figure, raster, zFace, zEnd) > FIRST_SHARE) rasterFailures.push(`${id} ${layer.key}`);
      }
      const runs = new Map<number, Blow>();
      plan.blows.forEach((blow, n) => {
        if (plan.marks[n]?.kind === 'stroke' && !runs.has(blow.stroke)) runs.set(blow.stroke, blow);
      });
      const deviations: number[] = [];
      for (const first of runs.values()) {
        runsTotal += 1;
        const line = runLine(first);
        if (degreesBetweenLines(line, [1, 0]) <= AXIS_DEGREES || degreesBetweenLines(line, [0, 1]) <= AXIS_DEGREES) runsOnAxis += 1;
        const contour = contourAt(m.figure, first.point[0], first.point[1], def.margin, zFace, zEnd);
        if (contour === null) continue;
        runsJudged += 1;
        const off = degreesBetweenLines(line, contour);
        deviations.push(off);
        if (off > CONTOUR_DEGREES) failures.push(`${id}: the run at (${first.point.map((c) => c.toFixed(2)).join(', ')}) turns ${off.toFixed(0)} degrees off the contour (at most ${String(CONTOUR_DEGREES)})`);
        if (degreesBetweenLines([1, 0], contour) > CONTOUR_DEGREES) axisMutantFailures += 1;
      }
      deviations.sort((a, b) => a - b);
      lines.push(`${id} runs: ${String(runs.size)}, judged ${String(deviations.length)}, off the contour p50 ${(deviations[Math.floor(deviations.length / 2)] ?? 0).toFixed(0)} p90 ${(deviations[Math.floor(deviations.length * 0.9)] ?? 0).toFixed(0)} max ${(deviations.at(-1) ?? 0).toFixed(0)} degrees`);
    }
    lines.push(`runs ${String(runsTotal)}, ${String(runsOnAxis)} within ${String(AXIS_DEGREES)} degrees of a world axis; the raster mutant fails ${String(rasterFailures.length)} layers; the x-axis mutant fails ${String(axisMutantFailures)} of ${String(runsJudged)} judged runs`);
    console.log(lines.join('\n'));
    m.dispose();
    expect(failures, failures.join('\n')).toEqual([]);
    expect(runsTotal, 'the front-furrows step plans furrow runs').toBeGreaterThan(0);
    expect(runsJudged, 'some runs have a defined contour to follow').toBeGreaterThan(runsTotal / 4);
    expect(runsOnAxis / runsTotal, 'share of runs within 10 degrees of a world axis').toBeLessThan(AXIS_SHARE);
    expect(rasterFailures.length, 'the raster mutant fails claim 2 in some layer').toBeGreaterThan(0);
    expect(axisMutantFailures, 'the x-axis mutant fails claim 4 in some run').toBeGreaterThan(0);
  }, 120_000);
});
