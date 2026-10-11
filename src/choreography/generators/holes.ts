/**
 * Drill holes (docs/research/technique.md, Stage 5; tools.md, Trapano): single holes at given points, straight in, and running rows along a path, the bit driven at the running drill's angle, lifted and shifted a pitch each time.
 * Each target is moved to the nearest point of the figure's surface within SEARCH_RADIUS and the hole starts where the stock stands above it; a target with no surface that near, or whose surface point lies outside the step's region, drills nothing. Every hole is its own set-up.
 */
import type { Blow, PlanContext, Vec3 } from '../../contracts/making';
import { blowAt, inRegion, nearestOnFigure, normalize, stockAbove } from './surface';

export interface HolesOptions {
  /** Single holes, world metres near the figure's surface. */
  readonly points?: readonly Vec3[];
  /** Polylines of running holes, world metres near the surface. */
  readonly paths?: readonly (readonly Vec3[])[];
  /** Hole spacing along a path, metres. */
  readonly pitch: number;
  /** Hole depth, metres. */
  readonly depth: number;
  /** Degrees to the surface for the running holes; single holes go straight in. */
  readonly runningAngle: number;
}

const LOOK_UP = 0.3;
/** How far from a named target the figure's surface is looked for, metres: the landmarks of src/choreography/david-steps.ts are read off photographs and may stand this far off the surface, in the figure grid's clamp band where a Newton step cannot move (Codex review of 81acb40, item 16). */
const SEARCH_RADIUS = 0.15;
/** Lattice spacing of that search, metres; a candidate counts as near the surface within one spacing. */
const SEARCH_SPACING = 0.01;

function hole(ctx: PlanContext, target: Vec3, along: Vec3 | null, angle: number, depth: number, stroke: number): Blow | null {
  const q = nearestOnFigure(ctx.figure, target, SEARCH_RADIUS, SEARCH_SPACING);
  if (q === null) return null;
  const normal = ctx.figure.gradient(q[0], q[1], q[2]);
  if (!inRegion(ctx.region, q, normal)) return null;
  const above = stockAbove(ctx, q, LOOK_UP);
  if (above === null) return null;
  return blowAt('drill', above.point, normal, along ?? [1, 0, 0], angle, depth, stroke);
}

export function holes(ctx: PlanContext, options: HolesOptions): Blow[] {
  const blows: Blow[] = [];
  let stroke = 0;
  for (const point of options.points ?? []) {
    const blow = hole(ctx, point, null, 90, options.depth, stroke);
    if (blow !== null) {
      blows.push(blow);
      stroke += 1;
    }
  }
  for (const path of options.paths ?? []) {
    for (let n = 0; n + 1 < path.length; n += 1) {
      const a = path[n];
      const b = path[n + 1];
      if (a === undefined || b === undefined) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const along = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const count = Math.max(1, Math.floor(length / options.pitch));
      for (let k = 0; k <= count; k += 1) {
        if (k === count && n + 2 < path.length) continue;
        const s = (k / count) * length;
        const blow = hole(ctx, [a[0] + along[0] * s, a[1] + along[1] * s, a[2] + along[2] * s], along, options.runningAngle, options.depth, stroke);
        if (blow !== null) {
          blows.push(blow);
          stroke += 1;
        }
      }
    }
  }
  return blows;
}
