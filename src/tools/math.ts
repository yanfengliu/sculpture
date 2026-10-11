/**
 * Small pure helpers the tools share: tuple vectors for the contract, a seeded generator for the chips, and the easing the hand moves with.
 * Everything here is deterministic; nothing reads a clock or the page.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

import type { Quat, Vec3 } from '../contracts/making';

export const toVector = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);
export const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
export const toQuat = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];
export const fromQuat = (q: Quat): Quaternion => new Quaternion(q[0], q[1], q[2], q[3]);

/** Minimum-jerk ease, the profile a hand follows between two rest points: zero speed and acceleration at both ends. */
export function easeHand(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export const DEG = Math.PI / 180;

/** The rotation that maps local +X, +Y, +Z onto the given orthonormal world axes. */
export function quatFromBasis(x: Vector3, y: Vector3, z: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** A unit vector perpendicular to `axis`, as close to `preferred` as possible; falls back through the world axes when `preferred` is parallel to `axis`. */
export function perpendicularTo(axis: Vector3, preferred: Vector3): Vector3 {
  const candidates = [preferred, new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)];
  for (const candidate of candidates) {
    const projected = candidate.clone().sub(axis.clone().multiplyScalar(candidate.dot(axis)));
    if (projected.lengthSq() > 1e-6) return projected.normalize();
  }
  return new Vector3(1, 0, 0);
}

/** FNV-1a over a string, as a 32-bit seed. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small deterministic generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
