/**
 * The plan build's entry into the engine (scripts/build-plan.mjs loads it through Vite's module runner, so the engine's TypeScript runs in Node as the page bundles it): the David steps over a figure grid read from the pipeline's files, planned and replayed by src/timeline/plan-build.ts.
 */
import { DAVID_STEPS } from '../../../src/choreography/david-steps';
import { STAGES } from '../../../src/choreography/stages';
import type { GridHeader } from '../../../src/contracts/grid';
import { Grid } from '../../../src/stock/grid';
import { buildPlan, type BuildPlanOptions, type BuiltPlan } from '../../../src/timeline/plan-build';

export interface DavidPlanOptions {
  readonly header: GridHeader;
  /** The grid's Int16 values, inflated and checked against the header's SHA-256. */
  readonly values: Int16Array;
  readonly store: BuildPlanOptions['store'];
  readonly log: (line: string) => void;
}

export function buildDavidPlan(options: DavidPlanOptions): BuiltPlan {
  const { header } = options;
  const figure = new Grid({ cell: header.cell, size: header.size, origin: header.origin, band: header.band }, options.values);
  return buildPlan({ figure, header, steps: DAVID_STEPS, stages: STAGES, name: 'david', gridSha256: header.sha256, store: options.store, log: options.log });
}
