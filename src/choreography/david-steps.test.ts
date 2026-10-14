/**
 * Plan integrity of the David steps (src/choreography/david-steps.ts) against docs/design/choreography.md, over the synthetic figure at 2 cm cells, and the drill's landmarks on the David grid. What a green run proves, and its bounds:
 *   1. The 21 step ids are the contract's, in its order; every stage id of StageId appears in order and matches src/choreography/stages.ts; every step cites technique.md and keeps the title and detail lengths; every step changes the stock or the finish; every blow lies inside the block and within reach of a scaffold deck or plank bridge (src/tools/scaffold.ts through src/tools/blow-cycle.ts); every blow's tool axis points into the surface at an angle inside the tool catalog's documented range (the point's bulk range at or above BULK_CUT_SIZE_M), measured against the blow's own stored normal; blows within a stroke are consecutive and stroke indices unique in a step; two fresh Makings give the same length and digest; the calendar runs forward from 9 September 1501 to 8 September 1504 without overlap.
 *   2. On the David grid (public/model/david.json beside its data, loaded from disk; skipped with a logged reason until `npm run model` builds it): every target of DAVID_LANDMARKS (the hairline path, the curls ring, the pupils and the nostrils) lies within 2 cm of the figure's surface, the holes generator's search (nearestOnFigure, 15 cm reach, 1 cm spacing) lands it, and the landing with the figure's gradient there is inside the step's region, HAIR for the hairline and the curls and FACE for the pupils and the nostrils, so the drill drops none of them as it dropped the photo-read targets of review F16; each target's move and landing region are logged (shown with --reporter=verbose).
 * Bounds: the plan is judged by its data, not by its look, and on the synthetic mannequin, not the David grid; the angle check trusts the stored normal, so a normal that is not the stock's gradient passes here and is the carve tests' claim; the blow budget at 8 mm is the slow test's claim; the landmark case pins the targets to this grid build (cell 8 mm, the Scan the World mesh), says nothing about whether a hole reads as a pupil or a curl at 8 mm, and runs the search on the figure alone, so a hole the stock would refuse (stockAbove) is the plan's claim; no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BlowCycle, RegionDef, StageId, ToolPose } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { syntheticFigure } from '../david/synthetic';
import { loadFigureGrid } from '../stock/grid';
import { createMaking, type EngineMaking } from '../timeline/making';
import { isReachable } from '../tools/blow-cycle';
import { BULK_CUT_SIZE_M, TOOL_CATALOG } from '../tools/catalog';
import { DAVID_STEPS } from './david-steps';
import { DAVID_LANDMARKS } from './landmarks';
import { nearestOnFigure } from './generators/surface';
import { FACE, HAIR, inside } from './regions';
import { STAGES } from './stages';

const STAGE_ORDER: readonly StageId[] = ['setup', 'layout', 'roughing', 'coarse-claw', 'fine-claw', 'drilling', 'rasping', 'polishing', 'on-site'];
/** The step ids of docs/design/choreography.md, in its order. */
const CONTRACT_IDS = [
  'nodo',
  'principal-view',
  'high-points',
  'chest-and-face',
  'front-furrows',
  'two-tooth-front',
  'claw-front',
  'sides-point',
  'back-point',
  'sides-and-back-claw',
  'fine-claw-all',
  'roundel-hollows',
  'hairline-and-curls',
  'pupils-and-nostrils',
  'fingers-sling-stump',
  'rasp-flesh',
  'file-details',
  'pumice-flesh',
  'tripoli-straw-leather',
  'last-touches',
  'gilding',
];

const cycle: BlowCycle = {
  posesAt: (): ToolPose[] => [],
  chipsAt: () => [],
  restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }),
};

function making(cell: number): EngineMaking {
  return createMaking({ figure: syntheticFigure(cell), steps: DAVID_STEPS, stages: STAGES, blowCycle: cycle, material: new THREE.MeshBasicMaterial() });
}

function differs(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return true;
  return false;
}

/** Degrees between the tool axis and the surface, from the direction's component into the stock. */
function angleToSurface(direction: readonly [number, number, number], normal: readonly [number, number, number]): number {
  const into = -(direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]);
  return (Math.asin(Math.min(Math.max(into, -1), 1)) * 180) / Math.PI;
}

