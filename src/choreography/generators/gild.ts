/**
 * Gilding (docs/research/technique.md, Stage 8: the sling and the stump were gilded in the summer of 1504): the brush passes over a region's surface, trailing, painting the gilt finish and removing nothing.
 */
import type { Blow, PlanContext } from '../../contracts/making';
import { bandBlows } from './bands';

export interface GildOptions {
  readonly pitch: number;
  readonly stride: number;
  /** Degrees to the surface, the brush trailing. */
  readonly angle: number;
}

export function gild(ctx: PlanContext, options: GildOptions): Blow[] {
  return bandBlows(ctx, { tool: 'gilding', pitch: options.pitch, stride: options.stride, size: 0, angle: options.angle, orientation: 'horizontal', strokeLength: 0.2, floor: 'stock', onlyWhereStockAbove: false, steeper: 45 });
}
