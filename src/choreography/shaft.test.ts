/**
 * The chisel's place in the stone at every blow of the David plan (src/choreography/david-steps.ts) on the synthetic figure at 2 cm cells: the tools seen buried in the stock in the captures of 2026-10-11, measured. What a green run proves, and its bounds:
 *   The Making plans the whole David (`planAll`, each step from the stock the earlier steps leave); the test then replays the blows itself in plan order with the carving rule (src/stock/carve.ts, applyBlow) on its own stock and finish grids, and before each blow samples the stock's distance at the blow point and along the shaft, `point - direction × d` for d = 1, 2, 3, 4, 6, 8, 12 and 16 cm. Every tip lies within one cell of the stock's surface (|distance| <= cell), every shaft sample is air (distance >= -cell / 2), and the test's replay ends byte for byte where the Making's own replay to t = N ends, which pins the instrument to the engine. The run logs, per step and per tool, the tips in stone, the tips in air and the shafts through stone, each with its count, its worst value and an example blow, so a red run names the step and the generator.
 *   The replay is the test's own rather than `setTime` to each blow's strike phase, so the readings do not depend on how the timeline groups blows into visible cycles.
 * Bounds: trilinear reads of a 2 cm grid along one ray, clamped at the stock band (3 cells, so ±60 mm means at least that), so a shaft grazing a wall by less than half a cell passes and the tool's width is ignored; the 8 mm page follows only by inference; the synthetic mannequin, not the David grid; a stub mesher, so nothing is meshed or rendered.
 */
import { describe, expect, it } from 'vitest';

/**
 * Bounds, from the residuals measured on 2026-10-13 with the generators planning against a scratch stock (src/choreography/generators/scratch.ts): no tip in stone, 141 tips in the air of 3,234 point blows (a stroke's cone or a crater placed from a column whose half-cell march missed a sub-cell sheet, so the tip sits a cell or two above it), 2 point shafts through stone of 3,234, and 219 rubbing-tool shafts of about 12,000 (the rasp and the pumice lying flat in the hollows between the head and the shoulder, where the neighbouring form is 12 to 16 cm along the shaft: the tools' approach, not the planner's placement). Before the scratch stock the same run had 8 tips in stone, 1,772 tips in the air and 60 point shafts of 4,771 point blows. A rise above these is a regression.
 */
const IN_STONE_ALLOWED = 2;
const AIR_FRACTION_ALLOWED = 0.02;
const SHAFT_FRACTION_ALLOWED = 0.02;
import * as THREE from 'three';

import type { Blow, BlowCycle, ToolPose } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { applyBlow, type CarveState } from '../stock/carve';
import { chunkLayout } from '../stock/chunks';
import { blockGrid, createFinishGrid, frameBlockBox } from '../stock/grid';
import type { ChunkMesher } from '../stock/remesh';
import { createMaking, type EngineMaking } from '../timeline/making';
import { DAVID_STEPS } from './david-steps';
import { STAGES } from './stages';

/** Distances back along the shaft from the tip, metres. */
const SHAFT_M = [0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.16];

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

/** Answers every chunk with no triangles: the test reads the grids, never the meshes. */
const noMesher: ChunkMesher = {
  transfers: false,
  submit(job, done): void {
    done(job.id, { positions: new Float32Array(0), finish: new Uint8Array(0) });
  },
  dispose(): void {
    // Nothing to release.
  },
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial(), mesher: noMesher });
}

/** One class of violation: how many blows, the worst value seen and the first blow that showed it. */
class Tally {
  count = 0;
  worst = 0;
  example = '';

  add(value: number, worse: boolean, blow: number, where: Blow, note = ''): void {
    this.count += 1;
    if (worse) {
      this.worst = value;
      this.example = `#${String(blow)} (${where.point.map((v) => v.toFixed(2)).join(', ')})${note}`;
    }
  }

  cell(): string {
    return this.count === 0 ? '-'.padEnd(46) : `${String(this.count).padStart(5)} ${(this.worst * 1000).toFixed(0).padStart(5)} mm ${this.example}`.padEnd(46);
  }
}