describe('David steps', () => {
  it('follows the choreography contract: ids, stages, citations, lengths and a forward calendar', () => {
    expect(STAGES.map((s) => s.id)).toEqual(STAGE_ORDER);
    expect(DAVID_STEPS.map((s) => s.id)).toEqual(CONTRACT_IDS);
    expect([...new Set(DAVID_STEPS.map((s) => s.stage))]).toEqual(STAGE_ORDER);
    let previousTo = '1501-09-08';
    for (const step of DAVID_STEPS) {
      expect(step.title.length, step.id).toBeLessThanOrEqual(48);
      expect(step.detail.length, step.id).toBeLessThanOrEqual(200);
      expect(step.detail, step.id).toMatch(/technique\.md/);
      expect(step.calendar.from >= previousTo, `${step.id} starts before the previous step ends`).toBe(true);
      expect(step.calendar.from <= step.calendar.to, step.id).toBe(true);
      expect(step.blowsPerShown, step.id).toBeGreaterThanOrEqual(1);
      previousTo = step.calendar.to;
    }
    expect(DAVID_STEPS[0]?.calendar.from).toBe('1501-09-09');
    expect(DAVID_STEPS.at(-1)?.calendar.to).toBe('1504-09-08');
  });

  it('plans blows that change the stock or finish, inside the block, reachable, at the documented angles, with a stable digest', () => {
    const a = making(0.02);
    let stock = a.stock.values.slice();
    let finish = a.finish.slice();
    for (let s = 0; s < a.N; s += 1) {
      a.setTime(s + 1);
      const step = DAVID_STEPS[s];
      if (step === undefined) throw new Error('missing step');
      const blows = a.blowsOf(s);
      expect(blows.length, `${step.id} plans no blows`).toBeGreaterThan(0);
      const stockChanged = differs(a.stock.values, stock);
      const finishChanged = differs(a.finish, finish);
      expect(stockChanged || finishChanged, `${step.id} changes neither stock nor finish`).toBe(true);
      stock = a.stock.values.slice();
      finish = a.finish.slice();
      const spec = TOOL_CATALOG[step.tool];
      let lastStroke = -1;
      const strokesSeen = new Set<number>();
      for (const blow of blows) {
        expect(blow.tool).toBe(step.tool);
        expect(Math.abs(blow.point[0])).toBeLessThanOrEqual(BLOCK_M.width / 2 + 0.02);
        expect(blow.point[1]).toBeGreaterThanOrEqual(-0.02);
        expect(blow.point[1]).toBeLessThanOrEqual(BLOCK_M.height + 0.02);
        expect(Math.abs(blow.point[2])).toBeLessThanOrEqual(BLOCK_M.depth / 2 + 0.02);
        expect(isReachable(blow.point), `${step.id}: blow at ${blow.point.join(', ')} is out of reach`).toBe(true);
        const angle = angleToSurface(blow.direction, blow.normal);
        const range = step.tool === 'point' ? (blow.size >= BULK_CUT_SIZE_M ? [60, 90] : [30, 50]) : step.tool === 'drill' ? [35, 90] : [spec.angle?.min ?? 0, spec.angle?.max ?? 90];
        expect(angle, `${step.id}: angle ${String(angle)} outside ${range.join('-')}`).toBeGreaterThanOrEqual((range[0] ?? 0) - 1e-6);
        expect(angle).toBeLessThanOrEqual((range[1] ?? 90) + 1e-6);
        if (blow.stroke !== lastStroke) {
          expect(strokesSeen.has(blow.stroke), `${step.id}: stroke ${String(blow.stroke)} is not consecutive`).toBe(false);
          strokesSeen.add(blow.stroke);
          lastStroke = blow.stroke;
        }
      }
    }
    expect(a.blowsApplied).toBe(a.planLength);
    const b = making(0.02);
    b.planAll();
    expect(b.planLength).toBe(a.planLength);
    expect(b.planDigest).toBe(a.planDigest);
  }, 180_000);
});

const DAVID_HEADER = fileURLToPath(new URL('../../public/model/david.json', import.meta.url));
const hasDavid = existsSync(DAVID_HEADER);
if (!hasDavid) console.log(`david-steps.test.ts: ${DAVID_HEADER} is not built (npm run model), so the landmark case is skipped`);

describe.skipIf(!hasDavid)('the drill landmarks on the David grid', () => {
  const fetchFromDisk: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = join(dirname(DAVID_HEADER), url.replace(/^.*[\\/]/, ''));
    return Promise.resolve(new Response(new Uint8Array(readFileSync(path)).buffer, { status: 200 }));
  };
  /** Each landmark set with the region its step drills in. */
  const CASES: readonly (readonly [keyof typeof DAVID_LANDMARKS, RegionDef])[] = [
    ['hairline', HAIR],
    ['curls', HAIR],
    ['pupils', FACE],
    ['nostrils', FACE],
  ];

  it("lie within 2 cm of the surface and land in their step's region through the holes generator's search", async () => {
    const { grid } = await loadFigureGrid(DAVID_HEADER, fetchFromDisk);
    const lines: string[] = [];
    for (const [name, region] of CASES) {
      const targets = DAVID_LANDMARKS[name];
      expect(targets.length, `${name} has no targets`).toBeGreaterThan(0);
      for (const target of targets) {
        const label = `${name} target (${target.map((c) => c.toFixed(3)).join(', ')})`;
        const distance = grid.sample(target[0], target[1], target[2]);
        expect(Math.abs(distance), `${label} is ${(distance * 1000).toFixed(1)} mm from the surface`).toBeLessThanOrEqual(0.02);
        const landing = nearestOnFigure(grid, target, 0.15, 0.01);
        expect(landing, `${label} finds no surface within 15 cm`).not.toBeNull();
        if (landing === null) continue;
        const normal = grid.gradient(landing[0], landing[1], landing[2]);
        const moved = Math.hypot(landing[0] - target[0], landing[1] - target[1], landing[2] - target[2]);
        const regions = [HAIR, FACE].filter((candidate) => inside(candidate, landing, normal)).map((candidate) => candidate.label);
        const landed = regions.length === 0 ? 'neither hair nor face' : regions.join(' and ');
        lines.push(`${label} moved ${(moved * 1000).toFixed(1)} mm, landed in ${landed}`);
        expect(inside(region, landing, normal), `${label} landed in ${landed}, not ${region.label}`).toBe(true);
      }
    }
    console.log(lines.join('\n'));
  }, 60_000);
});
