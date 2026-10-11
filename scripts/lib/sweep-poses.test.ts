/**
 * The sweep's pose generator (scripts/lib/sweep-poses.mjs): no browser.
 * Bound: it pins determinism per seed, that 300 drawn poses are all outside the block of src/david/frame.ts and inside the orbit limits of src/viewer/orbit-limits.ts (so the page keeps each pose exactly), that the block box is the frame's and not a restated one, and the cam parameter's format. Whether the page renders them is scripts/sweep.mjs's run.
 */
import { describe, expect, it } from 'vitest';

import { BLOCK_M } from '../../src/david/frame';
import { poseProblem } from '../../src/viewer/orbit-limits';
import { cameraParam, drawPose, insideBlock, metres, mulberry32 } from './sweep-poses.mjs';

describe('drawPose', () => {
  it('gives the same poses for the same seed and count, every third one close', () => {
    const a = Array.from({ length: 9 }, (_, index) => drawPose(mulberry32(1), index));
    const b = Array.from({ length: 9 }, (_, index) => drawPose(mulberry32(1), index));
    expect(a).toEqual(b);
    expect(a.map((pose) => pose.kind)).toEqual(['whole', 'whole', 'close', 'whole', 'whole', 'close', 'whole', 'whole', 'close']);
    expect(drawPose(mulberry32(2), 0)).not.toEqual(a[0]);
  });

  it('never draws a camera inside the block or outside the orbit limits', () => {
    const random = mulberry32(7);
    for (let index = 0; index < 300; index += 1) {
      const pose = drawPose(random, index);
      expect(insideBlock(pose.position), `pose ${String(index)} inside the block`).toBe(false);
      expect(poseProblem(pose), `pose ${String(index)}`).toBeNull();
      expect(pose.position[1]).toBeGreaterThanOrEqual(0.3);
    }
  });
});

describe('insideBlock', () => {
  it('uses the block of src/david/frame.ts, not a restated box', () => {
    expect(insideBlock([BLOCK_M.width / 2 - 0.01, 1, 0])).toBe(true);
    expect(insideBlock([BLOCK_M.width / 2 + 0.01, 1, 0])).toBe(false);
    expect(insideBlock([0, BLOCK_M.height - 0.01, 0])).toBe(true);
    expect(insideBlock([0, BLOCK_M.height + 0.01, 0])).toBe(false);
    expect(insideBlock([0, 1, BLOCK_M.depth / 2 - 0.01])).toBe(true);
    expect(insideBlock([0, 1, BLOCK_M.depth / 2 + 0.01])).toBe(false);
    // Inside the 2.22 m block but outside the 2.1 m box the sweep once carried.
    expect(insideBlock([1.08, 1, 0])).toBe(true);
  });
});

describe('cameraParam', () => {
  it('writes position then target to 3 decimals without a negative zero', () => {
    expect(metres(-0.0004)).toBe('0.000');
    expect(metres(-1.23456)).toBe('-1.235');
    expect(cameraParam({ position: [7, 4.2, -0.0001], target: [0, 2.625, 0] })).toBe('7.000,4.200,0.000,0.000,2.625,0.000');
  });
});
