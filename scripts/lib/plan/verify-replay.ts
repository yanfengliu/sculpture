/**
 * Runs in the page (scripts/verify-plan.mjs imports it through the dev server): a Making over the David grid and the plan file, with the page's worker pool and snapshot loader, replays the whole plan forward without loading a snapshot and, at every snapshot of the table, encodes its own grids and compares their SHA-256 with the table's. Equal digests mean the browser's carving reproduces what Node built byte for byte, so a jump through a snapshot and a replay reach the same state (docs/design/spec.md, Undo and replay).
 */
import { MeshBasicMaterial } from 'three';

import { DAVID_STEPS } from '../../../src/choreography/david-steps';
import { STAGES } from '../../../src/choreography/stages';
import type { BlowCycle } from '../../../src/contracts/making';
import { loadFigureGrid } from '../../../src/stock/grid';
import { encodeSnapshot } from '../../../src/stock/snapshot';
import { createMaking } from '../../../src/timeline/making';
import { timeOfSnapshot } from '../../../src/timeline/plan-build';
import { decodePlan, type PlanHeader } from '../../../src/timeline/plan-file';

const STILL: BlowCycle = { posesAt: () => [], chipsAt: () => [], restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }) };

export interface ReplayCheck {
  readonly file: string;
  readonly blow: number;
  readonly same: boolean;
  readonly seconds: number;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Replays the plan of `model/david.plan.json` with `workers` workers and checks every snapshot; `onCheck` hears each as it is made. */
export async function verifyReplay(workers: number, onCheck: (check: ReplayCheck) => void): Promise<readonly ReplayCheck[]> {
  const { grid, header } = await loadFigureGrid('model/david.json');
  const plan = (await (await fetch('model/david.plan.json')).json()) as PlanHeader;
  const decoded = decodePlan(new Uint8Array(await (await fetch('model/david.plan.bin')).arrayBuffer()));
  // No load is ever cheaper than a replay here, so every state comes from the page's own carving.
  const making = createMaking({ figure: grid, header, steps: DAVID_STEPS, stages: STAGES, blowCycle: STILL, material: new MeshBasicMaterial(), workers, plan: { blows: decoded.blows, swept: decoded.swept, snapshots: plan.snapshots, load: () => Promise.reject(new Error('the replay check loads no snapshot')) }, snapshotLoadSeconds: Number.POSITIVE_INFINITY });
  const checks: ReplayCheck[] = [];
  const started = performance.now();
  try {
    for (const entry of plan.snapshots) {
      making.setTime(timeOfSnapshot(making, entry));
      while (making.dirtyChunks > 0) await new Promise((resolve) => setTimeout(resolve, 5));
      const bytes = encodeSnapshot(making.stock, making.finish, grid, making.blowsApplied) as Uint8Array<ArrayBuffer>;
      const check = { file: entry.file, blow: entry.blow, same: making.blowsApplied === entry.blow && (await sha256(bytes)) === entry.sha256, seconds: (performance.now() - started) / 1000 };
      checks.push(check);
      onCheck(check);
    }
  } finally {
    making.dispose();
  }
  return checks;
}
