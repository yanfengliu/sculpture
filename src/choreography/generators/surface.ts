/**
 * What the stroke generators share (docs/design/spec.md, Blows, strokes and steps): a seeded random source, root finding on the stock and the figure, points on the figure's surface inside a region, and the blow with its tool at the documented angle.
 * Every function is pure in its arguments, so a generator is deterministic in its PlanContext and seed.
 */
import type { Blow, PlanContext, RegionDef, SdfSampler, ToolId, Vec3 } from '../../contracts/making';

/** mulberry32: a small seeded generator in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-12 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function add(a: Vec3, b: Vec3, scale = 1): Vec3 {
  return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
}

/** The part of `preferred` in the tangent plane of `normal`, unit; any tangent when they are parallel. */
export function tangentOf(normal: Vec3, preferred: Vec3): Vec3 {
  const along = dot(preferred, normal);
  const t: Vec3 = [preferred[0] - along * normal[0], preferred[1] - along * normal[1], preferred[2] - along * normal[2]];
  if (Math.hypot(t[0], t[1], t[2]) < 1e-6) return normalize(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return normalize(t);
}

/** Distance along `dir` from `from` at which `field` first turns negative (outside to inside), bisected to a thousandth of `step`; null when it stays positive within `maxDistance`. */
export function firstEntry(field: SdfSampler, from: Vec3, dir: Vec3, maxDistance: number, step: number): number | null {
  let previous = 0;
  let valuePrevious = field.sample(from[0], from[1], from[2]);
  if (valuePrevious <= 0) return 0;
  for (let s = step; s <= maxDistance + 1e-9; s += step) {
    const value = field.sample(from[0] + dir[0] * s, from[1] + dir[1] * s, from[2] + dir[2] * s);
    if (value <= 0) return bisect(field, from, dir, previous, s, valuePrevious, value, step * 1e-3);
    previous = s;
    valuePrevious = value;
  }
  return null;
}

/** Distance along `dir` from `from` (inside `field`) at which it turns positive; null when it stays inside within `maxDistance`. */
export function firstExit(field: SdfSampler, from: Vec3, dir: Vec3, maxDistance: number, step: number): number | null {
  const negated: SdfSampler = { sample: (x, y, z) => -field.sample(x, y, z), gradient: (x, y, z) => field.gradient(x, y, z) };
  return firstEntry(negated, from, dir, maxDistance, step);
}

function bisect(field: SdfSampler, from: Vec3, dir: Vec3, a: number, b: number, va: number, vb: number, tolerance: number): number {
  let lo = a;
  let hi = b;
  let vlo = va;
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    const v = field.sample(from[0] + dir[0] * mid, from[1] + dir[1] * mid, from[2] + dir[2] * mid);
    if ((v <= 0) === (vb <= 0)) hi = mid;
    else {
      lo = mid;
      vlo = v;
    }
  }
  return vlo === 0 ? lo : (lo + hi) / 2;
}

/** Moves `q` onto the figure's zero surface by a few Newton steps along the gradient. */
export function projectToFigure(figure: SdfSampler, q: Vec3, rounds = 3): Vec3 {
  let p = q;
  for (let n = 0; n < rounds; n += 1) {
    const d = figure.sample(p[0], p[1], p[2]);
    if (Math.abs(d) < 1e-5) break;
    p = add(p, figure.gradient(p[0], p[1], p[2]), -d);
  }
  return p;
}

/**
 * The point of the figure's surface nearest `target` within `radius`, or null when the surface comes no nearer: the ball is scanned on a lattice at `spacing`, the candidates within `spacing` of the surface kept, the one with the least `|candidate − target| + |value|` (the triangle bound on the distance to the surface through it) taken and moved onto the surface by Newton steps; a target already within `spacing` of the surface skips the scan.
 * Wider than `projectToFigure`, which cannot move a point where the figure grid is clamped to its band (16 cells, 128 mm at 8 mm) and the gradient is flat (Codex review of 81acb40, item 16). About 15,000 samples at a 15 cm radius and 1 cm spacing; deterministic in its arguments.
 */
