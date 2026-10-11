/**
 * The synthetic figure (src/david/synthetic.ts). What a green run proves, and its bounds:
 *   1. At a 4 cm cell the sampled grid's inside cells reach from the floor (min y within a cell of 0) to the statue's height (max y within a cell of STATUE_HEIGHT_M), stay inside the block and keep 8 cm of clearance to its side and top faces (the base stands on the bottom face).
 *   2. The grid agrees with the analytic distance at seeded random cells to within one fixed-point step after clamping, so the per-part sampling is the union it claims to be.
 *   3. The inside volume lies between 1.5 and 4.5 m³, the left hand sits at the left shoulder, the right hand at the right thigh, the left foot's toes reach further forward (+Z) than the right's, and the pose is not mirror-symmetric.
 *   4. The 1.6 cm build finishes in under 2 s, a loose bound; the 8 mm build is measured once by hand and reported in the handoff, not here.
 * Bounds: the figure is a mannequin, not the David; nothing here compares it with the reference photographs.
 */
import { describe, expect, it } from 'vitest';

import { FIXED_POINT } from '../contracts/grid';
import { blockDistance } from '../stock/grid';
import { BLOCK_M, STATUE_HEIGHT_M } from './frame';
import { BASE_HEIGHT_M, SYNTHETIC_PARTS, syntheticDistance, syntheticFigure } from './synthetic';

const CELL = 0.04;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function part(name: string): Extract<(typeof SYNTHETIC_PARTS)[number], { kind: 'capsule' }> {
  const found = SYNTHETIC_PARTS.find((p) => p.name === name);
  if (found === undefined || found.kind !== 'capsule') throw new Error(`no capsule part named ${name}`);
  return found;
}

describe('synthetic figure', () => {
  const grid = syntheticFigure(CELL);
  const { nx, ny, nz, values, limit } = grid;
  const { origin, cell } = grid.spec;

  it('stands on the floor at the statue height inside the block with clearance', () => {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let inside = 0;
    let tooClose = 0;
    for (let k = 0; k < nz; k += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          if ((values[grid.index(i, j, k)] ?? 0) >= 0) continue;
          inside += 1;
          const [x, y, z] = grid.worldOf(i, j, k);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          // The base stands on the block's bottom face by design; clearance is checked against the side and top faces.
          if (Math.abs(x) > BLOCK_M.width / 2 - 0.08 + cell || Math.abs(z) > BLOCK_M.depth / 2 - 0.08 + cell || y > BLOCK_M.height - 0.08) tooClose += 1;
          if (blockDistance(x, y, z) > cell) tooClose += 1;
        }
      }
    }
    expect(Math.abs(minY - 0)).toBeLessThan(cell);
    expect(Math.abs(maxY - STATUE_HEIGHT_M)).toBeLessThan(cell);
    expect(tooClose).toBe(0);
    const volume = inside * cell ** 3;
    expect(volume).toBeGreaterThan(1.5);
    expect(volume).toBeLessThan(4.5);
  });

  it('matches the analytic distance at random cells within one fixed-point step', () => {
    const random = mulberry32(7);
    for (let n = 0; n < 2000; n += 1) {
      const i = Math.floor(random() * nx);
      const j = Math.floor(random() * ny);
      const k = Math.floor(random() * nz);
      const [x, y, z] = grid.worldOf(i, j, k);
      const analytic = Math.round((syntheticDistance(x, y, z) / cell) * FIXED_POINT);
      const clamped = Math.max(-limit, Math.min(limit, analytic));
      expect(Math.abs((values[grid.index(i, j, k)] ?? 0) - clamped)).toBeLessThanOrEqual(1);
    }
    expect(origin[1]).toBeLessThan(0);
  });

  it('holds the pose: left hand at the shoulder, right hand at the thigh, left foot forward, no mirror symmetry', () => {
    const leftHand = part('left hand');
    const leftShoulder = part('left upper arm');
    expect(Math.hypot(leftHand.b[0] - leftShoulder.a[0], leftHand.b[1] - leftShoulder.a[1], leftHand.b[2] - leftShoulder.a[2])).toBeLessThan(0.3);
    expect(syntheticDistance(...leftHand.b)).toBeLessThan(0);
    const rightHand = part('right hand');
    const rightThigh = part('right thigh');
    expect(rightHand.b[1]).toBeGreaterThan(rightThigh.b[1]);
    expect(rightHand.b[1]).toBeLessThan(rightThigh.a[1]);
    expect(syntheticDistance(...rightHand.b)).toBeLessThan(0);
    const leftToes = part('left foot').b[2];
    const rightToes = part('right foot').b[2];
    expect(leftToes - rightToes).toBeGreaterThan(0.2);
    expect(syntheticDistance(0.3, BASE_HEIGHT_M + 0.11, leftToes)).toBeLessThan(0);
    expect(syntheticDistance(-0.27, BASE_HEIGHT_M + 0.11, leftToes)).toBeGreaterThan(0);
    let asymmetric = 0;
    for (let k = 0; k < nz; k += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const [x, y, z] = grid.worldOf(i, j, k);
          if (x <= 0 || syntheticDistance(x, y, z) >= 0) continue;
          if (syntheticDistance(-x, y, z) >= 0) asymmetric += 1;
        }
      }
    }
    expect(asymmetric).toBeGreaterThan(100);
  });

  it('builds the 1.6 cm grid in under 2 s', () => {
    const start = performance.now();
    const fine = syntheticFigure(0.016);
    const seconds = (performance.now() - start) / 1000;
    expect(fine.nx * fine.ny * fine.nz).toBeGreaterThan(1_000_000);
    expect(seconds).toBeLessThan(2);
  });
});
