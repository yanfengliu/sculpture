/**
 * Development stub of the engine's `Making` and the tools' `BlowCycle` (src/contracts/making.ts), so the page can be built and tested before they land.
 * Nine fake steps, one per stage id, with calendar spans in the proportions docs/research/technique.md gives. The stock is the block cut into a coarse lattice of cells; a blow removes cells outside a crude mannequin or re-finishes the cells it touches, so the surface changes and the `finish` attribute drives the marble shader. Everything observable is a pure function of `t`: the cell states at `t` are recomputed from the applied-blow count, never accumulated.
 * `dirtyChunks` is always 0 (meshing is synchronous), `planAll` is a no-op (the plan is built at construction) and `onMeshed` fires after every change.
 * Nothing here is authentic; it exists to exercise the page. `createStubBundle` is what src/main.ts swaps for the real parts.
 */
import * as THREE from 'three';

import type { FinishCode } from '../contracts/grid';
import { FINISH } from '../contracts/grid';
import type { Blow, BlowCycle, ChipState, Making, StageDef, StepInfo, ToolId, ToolPose, Vec3 } from '../contracts/making';
import { BASE_SECONDS } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import type { MakingBundle, RenderedTool, ToolNames } from './bundle';
import { FINISH_ATTRIBUTE } from './marble';
import { createPlaceholderTools } from './stub-tools';
import { BENCH } from './yard';

const LATTICE = { nx: 6, ny: 16, nz: 4 } as const;
const CELL: Vec3 = [BLOCK_M.width / LATTICE.nx, BLOCK_M.height / LATTICE.ny, BLOCK_M.depth / LATTICE.nz];
/** Shown blows per second at 1×, so a step of weight w gets about w × BASE_SECONDS × STRIKES_PER_SECOND blows. */
const STRIKES_PER_SECOND = 4;
/** Cycle phase at which the mallet lands and the blow applies. */
export const STRIKE_PHASE = 0.5;
const CHIP_LIFE_SECONDS = 1.5;
const SHANK_LENGTH = 0.26;
const MALLET_TOOLS: ReadonlySet<ToolId> = new Set(['point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill']);

type Op = { readonly cell: number; readonly state: 'removed' | FinishCode };

interface StepSpec {
  readonly id: string;
  readonly stage: StepInfo['stage'];
  readonly title: string;
  readonly detail: string;
  readonly tool: ToolId;
  readonly weight: number;
  readonly calendar: StepInfo['calendar'];
  readonly blowsPerShown: number;
  readonly ops: (lattice: Lattice) => Op[];
}

export const STUB_STAGES: readonly StageDef[] = [
  { id: 'setup', title: 'Setup', detail: 'The stock, its support and the shed (technique.md, stage 0).' },
  { id: 'layout', title: 'Layout', detail: 'Laying the figure out on the stock (technique.md, stage 1).' },
  { id: 'roughing', title: 'Roughing', detail: 'Roughing out with the point (technique.md, stage 2).' },
  { id: 'coarse-claw', title: 'Coarse claw', detail: 'The two-tooth chisel and the coarse claw (technique.md, stage 3).' },
  { id: 'fine-claw', title: 'Fine claw', detail: 'The fine claw and the roundel over the sides and back (technique.md, stage 4).' },
  { id: 'drilling', title: 'Drilling', detail: 'The bow drill at the hair and the pupils (technique.md, stage 5).' },
  { id: 'rasping', title: 'Rasping', detail: 'Rasps and files (technique.md, stage 6).' },
  { id: 'polishing', title: 'Polishing', detail: 'Pumice, tripoli, straw and leather (technique.md, stage 7).' },
  { id: 'on-site', title: 'On site', detail: 'The touches and gilding of the summer of 1504 (technique.md, stage 8).' },
];

