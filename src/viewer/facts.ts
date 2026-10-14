/**
 * `window.__sculpture`: the read-only facts the page exposes for tests (docs/design/spec.md, Query contract), the `window.__shotReady` capture flag and the `window.__shotSeek` capture seek.
 * Tests read these and drive the page through its real controls; nothing writes state through them. `__shotSeek` exists under `?shot=1` only, for the video exporter (scripts/export-video.mjs): it seeks through the player, the same path as the scrubber, and re-arms `__shotReady`.
 * Beyond the contract's list, the page adds per-step `stepTools`, `stepWeights` and `stepBlowCounts` (for the capture scripts) and the page state `playing`, `speed`, `view`, `follow`, `finish`, `yard` and `hiddenSpans` (for the control tests).
 */
import type { Making, PlayDirection, Player } from '../contracts/making';
import { BASE_SECONDS } from '../contracts/making';

export interface SculptureFacts {
  /** Step ids in timeline order; `stepTitles[i]`, `stepStages[i]`, `stepTools[i]`, `stepWeights[i]` and `stepBlowCounts[i]` belong to `stepIds[i]`. */
  readonly stepIds: readonly string[];
  readonly stepTitles: readonly string[];
  readonly stepStages: readonly string[];
  readonly stepTools: readonly string[];
  readonly stepWeights: readonly number[];
  readonly stepBlowCounts: readonly number[];
  /** Stage ids in order. */
  readonly stages: readonly string[];
  /** Number of steps; the timeline runs over `[0, N]`. */
  readonly N: number;
  /** Seconds per step at speed 1 and weight 1 (src/contracts/making.ts), so the video exporter maps wall time to `t` without restating it. */
  readonly baseSeconds: number;
  /** Current timeline position. */
  readonly t: number;
  /** Blows in the whole plan and a digest of it, both deterministic. */
  readonly planLength: number;
  readonly planDigest: string;
  /** Blows applied to the stock so far and chunks waiting to be remeshed. */
  readonly blowsApplied: number;
  readonly dirtyChunks: number;
  /** Playback state: the direction while playing, else null; the speed; whether a step animation or playback moves `t`. */
  readonly playing: PlayDirection | null;
  readonly speed: number;
  readonly moving: boolean;
  /** The camera preset in force (`free` once the user orbits), the follow toggle and the finish-code view. */
  readonly view: string;
  readonly follow: boolean;
  readonly finish: boolean;
  /** Whether the yard structures show (the Yard toggle, `yard=0`), and the ids of the yard spans hidden now: those between the camera and the block, or every span while the yard is off (src/viewer/yard-spans.ts). */
  readonly yard: boolean;
  readonly hiddenSpans: readonly string[];
  /** URL parameters the page ignored, each with why (`src/viewer/query.ts` and the page's own checks); empty for a well-formed URL, so a capture harness can tell a wrong shot from the asked one. */
  readonly queryProblems: readonly string[];
}

declare global {
  interface Window {
    /** Capture contract: true once at least 5 frames have rendered at the requested state under `?shot=1` with every dirty chunk meshed. */
    __shotReady?: boolean;
    /** Capture contract, `?shot=1` only: seeks to `t` through the player and clears `__shotReady` until the new state has rendered. */
    __shotSeek?: (t: number) => void;
    __sculpture?: SculptureFacts;
  }
}

export const EMPTY_FACTS: SculptureFacts = {
  stepIds: [],
  stepTitles: [],
  stepStages: [],
  stepTools: [],
  stepWeights: [],
  stepBlowCounts: [],
  stages: [],
  N: 0,
  baseSeconds: BASE_SECONDS,
  t: 0,
  planLength: 0,
  planDigest: '',
  blowsApplied: 0,
  dirtyChunks: 0,
  playing: null,
  speed: 1,
  moving: false,
  view: 'free',
  follow: false,
  finish: false,
  yard: true,
  hiddenSpans: [],
  queryProblems: [],
};

export interface PageState {
  readonly view: string;
  readonly follow: boolean;
  readonly finish: boolean;
  readonly yard: boolean;
  readonly hiddenSpans: readonly string[];
  readonly queryProblems: readonly string[];
}

/** The facts at this instant, from the making, the player and the page state. */
export function buildFacts(making: Making, player: Player & { readonly moving: boolean }, page: PageState): SculptureFacts {
  return {
    stepIds: making.steps.map((step) => step.id),
    stepTitles: making.steps.map((step) => step.title),
    stepStages: making.steps.map((step) => step.stage),
    stepTools: making.steps.map((step) => step.tool),
    stepWeights: making.steps.map((step) => step.weight),
    stepBlowCounts: making.steps.map((step) => step.blowCount),
    stages: making.stages.map((stage) => stage.id),
    N: making.N,
    baseSeconds: BASE_SECONDS,
    t: player.t,
    planLength: making.planLength,
    planDigest: making.planDigest,
    blowsApplied: making.blowsApplied,
    dirtyChunks: making.dirtyChunks,
    playing: player.playing,
    speed: player.speed,
    moving: player.moving,
    view: page.view,
    follow: page.follow,
    finish: page.finish,
    yard: page.yard,
    hiddenSpans: page.hiddenSpans,
    queryProblems: page.queryProblems,
  };
}

/** Publishes a frozen snapshot; call again when a fact changes. */
export function publishFacts(facts: SculptureFacts): void {
  window.__sculpture = Object.freeze({
    ...facts,
    stepIds: Object.freeze([...facts.stepIds]),
    stepTitles: Object.freeze([...facts.stepTitles]),
    stepStages: Object.freeze([...facts.stepStages]),
    stepTools: Object.freeze([...facts.stepTools]),
    stepWeights: Object.freeze([...facts.stepWeights]),
    stepBlowCounts: Object.freeze([...facts.stepBlowCounts]),
    stages: Object.freeze([...facts.stages]),
    hiddenSpans: Object.freeze([...facts.hiddenSpans]),
    queryProblems: Object.freeze([...facts.queryProblems]),
  });
}

/** The fields that change frame to frame, as one string, so the page republishes only on a change. */
export function factsSignature(facts: SculptureFacts): string {
  return [facts.t, facts.blowsApplied, facts.dirtyChunks, facts.playing, facts.speed, facts.moving, facts.view, facts.follow, facts.finish, facts.yard, facts.hiddenSpans.join(','), facts.planLength, facts.queryProblems.length].join('|');
}
