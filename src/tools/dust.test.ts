/**
 * The dust puffs (src/tools/dust.ts) on hand-made blows: no WebGL.
 * Bound: it pins that a puff is a pure function of the blow and the seconds since its strike, that only the point and the drill puff, that a puff fades in, spreads, stays near the tip and is gone by MAX_DUST_SECONDS, and that `recordStrikes` passes the chips through unchanged while keeping the strikes it was asked about. What the puff looks like is the follow capture's job.
 */
import { describe, expect, it } from 'vitest';

import type { Blow, BlowCycle, ChipState } from '../contracts/making';
import { MAX_DUST_SECONDS, dustAt, makesDust, recordStrikes } from './dust';

const POINT: Blow = { tool: 'point', point: [0.2, 2.4, 0.7], normal: [0, 0, 1], direction: [0, -0.5, -0.87], size: 0.02, stroke: 3 };
const DRILL: Blow = { ...POINT, tool: 'drill', size: 0.005 };
const CLAW: Blow = { ...POINT, tool: 'claw' };

const distanceFromTip = (position: readonly number[]): number => Math.hypot((position[0] ?? 0) - POINT.point[0], (position[1] ?? 0) - POINT.point[1], (position[2] ?? 0) - POINT.point[2]);
const meanOpacity = (blow: Blow, seconds: number): number => {
  const grains = dustAt(blow, seconds);
  return grains.reduce((sum, grain) => sum + grain.opacity, 0) / Math.max(1, grains.length);
};

describe('dustAt', () => {
  it('puffs for the point and the drill only, and nothing before the strike or after the longest life', () => {
    expect(makesDust('point')).toBe(true);
    expect(makesDust('drill')).toBe(true);
    expect(makesDust('claw')).toBe(false);
    expect(dustAt(CLAW, 0.2)).toEqual([]);
    expect(dustAt(POINT, -0.01)).toEqual([]);
    expect(dustAt(POINT, MAX_DUST_SECONDS + 0.01)).toEqual([]);
    expect(dustAt(POINT, 0.2).length).toBeGreaterThan(0);
    expect(dustAt(DRILL, 0.2).length).toBeGreaterThan(0);
    expect(MAX_DUST_SECONDS).toBeLessThan(1);
  });

  it('is the same for the same blow and time, and differs between blows', () => {
    expect(dustAt(POINT, 0.3)).toEqual(dustAt(POINT, 0.3));
    expect(dustAt({ ...POINT, stroke: 4 }, 0.3)).not.toEqual(dustAt(POINT, 0.3));
  });

  it('fades in, spreads off the face and fades out, staying within half a metre of the tip', () => {
    expect(meanOpacity(POINT, 0.01)).toBeLessThan(meanOpacity(POINT, 0.1));
    expect(meanOpacity(POINT, 0.5)).toBeLessThan(meanOpacity(POINT, 0.1));
    const early = dustAt(POINT, 0.02);
    const late = dustAt(POINT, 0.4);
    expect(Math.max(...late.map((grain) => grain.size))).toBeGreaterThan(Math.max(...early.map((grain) => grain.size)));
    for (const seconds of [0.02, 0.2, 0.4, 0.6, 0.8]) {
      for (const grain of dustAt(POINT, seconds)) {
        expect(distanceFromTip(grain.position)).toBeLessThan(0.5);
        expect(grain.position[2]).toBeGreaterThan(POINT.point[2]);
        expect(grain.opacity).toBeGreaterThan(0);
        expect(grain.opacity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('recordStrikes', () => {
  const chip: ChipState = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 0.01, life: 1 };
  const inner: BlowCycle = { posesAt: () => [], chipsAt: () => [chip], restPose: (tool) => ({ tool, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }) };

  it('passes the chips through and keeps the point and drill strikes until cleared', () => {
    const log = recordStrikes(inner);
    expect(log.cycle.chipsAt(POINT, 0.2)).toEqual([chip]);
    expect(log.cycle.chipsAt(CLAW, 0.2)).toEqual([chip]);
    expect(log.cycle.chipsAt(DRILL, 0.3)).toEqual([chip]);
    expect(log.dust()).toEqual([...dustAt(POINT, 0.2), ...dustAt(DRILL, 0.3)]);
    log.clear();
    expect(log.dust()).toEqual([]);
  });
});
