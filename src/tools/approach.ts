/**
 * The hand's path between two tool poses (docs/design/spec.md, Tools: a tool never intersects stock except at the working tip).
 * A move of more than a stroke lifts the tool out along the surface normal by at least its length, carries it, and lowers it along the new normal. Between two faces of the block, or from the bench, both ends of the carry are stations outside the block's box grown by the tool's length, and the carry between them runs in axis-aligned legs the box test accepts, so a convex stock inside the block is never entered. On one face the lift alone clears a convex surface.
 * Bound: the block's box and the two tangent planes. A non-convex stock (a limb standing proud between the two points) is not seen; that is the page's visual check.
 */
import { Vector3 } from 'three';

import { BLOCK_M } from '../david/frame';

const UP = new Vector3(0, 1, 0);
/** Margin round the block's box a carried tool keeps, metres, on top of the tool's length. */
const BOX_MARGIN = 0.1;
/** A station stands this much further out than the box, metres. */
const STATION_MARGIN = 0.05;
/** Faces whose normals agree within about ten degrees count as one face. */
const COPLANAR_DOT = 0.985;

export interface Box {
  readonly min: Vector3;
  readonly max: Vector3;
}

/** The block's box grown by the tool's length and a margin on the sides and the top; the floor is open. */
export function clearanceBox(toolLength: number): Box {
  const grow = toolLength + BOX_MARGIN;
  return { min: new Vector3(-BLOCK_M.width / 2 - grow, -1, -BLOCK_M.depth / 2 - grow), max: new Vector3(BLOCK_M.width / 2 + grow, BLOCK_M.height + grow, BLOCK_M.depth / 2 + grow) };
}

/** Whether the segment from `a` to `b` passes through `box` (slab test). */
export function segmentCrossesBox(a: Vector3, b: Vector3, box: Box): boolean {
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const start = a[axis];
    const delta = b[axis] - start;
    if (Math.abs(delta) < 1e-12) {
      if (start < box.min[axis] || start > box.max[axis]) return false;
      continue;
    }
    let t0 = (box.min[axis] - start) / delta;
    let t1 = (box.max[axis] - start) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return false;
  }
  return true;
}

/** Distance along `direction` from `origin` to where the ray leaves `box`; zero when the ray never meets it. */
export function exitDistance(origin: Vector3, direction: Vector3, box: Box): number {
  let tEnter = Number.NEGATIVE_INFINITY;
  let tExit = Number.POSITIVE_INFINITY;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return 0;
      continue;
    }
    let t0 = (box.min[axis] - origin[axis]) / d;
    let t1 = (box.max[axis] - origin[axis]) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
  }
  return tEnter <= tExit && tExit > 0 ? tExit : 0;
}

/** Where a tool hovers before it descends along `normal` to `point`: at least the tool's length out, and clear of the box. */
export function station(point: Vector3, normal: Vector3, toolLength: number, box: Box): Vector3 {
  return point.clone().addScaledVector(normal, Math.max(toolLength, exitDistance(point, normal, box) + STATION_MARGIN));
}

/** Axis-aligned legs from `from` to `to` that stay out of `box`: straight when that is clear, else the first clear L route or U route through a corridor past the front, back, a side or the top of the box; the straight line when none is. */
export function routeAround(from: Vector3, to: Vector3, box: Box): Vector3[] {
  const zFront = Math.max(from.z, to.z, box.max.z + STATION_MARGIN);
  const zBack = Math.min(from.z, to.z, box.min.z - STATION_MARGIN);
  const xRight = Math.max(from.x, to.x, box.max.x + STATION_MARGIN);
  const xLeft = Math.min(from.x, to.x, box.min.x - STATION_MARGIN);
  const yTop = Math.max(from.y, to.y, box.max.y + STATION_MARGIN);
  const candidates: Vector3[][] = [
    [],
    [new Vector3(to.x, to.y, from.z)],
    [new Vector3(from.x, to.y, to.z)],
    [new Vector3(from.x, to.y, zFront), new Vector3(to.x, to.y, zFront)],
    [new Vector3(from.x, to.y, zBack), new Vector3(to.x, to.y, zBack)],
    [new Vector3(xLeft, to.y, from.z), new Vector3(xLeft, to.y, to.z)],
    [new Vector3(xRight, to.y, from.z), new Vector3(xRight, to.y, to.z)],
    [new Vector3(from.x, yTop, from.z), new Vector3(to.x, yTop, to.z)],
  ];
  for (const corners of candidates) {
    const points = [from.clone(), ...corners, to.clone()];
    if (points.every((point, i) => i === 0 || !segmentCrossesBox(points[i - 1] ?? point, point, box))) return points;
  }
  return [from.clone(), to.clone()];
}

function liftedCarry(a: Vector3, normalA: Vector3, b: Vector3, normalB: Vector3, toolLength: number): Vector3[] {
  const box = clearanceBox(toolLength);
  return [a.clone(), ...routeAround(station(a, normalA, toolLength, box), station(b, normalB, toolLength, box), box), b.clone()];
}

/** Waypoints from one settled pose to another more than a stroke apart: on one face, out along the normal by the tool's length (or a quarter of the distance, up to 0.6 m), across, and in; between faces, a carry between stations outside the box. */
export function strokePath(a: Vector3, normalA: Vector3, b: Vector3, normalB: Vector3, toolLength: number): Vector3[] {
  if (normalA.dot(normalB) > COPLANAR_DOT) {
    const height = Math.max(toolLength, Math.min(0.25 * a.distanceTo(b), 0.6));
    return [a.clone(), a.clone().addScaledVector(normalA, height), b.clone().addScaledVector(normalB, height), b.clone()];
  }
  return liftedCarry(a, normalA, b, normalB, toolLength);
}

/** Waypoints for the carry from a rest spot: straight up off the bench by the tool's length, then round the box to the blow. */
export function carryPath(from: Vector3, b: Vector3, normalB: Vector3, toolLength: number): Vector3[] {
  return liftedCarry(from, UP, b, normalB, toolLength);
}

export function pathLength(points: readonly Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += (points[i] ?? new Vector3()).distanceTo(points[i - 1] ?? new Vector3());
  return total;
}

/** The point at fraction `e` of the polyline's length. */
export function alongPath(points: readonly Vector3[], e: number): Vector3 {
  const first = points[0];
  if (first === undefined) return new Vector3();
  const total = pathLength(points);
  if (total < 1e-12) return first.clone();
  let remaining = Math.min(1, Math.max(0, e)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1] ?? first;
    const end = points[i] ?? start;
    const length = start.distanceTo(end);
    if (remaining <= length || i === points.length - 1) return start.clone().lerp(end, length < 1e-12 ? 1 : Math.min(1, remaining / length));
    remaining -= length;
  }
  return (points[points.length - 1] ?? first).clone();
}
