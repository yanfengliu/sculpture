/**
 * A blow's frame and the distance helpers the tool volumes share (src/stock/tool-volumes.ts): the local frame of a blow (`n` the outward stock normal, `d` the tool axis from handle to tip, `u` the push direction and `w = n × u` across the blade), signed distances to a polygon, a rounded rectangle and an extrusion, the world bounds of frame-local boxes and cylinders, and the seeded irregularity of a blow (its seed, numbers drawn from it and a lattice of pits).
 * Every helper is a pure function of its arguments; the volumes build their shapes from them and nothing else here knows a tool.
 */
import type { Blow, Vec3 } from '../contracts/making';
import { FNV_OFFSET, fnvNumber } from './digest';

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

/** A blow's seed from its own fields: FNV-1a over the IEEE-754 bytes of its point, direction and size (src/stock/digest.ts). Every path that rebuilds a volume from the blow (the main thread, the planner's scratch, the carve workers, which unpack the same doubles) draws the same irregularity from it, and no state outside the blow is read. */
export function blowSeed(blow: Blow): number {
  let h = FNV_OFFSET;
  for (const v of blow.point) h = fnvNumber(h, v);
  for (const v of blow.direction) h = fnvNumber(h, v);
  return fnvNumber(h, blow.size);
}

/** Mixes a 32-bit integer (the finaliser of MurmurHash3): every input bit reaches every output bit. */
function mix32(k: number): number {
  let h = Math.imul(k ^ (k >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The `n`-th number in [0, 1) drawn from `seed`. */
export function seededUnit(seed: number, n: number): number {
  return mix32((seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0) / 4294967296;
}

/** The radii of the pits as fractions of the lattice's pitch, the smallest and the largest: each cell draws one between them. */
const PIT_RADIUS_MIN = 0.25;
const PIT_RADIUS_MAX = 0.42;
/** Steepest slope of `pitDepth` per lattice unit: every pit is a cone of one slope, its depth its radius over the largest radius. */
export const PIT_SLOPE = 1 / PIT_RADIUS_MAX;
/** The mean of `pitDepth` over the lattice: a cone of radius r holds π r⁴ / 3 over the largest radius, and r is drawn evenly between the two radii. */
export const PIT_MEAN = (Math.PI * (PIT_RADIUS_MAX ** 5 - PIT_RADIUS_MIN ** 5)) / (15 * (PIT_RADIUS_MAX - PIT_RADIUS_MIN) * PIT_RADIUS_MAX);

/** The rows of the rotation of the unit quaternion (w, x, y, z), normalised first: three orthonormal vectors. */
export function rotationRows(w: number, x: number, y: number, z: number): readonly [Vec3, Vec3, Vec3] {
  const length = Math.sqrt(w * w + x * x + y * y + z * z);
  const [a, b, c, d] = [w / length, x / length, y / length, z / length];
  return [
    [1 - 2 * (c * c + d * d), 2 * (b * c - a * d), 2 * (b * d + a * c)],
    [2 * (b * c + a * d), 1 - 2 * (b * b + d * d), 2 * (c * d - a * b)],
    [2 * (b * d - a * c), 2 * (c * d + a * b), 1 - 2 * (b * b + c * c)],
  ];
}

/**
 * The depth of a lattice of pits at lattice coordinates (x, y, z), 0 to 1: one conical pit per unit cell, the V of a point driven straight in (tools.md, Subbia), its radius and its centre drawn from the cell's integer coordinates and `seed`, the centre moved off the cell's middle as far as the cone stays inside the cell, so the pits fall irregularly and sampling on a grid gives noise, not the lattice's moiré. A plane through the lattice cuts each cone in a round pit whose width and depth depend on how near the centre it passes.
 * Every cone has one slope, so a pit's depth is its radius over the largest radius; the field is zero on every cell face, so neighbouring cells meet without a step, and its slope is at most PIT_SLOPE per lattice unit.
 */
export function pitDepth(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const k = mix32((Math.imul(ix, 0x27d4eb2f) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x61c88647) ^ seed) >>> 0);
  const radius = PIT_RADIUS_MIN + (PIT_RADIUS_MAX - PIT_RADIUS_MIN) * ((k & 0xff) / 256);
  // Each byte of the hash moves the centre along one axis by up to the room the cone leaves in the cell.
  const room = 0.5 - radius;
  const tx = x - ix - 0.5 - room * (((k >>> 8) & 0xff) / 128 - 1);
  const ty = y - iy - 0.5 - room * (((k >>> 16) & 0xff) / 128 - 1);
  const tz = z - iz - 0.5 - room * ((k >>> 24) / 128 - 1);
  const pit = radius - Math.sqrt(tx * tx + ty * ty + tz * tz);
  return pit > 0 ? pit / PIT_RADIUS_MAX : 0;
}