interface Row {
  readonly id: string;
  readonly tool: string;
  blows: number;
  readonly inStone: Tally;
  readonly inAir: Tally;
  readonly shaft: Tally;
}

function row(id: string, tool: string): Row {
  return { id, tool, blows: 0, inStone: new Tally(), inAir: new Tally(), shaft: new Tally() };
}

describe('the chisel in the stone over the David steps at 2 cm', () => {
  it('starts every blow with the tip on the surface and the shaft in the air', () => {
    const m = making(0.02);
    m.planAll();
    const figure = m.figure;
    const stock = blockGrid(figure.spec, frameBlockBox());
    const state: CarveState = { stock, finish: createFinishGrid(figure.spec), chunks: chunkLayout(figure.spec) };
    const cell = stock.cell;
    const rows: Row[] = [];
    const perTool = new Map<string, Row>();
    for (let s = 0; s < m.N; s += 1) {
      const def = DAVID_STEPS[s];
      if (def === undefined) throw new Error('missing step');
      const here = row(def.id, def.tool);
      const tool = perTool.get(def.tool) ?? row(def.tool, def.tool);
      perTool.set(def.tool, tool);
      m.blowsOf(s).forEach((blow, k) => {
        here.blows += 1;
        tool.blows += 1;
        const tip = stock.sample(blow.point[0], blow.point[1], blow.point[2]);
        let deepest = Number.POSITIVE_INFINITY;
        let deepestAt = 0;
        for (const d of SHAFT_M) {
          const value = stock.sample(blow.point[0] - blow.direction[0] * d, blow.point[1] - blow.direction[1] * d, blow.point[2] - blow.direction[2] * d);
          if (value < deepest) {
            deepest = value;
            deepestAt = d;
          }
        }
        for (const target of [here, tool]) {
          if (tip < -cell) target.inStone.add(tip, tip < target.inStone.worst, k, blow);
          else if (tip > cell) target.inAir.add(tip, tip > target.inAir.worst, k, blow);
          if (deepest < -cell / 2) target.shaft.add(deepest, deepest < target.shaft.worst, k, blow, ` at ${String(Math.round(deepestAt * 100))} cm`);
        }
        applyBlow(state, figure, blow, def.margin);
      });
      rows.push(here);
    }
    m.setTime(m.N);
    let mismatch = 0;
    for (let i = 0; i < stock.values.length; i += 1) if (stock.values[i] !== m.stock.values[i]) mismatch += 1;
    const header = `${'step'.padEnd(22)}${'tool'.padEnd(11)}${'blows'.padStart(6)}  ${'tip in stone: n, worst, example'.padEnd(46)}  ${'tip in air: n, worst, example'.padEnd(46)}  shaft through stone: n, worst at d, example`;
    const format = (r: Row): string => `${r.id.padEnd(22)}${r.tool.padEnd(11)}${String(r.blows).padStart(6)}  ${r.inStone.cell()}  ${r.inAir.cell()}  ${r.shaft.cell()}`;
    console.log([header, ...rows.map(format), 'per tool', ...[...perTool.values()].map(format), `stock cells differing between the test's replay and the Making at t = N: ${String(mismatch)}`].join('\n'));
    const tips = rows.reduce((sum, r) => sum + r.inStone.count + r.inAir.count, 0);
    const shafts = rows.reduce((sum, r) => sum + r.shaft.count, 0);
    const total = rows.reduce((sum, r) => sum + r.blows, 0);
    const inStone = rows.reduce((sum, r) => sum + r.inStone.count, 0);
    expect.soft(inStone, `${String(inStone)} of ${String(total)} blows start with the tip inside stone`).toBeLessThanOrEqual(IN_STONE_ALLOWED);
    expect.soft(tips, `${String(tips)} of ${String(total)} blows start with the tip more than a cell from the stock surface`).toBeLessThanOrEqual(total * AIR_FRACTION_ALLOWED);
    expect.soft(shafts, `${String(shafts)} of ${String(total)} blows start with the shaft inside stone`).toBeLessThanOrEqual(total * SHAFT_FRACTION_ALLOWED);
    expect.soft(mismatch, `${String(mismatch)} stock cells differ between the test's replay and the Making's at t = N`).toBe(0);
  }, 600_000);
});
