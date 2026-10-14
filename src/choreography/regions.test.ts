/**
 * The masked regions of src/choreography/regions.ts: the sling tube, the stump stack and the flesh they are cut from. What a green run proves, and its bounds:
 *   1. `tube` holds a point on its polyline and one just inside the radius, rejects one three radii away, interpolates per-point radii along a segment and refuses a radius list of the wrong length; `stack` holds a point in a slice's box, interpolates the box between two slices, holds for its reach beyond the ends and rejects beyond that.
 *   2. SLING's and STUMP's boxes hold their data (every path point plus its radius, every slice's bounds); both predicates ignore the normal, so the same point answers the same whichever way it faces; FLESH rejects a point inside SLING, STUMP or HAIR.
 *   3. On the synthetic figure at 2 cm, over every figure-surface cell of the block, a cell is in FLESH exactly when it is above the rock and in none of HAIR, SLING and STUMP: the exclusion is those three predicates and nothing else.
 *   4. On the David grid (public/model/david.json; skipped with a logged reason until `npm run model` builds it): every sling path point lies within 6 mm of the figure's surface; the surface inside SLING is 0.05 to 0.5 m² and inside STUMP 1.0 to 2.0 m² (surface cells with |sdf| under half a cell, times the cell's area; the probe of 2026-10-11 measured 0.41 and 1.55 against 1.14 and 1.63 for the boxes before); a deltoid point 15 cm from the strap is outside SLING; the calf's back at y 1.3, where the old box took it, is outside STUMP; the stump's face toward the shin at y 0.6, which the old box's facing test dropped, is inside STUMP.
 *   5. The head tables' helpers: `hairlineAtAzimuth` and `headRadiusAt` return a table row's own value at its azimuth and the mean of two rows halfway between them, and wrap 360 and negative angles round; `onHead` puts a point at the given height, azimuth (read back by `azimuthOf`) and radius from HAIR_AXIS; `onHeadRing` at the ring's height above the hairline there and its probed radius; `facePair` mirrors its two targets about FACE_AZIMUTH at the mark's height below the hairline, each at its own radius.
 * Bounds: the mannequin has no strap and no stump, so 1 to 3 are the predicates' geometry; 4 pins the masks to this grid build (cell 8 mm, the Scan the World mesh) and says nothing about how the gilding looks; the areas are envelopes, not the strap's true area; 5 is the helpers' arithmetic and says nothing about where the tables' values fall on the David, which is the landmark case of david-steps.test.ts; no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../contracts/making';
import { syntheticFigure } from '../david/synthetic';
import { FIXED_POINT } from '../contracts/grid';
import { type Grid, loadFigureGrid } from '../stock/grid';
import { azimuthOf, BASE, FACE_AZIMUTH, facePair, FLESH, HAIR, HAIR_AXIS, hairlineAtAzimuth, HEAD_RADIUS_BY_AZIMUTH, HEAD_RINGS, headRadiusAt, inside, onHead, onHeadRing, SLING, SLING_PATH, stack, STUMP, STUMP_SLICES, tube, type Slice } from './regions';

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];
const BACKWARD: Vec3 = [0, 0, -1];

describe('tube', () => {
  const points: readonly Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];

  it('holds points within one radius of the polyline and rejects three radii away', () => {
    const holds = tube(points, 0.1);
    expect(holds([0.5, 0, 0], UP)).toBe(true);
    expect(holds([0.5, 0.09, 0], UP)).toBe(true);
    expect(holds([1, 0.5, 0.09], UP)).toBe(true);
    expect(holds([0.5, 0.3, 0], UP)).toBe(false);
    expect(holds([-0.3, 0, 0], UP)).toBe(false);
    expect(holds([1, 1.3, 0], UP)).toBe(false);
  });

  it('interpolates per-point radii along a segment and refuses a list of the wrong length', () => {
    const holds = tube(points, [0.1, 0.3, 0.3]);
    expect(holds([0.5, 0.19, 0], UP)).toBe(true);
    expect(holds([0.5, 0.21, 0], UP)).toBe(false);
    expect(holds([0.1, 0.13, 0], UP)).toBe(false);
    expect(holds([0.9, 0.27, 0], UP)).toBe(true);
    expect(() => tube(points, [0.1, 0.2])).toThrow(/3 points.*2 radii/);
    expect(() => tube([], 0.1)).toThrow(/at least one point/);
  });
});

describe('stack', () => {
  const slices: readonly Slice[] = [[1, -1, 1, -1, 0], [2, -2, 2, -2, 1]];
  const holds = stack(slices, 0.1);

  it('holds a slice box, interpolates between slices and reaches a little beyond the ends', () => {
    expect(holds([0.5, 1, -0.5], UP)).toBe(true);
    expect(holds([0.5, 1, 0.5], UP)).toBe(false);
    expect(holds([1.4, 1.5, 0.4], UP)).toBe(true);
    expect(holds([1.6, 1.5, 0.4], UP)).toBe(false);
    expect(holds([0.5, 0.95, -0.5], UP)).toBe(true);
    expect(holds([0.5, 0.85, -0.5], UP)).toBe(false);
    expect(holds([1.9, 2.05, 0.9], UP)).toBe(true);
    expect(holds([1.9, 2.15, 0.9], UP)).toBe(false);
    expect(() => stack([], 0.1)).toThrow(/at least one slice/);
  });
});

describe('the sling and the stump as regions', () => {
  it('keep their data inside their boxes', () => {
    for (const [x, y, z, r] of SLING_PATH) {
      expect(x - r).toBeGreaterThanOrEqual(SLING.min[0]);
      expect(x + r).toBeLessThanOrEqual(SLING.max[0]);
      expect(y - r).toBeGreaterThanOrEqual(SLING.min[1]);
      expect(y + r).toBeLessThanOrEqual(SLING.max[1]);
      expect(z - r).toBeGreaterThanOrEqual(SLING.min[2]);
      expect(z + r).toBeLessThanOrEqual(SLING.max[2]);
      expect(inside(SLING, [x, y, z], UP)).toBe(true);
    }
    for (const [y, x0, x1, z0, z1] of STUMP_SLICES) {
      expect(x0).toBeGreaterThanOrEqual(STUMP.min[0]);
      expect(x1).toBeLessThanOrEqual(STUMP.max[0]);
      expect(y).toBeGreaterThan(STUMP.min[1]);
      expect(y).toBeLessThan(STUMP.max[1]);
      expect(z0).toBeGreaterThanOrEqual(STUMP.min[2]);
      expect(z1).toBeLessThanOrEqual(STUMP.max[2]);
      expect(inside(STUMP, [(x0 + x1) / 2, y, (z0 + z1) / 2], UP)).toBe(true);
    }
  });

  it('answer by position alone and are cut out of the flesh', () => {
    const onStrap = SLING_PATH[6] ?? [0, 0, 0, 0];
    const strapPoint: Vec3 = [onStrap[0], onStrap[1], onStrap[2]];
    const slice = STUMP_SLICES[20] ?? [0, 0, 0, 0, 0];
    const stumpPoint: Vec3 = [(slice[1] + slice[2]) / 2, slice[0], (slice[3] + slice[4]) / 2];
    for (const normal of [UP, DOWN, BACKWARD]) {
      expect(inside(SLING, strapPoint, normal)).toBe(true);
      expect(inside(STUMP, stumpPoint, normal)).toBe(true);
      expect(inside(FLESH, strapPoint, normal)).toBe(false);
      expect(inside(FLESH, stumpPoint, normal)).toBe(false);
    }
    expect(inside(HAIR, [0, 5.0, 0], UP)).toBe(true);
    expect(inside(FLESH, [0, 5.0, 0], UP)).toBe(false);
    expect(inside(FLESH, [0, 3.8, 0.3], [0, 0, 1])).toBe(true);
  });

  it('are exactly what FLESH excludes over the synthetic figure at 2 cm', () => {
    const grid = syntheticFigure(0.02);
    let checked = 0;
    let excluded = 0;
    forEachSurfaceCell(grid, (p, n) => {
      const flesh = inside(FLESH, p, n);
      const cut = inside(HAIR, p, n) || inside(SLING, p, n) || inside(STUMP, p, n);
      expect(flesh).toBe(!cut && !inside(BASE, p, n) && p[1] <= FLESH.max[1]);
      checked += 1;
      if (cut) excluded += 1;
    });
    expect(checked).toBeGreaterThan(10_000);
    expect(excluded).toBeGreaterThan(0);
  });
});

describe('the head tables', () => {
  const radiusFromAxis = (p: Vec3): number => Math.hypot(p[0] - HAIR_AXIS[0], p[2] - HAIR_AXIS[1]);

  it('interpolate by azimuth and wrap round', () => {
    const between = hairlineAtAzimuth(56.25);
    expect(between).toBeCloseTo((hairlineAtAzimuth(45) + hairlineAtAzimuth(67.5)) / 2, 12);
    expect(hairlineAtAzimuth(360)).toBe(hairlineAtAzimuth(0));
    expect(hairlineAtAzimuth(-22.5)).toBe(hairlineAtAzimuth(337.5));
    const row = HEAD_RADIUS_BY_AZIMUTH[4];
    const next = HEAD_RADIUS_BY_AZIMUTH[5];
    if (row === undefined || next === undefined) throw new Error('the head radius table has fewer than six rows');
    expect(headRadiusAt(row[0], 'hairline')).toBe(row[1]);
    expect(headRadiusAt(row[0], 'curls')).toBe(row[2]);
    expect(headRadiusAt((row[0] + next[0]) / 2, 'curls')).toBeCloseTo((row[2] + next[2]) / 2, 12);
    expect(headRadiusAt(row[0] + 360, 'hairline')).toBe(row[1]);
  });

  it('place points at their azimuth, height and radius from the axis', () => {
    for (const azimuth of [0, 38, 123.4, 270, 359]) {
      const p = onHead(azimuth, 4.8, 0.25);
      expect(p[1]).toBe(4.8);
      expect(radiusFromAxis(p)).toBeCloseTo(0.25, 12);
      expect(azimuthOf(p)).toBeCloseTo(azimuth, 8);
    }
    const ring = onHeadRing(90, 'curls');
    expect(ring[1]).toBeCloseTo(hairlineAtAzimuth(90) + HEAD_RINGS.curls, 12);
    expect(radiusFromAxis(ring)).toBeCloseTo(headRadiusAt(90, 'curls'), 12);
    expect(azimuthOf(ring)).toBeCloseTo(90, 8);
    const [left, right] = facePair({ below: 0.1, offset: 20, radii: [0.2, 0.22] });
    expect(left[1]).toBeCloseTo(hairlineAtAzimuth(FACE_AZIMUTH) - 0.1, 12);
    expect(right[1]).toBe(left[1]);
    expect(azimuthOf(left)).toBeCloseTo(FACE_AZIMUTH - 20, 8);
    expect(azimuthOf(right)).toBeCloseTo(FACE_AZIMUTH + 20, 8);
    expect(radiusFromAxis(left)).toBeCloseTo(0.2, 12);
    expect(radiusFromAxis(right)).toBeCloseTo(0.22, 12);
  });
});

const DAVID_HEADER = fileURLToPath(new URL('../../public/model/david.json', import.meta.url));
const hasDavid = existsSync(DAVID_HEADER);
if (!hasDavid) console.log(`regions.test.ts: ${DAVID_HEADER} is not built (npm run model), so the David cases are skipped`);

describe.skipIf(!hasDavid)('on the David grid', () => {
  const fetchFromDisk: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = join(dirname(DAVID_HEADER), url.replace(/^.*[\\/]/, ''));
    return Promise.resolve(new Response(new Uint8Array(readFileSync(path)).buffer, { status: 200 }));
  };

  it('masks the strap and the stump, not the flesh beside them', async () => {
    const { grid } = await loadFigureGrid(DAVID_HEADER, fetchFromDisk);
    for (const [x, y, z] of SLING_PATH) expect(Math.abs(grid.sample(x, y, z))).toBeLessThan(0.006);
    let sling = 0;
    let stump = 0;
    forEachSurfaceCell(grid, (p, n) => {
      if (inside(SLING, p, n)) sling += 1;
      if (inside(STUMP, p, n)) stump += 1;
    });
    const slingArea = sling * grid.cell * grid.cell;
    const stumpArea = stump * grid.cell * grid.cell;
    console.log(`David surface inside SLING ${slingArea.toFixed(3)} m2, inside STUMP ${stumpArea.toFixed(3)} m2`);
    expect(slingArea).toBeGreaterThan(0.05);
    expect(slingArea).toBeLessThan(0.5);
    expect(stumpArea).toBeGreaterThan(1.0);
    expect(stumpArea).toBeLessThan(2.0);
    const deltoid: Vec3 = [0.32, 4.189, -0.1];
    expect(Math.abs(grid.sample(...deltoid))).toBeLessThan(0.01);
    expect(inside(SLING, deltoid, UP)).toBe(false);
    const calfBack = firstCrossing(grid, [-0.3, 1.3, 0.0], BACKWARD, 0.4);
    expect(calfBack[2]).toBeGreaterThan(-0.26);
    expect(calfBack[2]).toBeLessThan(-0.2);
    expect(inside(STUMP, calfBack, BACKWARD)).toBe(false);
    const stumpFace = firstCrossing(grid, [-0.3, 0.6, -0.17], BACKWARD, 0.1);
    expect(stumpFace[2]).toBeLessThan(-0.17);
    expect(stumpFace[2]).toBeGreaterThan(-0.2);
    expect(inside(STUMP, stumpFace, [0, 0, 1])).toBe(true);
  }, 60_000);
});

/** Calls `fn` with the centre and outward normal of every cell within half a cell of the figure's surface. */
function forEachSurfaceCell(grid: Grid, fn: (point: Vec3, normal: Vec3) => void): void {
  const { nx, ny, nz, values } = grid;
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const v = values[grid.index(i, j, k)] ?? FIXED_POINT;
        if (v < -FIXED_POINT / 2 || v >= FIXED_POINT / 2) continue;
        const p = grid.worldOf(i, j, k);
        fn(p, grid.gradient(p[0], p[1], p[2]));
      }
    }
  }
}

/** The first point along `direction` from `from` where the figure's distance changes sign, found in millimetre steps; throws when none within `maxDistance`. */
function firstCrossing(grid: Grid, from: Vec3, direction: Vec3, maxDistance: number): Vec3 {
  const start = grid.sample(from[0], from[1], from[2]);
  for (let s = 0.001; s <= maxDistance; s += 0.001) {
    const p: Vec3 = [from[0] + direction[0] * s, from[1] + direction[1] * s, from[2] + direction[2] * s];
    if (grid.sample(p[0], p[1], p[2]) * start <= 0) return p;
  }
  throw new Error(`no surface within ${String(maxDistance)} m of ${from.join(', ')} along ${direction.join(', ')}`);
}