export const STUB_TOOL_NAMES: Readonly<Record<RenderedTool, ToolNames>> = {
  charcoal: { italian: 'carbone', english: 'charcoal' },
  point: { italian: 'subbia', english: 'point' },
  'two-tooth': { italian: 'calcagnuolo', english: 'two-tooth chisel' },
  claw: { italian: 'gradina', english: 'claw chisel' },
  'fine-claw': { italian: 'dente di cane', english: 'fine claw' },
  roundel: { italian: 'unghietto', english: 'roundel' },
  flat: { italian: 'scalpello', english: 'flat chisel' },
  drill: { italian: 'trapano', english: 'bow drill' },
  rasp: { italian: 'raspa', english: 'rasp' },
  file: { italian: 'lima', english: 'file' },
  pumice: { italian: 'pomice', english: 'pumice' },
  polish: { italian: 'tripoli', english: 'tripoli and leather' },
  gilding: { italian: 'doratura', english: 'gold leaf' },
  mallet: { italian: 'mazzuolo', english: 'mallet' },
};

/** The cells of the block and the crude figure inside it. */
class Lattice {
  readonly count = LATTICE.nx * LATTICE.ny * LATTICE.nz;
  readonly figure: boolean[];
  constructor() {
    this.figure = Array.from({ length: this.count }, (_, cell) => isFigure(this.centre(cell)));
  }
  index(i: number, j: number, k: number): number {
    return i + LATTICE.nx * (j + LATTICE.ny * k);
  }
  ijk(cell: number): [number, number, number] {
    const i = cell % LATTICE.nx;
    const j = Math.floor(cell / LATTICE.nx) % LATTICE.ny;
    const k = Math.floor(cell / (LATTICE.nx * LATTICE.ny));
    return [i, j, k];
  }
  centre(cell: number): Vec3 {
    const [i, j, k] = this.ijk(cell);
    return [(i + 0.5) * CELL[0] - BLOCK_M.width / 2, (j + 0.5) * CELL[1], (k + 0.5) * CELL[2] - BLOCK_M.depth / 2];
  }
  /** Cells matching `keep`, ordered front layer first, top down, left to right: the sculptor's order of technique.md. */
  select(keep: (centre: Vec3, figure: boolean) => boolean): number[] {
    const cells: number[] = [];
    for (let cell = 0; cell < this.count; cell += 1) if (keep(this.centre(cell), this.figure[cell] ?? false)) cells.push(cell);
    return cells.sort((a, b) => {
      const [ai, aj, ak] = this.ijk(a);
      const [bi, bj, bk] = this.ijk(b);
      return bk - ak || bj - aj || ai - bi;
    });
  }
}

function isFigure([x, y, z]: Vec3): boolean {
  if (y < 0.45) return Math.abs(x) < 0.8 && Math.abs(z) < 0.55;
  if (y < 1.5 && x < -0.4 && z < -0.4) return true; // the tree stump behind the right leg
  if (y < 4.5) {
    const halfWidth = y > 3.5 && y < 4.3 ? 0.95 : 0.6;
    return (x / halfWidth) ** 2 + (z / 0.35) ** 2 < 1;
  }
  if (y < 5.2) return (x / 0.35) ** 2 + (z / 0.3) ** 2 < 1;
  return false;
}

const refinish = (cells: number[], code: FinishCode): Op[] => cells.map((cell) => ({ cell, state: code }));
const remove = (cells: number[]): Op[] => cells.map((cell) => ({ cell, state: 'removed' as const }));

