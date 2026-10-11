/**
 * The scaffold of docs/research/technique.md stage 0 as the tools own it: deck heights and extents, the movable plank bridges, and the reach test every planned blow must pass (docs/policies/local-rules.md: a tool never cuts where a sculptor could not reach).
 * The page's yard builds its timbers from these constants; src/choreography's plan test calls `isReachable` on every blow.
 * All inferred: the record says only that a `ponte` with planks stood beside the figure. Two levels of plank decks ring the front and sides 0.35 m clear of the block, the distance a working scaffold keeps from a wall. The bridges are pairs of planks a sculptor lays between the side decks when the work needs them: across the front at the top level, close over the roughed-out chest, to reach the head; across the back at both levels to reach the back, which the decks do not ring. Nothing in the record forbids either, and neither the head nor the back can be reached without them.
 * Reach is measured from the nearest standing edge: a deck's or bridge's rectangle, or the yard floor outside the block's footprint.
 */
import type { Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';

/** Deck heights above the floor, metres. */
export const DECK_LEVELS = [1.5, 3.2] as const;

/** Timber sizes and offsets the yard builds the scaffold from, metres. */
export const SCAFFOLD_TIMBER = {
  /** Between a deck's inner edge and the block's face. */
  clearance: 0.35,
  deckWidth: 0.8,
  /** The side decks run this far past the block's back face and this far short of... past its front face. */
  sideBackOverhang: 0.4,
  sideFrontOverhang: 0.2,
  /** The front deck reaches this far past the block's sides. */
  frontOverhangX: 0.45,
  plankWidth: 0.25,
  plankThickness: 0.04,
  plankGap: 0.02,
  post: 0.12,
  beam: 0.1,
  postHeight: 6.0,
  /** The top beam across the front, above the block, the plumb line's anchor. */
  topBeamY: 5.85,
} as const;

/** What a standing sculptor reaches with a tool from a platform edge: 2.35 m up (shoulder 1.4, arm 0.7, tool 0.25), 0.9 m down over the edge (kneeling at it), 1.0 m out (arm, tool and 5 cm of lean). */
export const REACH = { above: 2.35, below: 0.9, horizontal: 1.0 } as const;

export type PlatformKind = 'floor' | 'deck' | 'bridge';

/** A place to stand: a rectangle at a height. The floor's rectangle is the yard outside the block's footprint. */
export interface Platform {
  readonly id: string;
  readonly kind: PlatformKind;
  readonly level: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

const halfW = BLOCK_M.width / 2;
const halfD = BLOCK_M.depth / 2;
const { clearance, deckWidth, sideBackOverhang, sideFrontOverhang, frontOverhangX, plankWidth, plankGap } = SCAFFOLD_TIMBER;

/** The side decks' inner and outer x, their z run, the front deck's z run and half-width: the yard lays its ledgers and planks on these. */
export const DECK_EXTENTS = {
  innerX: halfW + clearance,
  outerX: halfW + clearance + deckWidth,
  sideZMin: -halfD - sideBackOverhang,
  sideZMax: halfD + sideFrontOverhang,
  frontZMin: halfD + clearance,
  frontZMax: halfD + clearance + deckWidth,
  frontHalfX: halfW + frontOverhangX,
} as const;

const BRIDGE_WIDTH = 2 * plankWidth + plankGap;

/** The movable bridges: two planks each, resting on the side decks' inner ledgers. The head bridge lies across the front at the top level with its near edge 0.6 m before the block's centre; the back bridges lie just behind the block at both levels. */
export const BRIDGES: readonly Platform[] = [
  { id: 'head-bridge', kind: 'bridge', level: 3.2, xMin: -DECK_EXTENTS.innerX, xMax: DECK_EXTENTS.innerX, zMin: 0.6, zMax: 0.6 + BRIDGE_WIDTH },
  ...DECK_LEVELS.map((level): Platform => ({ id: `back-bridge-${String(level)}`, kind: 'bridge', level, xMin: -DECK_EXTENTS.innerX, xMax: DECK_EXTENTS.innerX, zMin: -halfD - 0.08 - BRIDGE_WIDTH, zMax: -halfD - 0.08 })),
];

export const FLOOR: Platform = { id: 'floor', kind: 'floor', level: 0, xMin: -30, xMax: 30, zMin: -30, zMax: 30 };

/** The decks of both levels: left and right sides, and the front. */
export const DECKS: readonly Platform[] = DECK_LEVELS.flatMap((level): Platform[] => [
  { id: `left-${String(level)}`, kind: 'deck', level, xMin: -DECK_EXTENTS.outerX, xMax: -DECK_EXTENTS.innerX, zMin: DECK_EXTENTS.sideZMin, zMax: DECK_EXTENTS.sideZMax },
  { id: `right-${String(level)}`, kind: 'deck', level, xMin: DECK_EXTENTS.innerX, xMax: DECK_EXTENTS.outerX, zMin: DECK_EXTENTS.sideZMin, zMax: DECK_EXTENTS.sideZMax },
  { id: `front-${String(level)}`, kind: 'deck', level, xMin: -DECK_EXTENTS.frontHalfX, xMax: DECK_EXTENTS.frontHalfX, zMin: DECK_EXTENTS.frontZMin, zMax: DECK_EXTENTS.frontZMax },
]);

/** Every place to stand, bridges included. */
export const PLATFORMS: readonly Platform[] = [FLOOR, ...DECKS, ...BRIDGES];

/** Horizontal distance from `(x, z)` to the nearest point of the platform a sculptor can stand on: zero inside a deck; for the floor, the depth inside the block's footprint. */
export function standingDistance(platform: Platform, x: number, z: number): number {
  if (platform.kind === 'floor') {
    const inside = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
    return Math.max(0, inside);
  }
  const dx = Math.max(platform.xMin - x, 0, x - platform.xMax);
  const dz = Math.max(platform.zMin - z, 0, z - platform.zMax);
  return Math.hypot(dx, dz);
}

/** Whether a sculptor standing at the edge of `platform` reaches `point` with a tool. */
export function reachesFrom(platform: Platform, point: Vec3): boolean {
  const [x, y, z] = point;
  const rise = y - platform.level;
  if (rise < -REACH.below || rise > REACH.above) return false;
  if (platform.kind === 'floor' && y < 0) return false;
  return standingDistance(platform, x, z) <= REACH.horizontal;
}

/** Whether any of `platforms` (all of them by default) puts `point` within a sculptor's reach. */
export function isReachable(point: Vec3, platforms: readonly Platform[] = PLATFORMS): boolean {
  return point[1] >= 0 && platforms.some((platform) => reachesFrom(platform, point));
}

/** The platform the sculptor would use for `point`: the one whose edge is nearest, or null when none reaches. */
export function nearestPlatform(point: Vec3, platforms: readonly Platform[] = PLATFORMS): Platform | null {
  let best: Platform | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const platform of platforms) {
    if (!reachesFrom(platform, point)) continue;
    const distance = Math.hypot(standingDistance(platform, point[0], point[2]), point[1] - platform.level);
    if (distance < bestDistance) {
      best = platform;
      bestDistance = distance;
    }
  }
  return best;
}
