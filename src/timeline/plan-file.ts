/**
 * The plan file (docs/design/spec.md, Undo and replay; docs/research/decisions.md, Engine): the Making's whole plan and the cells each step's end sweep takes off, planned once in Node by scripts/build-plan.mjs over the David grid, so the page neither plans nor sweeps while it plays, and the snapshot table that lets a jump start near its target.
 *
 * `public/model/<name>.plan.json` is the header (`PlanHeader`); `<name>.plan.bin` holds, little-endian:
 * - PLAN_HEADER_WORDS Uint32 words: magic, PLAN_BIN_VERSION, the step count S, the blow count B, the swept-cell count W, 0;
 * - per step its first blow, its blow count and its swept-cell count (3 × S Uint32), padded to 8 bytes;
 * - per blow BLOW_NUMBERS Float64 (point, normal, direction, size, stroke), so every number keeps its IEEE-754 bits and the plan digest is the in-page plan's;
 * - the swept cells, global cell indices in increasing order per step (W Uint32);
 * - per blow its tool's code in TOOL_IDS (B bytes).
 * The page uses the file only when the header's format, PLAN_VERSION, grid SHA-256 and step ids match what it runs and the digests of the blows and the swept cells it decoded equal the header's (`planFileProblem`, `checkDecoded`); otherwise it plans in the page and says why.
 * PLAN_VERSION names the planner and the replay the files were built with: src/timeline/plan-file.test.ts holds a table from each version to the synthetic 2 cm making's digests and fails, asking for a new version, when the planner, the carving or the sweep changes what they produce.
 */
import type { Blow } from '../contracts/making';
import { TOOL_IDS } from '../stock/carve-jobs';
import { FNV_OFFSET, fnvBlow, fnvHex, fnvNumber } from '../stock/digest';

export const PLAN_FORMAT = 'sculpture-plan/1';
/** Bump when the planner, the carving rule, the tool volumes or the sweep change their output, and add the new digests to the table in src/timeline/plan-file.test.ts; a plan file of another version is not used. */
export const PLAN_VERSION = 1;
const PLAN_MAGIC = 0x4c504353;
const PLAN_BIN_VERSION = 1;
const PLAN_HEADER_WORDS = 6;
/** Float64 numbers per packed blow: point, normal, direction, size and stroke. */
const BLOW_NUMBERS = 11;

/** One snapshot of the plan's table: the state after `blow` blows, the step `blow` falls in (or ends), the file and its sizes. */
export interface SnapshotEntry {
  readonly blow: number;
  readonly step: number;
  /** File name beside the header. */
  readonly file: string;
  /** Bytes inflated, and the gzip on disk. */
  readonly bytes: number;
  readonly gzipBytes: number;
  /** SHA-256 of the inflated bytes, hex. */
  readonly sha256: string;
  /** Estimated seconds the page's worker pool takes to replay from this snapshot to the next (src/timeline/replay-cost.ts). */
  readonly replaySeconds: number;
}

export interface PlanHeader {
  readonly format: typeof PLAN_FORMAT;
  readonly planVersion: number;
  /** SHA-256 of the figure grid the plan was built on (its header's `sha256`). */
  readonly gridSha256: string;
  /** Step ids in timeline order. */
  readonly steps: readonly string[];
  readonly planLength: number;
  /** The plan digest the Making computes (src/stock/digest.ts, `fnvBlow` over every blow in order). */
  readonly planDigest: string;
  /** FNV-1a over the swept cells, step by step (`sweptDigest`). */
  readonly sweptDigest: string;
  /** Cells each step's end sweep took off in the build, for the record. */
  readonly sweptCells: readonly number[];
  /** Ascending by blow; the first is the untouched block at blow 0, and every step boundary has one. */
  readonly snapshots: readonly SnapshotEntry[];
}

/** A whole plan from the plan file (src/timeline/plan-file.ts) and the snapshots beside it. */
export interface PlanSource {
  /** Blows per step, in timeline order. */
  readonly blows: readonly (readonly Blow[])[];
  /** Cells each step's end sweep takes off, ascending global indices. */
  readonly swept: readonly Uint32Array[];
  /** Ascending by blow, the first at blow 0. */
  readonly snapshots: readonly SnapshotEntry[];
  /** A snapshot's inflated bytes: at once (the tests) or later (the page's loader, src/stock/snapshot-loader.ts). */
  load(entry: SnapshotEntry): Uint8Array | Promise<Uint8Array>;
}