const STEP_SPECS: readonly StepSpec[] = [
  {
    id: 'shed-and-scaffold', stage: 'setup', tool: 'point', weight: 0.5, blowsPerShown: 1, calendar: { from: '1501-09-13', to: '1501-09-14' },
    title: 'The block upright, the shed and the scaffold',
    detail: 'Stub: the test blows on the chest where the nodo stood, inside the turata of planks with the scaffold raised (technique.md, stage 0).',
    ops: (lattice) => refinish(lattice.select(([x, y, z]) => z > 0.35 && y > 3.3 && y < 3.7 && Math.abs(x) < 0.4), FINISH.point),
  },
  {
    id: 'draw-front', stage: 'layout', tool: 'charcoal', weight: 0.5, blowsPerShown: 1, calendar: { from: '1501-09-14', to: '1501-09-18' },
    title: 'Drawing the principal view on the front',
    detail: 'Stub: the principal view in charcoal down the front face, checked against the wax model with the square and the plumb line (technique.md, stage 1).',
    ops: (lattice) => refinish(lattice.select(([x, , z]) => z > 0.35 && x > 0 && x < 0.36), FINISH.drawn),
  },
  {
    id: 'rough-front', stage: 'roughing', tool: 'point', weight: 1.5, blowsPerShown: 40, calendar: { from: '1501-09-18', to: '1502-01-08' },
    title: 'Roughing the front with the point',
    detail: 'Stub: the point opens the front face around the contour, highest points first, from the top down (technique.md, stage 2).',
    ops: (lattice) => [...remove(lattice.select(([, , z], figure) => z > 0 && !figure)), ...refinish(lattice.select(([, , z], figure) => z > 0 && figure), FINISH.point)],
  },
  {
    id: 'claw-front', stage: 'coarse-claw', tool: 'claw', weight: 1, blowsPerShown: 30, calendar: { from: '1502-01-08', to: '1502-02-28' },
    title: 'Combing the masses with the claw',
    detail: 'Stub: the back is freed and the claw combs the furrows down over the front to the half-done report of 28 February 1502 (technique.md, stage 3).',
    ops: (lattice) => [...remove(lattice.select(([, , z], figure) => z < 0 && !figure)), ...refinish(lattice.select((_, figure) => figure), FINISH.claw)],
  },
  {
    id: 'fine-claw-all', stage: 'fine-claw', tool: 'fine-claw', weight: 1.5, blowsPerShown: 25, calendar: { from: '1502-02-28', to: '1503-06-30' },
    title: 'The fine claw over the whole figure',
    detail: 'Stub: the dente di cane lays fine crossing bands over the front, the sides and the back (technique.md, stage 4).',
    ops: (lattice) => refinish(lattice.select((_, figure) => figure), FINISH.fineClaw),
  },
  {
    id: 'drill-hair', stage: 'drilling', tool: 'drill', weight: 0.75, blowsPerShown: 6, calendar: { from: '1503-06-30', to: '1503-09-15' },
    title: 'Drilling the hair and the pupils',
    detail: 'Stub: the bow drill at the hairline and the curls (technique.md, stage 5).',
    ops: (lattice) => refinish(lattice.select(([, y], figure) => figure && y > 4.5), FINISH.drill),
  },
  {
    id: 'rasp-flesh', stage: 'rasping', tool: 'rasp', weight: 0.75, blowsPerShown: 20, calendar: { from: '1503-09-15', to: '1503-12-01' },
    title: 'Rasps and files over the flesh',
    detail: 'Stub: the rasp takes the tooth marks off the flesh and the files soften it (technique.md, stage 6).',
    ops: (lattice) => refinish(lattice.select(([, y], figure) => figure && y >= 0.45 && y < 4.5), FINISH.rasp),
  },
  {
    id: 'polish-flesh', stage: 'polishing', tool: 'polish', weight: 1, blowsPerShown: 50, calendar: { from: '1503-12-01', to: '1504-01-25' },
    title: 'Pumice and tripoli to a satin sheen',
    detail: 'Stub: wet pumice, then tripoli on leather and straw over the flesh; the hair keeps its tooth texture (technique.md, stage 7).',
    ops: (lattice) => refinish(lattice.select(([, y], figure) => figure && y >= 0.45 && y < 4.5), FINISH.polish),
  },
  {
    id: 'gild-sling-stump', stage: 'on-site', tool: 'gilding', weight: 0.5, blowsPerShown: 4, calendar: { from: '1504-06-08', to: '1504-09-08' },
    title: 'Gilding the sling and the stump',
    detail: 'Stub: gold leaf on the tree stump and the sling on the Piazza in the summer of 1504 (technique.md, stage 8).',
    ops: (lattice) => refinish(lattice.select(([x, y, z], figure) => figure && ((y < 1.5 && x < -0.4 && z < -0.4) || (y > 3.5 && y < 4.3 && x > 0.7))), FINISH.gilt),
  },
];

interface PlannedStep extends StepInfo {
  readonly blows: readonly Blow[];
  readonly blowOps: readonly (readonly Op[])[];
}

