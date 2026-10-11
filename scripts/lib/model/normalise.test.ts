/**
 * Bound: normalise is checked on a synthetic figure of five boxes built here (wide base, column, small head, a hand box on the figure's right in the thigh band, a foot box on its left and forward in the lower-leg band) under several proper rotations of the input and one mirror image. It proves the axis choice, the up sign, the facing, the centring, the scaling and the offset on that figure; it says nothing about the real mesh, whose silhouettes are the check.
 */
import { describe, expect, it } from 'vitest';

import { decideUp, matrixRows, normalise, transformPositions } from './normalise.mjs';
import { boxTriangles } from './shapes.mjs';
import { boundingBox } from './topology.mjs';

/** Raw frame: +Z up (print convention), height 10; the figure's right is raw +X, so its front is raw +Y (= up × right). Triangles 0–11 base, 12–23 column, 24–35 head, 36–47 right hand, 48–59 left foot. */
function figure(): number[] {
  return [
    ...boxTriangles([-3, -2, 0], [3, 2, 1]),
    ...boxTriangles([-1, -1, 1], [1, 1, 9]),
    ...boxTriangles([-0.5, -0.5, 9], [0.5, 0.5, 10]),
    ...boxTriangles([1, -0.5, 4.2], [2.5, 0.5, 5.2]),
    ...boxTriangles([-2, 1, 2], [-1, 2, 3]),
  ];
}

const HAND = [36 * 9, 48 * 9] as const;
const FOOT = [48 * 9, 60 * 9] as const;
const HEAD = [24 * 9, 36 * 9] as const;
const NO_OFFSET = { x: 0, y: 0, z: 0 };

function part(positions: Float32Array, range: readonly [number, number]) {
  return boundingBox(positions.subarray(range[0], range[1]));
}

/** The canonical outcome for a correctly normalised figure at scale `s`: right hand on −X, left foot on +X and forward (+Z), head at the top. */
function expectCanonical(positions: Float32Array, s: number, offset = NO_OFFSET): void {
  const box = boundingBox(positions);
  expect(box.min.map((v) => v / s)).toEqual([-3 + offset.x / s, offset.y / s, -2 + offset.z / s].map((v) => expect.closeTo(v, 5) as unknown as number));
  expect(box.max.map((v) => v / s)).toEqual([3 + offset.x / s, 10 + offset.y / s, 2 + offset.z / s].map((v) => expect.closeTo(v, 5) as unknown as number));
  const hand = part(positions, HAND);
  expect(hand.max[0]).toBeLessThan(offset.x);
  expect(hand.min[1] / s).toBeCloseTo(4.2 + offset.y / s, 5);
  const foot = part(positions, FOOT);
  expect(foot.min[0]).toBeGreaterThan(offset.x);
  expect(foot.min[2]).toBeGreaterThan(offset.z);
  const head = part(positions, HEAD);
  expect(head.max[1] / s).toBeCloseTo(10 + offset.y / s, 5);
}

describe('normalise', () => {
  const raw = Float32Array.from(figure());

  it('rotates the longest axis to +Y with the base down, turns the right hand to −X, centres the footprint and scales the height', () => {
    const result = normalise(raw, 5, NO_OFFSET);
    expect(result.up.axis).toBe('z');
    expect(result.up.baseAtMin).toBe(true);
    expect(result.front.swappedHorizontalAxes).toBe(false);
    expect(result.front.turnedAround).toBe(true);
    expect(result.front.chiralityOk).toBe(true);
    expect(result.scale).toBeCloseTo(0.5, 9);
    expect(result.rotation).toEqual([-1, 0, 0, 0, 0, 1, 0, 1, 0]);
    expect(result.translation.map((v) => Math.abs(v))).toEqual([0, 0, 0]);
    expectCanonical(result.positions, 0.5);
  });

  it('applies the figure offset after centring', () => {
    const offset = { x: 0.1, y: 0.25, z: -0.2 };
    const result = normalise(raw, 10, offset);
    expectCanonical(result.positions, 1, offset);
    expect(matrixRows(result.rotation, result.scale, result.translation)[0]).toEqual([-1, 0, 0, 0.1]);
  });

  it.each([
    ['upside down (180° about raw x)', [1, 0, 0, 0, -1, 0, 0, 0, -1] as number[], 'z', false],
    ['height along raw x', [0, 0, 1, 1, 0, 0, 0, 1, 0] as number[], 'x', true],
    ['yawed 90° so the wider footprint axis lands on z', [0, -1, 0, 1, 0, 0, 0, 0, 1] as number[], 'z', true],
  ])('reaches the same canonical pose from an input %s', (_label, matrix, axis, baseAtMin) => {
    const upsideDown = matrix[8] === -1;
    const input = transformPositions(raw, matrix, 1, [0, 0, 0]);
    const up = decideUp(input);
    expect(up.axis).toBe(axis);
    expect(up.baseAtMin).toBe(baseAtMin);
    const result = normalise(input, 10, NO_OFFSET);
    expect(result.front.chiralityOk).toBe(true);
    expectCanonical(result.positions, 1);
    if (upsideDown) expect(result.rotation).toEqual([-1, 0, 0, 0, 0, -1, 0, -1, 0]);
  });

  it('flags a mirror image, which no proper rotation can fix', () => {
    const mirrored = transformPositions(raw, [-1, 0, 0, 0, 1, 0, 0, 0, 1], 1, [0, 0, 0]);
    const result = normalise(mirrored, 10, NO_OFFSET);
    expect(result.front.chiralityOk).toBe(false);
    expect(part(result.positions, HAND).max[0]).toBeLessThan(0);
    expect(part(result.positions, FOOT).max[2]).toBeLessThan(0);
  });
});
