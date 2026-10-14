/**
 * A blow's frame and the distance helpers the tool volumes share (src/stock/tool-volumes.ts): the local frame of a blow (`n` the outward stock normal, `d` the tool axis from handle to tip, `u` the push direction and `w = n × u` across the blade), signed distances to a polygon, a rounded rectangle and an extrusion, and the world bounds of frame-local boxes and cylinders.
 * Every helper is a pure function of its arguments; the volumes build their shapes from them and nothing else here knows a tool.
 */
import type { Blow, Vec3 } from '../contracts/making';

export interface Frame {
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly n: Vec3;
  readonly u: Vec3;
  readonly w: Vec3;
  readonly d: Vec3;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-12 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The blow's local frame; the push direction falls back to any tangent when the tool axis is along the normal. */
export function blowFrame(blow: Blow): Frame {
  const n = normalize(blow.normal);
  const d = normalize(blow.direction);
  const along = dot(d, n);
  let u: Vec3 = [d[0] - along * n[0], d[1] - along * n[1], d[2] - along * n[2]];
  if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  u = normalize(u);
  const w = normalize(cross(n, u));
  return { px: blow.point[0], py: blow.point[1], pz: blow.point[2], n, u, w, d };
}

/** Signed distance to a simple polygon in 2D (Quilez's sdPolygon), vertices as parallel coordinate arrays. */
export function polygonDistance(xs: ArrayLike<number>, ys: ArrayLike<number>, px: number, py: number): number {
  const count = xs.length;
  let best = Number.POSITIVE_INFINITY;
  let sign = 1;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const vix = xs[i] ?? 0;
    const viy = ys[i] ?? 0;
    const ex = (xs[j] ?? 0) - vix;
    const ey = (ys[j] ?? 0) - viy;
    const wx = px - vix;
    const wy = py - viy;
    const ee = ex * ex + ey * ey;
    let t = ee > 0 ? (wx * ex + wy * ey) / ee : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const bx = wx - ex * t;
    const by = wy - ey * t;
    const dd = bx * bx + by * by;
    if (dd < best) best = dd;
    const c0 = py >= viy;
    const c1 = py < (ys[j] ?? 0);
    const c2 = ex * wy > ey * wx;
    if ((c0 && c1 && c2) || (!c0 && !c1 && !c2)) sign = -sign;
  }
  return sign * Math.sqrt(best);
}

/** Distance to the extrusion of a 2D shape (distance `d2`) across a slab (distance `db`), exact outside the corners. */
export function extrude(d2: number, db: number): number {
  const inside = Math.min(Math.max(d2, db), 0);
  const ox = d2 > 0 ? d2 : 0;
  const oy = db > 0 ? db : 0;
  return inside + Math.hypot(ox, oy);
}

/** Signed distance to a rounded rectangle centred at the origin with half extents hx, hy and corner radius r. */
export function roundedBox2(x: number, y: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(x) - (hx - r);
  const qy = Math.abs(y) - (hy - r);
  return Math.hypot(qx > 0 ? qx : 0, qy > 0 ? qy : 0) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Bounds of a frame-local box [a0, a1] × [b0, b1] × [c0, c1] in world metres, dilated by `pad`. */
export function frameBounds(f: Frame, a0: number, a1: number, b0: number, b1: number, c0: number, c1: number, pad: number): { min: Vec3; max: Vec3 } {
  const centre = [f.px, f.py, f.pz];
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const a of [a0, a1]) {
    for (const b of [b0, b1]) {
      for (const c of [c0, c1]) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = (centre[axis] ?? 0) + a * (f.u[axis] ?? 0) + b * (f.w[axis] ?? 0) + c * (f.n[axis] ?? 0);
          if (value < (min[axis] ?? 0)) min[axis] = value;
          if (value > (max[axis] ?? 0)) max[axis] = value;
        }
      }
    }
  }
  return { min: [(min[0] ?? 0) - pad, (min[1] ?? 0) - pad, (min[2] ?? 0) - pad], max: [(max[0] ?? 0) + pad, (max[1] ?? 0) + pad, (max[2] ?? 0) + pad] };
}

/** The tight box of a cylinder of `radius` and `halfHeight` about `centre` along the unit axis `d`. */
export function cylinderBounds(centre: Vec3, d: Vec3, radius: number, halfHeight: number): { min: Vec3; max: Vec3 } {
  const extent = (axis: number): number => {
    const along = d[axis] ?? 0;
    return radius * Math.sqrt(Math.max(0, 1 - along * along)) + halfHeight * Math.abs(along);
  };
  const ex = extent(0);
  const ey = extent(1);
  const ez = extent(2);
  return { min: [centre[0] - ex, centre[1] - ey, centre[2] - ez], max: [centre[0] + ex, centre[1] + ey, centre[2] + ez] };
}
