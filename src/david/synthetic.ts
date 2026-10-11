/**
 * The synthetic figure (docs/design/spec.md, Stock and figure): a mannequin of capsules, ellipsoids and one rounded box standing in for the David at its height, for tests and for working without the downloaded grid.
 * Pose, as the record describes it: weight on the right leg (−X, the figure faces +Z so its left is +X), the left leg relaxed with the left foot forward, the left hand raised to the left shoulder, the right hand hanging at the right thigh, standing on a rock base carved from the same block.
 * Proportions are a 1.75 m adult scaled to the body height above the base; the figure fits the block of src/david/frame.ts with clearance on every face.
 */
import { DEFAULT_BAND_CELLS, FIXED_POINT } from '../contracts/grid';
import type { Vec3 } from '../contracts/making';
import { blockLattice, Grid } from '../stock/grid';
import { STATUE_HEIGHT_M } from './frame';

export type Primitive =
  | { readonly kind: 'capsule'; readonly name: string; readonly a: Vec3; readonly b: Vec3; readonly r: number }
  | { readonly kind: 'ellipsoid'; readonly name: string; readonly c: Vec3; readonly radii: Vec3 }
  | { readonly kind: 'box'; readonly name: string; readonly c: Vec3; readonly half: Vec3; readonly round: number };

/** Height of the rock base, metres: the figure's feet stand on it. */
export const BASE_HEIGHT_M = 0.35;
const BASE_TOP = BASE_HEIGHT_M;
/** Body height from the base top to the crown. */
const BODY = STATUE_HEIGHT_M - BASE_HEIGHT_M;
/** Scale from a 1.75 m adult. */
const S = BODY / 1.75;

const y = (metres: number): number => BASE_TOP + metres * S;

/** The mannequin's parts, metres, in the world frame. */
export const SYNTHETIC_PARTS: readonly Primitive[] = [
  { kind: 'box', name: 'rock base', c: [0, BASE_HEIGHT_M / 2, -0.02], half: [0.84, BASE_HEIGHT_M / 2, 0.55], round: 0.1 },
  { kind: 'ellipsoid', name: 'head', c: [0.02, y(1.75) - 0.32, -0.06], radii: [0.22, 0.32, 0.26] },
  { kind: 'capsule', name: 'neck', a: [0.01, y(1.52), -0.07], b: [0, y(1.42), -0.06], r: 0.16 },
  { kind: 'capsule', name: 'torso left', a: [0.24, y(1.42), -0.05], b: [0.2, y(1.0), -0.05], r: 0.3 },
  { kind: 'capsule', name: 'torso centre', a: [0, y(1.44), -0.05], b: [0, y(0.98), -0.05], r: 0.31 },
  { kind: 'capsule', name: 'torso right', a: [-0.24, y(1.42), -0.05], b: [-0.2, y(1.0), -0.05], r: 0.3 },
  { kind: 'capsule', name: 'pelvis', a: [-0.26, y(0.93), -0.04], b: [0.26, y(0.93), -0.04], r: 0.3 },
  { kind: 'capsule', name: 'right thigh', a: [-0.25, y(0.9), -0.04], b: [-0.27, y(0.5), -0.02], r: 0.2 },
  { kind: 'capsule', name: 'right shin', a: [-0.27, y(0.5), -0.02], b: [-0.27, y(0.08), -0.04], r: 0.14 },
  { kind: 'capsule', name: 'right foot', a: [-0.27, BASE_TOP + 0.11, -0.36], b: [-0.27, BASE_TOP + 0.11, 0.24], r: 0.11 },
  { kind: 'capsule', name: 'left thigh', a: [0.25, y(0.9), -0.04], b: [0.3, y(0.5), 0.1], r: 0.2 },
  { kind: 'capsule', name: 'left shin', a: [0.3, y(0.5), 0.1], b: [0.3, y(0.08), 0.14], r: 0.14 },
  { kind: 'capsule', name: 'left foot', a: [0.3, BASE_TOP + 0.11, -0.12], b: [0.3, BASE_TOP + 0.11, 0.48], r: 0.11 },
  { kind: 'capsule', name: 'right upper arm', a: [-0.6, y(1.42), -0.06], b: [-0.68, y(1.14), -0.08], r: 0.15 },
  { kind: 'capsule', name: 'right forearm', a: [-0.68, y(1.14), -0.08], b: [-0.6, y(0.88), 0.04], r: 0.12 },
  { kind: 'capsule', name: 'right hand', a: [-0.58, y(0.88), 0.06], b: [-0.5, y(0.7), 0.12], r: 0.1 },
  { kind: 'capsule', name: 'left upper arm', a: [0.6, y(1.42), -0.06], b: [0.74, y(1.18), -0.3], r: 0.15 },
  { kind: 'capsule', name: 'left forearm', a: [0.74, y(1.18), -0.3], b: [0.52, y(1.4), -0.16], r: 0.12 },
  { kind: 'capsule', name: 'left hand', a: [0.52, y(1.4), -0.16], b: [0.42, y(1.47), -0.08], r: 0.1 },
];