function faceOf(lattice: Lattice, cell: number): { point: Vec3; normal: Vec3 } {
  const [i, j, k] = lattice.ijk(cell);
  const centre = lattice.centre(cell);
  const open = (ii: number, jj: number, kk: number): boolean => ii < 0 || jj < 0 || kk < 0 || ii >= LATTICE.nx || jj >= LATTICE.ny || kk >= LATTICE.nz || !(lattice.figure[lattice.index(ii, jj, kk)] ?? false);
  const faces: { readonly normal: Vec3; readonly free: boolean }[] = [
    { normal: [0, 0, 1], free: open(i, j, k + 1) },
    { normal: [1, 0, 0], free: open(i + 1, j, k) },
    { normal: [-1, 0, 0], free: open(i - 1, j, k) },
    { normal: [0, 0, -1], free: open(i, j, k - 1) },
    { normal: [0, 1, 0], free: open(i, j + 1, k) },
  ];
  const face = faces.find(({ free }) => free) ?? faces[0];
  const normal = face?.normal ?? [0, 0, 1];
  const point: Vec3 = [centre[0] + (normal[0] * CELL[0]) / 2, centre[1] + (normal[1] * CELL[1]) / 2, centre[2] + (normal[2] * CELL[2]) / 2];
  return { point, normal };
}

function direction(normal: Vec3): Vec3 {
  const v = new THREE.Vector3(-normal[0], -normal[1] - 0.7, -normal[2]).normalize();
  return [v.x, v.y, v.z];
}

function planSteps(lattice: Lattice): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let firstBlow = 0;
  for (const spec of STEP_SPECS) {
    const ops = spec.ops(lattice);
    const blowCount = Math.max(1, Math.round(spec.weight * BASE_SECONDS * STRIKES_PER_SECOND));
    const blows: Blow[] = [];
    const blowOps: Op[][] = [];
    let lastPoint: { point: Vec3; normal: Vec3 } = ops[0] === undefined ? { point: [0, 1, BLOCK_M.depth / 2], normal: [0, 0, 1] } : faceOf(lattice, ops[0].cell);
    for (let blow = 0; blow < blowCount; blow += 1) {
      const group = ops.slice(Math.floor((blow * ops.length) / blowCount), Math.floor(((blow + 1) * ops.length) / blowCount));
      const first = group[0];
      if (first !== undefined) lastPoint = faceOf(lattice, first.cell);
      blowOps.push(group);
      blows.push({ tool: spec.tool, point: lastPoint.point, normal: lastPoint.normal, direction: direction(lastPoint.normal), size: CELL[2] / 2, stroke: Math.floor(blow / 4) });
    }
    const { id, stage, title, detail, tool, blowsPerShown, weight, calendar } = spec;
    steps.push({ id, stage, title, detail, tool, blowsPerShown, weight, calendar, firstBlow, blowCount, blows, blowOps });
    firstBlow += blowCount;
  }
  return steps;
}

