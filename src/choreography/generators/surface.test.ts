/**
 * The surface scan (src/choreography/generators/surface.ts, `figureSurfacePoints`). What a green run proves, and its bounds:
 *   On the synthetic figure at 2 cm, over three regions (the whole flesh, the face and the hands, the face alone) at the spacings the finishing steps use, the scan with its one-read rejection of far cells returns exactly the points, in the same order, that the plain trilinear scan returns, so the rejection changes no plan; and the scan yields points on the surface (|figure| within a cell: a near-surface sample moved by three Newton steps) inside the region.
 * Bounds: the synthetic mannequin, whose ellipsoids are distance bounds rather than distances (the slack the rejection carries is for them); the David grid's field is a true distance and is covered by inference; the regions are the plan's, not every region.
 */
import { describe, expect, it } from 'vitest';

import type { PlanContext } from '../../contracts/making';
import { syntheticFigure } from '../../david/synthetic';
import { blockGrid, frameBlockBox } from '../../stock/grid';
import { DETAILS, FACE, FLESH, inside } from '../regions';
import { figureSurfacePoints } from './surface';

describe('figureSurfacePoints', () => {
  const figure = syntheticFigure(0.02);
  const stock = blockGrid(figure.spec, frameBlockBox());
  const cases = [
    { region: FLESH, spacing: 0.0375 },
    { region: DETAILS, spacing: 0.0225 },
    { region: FACE, spacing: 0.02 },
  ];
  for (const { region, spacing } of cases) {
    it(`rejects far cells by one read without changing the points over ${region.label} at ${String(spacing)} m`, () => {
      const ctx: PlanContext = { figure, stock, region, margin: 0, seed: 1, cell: figure.cell };
      const fast = figureSurfacePoints(ctx, spacing);
      const plain = figureSurfacePoints(ctx, spacing, { prefilter: false });
      expect(fast.length).toBeGreaterThan(50);
      expect(fast).toEqual(plain);
      for (const p of fast) {
        expect(Math.abs(figure.sample(p[0], p[1], p[2]))).toBeLessThanOrEqual(figure.cell);
        expect(inside(region, p, figure.gradient(p[0], p[1], p[2]))).toBe(true);
      }
    });
  }
});
