/**
 * A step's paint and cut stay inside its region (the item of 2026-10-14: the rubbing tools strike a footprint of 3 to 15 cm and the kernel paints every surface cell within one cell of a volume, so a rasp blow beside the hairline painted and cut about 6 cm into the hair, which keeps its fine-claw texture). What a green run proves, and its bounds:
 *   1. On the synthetic figure at 2 cm, walked step by step from the block: every step whose tool strikes a footprint (./outside-region.ts, FOOTPRINT_TOOLS: the fine claw's combing patch in fine-claw-all and fine-claw-gaps, the rasp, the file, the pumice, the polish, the gilding) paints and cuts no cell outside its region (./outside-region.ts, `outsideRegion`: a cell whose finish became the tool's code, or whose stone was cut and some stays, at a centre outside the region with the figure's gradient there), and the walk audits a step of each of the six tools. At the end of file-details (t = its index + 1, after rasp-flesh and file-details) no HAIR cell carries the rasp's or the file's finish code. A HAIR cell is a stock cell in the surface band (stock value strictly between -limit and +limit) whose world position p is inside HAIR with the figure's gradient at p (./regions.ts, `inside`). The run counts the HAIR cells it examined and fails below MIN_HAIR_CELLS, so a scan that found none cannot pass, and logs that count with the finish codes it found on them.
 *   2. The footprint the planner sizes its moves by (src/stock/footprint.ts, `footprintOf`, read by ./generators/confine.ts) is the volume the kernel carves: for every tool and cut depth of SIZES with a footprint, on a face parallel to the blow's tangent plane, half a millimetre over the face the volume's distance is negative half a millimetre inside the footprint's outline (its straight edges and its corner arcs, in the blow's frame of src/stock/tool-frame.ts) and positive half a millimetre outside it; the six band tools that strike a footprint (the fine claw's patch, the rasp, the file, the pumice, the polish, the gilding) each have one.
 * Bounds: the mannequin at 2 cm, whose webs and region boundaries are not the David's; a cell repainted with the code it already carried is not seen (./outside-region.ts); the David grid at 8 mm is the slow case in david-steps.slow.test.ts; the check reads finish codes, which the kernel writes on every band cell a blow cuts or paints (src/stock/carve-kernel.ts), so a cut that takes a HAIR cell out past the band leaves no code here and is the planner's own trial's claim (it asks the region of every cell a blow cuts as well as those it paints). The footprint check is on a flat face, where a slab's level sets are planes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { FINISH } from '../contracts/grid';
import type { Blow, BlowCycle, ToolId, ToolPose, Vec3 } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { blowFrame } from '../stock/tool-frame';
import { footprintOf } from '../stock/footprint';
import { PATCH_SIZE_M, TOOL_VOLUMES, toolVolume } from '../stock/tool-volumes';
import { createMaking, type EngineMaking } from '../timeline/making';
import { DAVID_STEPS } from './david-steps';
import { blowAt } from './generators/surface';
import { FOOTPRINT_TOOLS, outsideRegion } from './outside-region';
import { HAIR, inside } from './regions';
import { STAGES } from './stages';

/** The fewest HAIR cells the scan must examine: the run of 2026-10-14 examined 67,322 at 2 cm (the band over the mannequin's head above the hairline and over the block's stone left beside it, which HAIR's predicate, a height by azimuth, also holds), so a scan below this read the wrong part of the grid. */
const MIN_HAIR_CELLS = 1000;

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

/** The HAIR cells of the stock's band and how many carry each finish code. */
function hairCells(m: EngineMaking): { examined: number; byCode: Map<number, number>; example: Map<number, string> } {
  const { stock, figure, finish } = m;
  const limit = stock.limit;
  const byCode = new Map<number, number>();
  const example = new Map<number, string>();
  let examined = 0;
  const j0 = Math.max(0, Math.floor((HAIR.min[1] - stock.spec.origin[1]) / stock.cell));
  for (let k = 0; k < stock.nz; k += 1) {
    for (let j = j0; j < stock.ny; j += 1) {
      for (let i = 0; i < stock.nx; i += 1) {
        const index = stock.index(i, j, k);
        const value = stock.values[index] ?? limit;
        if (value <= -limit || value >= limit) continue;
        const p = stock.worldOf(i, j, k);
        if (!inside(HAIR, p, figure.gradient(p[0], p[1], p[2]))) continue;
        examined += 1;
        const code = finish[index] ?? 0;
        byCode.set(code, (byCode.get(code) ?? 0) + 1);
        if (!example.has(code)) example.set(code, p.map((v) => v.toFixed(3)).join(', '));
      }
    }
  }
  return { examined, byCode, example };
}

