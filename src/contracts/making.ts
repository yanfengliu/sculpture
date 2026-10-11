/**
 * The making contract (docs/design/spec.md, Blows, strokes and steps; Tools): the interfaces the engine, the tools and the page share.
 * Types only. The engine implements Making and Player under src/stock/ and src/timeline/; the tools implement BlowCycle under src/tools/; the page consumes all three. Choreography data implements StepDef under src/choreography/.
 */
import type { Object3D } from 'three';

/** Carving tools the catalogue names (src/tools/catalog.ts gives each its Italian and English names, dimensions and source). The mallet is the striking tool and has no blows of its own. */
export type ToolId = 'point' | 'two-tooth' | 'claw' | 'flat' | 'roundel' | 'drill' | 'rasp' | 'riffler' | 'abrasive' | 'polish';

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** One blow: removes stock at an instant. World metres. */
export interface Blow {
  readonly tool: ToolId;
  /** Impact point on the current stock surface. */
  readonly point: Vec3;
  /** Outward surface normal of the stock at the point, unit length. */
  readonly normal: Vec3;
  /** Tool axis from the handle toward the working tip, unit length. */
  readonly direction: Vec3;
  /** Characteristic size of the removed volume, metres: the depth of the cut along the direction. */
  readonly size: number;
  /** Stroke index within the step; consecutive blows with the same stroke share one tool set-up and approach. */
  readonly stroke: number;
}

/** A sampler of a signed-distance field in world metres (negative inside). */
export interface SdfSampler {
  sample(x: number, y: number, z: number): number;
  /** Unit gradient at the point, which is the outward normal near the surface. */
  gradient(x: number, y: number, z: number): Vec3;
}

/** The region a step works: an axis-aligned box in world metres, optionally intersected with a predicate on figure-surface points. */
export interface RegionDef {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly label: string;
  readonly contains?: (point: Vec3, figureNormal: Vec3) => boolean;
}

export interface PlanContext {
  /** Signed distance to the statue's surface. */
  readonly figure: SdfSampler;
  /** Signed distance to the stock as the previous steps leave it. */
  readonly stock: SdfSampler;
  readonly region: RegionDef;
  readonly margin: number;
  readonly seed: number;
  /** Cell size of the grids, metres, so a generator can space its blows. */
  readonly cell: number;
}

export type StageId = 'setup' | 'roughing' | 'two-tooth' | 'claw-work' | 'flat-work' | 'drilling' | 'rasping' | 'abrading' | 'polishing';

export interface CameraFocus {
  /** What the follow camera frames: the working tip, or a fixed point in world metres. */
  readonly kind: 'tip' | 'point';
  readonly point?: Vec3;
  /** Distance of the follow camera from its target, metres. */
  readonly distance: number;
}

export interface StepDef {
  readonly id: string;
  readonly stage: StageId;
  /** At most 48 characters. */
  readonly title: string;
  /** At most 200 characters; names the research note behind the step. */
  readonly detail: string;
  readonly tool: ToolId;
  readonly region: RegionDef;
  /** Metres left above the final surface at the end of this step. */
  readonly margin: number;
  /** Real blows one shown blow stands for. */
  readonly blowsPerShown: number;
  /** Playback duration multiplier; 1 is BASE_SECONDS per step. */
  readonly weight: number;
  /** ISO dates the step spans in the simulated calendar. */
  readonly calendar: { readonly from: string; readonly to: string };
  readonly focus?: CameraFocus;
  /** Deterministic in ctx and the step's seed; the blows are applied in array order. */
  plan(ctx: PlanContext): readonly Blow[];
}

export interface StageDef {
  readonly id: StageId;
  readonly title: string;
  readonly detail: string;
}

/** Pose of one rendered tool at an instant; the mallet appears here as 'mallet'. */
export interface ToolPose {
  readonly tool: ToolId | 'mallet';
  readonly position: Vec3;
  readonly quaternion: Quat;
}

/** One chip in flight or at rest. */
export interface ChipState {
  readonly position: Vec3;
  readonly quaternion: Quat;
  /** Scale of the unit chip geometry, metres. */
  readonly scale: number;
  /** 1 fresh, 0 faded out. */
  readonly life: number;
}

/** What the tools contribute to an instant of the making: pure functions of the blow and the phase, so the result at a time is reproducible. */
export interface BlowCycle {
  /** Tool poses at phase p in [0, 1) of the cycle around `blow`, after `previous` (null at a step's first blow). */
  posesAt(blow: Blow, previous: Blow | null, phase: number): readonly ToolPose[];
  /** Chips launched by `blow`, at `secondsSince` the strike; empty before the strike and once all have faded. */
  chipsAt(blow: Blow, secondsSince: number): readonly ChipState[];
  /** Where a tool rests when it is not in use, by tool. */
  restPose(tool: ToolId | 'mallet'): ToolPose;
}

export interface StepInfo {
  readonly id: string;
  readonly stage: StageId;
  readonly title: string;
  readonly detail: string;
  readonly tool: ToolId;
  readonly blowsPerShown: number;
  readonly weight: number;
  readonly calendar: { readonly from: string; readonly to: string };
  /** Index of the step's first blow in the plan and its blow count. */
  readonly firstBlow: number;
  readonly blowCount: number;
}

/** The making at a timeline position: the engine's view for the page. Everything observable is a pure function of `t`. */
export interface Making {
  readonly steps: readonly StepInfo[];
  readonly stages: readonly StageDef[];
  /** Number of steps; `t` runs over [0, N]. */
  readonly N: number;
  readonly planLength: number;
  /** Deterministic digest of the whole plan, hex. */
  readonly planDigest: string;
  readonly t: number;
  /** Sets the position. The material state updates synchronously; meshing is asynchronous and `dirtyChunks` counts what is left. */
  setTime(t: number): void;
  readonly blowsApplied: number;
  readonly dirtyChunks: number;
  /** Tool poses and chips to render at `t`. */
  readonly poses: readonly ToolPose[];
  readonly chips: readonly ChipState[];
  /** The blow in progress at `t` and its cycle phase, or null at a rest position. */
  readonly current: { readonly blow: Blow; readonly phase: number } | null;
  /** The stock's meshes, one child per chunk; the page adds this to its scene and never edits it. */
  readonly stockObject: Object3D;
  /** Called whenever `dirtyChunks` reaches 0 after a change. */
  onMeshed(listener: () => void): () => void;
}

export type PlayDirection = 'forward' | 'backward';

/** Pure playback logic with no DOM (docs/design/spec.md, Blows, strokes and steps). */
export interface Player {
  readonly t: number;
  readonly N: number;
  readonly playing: PlayDirection | null;
  readonly speed: 0.5 | 1 | 2 | 4;
  play(direction: PlayDirection): void;
  pause(): void;
  /** Animates to the next or previous integer; a second call while moving retargets. */
  stepForward(): void;
  stepBack(): void;
  /** Sets `t` directly, clamped to [0, N]. */
  seek(t: number): void;
  setSpeed(speed: 0.5 | 1 | 2 | 4): void;
  /** Advances by `seconds` of wall time; returns true when `t` changed. */
  update(seconds: number): boolean;
}

/** Seconds per step at speed 1 and weight 1. */
export const BASE_SECONDS = 12;