/** FNV-1a over the blow coordinates, hex. */
function digest(steps: readonly PlannedStep[]): string {
  let hash = 0x811c9dc5;
  for (const step of steps) {
    for (const blow of step.blows) {
      for (const value of [...blow.point, ...blow.direction]) {
        hash ^= Math.round(value * 1000) & 0xff;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
  }
  return hash.toString(16).padStart(8, '0');
}

export interface StubMakingOptions {
  readonly blowCycle: BlowCycle;
  /** The marble material the page built; the stub's stock mesh carries the `finish` attribute it reads. */
  readonly material: THREE.Material;
}

export function createStubMaking({ blowCycle, material }: StubMakingOptions): Making {
  const lattice = new Lattice();
  const steps = planSteps(lattice);
  const N = steps.length;
  const planLength = steps.reduce((sum, step) => sum + step.blowCount, 0);
  const planDigest = digest(steps);
  const stockObject = new THREE.Group();
  stockObject.name = 'stock';
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'stock-chunk-0';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stockObject.add(mesh);
  const listeners = new Set<() => void>();
  let t = 0;
  let blowsApplied = -1;
  let states: ('removed' | FinishCode)[] = [];

  function appliedAt(time: number): number {
    return steps.reduce((sum, step, index) => sum + Math.floor(Math.min(1, Math.max(0, time - index)) * step.blowCount), 0);
  }

  /** Cell states after `applied` blows, from the plan alone. */
  function rebuild(applied: number): void {
    states = Array.from({ length: lattice.count }, () => FINISH.block);
    let seen = 0;
    for (const step of steps) {
      for (const group of step.blowOps) {
        if (seen >= applied) break;
        for (const op of group) states[op.cell] = op.state;
        seen += 1;
      }
    }
    const positions: number[] = [];
    const finish: number[] = [];
    const visible = (i: number, j: number, k: number): boolean => i >= 0 && j >= 0 && k >= 0 && i < LATTICE.nx && j < LATTICE.ny && k < LATTICE.nz && states[lattice.index(i, j, k)] !== 'removed';
    for (let cell = 0; cell < lattice.count; cell += 1) {
      const state = states[cell];
      if (state === undefined || state === 'removed') continue;
      const [i, j, k] = lattice.ijk(cell);
      const [cx, cy, cz] = lattice.centre(cell);
      const [hx, hy, hz] = [CELL[0] / 2, CELL[1] / 2, CELL[2] / 2];
      const faces: { readonly open: boolean; readonly corners: readonly Vec3[] }[] = [
        { open: !visible(i, j, k + 1), corners: [[cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]] },
        { open: !visible(i, j, k - 1), corners: [[cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz]] },
        { open: !visible(i + 1, j, k), corners: [[cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz]] },
        { open: !visible(i - 1, j, k), corners: [[cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz]] },
        { open: !visible(i, j + 1, k), corners: [[cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz]] },
        { open: !visible(i, j - 1, k), corners: [[cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz]] },
      ];
      for (const face of faces) {
        if (!face.open) continue;
        const [a, b, c, d] = face.corners;
        if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
        positions.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let v = 0; v < 6; v += 1) finish.push(state);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute(FINISH_ATTRIBUTE, new THREE.Uint8BufferAttribute(new Uint8Array(finish), 1, false));
    geometry.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  function locate(time: number): { step: PlannedStep; index: number; phase: number } | null {
    const i = Math.floor(time);
    const f = time - i;
    const step = steps[i];
    if (step === undefined || f <= 0) return null;
    const raw = f * step.blowCount;
    const index = Math.min(step.blowCount - 1, Math.floor(raw));
    return { step, index, phase: Math.min(0.999999, raw - index) };
  }

  const making: Making = {
    steps,
    stages: STUB_STAGES,
    N,
    planLength,
    planDigest,
    planAll() {
      // The whole plan is built at construction.
    },
    get t() {
      return t;
    },
    setTime(time) {
      t = Math.min(N, Math.max(0, time));
      const applied = appliedAt(t);
      if (applied !== blowsApplied) {
        blowsApplied = applied;
        rebuild(applied);
        for (const listener of listeners) listener();
      }
    },
    get blowsApplied() {
      return Math.max(0, blowsApplied);
    },
    dirtyChunks: 0,
    get poses(): readonly ToolPose[] {
      const at = locate(t);
      if (at === null) {
        const next = steps[Math.min(N - 1, Math.floor(t))];
        const tool = next?.tool ?? 'point';
        return [blowCycle.restPose(tool), blowCycle.restPose('mallet')];
      }
      const blow = at.step.blows[at.index];
      if (blow === undefined) return [];
      return blowCycle.posesAt(blow, at.step.blows[at.index - 1] ?? null, at.phase);
    },
    get chips(): readonly ChipState[] {
      const at = locate(t);
      if (at === null) return [];
      const cycleSeconds = (at.step.weight * BASE_SECONDS) / at.step.blowCount;
      const chips: ChipState[] = [];
      for (let back = 0; back <= Math.ceil(CHIP_LIFE_SECONDS / cycleSeconds); back += 1) {
        const blow = at.step.blows[at.index - back];
        if (blow === undefined) break;
        chips.push(...blowCycle.chipsAt(blow, (back + at.phase - STRIKE_PHASE) * cycleSeconds));
      }
      return chips;
    },
    get current() {
      const at = locate(t);
      const blow = at?.step.blows[at.index];
      return at === null || blow === undefined ? null : { blow, phase: at.phase };
    },
    stockObject,
    onMeshed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  making.setTime(0);
  return making;
}

const REST_ORDER: readonly RenderedTool[] = ['mallet', 'point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding', 'charcoal'];
const UP = new THREE.Vector3(0, 1, 0);

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function quaternionFromAxis(axis: Vec3): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...axis).normalize());
  return [q.x, q.y, q.z, q.w];
}

/** Chisel at the point along the blow's direction, the mallet on its axis behind the head, rising and landing by phase; hand tools slide along the surface instead. */
export function createStubBlowCycle(): BlowCycle {
  return {
    posesAt(blow, previous, phase) {
      const axis: Vec3 = [-blow.direction[0], -blow.direction[1], -blow.direction[2]];
      const approach = Math.min(1, phase / 0.3);
      const eased = approach * approach * (3 - 2 * approach);
      const from = previous?.point ?? blow.point;
      const tip: Vec3 = [from[0] + (blow.point[0] - from[0]) * eased, from[1] + (blow.point[1] - from[1]) * eased, from[2] + (blow.point[2] - from[2]) * eased];
      const quaternion = quaternionFromAxis(axis);
      if (!MALLET_TOOLS.has(blow.tool)) {
        const slide = Math.sin(phase * Math.PI * 2) * 0.04;
        return [{ tool: blow.tool, position: [tip[0] + slide * axis[2], tip[1] + slide * 0.2, tip[2] - slide * axis[0]], quaternion }];
      }
      const gap = phase < 0.3 ? 0.12 : phase < STRIKE_PHASE ? 0.12 + ((phase - 0.3) / 0.2) * 0.18 : phase < 0.6 ? 0.3 * (1 - (phase - STRIKE_PHASE) / 0.1) : ((phase - 0.6) / 0.4) * 0.12;
      const offset = SHANK_LENGTH + gap;
      return [
        { tool: blow.tool, position: tip, quaternion },
        { tool: 'mallet', position: [tip[0] + axis[0] * offset, tip[1] + axis[1] * offset, tip[2] + axis[2] * offset], quaternion },
      ];
    },
    chipsAt(blow, secondsSince) {
      if (!MALLET_TOOLS.has(blow.tool) || secondsSince < 0 || secondsSince > CHIP_LIFE_SECONDS) return [];
      const seed = Math.round(blow.point[0] * 97 + blow.point[1] * 131 + blow.point[2] * 173);
      const chips: ChipState[] = [];
      for (let index = 0; index < 6; index += 1) {
        const h = (k: number): number => hash(seed * 7 + index * 13 + k) - 0.5;
        const velocity: Vec3 = [blow.normal[0] * (1.4 + h(1)) + h(2) * 1.6, 1.2 + h(3) + blow.normal[1], blow.normal[2] * (1.4 + h(4)) + h(5) * 1.6];
        const tau = secondsSince;
        const y = blow.point[1] + velocity[1] * tau - 4.905 * tau * tau;
        chips.push({
          position: [blow.point[0] + velocity[0] * tau, Math.max(0.012, y), blow.point[2] + velocity[2] * tau],
          quaternion: quaternionFromAxis([h(6) + 0.01, h(7) + 0.5, h(8)]),
          scale: 0.015 + 0.015 * hash(seed + index),
          life: 1 - tau / CHIP_LIFE_SECONDS,
        });
      }
      return chips;
    },
    restPose(tool) {
      const slot = Math.max(0, REST_ORDER.indexOf(tool));
      return { tool, position: [BENCH.minX + 0.06 + slot * 0.055, BENCH.topY + 0.015, BENCH.minZ + 0.1], quaternion: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
    },
  };
}

/** The bundle src/main.ts boots from until the engine and the tools replace it. */
export function createStubBundle(material: THREE.Material): MakingBundle {
  return {
    making: createStubMaking({ blowCycle: createStubBlowCycle(), material }),
    toolMeshes: createPlaceholderTools(),
    toolNames: (tool) => STUB_TOOL_NAMES[tool],
    source: null,
  };
}
