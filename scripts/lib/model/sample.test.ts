/**
 * Bound: latticeFor, sampleSlabs, floodFromBoundary, resolveSign and gridVolume are checked on a closed cube built here at a coarse cell, where every expected distance and the volume are exact, and the flood-fill sealing on a hand-written field with and without a one-cell gap. Single-threaded: the worker split is exercised only by the real run.
 */
import { describe, expect, it } from 'vitest';

import { buildBvh } from './bvh.mjs';
import { floodFromBoundary, gridVolume, latticeFor, resolveSign, sampleSlabs } from './sample.mjs';
import { cubeTriangles } from './shapes.mjs';
import { EdgeTable, pseudonormals, weld } from './topology.mjs';

function sampledCube(half: number, cell: number) {
  const positions = Float32Array.from(cubeTriangles(half));
  const welded = weld(positions);
  const normals = pseudonormals(welded.vertices, welded.indices, new EdgeTable(welded.indices));
  const bvh = buildBvh(positions);
  const lattice = latticeFor({ min: [-1, -1, -1], max: [1, 1, 1] }, cell, 2, 32);
  const [nx = 0, ny = 0, nz = 0] = lattice.size;
  const values = new Float32Array(nx * ny * nz);
  const slabs = Array.from({ length: nz }, (_, k) => k);
  const sampled = sampleSlabs(bvh, { ...normals, order: bvh.order, indices: welded.indices }, lattice, slabs, values);
  return { lattice, values, sampled };
}

const at = (lattice: { size: number[] }, values: Float32Array, i: number, j: number, k: number) => values[i + (lattice.size[0] ?? 0) * (j + (lattice.size[1] ?? 0) * k)];

describe('latticeFor', () => {
  it('covers the block plus the margin with cell (margin, margin, margin) starting at the block corner', () => {
    const lattice = latticeFor({ min: [-1, 0, -0.5], max: [1, 2, 0.5] }, 0.25, 2, 32);
    expect(lattice.size).toEqual([12, 12, 8]);
    expect(lattice.origin).toEqual([-1 - 1.5 * 0.25, -1.5 * 0.25, -0.5 - 1.5 * 0.25]);
    expect(lattice.band).toBe(32);
    expect(lattice.cell).toBe(0.25);
  });
});

describe('sampleSlabs on the unit cube at cell 0.25', () => {
  const { lattice, values, sampled } = sampledCube(1, 0.25);

  it('samples every cell: inside negative, outside positive, exact distances in cells', () => {
    expect(sampled).toBe(12 * 12 * 12);
    // Cell i has its centre at −1.375 + 0.25 i, so cell 5 sits 0.875 m = 3.5 cells inside the nearest face and cell 0 sits 0.375 m = 1.5 cells outside it.
    expect(at(lattice, values, 5, 5, 5)).toBeCloseTo(-3.5, 6);
    expect(at(lattice, values, 0, 5, 5)).toBeCloseTo(1.5, 6);
    expect(at(lattice, values, 0, 0, 0)).toBeCloseTo(Math.hypot(1.5, 1.5, 1.5), 6);
    expect(at(lattice, values, 2, 5, 5)).toBeCloseTo(-0.5, 6);
    expect(at(lattice, values, 1, 5, 5)).toBeCloseTo(0.5, 6);
  });

  it('agrees with the flood fill everywhere and encloses exactly 8 cubic units', () => {
    const copy = Float32Array.from(values);
    const flood = floodFromBoundary(copy, lattice.size);
    const sign = resolveSign(copy, flood.reached, lattice.band, 'pseudonormal');
    expect(sign.floodInsideNormalOutside).toBe(0);
    expect(sign.floodOutsideNormalInside).toBe(0);
    expect(sign.inside).toBe(512);
    expect(sign.far).toBe(0);
    expect(Array.from(copy)).toEqual(Array.from(values));
    const volume = gridVolume(copy, lattice.cell);
    expect(volume.negativeCells).toBe(512);
    expect(volume.counted).toBeCloseTo(8, 9);
    expect(volume.corrected).toBeCloseTo(8, 9);
  });

  it('keeps the volume within 3 percent when the faces fall between cell centres', () => {
    // Half-size 0.93 at cell 0.1: the faces cut the outer cells at 30 percent; the half-cell correction is exact on the faces and overestimates only along the edges and corners.
    const offset = sampledCube(0.93, 0.1);
    const volume = gridVolume(offset.values, offset.lattice.cell);
    expect(Math.abs(volume.corrected - 1.86 ** 3) / 1.86 ** 3).toBeLessThan(0.03);
    expect(Math.abs(volume.counted - 1.86 ** 3) / 1.86 ** 3).toBeLessThan(0.1);
  });
});

describe('flood-fill sealing', () => {
  /** A 7³ field: a hollow shell of surface cells (value 0.4) around a 3³ core whose pseudonormal sign says outside (+3), far cells +3 elsewhere. */
  function hollowShell(gap: boolean): Float32Array {
    const size = 7;
    const values = new Float32Array(size ** 3).fill(3);
    for (let k = 0; k < size; k += 1) {
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) {
          const onShell = [i, j, k].some((c) => c === 1 || c === 5) && [i, j, k].every((c) => c >= 1 && c <= 5);
          if (onShell) values[i + size * (j + size * k)] = 0.4;
        }
      }
    }
    if (gap) values[3 + size * (3 + size * 1)] = 0.6;
    return values;
  }

  it('seals a closed shell: unreached core cells become inside and are counted as sealed', () => {
    const values = hollowShell(false);
    const flood = floodFromBoundary(values, [7, 7, 7]);
    expect(flood.reachedCount).toBe(7 ** 3 - 5 ** 3);
    const sign = resolveSign(values, flood.reached, 32, 'flood');
    expect(sign.floodInsideNormalOutside).toBe(27);
    expect(sign.inside).toBe(27);
    expect(values[3 + 7 * (3 + 7 * 3)]).toBe(-3);
  });

  it('leaks through a gap wider than the half-cell surface band', () => {
    const values = hollowShell(true);
    const flood = floodFromBoundary(values, [7, 7, 7]);
    expect(flood.reachedCount).toBe(7 ** 3 - 5 ** 3 + 1 + 27);
    const sign = resolveSign(values, flood.reached, 32, 'flood');
    expect(sign.floodInsideNormalOutside).toBe(0);
    expect(sign.inside).toBe(0);
  });

  it('lets the pseudonormal win beyond half a cell when it is the authority, except at the band', () => {
    const values = Float32Array.from([3, -3, 32, -32, 0.3, -0.3]);
    const reached = Uint8Array.from([0, 1, 0, 1, 1, 1]);
    const sign = resolveSign(values, reached, 32, 'pseudonormal');
    expect(Array.from(values)).toEqual(Array.from(Float32Array.from([3, -3, -32, 32, 0.3, -0.3])));
    expect(sign).toEqual({ inside: 3, surface: 2, far: 2, floodInsideNormalOutside: 1, floodOutsideNormalInside: 1 });
  });
});
