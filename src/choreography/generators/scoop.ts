/**
 * The roundel in the hollows (docs/research/tools.md, Unghietto: hollows, hair, the spaces between fingers and toes): short scooping strokes where the figure's surface is concave, the chisel at its documented angle along the hollow.
 * Concavity is the sign of the figure field's Laplacian at the surface point, which is strongly negative along the creases where two forms meet.
 */
import type { Blow, PlanContext, Vec3 } from '../../contracts/making';
import { blowAt, cross, figureSurfacePoints, normalize, stockAbove } from './surface';

export interface ScoopOptions {
  /** Spacing of the sampled surface points, metres. */
  readonly stride: number;
  /** Cut depth per blow, metres. */
  readonly size: number;
  /** Degrees to the surface, inside the roundel's 35 to 60. */
  readonly angle: number;
  /** Laplacian below which a point counts as a hollow, per metre; larger magnitudes pick only the sharpest creases. */
  readonly concavity?: number;
}

const LOOK_UP = 0.3;

function laplacian(ctx: PlanContext, p: Vec3): number {
  const h = ctx.cell * 2;
  const f = ctx.figure;
  const centre = f.sample(p[0], p[1], p[2]);
  const sum = f.sample(p[0] + h, p[1], p[2]) + f.sample(p[0] - h, p[1], p[2]) + f.sample(p[0], p[1] + h, p[2]) + f.sample(p[0], p[1] - h, p[2]) + f.sample(p[0], p[1], p[2] + h) + f.sample(p[0], p[1], p[2] - h);
  return (sum - 6 * centre) / (h * h);
}

export function scoop(ctx: PlanContext, options: ScoopOptions): Blow[] {
  const threshold = options.concavity ?? -3;
  const blows: Blow[] = [];
  let stroke = 0;
  let previous: Vec3 | null = null;
  for (const q of figureSurfacePoints(ctx, options.stride)) {
    if (laplacian(ctx, q) > threshold) continue;
    const normal = ctx.figure.gradient(q[0], q[1], q[2]);
    const above = stockAbove(ctx, q, LOOK_UP);
    if (above === null) continue;
    // The hollow runs across the gradient's change; the stroke follows it, which is the tangent perpendicular to the normal's tilt from vertical.
    const along = normalize(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    if (previous !== null && Math.hypot(q[0] - previous[0], q[1] - previous[1], q[2] - previous[2]) > 3 * options.stride) stroke += 1;
    blows.push(blowAt('roundel', above.point, normal, along, options.angle, options.size, stroke));
    previous = q;
  }
  return blows;
}
