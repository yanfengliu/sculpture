/**
 * Dust (docs/design/spec.md, Tools; docs/research/technique.md, How marble behaves: the dust is white and fine, a handful of it lies on the scaffold planks): a soft puff at the tip of the point and the drill at each strike.
 * Pure in the blow and the seconds since its strike, like the chips (src/tools/chip-burst.ts): the puff is seeded by the blow's fields, so the same blow always puffs the same way and the dust at any `t` is a function of `t`.
 * A puff is a few soft grains of powder thrown off the face along its normal, slowed by the air, swelling as they spread and sinking a little; each fades in over the first 0.06 s and out by its life's end, under a second. Rubbing tools, the claws and the flat send none: their powder stays in the marks.
 * `recordStrikes` is how the page learns which blows have struck: it wraps the cycle the Making calls for chips and keeps the blows and seconds it was asked about, so the dust follows the chips' own look-back without a second walk of the plan.
 */
import type { Blow, BlowCycle, ChipState, ToolId, Vec3 } from '../contracts/making';
import { hashString, lerp, seededRandom } from './math';

/** One grain of a puff: where it is, its diameter in metres, and its opacity from 0 to 1. */
export interface DustState {
  readonly position: Vec3;
  readonly size: number;
  readonly opacity: number;
}

interface PuffSpec {
  readonly grains: number;
  /** Seconds a grain lives, from the strike. */
  readonly life: readonly [number, number];
  /** Launch speed off the face, metres per second, slowed by the air at DRAG per second. */
  readonly speed: readonly [number, number];
  /** Diameter at the strike and when spread, metres. */
  readonly size: readonly [number, number];
  readonly opacity: number;
}

/** The point bursts a puff off the face; the drill's bit lets out a thin trickle of powder. Sizes and speeds inferred: a handful of fine powder, never a cloud that hides the stone. */
const PUFFS: Readonly<Partial<Record<ToolId, PuffSpec>>> = {
  point: { grains: 6, life: [0.55, 0.9], speed: [0.25, 0.6], size: [0.015, 0.14], opacity: 0.6 },
  drill: { grains: 4, life: [0.45, 0.8], speed: [0.08, 0.2], size: [0.008, 0.06], opacity: 0.45 },
};

const DRAG = 4;
const FADE_IN_SECONDS = 0.06;
/** Grains leave this far off the face. */
const LIFT_M = 0.01;
const CONE = 0.9;
const SINK = 0.05;

/** The longest any grain lives: past this, no blow puffs. */
export const MAX_DUST_SECONDS = Math.max(...Object.values(PUFFS).map((puff) => puff.life[1]));

/** Whether `tool` puffs dust at its strikes. */
export function makesDust(tool: ToolId): boolean {
  return PUFFS[tool] !== undefined;
}

function unit(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** The grains of `blow`'s puff at `secondsSince` its strike: empty before the strike, for a tool that sends none, and once every grain has faded. */
export function dustAt(blow: Blow, secondsSince: number): readonly DustState[] {
  const puff = PUFFS[blow.tool];
  if (puff === undefined || secondsSince < 0 || secondsSince > puff.life[1]) return [];
  const random = seededRandom(hashString(['dust', blow.tool, ...blow.point, ...blow.normal, ...blow.direction, blow.size, blow.stroke].map(String).join('|')));
  const [nx, ny, nz] = unit(blow.normal);
  const origin: Vec3 = [blow.point[0] + nx * LIFT_M, blow.point[1] + ny * LIFT_M, blow.point[2] + nz * LIFT_M];
  const travel = (1 - Math.exp(-DRAG * secondsSince)) / DRAG;
  const grains: DustState[] = [];
  for (let i = 0; i < puff.grains; i += 1) {
    const life = lerp(puff.life[0], puff.life[1], random());
    const speed = lerp(puff.speed[0], puff.speed[1], random());
    const direction = unit([nx + CONE * (random() * 2 - 1), ny + CONE * (random() * 2 - 1) + 0.3, nz + CONE * (random() * 2 - 1)]);
    const swell = lerp(0.7, 1.3, random());
    if (secondsSince > life) continue;
    const fadeIn = Math.min(1, secondsSince / FADE_IN_SECONDS);
    const fadeOut = 1 - smooth(secondsSince / life);
    const spread = 1 - Math.exp(-3 * secondsSince);
    grains.push({
      position: [origin[0] + direction[0] * speed * travel, origin[1] + direction[1] * speed * travel - SINK * secondsSince * secondsSince, origin[2] + direction[2] * speed * travel],
      size: lerp(puff.size[0], puff.size[1] * swell, spread),
      opacity: puff.opacity * fadeIn * fadeOut,
    });
  }
  return grains;
}

function smooth(u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  return clamped * clamped * (3 - 2 * clamped);
}

/** A blow the Making asked the chips of, with its seconds since the strike. */
export interface Strike {
  readonly blow: Blow;
  readonly secondsSince: number;
}

export interface StrikeLog {
  /** The cycle to hand the Making: the same answers, with every chips question kept. */
  readonly cycle: BlowCycle;
  /** Forgets the strikes kept so far; call it before reading `Making.chips`. */
  clear(): void;
  /** The dust of every strike kept since the last `clear`. */
  dust(): readonly DustState[];
}

/** Wraps `cycle` so the strikes the Making asks chips for are kept for the dust. */
export function recordStrikes(cycle: BlowCycle): StrikeLog {
  const strikes: Strike[] = [];
  return {
    cycle: {
      posesAt: (blow, previous, phase) => cycle.posesAt(blow, previous, phase),
      chipsAt: (blow, secondsSince): readonly ChipState[] => {
        if (makesDust(blow.tool) && secondsSince >= 0 && secondsSince <= MAX_DUST_SECONDS) strikes.push({ blow, secondsSince });
        return cycle.chipsAt(blow, secondsSince);
      },
      restPose: (tool) => cycle.restPose(tool),
    },
    clear() {
      strikes.length = 0;
    },
    dust() {
      return strikes.flatMap(({ blow, secondsSince }) => dustAt(blow, secondsSince));
    },
  };
}
