/**
 * When the scaffold's plank bridges are laid (docs/research/decisions.md, the scaffold entry: bridges are laid when the work needs them; src/tools/scaffold.ts, BRIDGES).
 * A bridge is laid once the position is inside the first step with a planned blow that neither the floor nor a deck reaches and whose nearest platform is that bridge (`isReachable` and `nearestPlatform` over `PLATFORMS`), and never while stone occupies the bridge's planks: the stock is sampled over them when the bridge would appear.
 * Pure in `t` once the plan is known: the needs come from the plans of the steps the position has entered, which the making has planned by the time it stands there, and the occupancy from the stock at `t`, which only loses stone as `t` grows (the carving rule only cuts), so a box once clear stays clear at every later `t`. A bridge that is needed while stone still fills its box stays hidden and is reported with its step and how deep the stone reaches, never hidden silently.
 * Measured on 2026-10-14 at 8 mm, on the David and the synthetic figure alike: the head bridge is first needed by step 4 (`chest-and-face`), the upper back bridge by step 8 (`sides-point`), the lower back bridge by none, and each box is clear when its bridge is first needed.
 */
import type { Blow } from '../contracts/making';
import type { Platform } from '../tools/scaffold';
import { BRIDGES, DECKS, FLOOR, PLATFORMS, SCAFFOLD_TIMBER, isReachable, nearestPlatform } from '../tools/scaffold';

const GROUND_AND_DECKS: readonly Platform[] = [FLOOR, ...DECKS];
/** Spacing of the samples over a bridge's footprint, metres. */
const SAMPLE_STEP = 0.02;

/** The bridge `blow` needs: its nearest platform when neither the floor nor a deck reaches it, if that platform is a bridge; else null. */
export function bridgeFor(blow: Blow): string | null {
  if (isReachable(blow.point, GROUND_AND_DECKS)) return null;
  const platform = nearestPlatform(blow.point, PLATFORMS);
  return platform?.kind === 'bridge' ? platform.id : null;
}

/** How deep stone reaches into `bridge`'s planks, metres, 0 when they are clear: `sample` is the stock's signed distance (negative inside), read every 2 cm over the footprint at the planks' underside, middle and top. */
export function stoneDepth(bridge: Platform, sample: (x: number, y: number, z: number) => number): number {
  const thickness = SCAFFOLD_TIMBER.plankThickness;
  let deepest = 0;
  for (let x = bridge.xMin; x <= bridge.xMax + 1e-9; x += SAMPLE_STEP) {
    for (let z = bridge.zMin; z <= bridge.zMax + 1e-9; z += SAMPLE_STEP) {
      for (const y of [bridge.level - thickness, bridge.level - thickness / 2, bridge.level]) deepest = Math.min(deepest, sample(x, y, z));
    }
  }
  return deepest < 0 ? -deepest : 0;
}

/** What the tracker reads from the making. */
export interface BridgeSource {
  readonly N: number;
  /** A planned step's blows; empty for a step not planned yet. */
  blowsOf(step: number): readonly Blow[];
  /** Blows applied to the stock: the stock at a count is always the same. */
  readonly blowsApplied: number;
  /** The stock's signed distance at a world point, metres, negative inside. */
  sampleStock(x: number, y: number, z: number): number;
  stepId(step: number): string;
}

export interface BridgeState {
  /** Ids of the bridges laid now, in BRIDGES order. */
  readonly laid: readonly string[];
  /** Every disagreement seen so far: a bridge needed while stone fills its box, with the step and the depth. */
  readonly problems: readonly string[];
}

export interface BridgeTracker {
  update(t: number): BridgeState;
}

export function createBridgeTracker(source: BridgeSource, bridges: readonly Platform[] = BRIDGES): BridgeTracker {
  /** The bridges each planned step needs, computed once a step has blows (a plan never changes once made). */
  const needs: (ReadonlySet<string> | undefined)[] = [];
  /** Per bridge, the fewest applied blows seen with its box clear and the most seen with stone in it. */
  const clearFrom = new Map<string, number>();
  const filledTo = new Map<string, number>();
  const problems: string[] = [];
  const reported = new Set<string>();

  const needsOf = (step: number): ReadonlySet<string> => {
    const known = needs[step];
    if (known !== undefined) return known;
    const blows = source.blowsOf(step);
    const found = new Set<string>();
    for (const blow of blows) {
      const id = bridgeFor(blow);
      if (id !== null) found.add(id);
    }
    if (blows.length > 0) needs[step] = found;
    return found;
  };

  const clear = (bridge: Platform, firstStep: number): boolean => {
    const applied = source.blowsApplied;
    if (applied >= (clearFrom.get(bridge.id) ?? Number.POSITIVE_INFINITY)) return true;
    if (applied <= (filledTo.get(bridge.id) ?? Number.NEGATIVE_INFINITY)) return false;
    const depth = stoneDepth(bridge, (x, y, z) => source.sampleStock(x, y, z));
    if (depth <= 0) {
      clearFrom.set(bridge.id, Math.min(applied, clearFrom.get(bridge.id) ?? Number.POSITIVE_INFINITY));
      return true;
    }
    filledTo.set(bridge.id, Math.max(applied, filledTo.get(bridge.id) ?? Number.NEGATIVE_INFINITY));
    const key = `${bridge.id}@${String(firstStep)}`;
    if (!reported.has(key)) {
      reported.add(key);
      problems.push(`${bridge.id} is needed from step ${String(firstStep + 1)} (${source.stepId(firstStep)}), but stone fills its planks' box up to ${(depth * 100).toFixed(1)} cm deep there (${String(applied)} blows applied); it stays hidden until the box is clear.`);
    }
    return false;
  };

  return {
    update(t) {
      // The steps the position has entered: step s from t > s on, so at an integer t = k the step about to start lays nothing yet.
      const entered = Math.min(source.N, Math.ceil(t));
      const laid: string[] = [];
      for (const bridge of bridges) {
        let first = -1;
        for (let step = 0; step < entered && first < 0; step += 1) if (needsOf(step).has(bridge.id)) first = step;
        if (first >= 0 && clear(bridge, first)) laid.push(bridge.id);
      }
      return { laid, problems: [...problems] };
    },
  };
}
