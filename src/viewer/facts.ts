/**
 * `window.__sculpture`: the read-only facts the page exposes for tests (docs/design/spec.md, Query contract), and the `window.__shotReady` capture flag.
 * Tests read these and drive the page through its real controls; nothing writes state through them.
 * The scaffold publishes an empty making (no steps, `N` 0, `t` 0); the engine, timeline and page owners fill the fields as their parts land.
 */

export interface SculptureFacts {
  /** Step ids in timeline order; `stepTitles[i]` and `stepStages[i]` belong to `stepIds[i]`. */
  readonly stepIds: readonly string[];
  readonly stepTitles: readonly string[];
  readonly stepStages: readonly string[];
  /** Stage ids in order. */
  readonly stages: readonly string[];
  /** Number of steps; the timeline runs over `[0, N]`. */
  readonly N: number;
  /** Current timeline position. */
  readonly t: number;
  /** Blows in the whole plan and a digest of it, both deterministic. */
  readonly planLength: number;
  readonly planDigest: string;
  /** Blows applied to the stock so far and chunks waiting to be remeshed. */
  readonly blowsApplied: number;
  readonly dirtyChunks: number;
  /** URL parameters the page ignored, each with why (`src/viewer/query.ts`); empty for a well-formed URL, so a capture harness can tell a wrong shot from the asked one. */
  readonly queryProblems: readonly string[];
}

declare global {
  interface Window {
    /** Capture contract: true once at least 5 frames have rendered at the requested state under `?shot=1`. */
    __shotReady?: boolean;
    __sculpture?: SculptureFacts;
  }
}

export const EMPTY_FACTS: SculptureFacts = {
  stepIds: [],
  stepTitles: [],
  stepStages: [],
  stages: [],
  N: 0,
  t: 0,
  planLength: 0,
  planDigest: '',
  blowsApplied: 0,
  dirtyChunks: 0,
  queryProblems: [],
};

/** Publishes a frozen snapshot; call again when a fact changes. */
export function publishFacts(facts: SculptureFacts): void {
  window.__sculpture = Object.freeze({
    ...facts,
    stepIds: Object.freeze([...facts.stepIds]),
    stepTitles: Object.freeze([...facts.stepTitles]),
    stepStages: Object.freeze([...facts.stepStages]),
    stages: Object.freeze([...facts.stages]),
    queryProblems: Object.freeze([...facts.queryProblems]),
  });
}
