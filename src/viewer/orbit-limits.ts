/**
 * The orbit's limits (src/viewer/scene.ts applies them to the controls) and the check an explicit `cam=` pose must pass before the page keeps it (docs/design/spec.md, Query contract).
 * The controls clamp the camera to these limits on every update, so a pose outside them would be rendered from somewhere else than the URL says; the page reports such a pose and falls back to the preset instead (the defect of 2026-10-11: `cam=0,1,10,0,3,0` rendered from about [0, 3.2, 10.2] with no problem reported).
 * Pure, so the check is unit-tested here and reused by the sweep's pose generator (scripts/sweep.mjs), which must never draw a pose the page would refuse.
 */
import type { CameraPose } from './query';

/** Polar angle from straight above the target, radians: the camera never goes below the target's horizon by more than this limit allows, so it never looks up from under the yard floor. */
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;
/** Distance from the target, metres: 20 cm tools must be framed from close by in the follow view; 80 m takes in the whole yard. */
export const MIN_DISTANCE = 0.2;
export const MAX_DISTANCE = 80;

const DEGREES = 180 / Math.PI;

/** The pose's distance and polar angle (degrees from straight above the target). */
export function describePose(pose: CameraPose): { readonly distance: number; readonly polarDegrees: number } {
  const dx = pose.position[0] - pose.target[0];
  const dy = pose.position[1] - pose.target[1];
  const dz = pose.position[2] - pose.target[2];
  const distance = Math.hypot(dx, dy, dz);
  const polarDegrees = distance === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, dy / distance))) * DEGREES;
  return { distance, polarDegrees };
}

/** Why the orbit would move `pose`, or null when the controls keep it as it is. The text names the limit and the pose's own numbers. */
export function poseProblem(pose: CameraPose): string | null {
  const { distance, polarDegrees } = describePose(pose);
  const maxPolar = MAX_POLAR_ANGLE * DEGREES;
  if (distance < MIN_DISTANCE || distance > MAX_DISTANCE || polarDegrees > maxPolar) {
    return `the orbit keeps the camera ${String(MIN_DISTANCE)} to ${String(MAX_DISTANCE)} m from its target and at most ${maxPolar.toFixed(1)}° from straight above it (above the target's horizon); this pose is ${distance.toFixed(2)} m away at ${polarDegrees.toFixed(1)}°`;
  }
  return null;
}
