/**
 * The drawn layout (docs/research/technique.md, Stage 1: Cellini's principal view drawn on the stone): the figure's silhouette, seen from the front, traced in charcoal on the block's front face.
 * The silhouette is the boundary of the columns through the figure on a raster of the face; its points are chained into strokes, nearest first, from the top down, and each blow sits on the stock's surface at the start of its column. Charcoal removes nothing and paints the drawn finish.
 */
import type { Blow, PlanContext, Vec3 } from '../../contracts/making';
import { blowAt, firstEntry, normalize } from './surface';

export interface DrawingOptions {
  /** Spacing of the charcoal marks along the contour, metres. */
  readonly stride: number;
  /** Degrees to the surface, the stick trailing. */
  readonly angle: number;
}

/** Whether the column through (x, y) along z meets the figure inside the region. */
function columnHitsFigure(ctx: PlanContext, x: number, y: number): boolean {
  const step = Math.max(ctx.cell, 0.01);
  for (let z = ctx.region.max[2]; z >= ctx.region.min[2]; z -= step) {
    if (ctx.figure.sample(x, y, z) < 0) return true;
  }
  return false;
}

export function drawing(ctx: PlanContext, options: DrawingOptions): Blow[] {
  const step = options.stride / 2;
  const nx = Math.max(2, Math.floor((ctx.region.max[0] - ctx.region.min[0]) / step));
  const ny = Math.max(2, Math.floor((ctx.region.max[1] - ctx.region.min[1]) / step));
  const mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      mask[i + nx * j] = columnHitsFigure(ctx, ctx.region.min[0] + (i + 0.5) * step, ctx.region.min[1] + (j + 0.5) * step) ? 1 : 0;
    }
  }
  const contour: Vec3[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (mask[i + nx * j] !== 1) continue;
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || mask[i - 1 + nx * j] === 0 || mask[i + 1 + nx * j] === 0 || mask[i + nx * (j - 1)] === 0 || mask[i + nx * (j + 1)] === 0;
      if (edge) contour.push([ctx.region.min[0] + (i + 0.5) * step, ctx.region.min[1] + (j + 0.5) * step, ctx.region.max[2]]);
    }
  }
  // Chain the contour nearest-first from the top; a jump longer than a few strides starts a new stroke.
  const remaining = contour.slice().sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const ordered: Vec3[] = [];
  let current = remaining.shift();
  while (current !== undefined) {
    ordered.push(current);
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let n = 0; n < remaining.length; n += 1) {
      const candidate = remaining[n];
      if (candidate === undefined) continue;
      const d = Math.hypot(candidate[0] - current[0], candidate[1] - current[1]);
      if (d < bestDistance) {
        bestDistance = d;
        best = n;
      }
    }
    if (best < 0) break;
    current = remaining.splice(best, 1)[0];
  }
  const blows: Blow[] = [];
  let stroke = 0;
  let previous: Vec3 | null = null;
  let sinceLast = Number.POSITIVE_INFINITY;
  for (let n = 0; n < ordered.length; n += 1) {
    const p = ordered[n];
    if (p === undefined) continue;
    const hop = previous === null ? Number.POSITIVE_INFINITY : Math.hypot(p[0] - previous[0], p[1] - previous[1]);
    if (hop > 3 * options.stride) stroke += 1;
    sinceLast = hop > 3 * options.stride ? Number.POSITIVE_INFINITY : sinceLast + hop;
    previous = p;
    if (sinceLast < options.stride) continue;
    sinceLast = 0;
    const entry = firstEntry(ctx.stock, p, [0, 0, -1], ctx.region.max[2] - ctx.region.min[2], ctx.cell * 0.5);
    if (entry === null) continue;
    const next = ordered[n + 1] ?? p;
    const along = normalize([next[0] - p[0], next[1] - p[1], 0]);
    blows.push(blowAt('charcoal', [p[0], p[1], p[2] - entry], [0, 0, 1], along[0] === 0 && along[1] === 0 ? [1, 0, 0] : along, options.angle, 0, stroke));
  }
  return blows;
}