describe('the paint and the cut of a step stay inside its region', () => {
  it('keeps every footprint step inside its region and leaves no rasp or file code on a HAIR cell, on the synthetic figure at 2 cm', () => {
    const m = making(0.02);
    const index = DAVID_STEPS.findIndex((step) => step.id === 'file-details');
    expect(index, 'the David steps have no file-details step').toBeGreaterThan(0);
    const audited: string[] = [];
    const outside: string[] = [];
    let hair: ReturnType<typeof hairCells> | null = null;
    // Step by step from the block, each footprint step's grids as it found them against the grids it left.
    for (let s = 0; s < m.N; s += 1) {
      const step = DAVID_STEPS[s];
      if (step === undefined) continue;
      const before = FOOTPRINT_TOOLS.has(step.tool) ? { stock: m.stock.values.slice(), finish: m.finish.slice() } : null;
      m.setTime(s + 1);
      if (before !== null) {
        const count = outsideRegion(step, before, m.stock, m.finish, m.figure);
        audited.push(`${step.id} ${String(count.painted)}/${String(count.cut)}`);
        if (count.painted + count.cut > 0) outside.push(`${step.id} painted ${String(count.painted)} and cut ${String(count.cut)} cells outside ${step.region.label} (one at ${count.example})`);
      }
      if (s === index) hair = hairCells(m);
    }
    console.log(`footprint steps, cells painted/cut outside their regions: ${audited.join(', ')}`);
    const toolsAudited = new Set(DAVID_STEPS.filter((step) => FOOTPRINT_TOOLS.has(step.tool)).map((step) => step.tool));
    expect([...FOOTPRINT_TOOLS].filter((tool) => !toolsAudited.has(tool)), 'footprint tools no step of the walk used').toEqual([]);
    expect(outside, outside.join('; ')).toEqual([]);
    if (hair === null) throw new Error(`the walk never reached the end of file-details (step ${String(index)} of ${String(m.N)})`);
    const { examined, byCode, example } = hair;
    const names = new Map<number, string>(Object.entries(FINISH).map(([name, code]) => [code, name]));
    const codes = [...byCode.entries()].sort((a, b) => a[0] - b[0]).map(([code, count]) => `${names.get(code) ?? String(code)} ${String(count)}`);
    const rasped = byCode.get(FINISH.rasp) ?? 0;
    const filed = byCode.get(FINISH.file) ?? 0;
    console.log(`HAIR cells in the stock's band at t = ${String(index + 1)} (after file-details): ${String(examined)} examined; by finish: ${codes.join(', ')}; rasp ${String(rasped)}${rasped > 0 ? ` (one at ${example.get(FINISH.rasp) ?? ''})` : ''}, file ${String(filed)}${filed > 0 ? ` (one at ${example.get(FINISH.file) ?? ''})` : ''}`);
    expect(examined, `the scan examined ${String(examined)} HAIR cells, fewer than ${String(MIN_HAIR_CELLS)}`).toBeGreaterThanOrEqual(MIN_HAIR_CELLS);
    expect(rasped + filed, `${String(rasped)} HAIR cells carry the rasp's code and ${String(filed)} the file's after file-details`).toBe(0);
    m.dispose();
  }, 180_000);

  it("describes each footprint tool's volume by its footprint", () => {
    const struck = new Set<ToolId>();
    const failures: string[] = [];
    const nudge = 0.0005;
    for (const tool of Object.keys(TOOL_VOLUMES) as ToolId[]) {
      for (const size of SIZES) {
        const footprint = footprintOf(tool, size);
        if (footprint === null) continue;
        struck.add(tool);
        // A blow 2 mm above a level face, pushing along +x at 10 degrees: the face's distance at a point is its height over y = 0.998.
        const blow: Blow = blowAt(tool, [0, 1, 0], [0, 1, 0], [1, 0, 0], 10, size, 0);
        const level = 0.002;
        const volume = toolVolume(blow, level, 0.128);
        const f = blowFrame(blow);
        const at = (a: number, b: number, c: number): number => {
          const p: Vec3 = [f.px + a * f.u[0] + b * f.w[0] + c * f.n[0], f.py + a * f.u[1] + b * f.w[1] + c * f.n[1], f.pz + a * f.u[2] + b * f.w[2] + c * f.n[2]];
          return volume.distance(p[0], p[1], p[2], level + c);
        };
        const { halfPush, halfWidth, rounding } = footprint;
        const name = `${tool} at ${String(size)} m`;
        for (const [a, b, na, nb] of outlinePoints(halfPush, halfWidth, rounding)) {
          const inner = at(a - na * nudge, b - nb * nudge, nudge);
          const outer = at(a + na * nudge, b + nb * nudge, nudge);
          if (!(inner < 0 && outer > 0)) failures.push(`${name}: at the outline point (${a.toFixed(4)}, ${b.toFixed(4)}) the volume's distance is ${inner.toExponential(2)} inside and ${outer.toExponential(2)} outside`);
        }
      }
    }
    expect(failures, failures.slice(0, 5).join('; ')).toEqual([]);
    const missing = BAND_FOOTPRINT_TOOLS.filter((tool) => !struck.has(tool));
    expect(missing, `band tools without a footprint: ${missing.join(', ')}`).toEqual([]);
  });
});

/** Cut depths tried for each tool, metres: the depths the David steps strike at and the fine claw's patch threshold. */
const SIZES = [0, 0.001, 0.004, 0.02, 0.03, 0.04, PATCH_SIZE_M];
/** The band tools whose blows strike a footprint (src/choreography/david-steps.ts). */
const BAND_FOOTPRINT_TOOLS: readonly ToolId[] = ['fine-claw', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

/** Points on the outline of a rounded rectangle with their outward normals: the midpoint and the ends of each straight edge and five points on each corner's arc. */
function outlinePoints(halfA: number, halfB: number, radius: number): (readonly [number, number, number, number])[] {
  const points: (readonly [number, number, number, number])[] = [];
  const ea = halfA - radius;
  const eb = halfB - radius;
  for (const s of [1, -1]) {
    for (const t of [-1, 0, 1]) {
      points.push([s * halfA, t * eb, s, 0], [t * ea, s * halfB, 0, s]);
    }
    for (const r of [1, -1]) {
      for (let k = 0; k <= 4; k += 1) {
        const angle = (Math.PI / 2) * (k / 4);
        const na = Math.cos(angle) * s;
        const nb = Math.sin(angle) * r;
        points.push([s * ea + radius * na, r * eb + radius * nb, na, nb]);
      }
    }
  }
  return points;
}