function capsuleDistance(p: Primitive & { kind: 'capsule' }, x: number, y0: number, z: number): number {
  const ax = x - p.a[0];
  const ay = y0 - p.a[1];
  const az = z - p.a[2];
  const bx = p.b[0] - p.a[0];
  const by = p.b[1] - p.a[1];
  const bz = p.b[2] - p.a[2];
  const bb = bx * bx + by * by + bz * bz;
  let t = bb > 0 ? (ax * bx + ay * by + az * bz) / bb : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax - bx * t, ay - by * t, az - bz * t) - p.r;
}

/** Quilez's ellipsoid bound: exact on the axes, close elsewhere. */
function ellipsoidDistance(p: Primitive & { kind: 'ellipsoid' }, x: number, y0: number, z: number): number {
  const qx = (x - p.c[0]) / p.radii[0];
  const qy = (y0 - p.c[1]) / p.radii[1];
  const qz = (z - p.c[2]) / p.radii[2];
  const k0 = Math.hypot(qx, qy, qz);
  const k1 = Math.hypot(qx / p.radii[0], qy / p.radii[1], qz / p.radii[2]);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.radii[0], p.radii[1], p.radii[2]);
}

function boxDistance(p: Primitive & { kind: 'box' }, x: number, y0: number, z: number): number {
  const qx = Math.abs(x - p.c[0]) - (p.half[0] - p.round);
  const qy = Math.abs(y0 - p.c[1]) - (p.half[1] - p.round);
  const qz = Math.abs(z - p.c[2]) - (p.half[2] - p.round);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - p.round;
}

function primitiveDistance(p: Primitive, x: number, y0: number, z: number): number {
  switch (p.kind) {
    case 'capsule':
      return capsuleDistance(p, x, y0, z);
    case 'ellipsoid':
      return ellipsoidDistance(p, x, y0, z);
    default:
      return boxDistance(p, x, y0, z);
  }
}

/** Bounds of a primitive, metres. */
function primitiveBounds(p: Primitive): { min: Vec3; max: Vec3 } {
  switch (p.kind) {
    case 'capsule':
      return {
        min: [Math.min(p.a[0], p.b[0]) - p.r, Math.min(p.a[1], p.b[1]) - p.r, Math.min(p.a[2], p.b[2]) - p.r],
        max: [Math.max(p.a[0], p.b[0]) + p.r, Math.max(p.a[1], p.b[1]) + p.r, Math.max(p.a[2], p.b[2]) + p.r],
      };
    case 'ellipsoid':
      return { min: [p.c[0] - p.radii[0], p.c[1] - p.radii[1], p.c[2] - p.radii[2]], max: [p.c[0] + p.radii[0], p.c[1] + p.radii[1], p.c[2] + p.radii[2]] };
    default:
      return { min: [p.c[0] - p.half[0], p.c[1] - p.half[1], p.c[2] - p.half[2]], max: [p.c[0] + p.half[0], p.c[1] + p.half[1], p.c[2] + p.half[2]] };
  }
}

/** The figure's signed distance, metres, negative inside: the union of the parts. */
export function syntheticDistance(x: number, y0: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const part of SYNTHETIC_PARTS) {
    const d = primitiveDistance(part, x, y0, z);
    if (d < best) best = d;
  }
  return best;
}

/** Bounds of the whole figure, metres. */
export function syntheticBounds(): { min: Vec3; max: Vec3 } {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const part of SYNTHETIC_PARTS) {
    const b = primitiveBounds(part);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? 0, b.min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? 0, b.max[axis] ?? 0);
    }
  }
  return { min, max };
}

/**
 * Samples the figure on the block's lattice at `cell` metres with the figure band (DEFAULT_BAND_CELLS).
 * Every cell starts at the clamp; each part writes the minimum of itself over its bounds dilated by the band, which is the exact union inside the band and the clamp beyond it.
 */
export function syntheticFigure(cell: number): Grid {
  const grid = new Grid(blockLattice(cell, DEFAULT_BAND_CELLS));
  const { origin } = grid.spec;
  const { nx, ny, nz, values, limit } = grid;
  const band = DEFAULT_BAND_CELLS * cell;
  const scale = FIXED_POINT / cell;
  for (const part of SYNTHETIC_PARTS) {
    const b = primitiveBounds(part);
    const i0 = Math.max(0, Math.floor((b.min[0] - band - origin[0]) / cell));
    const j0 = Math.max(0, Math.floor((b.min[1] - band - origin[1]) / cell));
    const k0 = Math.max(0, Math.floor((b.min[2] - band - origin[2]) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((b.max[0] + band - origin[0]) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((b.max[1] + band - origin[1]) / cell));
    const k1 = Math.min(nz - 1, Math.ceil((b.max[2] + band - origin[2]) / cell));
    for (let k = k0; k <= k1; k += 1) {
      const z = origin[2] + k * cell;
      for (let j = j0; j <= j1; j += 1) {
        const yy = origin[1] + j * cell;
        let index = i0 + nx * (j + ny * k);
        for (let i = i0; i <= i1; i += 1, index += 1) {
          const d = primitiveDistance(part, origin[0] + i * cell, yy, z);
          let value = Math.round(d * scale);
          if (value < -limit) value = -limit;
          else if (value > limit) value = limit;
          if (value < (values[index] ?? limit)) values[index] = value;
        }
      }
    }
  }
  return grid;
}