export interface DecodedPlan {
  /** Blows per step. */
  readonly blows: readonly (readonly Blow[])[];
  /** Global cell indices each step's end sweep takes off, ascending. */
  readonly swept: readonly Uint32Array[];
}

function align8(n: number): number {
  return Math.ceil(n / 8) * 8;
}

/** Packs a plan into the `.plan.bin` bytes. */
export function encodePlan(plan: DecodedPlan): Uint8Array {
  const steps = plan.blows.length;
  if (plan.swept.length !== steps) throw new Error(`a plan of ${String(steps)} steps needs ${String(steps)} swept lists, not ${String(plan.swept.length)}`);
  const blows = plan.blows.reduce((sum, list) => sum + list.length, 0);
  const sweptCount = plan.swept.reduce((sum, list) => sum + list.length, 0);
  const numbersAt = align8(PLAN_HEADER_WORDS * 4 + steps * 12);
  const sweptAt = numbersAt + blows * BLOW_NUMBERS * 8;
  const toolsAt = sweptAt + sweptCount * 4;
  const out = new Uint8Array(toolsAt + blows);
  const view = new DataView(out.buffer);
  [PLAN_MAGIC, PLAN_BIN_VERSION, steps, blows, sweptCount, 0].forEach((word, n) => {
    view.setUint32(n * 4, word, true);
  });
  let first = 0;
  let blow = 0;
  let cell = 0;
  plan.blows.forEach((list, s) => {
    const swept = plan.swept[s] ?? new Uint32Array(0);
    const at = PLAN_HEADER_WORDS * 4 + s * 12;
    view.setUint32(at, first, true);
    view.setUint32(at + 4, list.length, true);
    view.setUint32(at + 8, swept.length, true);
    first += list.length;
    for (const b of list) {
      const numbers = [...b.point, ...b.normal, ...b.direction, b.size, b.stroke];
      numbers.forEach((value, n) => {
        view.setFloat64(numbersAt + (blow * BLOW_NUMBERS + n) * 8, value, true);
      });
      const code = TOOL_IDS.indexOf(b.tool);
      if (code < 0) throw new Error(`blow ${String(blow)} of step ${String(s)} has tool "${b.tool}", which TOOL_IDS does not list`);
      out[toolsAt + blow] = code;
      blow += 1;
    }
    for (const index of swept) {
      view.setUint32(sweptAt + cell * 4, index, true);
      cell += 1;
    }
  });
  return out;
}

/** Unpacks `.plan.bin` bytes; throws naming what is wrong with bytes that are not a plan. */
export function decodePlan(bytes: Uint8Array): DecodedPlan {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < PLAN_HEADER_WORDS * 4) throw new Error(`a plan file holds at least ${String(PLAN_HEADER_WORDS * 4)} bytes; this one holds ${String(bytes.byteLength)}`);
  const word = (n: number): number => view.getUint32(n * 4, true);
  if (word(0) !== PLAN_MAGIC) throw new Error(`not a sculpture plan file: the magic is ${word(0).toString(16)}, expected ${PLAN_MAGIC.toString(16)}`);
  if (word(1) !== PLAN_BIN_VERSION) throw new Error(`plan file layout ${String(word(1))}; this engine reads layout ${String(PLAN_BIN_VERSION)}`);
  const steps = word(2);
  const blowCount = word(3);
  const sweptCount = word(4);
  const numbersAt = align8(PLAN_HEADER_WORDS * 4 + steps * 12);
  const sweptAt = numbersAt + blowCount * BLOW_NUMBERS * 8;
  const toolsAt = sweptAt + sweptCount * 4;
  if (bytes.byteLength !== toolsAt + blowCount) throw new Error(`plan file of ${String(steps)} steps, ${String(blowCount)} blows and ${String(sweptCount)} swept cells needs ${String(toolsAt + blowCount)} bytes; it holds ${String(bytes.byteLength)}`);
  const blows: Blow[][] = [];
  const swept: Uint32Array[] = [];
  let cell = 0;
  for (let s = 0; s < steps; s += 1) {
    const at = PLAN_HEADER_WORDS * 4 + s * 12;
    const first = view.getUint32(at, true);
    const count = view.getUint32(at + 4, true);
    const sweptHere = view.getUint32(at + 8, true);
    if (first + count > blowCount || cell + sweptHere > sweptCount) throw new Error(`plan file step ${String(s)} runs past the file: blows ${String(first)} to ${String(first + count)} of ${String(blowCount)}, swept cells to ${String(cell + sweptHere)} of ${String(sweptCount)}`);
    const list: Blow[] = [];
    for (let b = first; b < first + count; b += 1) {
      const n = (k: number): number => view.getFloat64(numbersAt + (b * BLOW_NUMBERS + k) * 8, true);
      const tool = TOOL_IDS[bytes[toolsAt + b] ?? 255];
      if (tool === undefined) throw new Error(`plan file blow ${String(b)} has tool code ${String(bytes[toolsAt + b])}, which TOOL_IDS does not list`);
      list.push({ tool, point: [n(0), n(1), n(2)], normal: [n(3), n(4), n(5)], direction: [n(6), n(7), n(8)], size: n(9), stroke: n(10) });
    }
    blows.push(list);
    const indices = new Uint32Array(sweptHere);
    for (let c = 0; c < sweptHere; c += 1) indices[c] = view.getUint32(sweptAt + (cell + c) * 4, true);
    swept.push(indices);
    cell += sweptHere;
  }
  return { blows, swept };
}

