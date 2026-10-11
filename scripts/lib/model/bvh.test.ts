/**
 * Bound: the hierarchy's closest-point answers are compared with a brute-force scan over every triangle of a seeded random soup, with and without a distance cap, and the region codes of closestPointOnTriangle are checked on one triangle. Performance is not measured.
 */
import { describe, expect, it } from 'vitest';

import { ClosestPointQuery, LEAF_SIZE, REGION, buildBvh, closestPointOnTriangle } from './bvh.mjs';

/** A small deterministic generator (mulberry32) so the soup is the same on every run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function soup(count: number, seed: number): Float32Array {
  const next = random(seed);
  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t += 1) {
    const cx = next() * 10 - 5;
    const cy = next() * 10 - 5;
    const cz = next() * 10 - 5;
    for (let corner = 0; corner < 3; corner += 1) {
      positions[t * 9 + corner * 3] = cx + next() - 0.5;
      positions[t * 9 + corner * 3 + 1] = cy + next() - 0.5;
      positions[t * 9 + corner * 3 + 2] = cz + next() - 0.5;
    }
  }
  return positions;
}

function bruteForce(positions: Float32Array, px: number, py: number, pz: number): { distance: number; triangle: number } {
  const out = new Float64Array(5);
  let best = Infinity;
  let triangle = -1;
  for (let t = 0; t < positions.length / 9; t += 1) {
    closestPointOnTriangle(positions, t * 9, px, py, pz, out);
    const squared = out[3] ?? Infinity;
    if (squared < best) {
      best = squared;
      triangle = t;
    }
  }
  return { distance: Math.sqrt(best), triangle };
}

describe('closestPointOnTriangle', () => {
  const triangle = Float32Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  const out = new Float64Array(5);

  it.each([
    [[0.5, 0.5, 1], 1, REGION.face],
    [[-1, -1, 0], Math.SQRT2, REGION.vertexA],
    [[3, -1, 0], Math.SQRT2, REGION.vertexB],
    [[-1, 3, 0], Math.SQRT2, REGION.vertexC],
    [[1, -1, 0], 1, REGION.edgeAB],
    [[2, 2, 0], Math.SQRT2, REGION.edgeBC],
    [[-1, 1, 0], 1, REGION.edgeCA],
  ])('from %j is at distance %f on region %i', (point, distance, region) => {
    const [px = 0, py = 0, pz = 0] = point;
    closestPointOnTriangle(triangle, 0, px, py, pz, out);
    expect(Math.sqrt(out[3] ?? Number.NaN)).toBeCloseTo(distance, 9);
    expect(out[4]).toBe(region);
  });
});

describe('buildBvh and ClosestPointQuery', () => {
  const positions = soup(500, 7);
  const bvh = buildBvh(positions);
  const query = new ClosestPointQuery(bvh);
  const next = random(11);

  it('keeps every triangle once, in leaf order, under leaves of at most LEAF_SIZE', () => {
    expect(bvh.triangles).toBe(500);
    expect(Array.from(bvh.order).sort((a, b) => a - b)).toEqual(Array.from({ length: 500 }, (_, i) => i));
    for (let node = 0; node < bvh.nodeCount; node += 1) expect(bvh.meta[node * 2 + 1]).toBeLessThanOrEqual(LEAF_SIZE);
    for (let i = 0; i < 500; i += 1) expect(Array.from(bvh.positions.subarray(i * 9, i * 9 + 9))).toEqual(Array.from(positions.subarray((bvh.order[i] ?? 0) * 9, (bvh.order[i] ?? 0) * 9 + 9)));
  });

  it('matches brute force on 200 random points with no cap', () => {
    for (let n = 0; n < 200; n += 1) {
      const px = next() * 14 - 7;
      const py = next() * 14 - 7;
      const pz = next() * 14 - 7;
      const expected = bruteForce(positions, px, py, pz);
      expect(query.query(px, py, pz, Infinity)).toBeCloseTo(expected.distance, 9);
      expect(bvh.order[query.triangle]).toBe(expected.triangle);
    }
  });

  it('returns the cap and no triangle when nothing is nearer, and the true distance when something is', () => {
    for (let n = 0; n < 200; n += 1) {
      const px = next() * 14 - 7;
      const py = next() * 14 - 7;
      const pz = next() * 14 - 7;
      const expected = bruteForce(positions, px, py, pz);
      const cap = next() * 2;
      const distance = query.query(px, py, pz, cap);
      if (expected.distance < cap) {
        expect(distance).toBeCloseTo(expected.distance, 9);
        expect(query.triangle).not.toBe(-1);
      } else {
        expect(distance).toBe(cap);
        expect(query.triangle).toBe(-1);
      }
    }
  });
});
