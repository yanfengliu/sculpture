/**
 * The scaffold's reach (docs/research/technique.md stage 0; review item 13): reach is measured from the nearest deck, bridge or floor edge, so a point the decks cannot reach is out of reach unless a bridge is laid for it.
 * Bound: geometry only; whether the stock in the way has been cut is the plan's order, not this test's.
 */
import { describe, expect, it } from 'vitest';

import { BLOCK_M } from '../david/frame';
import { BRIDGES, DECKS, DECK_EXTENTS, DECK_LEVELS, FLOOR, PLATFORMS, REACH, SCAFFOLD_TIMBER, isReachable, nearestPlatform, standingDistance } from './scaffold';

const withoutBridges = [FLOOR, ...DECKS];

describe('scaffold', () => {
  it('rings the front and sides at two levels a scaffold\u2019s clearance from the block, with the bridges between the side decks', () => {
    expect([...DECK_LEVELS].sort((a, b) => a - b)).toEqual([...DECK_LEVELS]);
    // From the top deck a standing sculptor reaches the block's top face.
    expect(Math.max(...DECK_LEVELS) + REACH.above).toBeGreaterThanOrEqual(BLOCK_M.height);
    expect(DECKS).toHaveLength(6);
    expect(DECK_EXTENTS.innerX).toBeCloseTo(BLOCK_M.width / 2 + SCAFFOLD_TIMBER.clearance, 9);
    expect(DECK_EXTENTS.frontZMin).toBeCloseTo(BLOCK_M.depth / 2 + SCAFFOLD_TIMBER.clearance, 9);
    for (const bridge of BRIDGES) {
      expect(bridge.xMin).toBeCloseTo(-DECK_EXTENTS.innerX, 9);
      expect(bridge.xMax).toBeCloseTo(DECK_EXTENTS.innerX, 9);
      expect(DECK_LEVELS).toContain(bridge.level);
    }
    expect(PLATFORMS.map((p) => p.id)).toEqual(['floor', 'left-1.5', 'right-1.5', 'front-1.5', 'left-3.2', 'right-3.2', 'front-3.2', 'head-bridge', 'back-bridge-1.5', 'back-bridge-3.2']);
  });

  it('measures the standing distance from the deck edge, and from the footprint edge on the floor', () => {
    const front = DECKS.find((d) => d.id === 'front-1.5');
    if (front === undefined) throw new Error('no front deck');
    expect(standingDistance(front, 0, 0.2)).toBeCloseTo(DECK_EXTENTS.frontZMin - 0.2, 9);
    expect(standingDistance(front, 0, 1.5)).toBe(0);
    expect(standingDistance(FLOOR, 3, 3)).toBe(0);
    expect(standingDistance(FLOOR, 0, 0.3)).toBeCloseTo(BLOCK_M.depth / 2 - 0.3, 9);
  });

  it('reaches the crown only from the head bridge, and the review\u2019s pupil blow from the top front deck', () => {
    const crown: readonly [number, number, number] = [0, 5.1, 0.0];
    expect(DECK_EXTENTS.frontZMin - crown[2]).toBeGreaterThan(REACH.horizontal);
    expect(isReachable(crown, withoutBridges)).toBe(false);
    expect(isReachable(crown)).toBe(true);
    expect(nearestPlatform(crown)?.id).toBe('head-bridge');
    const pupil: readonly [number, number, number] = [-0.103, 4.707, 0.199];
    expect(isReachable(pupil, withoutBridges)).toBe(true);
    expect(nearestPlatform(pupil, withoutBridges)?.id).toBe('front-3.2');
  });

  it('reaches the back only from the back bridges, the block top from the head bridge, and the base from the floor', () => {
    expect(isReachable([0, 3.0, -0.6], withoutBridges)).toBe(false);
    expect(isReachable([0, 3.0, -0.6])).toBe(true);
    expect(nearestPlatform([0, 3.0, -0.6])?.id).toBe('back-bridge-3.2');
    expect(isReachable([0, BLOCK_M.height, 0])).toBe(true);
    expect(isReachable([0, 0.4, 0.3])).toBe(true);
    expect(nearestPlatform([0, 0.4, 0.3])?.id).toBe('floor');
  });

  it('rejects points above the top deck\u2019s reach, below the floor, and far from every platform', () => {
    expect(isReachable([0, 3.2 + REACH.above + 0.01, 0])).toBe(false);
    expect(isReachable([0, 3.2 + REACH.above - 0.01, 0.9])).toBe(true);
    expect(isReachable([0, -0.1, 0.7])).toBe(false);
    expect(isReachable([5, 3, 5])).toBe(false);
    expect(nearestPlatform([5, 3, 5])).toBeNull();
  });
});