/** The plan digest of src/timeline/making.ts (`planDigest`) over a whole plan. */
export function planDigestOf(blows: readonly (readonly Blow[])[]): string {
  let hash = FNV_OFFSET;
  for (const list of blows) for (const blow of list) hash = fnvBlow(hash, blow);
  return fnvHex(hash);
}

/** FNV-1a over the swept cells, each list prefixed by its length so the step boundaries count. */
export function sweptDigestOf(swept: readonly Uint32Array[]): string {
  let hash = FNV_OFFSET;
  for (const list of swept) {
    hash = fnvNumber(hash, list.length);
    for (const index of list) hash = fnvNumber(hash, index);
  }
  return fnvHex(hash);
}

/** Why a parsed `.plan.json` cannot serve this page (null when it can): its format, version, grid or steps differ from what the page runs. */
export function planHeaderProblem(parsed: unknown, expected: { readonly gridSha256: string; readonly steps: readonly string[] }): string | null {
  const h = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Partial<Record<keyof PlanHeader, unknown>>;
  if (h.format !== PLAN_FORMAT) return `its format is ${JSON.stringify(h.format)}, not "${PLAN_FORMAT}"`;
  if (h.planVersion !== PLAN_VERSION) return `it was built by plan version ${JSON.stringify(h.planVersion)} and this page plans with version ${String(PLAN_VERSION)}`;
  if (typeof h.gridSha256 !== 'string' || h.gridSha256.toLowerCase() !== expected.gridSha256.toLowerCase()) return `it was built on the grid with SHA-256 ${JSON.stringify(h.gridSha256)}, and the loaded grid's is ${expected.gridSha256}`;
  const steps = h.steps;
  if (!Array.isArray(steps) || steps.length !== expected.steps.length || steps.some((id, n) => id !== expected.steps[n])) return `its steps (${Array.isArray(steps) ? steps.join(', ') : 'none'}) are not the page's (${expected.steps.join(', ')})`;
  if (typeof h.planDigest !== 'string' || typeof h.sweptDigest !== 'string' || typeof h.planLength !== 'number') return 'it lacks the plan length or digests';
  const snapshots = h.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return 'its snapshot table is empty';
  let last = -1;
  for (const entry of snapshots as unknown[]) {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Partial<Record<keyof SnapshotEntry, unknown>>;
    if (typeof e.blow !== 'number' || typeof e.step !== 'number' || typeof e.file !== 'string' || typeof e.sha256 !== 'string' || typeof e.replaySeconds !== 'number' || e.blow <= last) return `its snapshot table is malformed at ${JSON.stringify(entry)}`;
    last = e.blow;
  }
  if ((snapshots[0] as SnapshotEntry).blow !== 0) return 'its snapshot table does not start at blow 0';
  return null;
}

/** Why a decoded plan does not match its header (null when it does): another step count, length or digest. */
export function decodedPlanProblem(plan: DecodedPlan, header: PlanHeader): string | null {
  if (plan.blows.length !== header.steps.length) return `the plan file holds ${String(plan.blows.length)} steps and the header names ${String(header.steps.length)}`;
  const length = plan.blows.reduce((sum, list) => sum + list.length, 0);
  if (length !== header.planLength) return `the plan file holds ${String(length)} blows and the header says ${String(header.planLength)}`;
  const digest = planDigestOf(plan.blows);
  if (digest !== header.planDigest) return `the plan file's blows digest to ${digest} and the header says ${header.planDigest}`;
  const swept = sweptDigestOf(plan.swept);
  if (swept !== header.sweptDigest) return `the plan file's swept cells digest to ${swept} and the header says ${header.sweptDigest}`;
  return null;
}