export function nearestOnFigure(figure: SdfSampler, target: Vec3, radius: number, spacing: number): Vec3 | null {
  if (Math.abs(figure.sample(target[0], target[1], target[2])) <= spacing) return settled(figure, projectToFigure(figure, target, 6), spacing);
  const reach = Math.floor(radius / spacing + 1e-9);
  let best: Vec3 | null = null;
  let bestScore = Infinity;
  for (let k = -reach; k <= reach; k += 1) {
    for (let j = -reach; j <= reach; j += 1) {
      for (let i = -reach; i <= reach; i += 1) {
        const offset = Math.hypot(i, j, k) * spacing;
        if (offset > radius) continue;
        const x = target[0] + i * spacing;
        const y = target[1] + j * spacing;
        const z = target[2] + k * spacing;
        const value = Math.abs(figure.sample(x, y, z));
        if (value > spacing) continue;
        const score = offset + value;
        if (score < bestScore) {
          bestScore = score;
          best = [x, y, z];
        }
      }
    }
  }
  return best === null ? null : settled(figure, projectToFigure(figure, best, 6), spacing);
}

/** `p` when the Newton steps left it within `tolerance` of the surface, else null: a point that would not converge is not drilled. */
function settled(figure: SdfSampler, p: Vec3, tolerance: number): Vec3 | null {
  return Math.abs(figure.sample(p[0], p[1], p[2])) <= tolerance ? p : null;
}

/** From a point on or near the figure, the point where the stock surface lies outward along the figure's normal, or null when the stock is already cut away there, the normal leaves the stock within `maxDistance`, or the surface found is the block's bottom face. */
export function stockAbove(ctx: PlanContext, q: Vec3, maxDistance: number): { point: Vec3; depth: number } | null {
  const n = ctx.figure.gradient(q[0], q[1], q[2]);
  const inside = ctx.stock.sample(q[0], q[1], q[2]);
  if (inside > 0) return null;
  const depth = firstExit(ctx.stock, q, n, maxDistance, ctx.cell * 0.5);
  if (depth === null) return null;
  const point = add(q, n, depth);
  // The block stands on its bottom face, which no tool reaches.
  if (point[1] < ctx.cell * 0.5) return null;
  return { point, depth };
}

export function inRegion(region: RegionDef, point: Vec3, normal: Vec3): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    const v = point[axis] ?? 0;
    if (v < (region.min[axis] ?? 0) || v > (region.max[axis] ?? 0)) return false;
  }
  return region.contains === undefined ? true : region.contains(point, normal);
}

/** Points on the figure's surface inside the region, about `spacing` apart, found by scanning the region's box at half that spacing and projecting the near-surface samples; each cell of a `spacing` lattice keeps one point, in scan order. */
export function figureSurfacePoints(ctx: PlanContext, spacing: number): Vec3[] {
  const { region, figure } = ctx;
  const points: Vec3[] = [];
  const taken = new Set<string>();
  const step = spacing / 2;
  for (let y = region.max[1]; y >= region.min[1]; y -= step) {
    for (let z = region.min[2]; z <= region.max[2]; z += step) {
      for (let x = region.min[0]; x <= region.max[0]; x += step) {
        const d = figure.sample(x, y, z);
        if (Math.abs(d) > step) continue;
        const p = projectToFigure(figure, [x, y, z]);
        // The block stands on its bottom face, so nothing at or below it is worked.
        if (p[1] < ctx.cell) continue;
        const key = `${String(Math.floor(p[0] / spacing))},${String(Math.floor(p[1] / spacing))},${String(Math.floor(p[2] / spacing))}`;
        if (taken.has(key)) continue;
        if (!inRegion(region, p, figure.gradient(p[0], p[1], p[2]))) continue;
        taken.add(key);
        points.push(p);
      }
    }
  }
  return points;
}

/**
 * A blow with its tool axis at `angleDeg` to the surface, leaning forward along the stroke's `tangent` (90 is straight in).
 * `size` is the cut depth; `stroke` groups the blows of one set-up.
 */
export function blowAt(tool: ToolId, point: Vec3, normal: Vec3, tangent: Vec3, angleDeg: number, size: number, stroke: number): Blow {
  const n = normalize(normal);
  const u = tangentOf(n, tangent);
  const angle = (angleDeg * Math.PI) / 180;
  const direction = normalize([-n[0] * Math.sin(angle) + u[0] * Math.cos(angle), -n[1] * Math.sin(angle) + u[1] * Math.cos(angle), -n[2] * Math.sin(angle) + u[2] * Math.cos(angle)]);
  return { tool, point, normal: n, direction, size, stroke };
}
