/**
 * The blow cycle (docs/design/spec.md, Tools; src/contracts/making.ts, BlowCycle): tool poses and chips as pure functions of a blow, the blow before it and the phase.
 *
 * Phase p in [0, 1): approach [0, APPROACH_END) moves the tool from its previous settled pose (or its bench slot when `previous` is null) to this blow with a hand's minimum-jerk ease and a lift that clears the stone; raise [APPROACH_END, RAISE_PEAK] lifts the mallet along its arc; it falls and meets the chisel's head at STRIKE, when the tip is exactly at `blow.point`; recoil to 1, the chisel biting in by at most `blow.size` and lifting out again so the next cycle starts where this one ends.
 * Angles (docs/research/tools.md; technique.md, Why angles matter): the tool axis follows `blow.direction`, tilted within the plane of the direction and the normal into the tool's documented range: the point at the sculptor's 45° stroke (30 to 50) unless the engine marks a bulk cut by `size` at or above BULK_CUT_SIZE_M (60 to 90); toothed chisels and the roundel 35 to 60; the drill 35 to 45 when running and straight in for a single hole; rasps, files and straw lying along the surface; pumice and leather flat on it; charcoal and the brush trailing.
 * The mallet swings about a wrist pivot SWING_RADIUS from the chisel head on the side away from the stone, so handle and head never pass through stock. Tools that are not struck have no mallet pose. Tools absent from `posesAt` are at their `restPose`.
 * Reach: `isReachable` is the bound of technique.md stage 0 (plank decks at 1.5 and 3.2 m ringing the block, inferred); the cycle cannot refuse a blow, so the choreography's tests should assert it on every planned point.
 */
import { Quaternion, Vector3 } from 'three';

import type { Blow, BlowCycle, ToolPose, Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { benchPose } from './bench';
import type { CatalogId } from './catalog';
import { BULK_CUT_SIZE_M, TOOL_CATALOG, dimension } from './catalog';
import { chipsAt } from './chip-burst';
import { DEG, clamp, easeHand, fromQuat, perpendicularTo, quatFromBasis, toQuat, toVec3, toVector } from './math';

export const APPROACH_END = 0.3;
export const RAISE_PEAK = 0.52;
export const STRIKE = 0.65;
const BITE_IN_END = 0.71;
const BITE_OUT_START = 0.9;

/** Wrist pivot distance from the mallet face, metres, and the swing's ready and peak angles. */
export const SWING_RADIUS = 0.28;
const READY_ANGLE = 30 * DEG;
const PEAK_ANGLE = 75 * DEG;

/** Stroke amplitude of a tool rubbed back and forth, metres (technique.md: rasp strokes 5 to 15 cm). */
const STROKE_AMPLITUDE: Readonly<Partial<Record<CatalogId, number>>> = { rasp: 0.05, file: 0.04, polish: 0.06, pumice: 0.04 };

/** Hand speeds, metres per second: carrying a tool from the bench or to a new stroke, and sliding it along a furrow. */
export const CARRY_SPEED = 1.2;
export const SLIDE_SPEED = 0.4;

/** The scaffold of technique.md stage 0: plank decks ringing the block, and what a standing sculptor reaches above a deck or the yard (shoulder 1.4 m, arm 0.7 m, tool 0.25 m), all inferred. */
export const SCAFFOLD = { decks: [1.5, 3.2] as const, reachAbove: 2.35, armReach: 0.9 } as const;

const UP = new Vector3(0, 1, 0);

interface Frame {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

interface Settled {
  readonly frame: Frame;
  readonly direction: Vector3;
  readonly normal: Vector3;
  readonly tangent: Vector3;
}

/** Working angle bounds the cycle settles into, degrees to the surface. */
function angleRange(blow: Blow): readonly [number, number] {
  const spec = TOOL_CATALOG[blow.tool];
  if (blow.tool === 'point') return blow.size >= BULK_CUT_SIZE_M ? [60, 90] : [30, 50];
  if (blow.tool === 'drill') return [35, 90];
  const angle = spec.angle ?? { min: 0, max: 90 };
  return [angle.min, angle.max];
}

/** `direction` tilted within its plane with `normal` so its angle to the surface lies in [min, max] degrees. */
export function clampAngle(direction: Vector3, normal: Vector3, min: number, max: number): Vector3 {
  const into = clamp(-direction.dot(normal), -1, 1);
  const angle = Math.asin(into) / DEG;
  if (angle >= min && angle <= max) return direction.clone();
  const target = clamp(angle, min, max) * DEG;
  const tangent = perpendicularTo(normal, direction);
  return tangent.multiplyScalar(Math.cos(target)).addScaledVector(normal, -Math.sin(target)).normalize();
}

function settle(blow: Blow): Settled {
  const spec = TOOL_CATALOG[blow.tool];
  const normal = toVector(blow.normal).normalize();
  const [min, max] = angleRange(blow);
  const direction = clampAngle(toVector(blow.direction).normalize(), normal, min, max);
  const axis = direction.clone().negate();
  const tangent = perpendicularTo(normal, direction);
  const side = normal.clone().cross(tangent).normalize();
  let quaternion: Quaternion;
  switch (spec.motion) {
    case 'drill': {
      const bow = perpendicularTo(axis, UP.clone().cross(axis));
      quaternion = quatFromBasis(bow, axis, bow.clone().cross(axis));
      break;
    }
    case 'edge': {
      const z = perpendicularTo(axis, normal);
      quaternion = quatFromBasis(axis.clone().cross(z), axis, z);
      break;
    }
    case 'face':
      quaternion = quatFromBasis(tangent, normal, tangent.clone().cross(normal));
      break;
    default:
      quaternion = quatFromBasis(side, axis, side.clone().cross(axis));
  }
  return { frame: { position: toVector(blow.point), quaternion }, direction, normal, tangent };
}

function restFrame(tool: CatalogId): Frame {
  const pose = benchPose(tool);
  return { position: toVector(pose.position), quaternion: fromQuat(pose.quaternion) };
}

function sameTool(blow: Blow, previous: Blow | null): previous is Blow {
  return previous !== null && previous.tool === blow.tool;
}

/** The tool's frame during the approach: eased from `from` to `to` with a lift along `liftAxis` peaking at `lift` metres. */
function approach(from: Frame, to: Frame, u: number, liftAxis: Vector3, lift: number): Frame {
  const e = easeHand(u);
  const position = from.position.clone().lerp(to.position, e).addScaledVector(liftAxis, lift * Math.sin(Math.PI * e));
  return { position, quaternion: from.quaternion.clone().slerp(to.quaternion, e) };
}

function toolFrame(blow: Blow, previous: Blow | null, phase: number, settled: Settled): Frame {
  if (phase < APPROACH_END) {
    const u = phase / APPROACH_END;
    if (sameTool(blow, previous)) {
      const before = settle(previous);
      const distance = before.frame.position.distanceTo(settled.frame.position);
      if (previous.stroke === blow.stroke) {
        const meanNormal = before.normal.clone().add(settled.normal).normalize();
        return approach(before.frame, settled.frame, u, meanNormal, clamp(0.1 * distance, 0.003, 0.02));
      }
      return approach(before.frame, settled.frame, u, UP, clamp(0.3 * distance, 0.02, 0.35));
    }
    const rest = restFrame(blow.tool);
    return approach(rest, settled.frame, u, UP, clamp(0.3 * rest.position.distanceTo(settled.frame.position), 0.05, 0.4));
  }
  const u = (phase - APPROACH_END) / (1 - APPROACH_END);
  const offset = workOffset(blow, u, phase, settled);
  return { position: settled.frame.position.clone().add(offset), quaternion: settled.frame.quaternion };
}

/** Where the tip is relative to the point while the tool works: biting in, drilling in and out, or stroking along the surface. */
function workOffset(blow: Blow, u: number, phase: number, settled: Settled): Vector3 {
  const motion = TOOL_CATALOG[blow.tool].motion;
  if (motion === 'struck') return settled.direction.clone().multiplyScalar(bite(phase) * blow.size);
  if (motion === 'drill') {
    const wave = Math.sin(Math.PI * 2 * u);
    return settled.direction.clone().multiplyScalar(blow.size * (wave >= 0 ? wave : 0.3 * wave));
  }
  const amplitude = STROKE_AMPLITUDE[blow.tool] ?? 0;
  return settled.tangent.clone().multiplyScalar(amplitude * Math.sin(Math.PI * 2 * u));
}

/** 0 before the strike, 1 while the chisel sits in its cut, back to 0 as it lifts out before the cycle ends. */
function bite(phase: number): number {
  if (phase < STRIKE) return 0;
  if (phase < BITE_IN_END) return smooth((phase - STRIKE) / (BITE_IN_END - STRIKE));
  if (phase < BITE_OUT_START) return 1;
  return 1 - smooth((phase - BITE_OUT_START) / (1 - BITE_OUT_START));
}

function smooth(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Mallet swing angle over the cycle: ready while the chisel approaches, up to the peak, down onto the head at the strike, a quick recoil back to ready. */
export function swingAngle(phase: number): number {
  if (phase < APPROACH_END) return READY_ANGLE;
  if (phase < RAISE_PEAK) return READY_ANGLE + (PEAK_ANGLE - READY_ANGLE) * smooth((phase - APPROACH_END) / (RAISE_PEAK - APPROACH_END));
  if (phase < STRIKE) {
    const v = (phase - RAISE_PEAK) / (STRIKE - RAISE_PEAK);
    return PEAK_ANGLE * (1 - v * v);
  }
  const w = (phase - STRIKE) / (1 - STRIKE);
  return READY_ANGLE * (1 - (1 - w) * (1 - w));
}

/** The mallet about its pivot: face on the chisel's head at angle 0, the pivot SWING_RADIUS away on the side `preferred` leans to. */
function malletFrame(chisel: Frame, tool: CatalogId, theta: number, preferred: Vector3): Frame {
  const axis = new Vector3(0, 1, 0).applyQuaternion(chisel.quaternion);
  const head = chisel.position.clone().addScaledVector(axis, dimension(tool, 'shaftLength'));
  const side = perpendicularTo(axis, preferred);
  const hinge = axis.clone().cross(side).normalize();
  const pivot = head.clone().addScaledVector(side, SWING_RADIUS);
  const swing = new Quaternion().setFromAxisAngle(hinge, theta);
  const position = head.clone().sub(pivot).applyQuaternion(swing).add(pivot);
  const quaternion = swing.multiply(quatFromBasis(hinge, axis, side));
  return { position, quaternion };
}

/** The side the mallet hand keeps to: away from the stone and a little above, blended from the previous blow's normal so the hand does not jump between blows. */
function pivotPreference(blow: Blow, previous: Blow | null, phase: number): Vector3 {
  const current = toVector(blow.normal).normalize();
  if (phase < APPROACH_END && sameTool(blow, previous)) {
    current.lerp(toVector(previous.normal).normalize(), 1 - easeHand(phase / APPROACH_END)).normalize();
  }
  return current.addScaledVector(UP, 0.5);
}

function pose(tool: CatalogId, frame: Frame): ToolPose {
  return { tool, position: toVec3(frame.position), quaternion: toQuat(frame.quaternion) };
}

export interface ToolsBlowCycle extends BlowCycle {
  /** Seconds a hand needs for the approach of `blow` after `previous`, so the page can give a step's first cycle the time the carry from the bench takes. */
  approachSeconds(blow: Blow, previous: Blow | null): number;
}

export function createBlowCycle(): ToolsBlowCycle {
  return {
    posesAt(blow, previous, phase) {
      const p = clamp(phase, 0, 1 - 1e-9);
      const settled = settle(blow);
      const frame = toolFrame(blow, previous, p, settled);
      const poses: ToolPose[] = [pose(blow.tool, frame)];
      if (TOOL_CATALOG[blow.tool].motion === 'struck') {
        const theta = swingAngle(p);
        const ready = malletFrame(frame, blow.tool, theta, pivotPreference(blow, previous, p));
        if (p < APPROACH_END && !sameTool(blow, previous)) {
          const atRest = restFrame('mallet');
          poses.push(pose('mallet', approach(atRest, malletFrame(settled.frame, blow.tool, READY_ANGLE, pivotPreference(blow, null, p)), p / APPROACH_END, UP, 0.2)));
        } else {
          poses.push(pose('mallet', ready));
        }
      }
      return poses;
    },
    chipsAt,
    restPose: benchPose,
    approachSeconds(blow, previous) {
      const to = toVector(blow.point);
      if (sameTool(blow, previous)) {
        const distance = toVector(previous.point).distanceTo(to);
        return Math.max(0.05, distance / (previous.stroke === blow.stroke ? SLIDE_SPEED : CARRY_SPEED));
      }
      return Math.max(0.05, restFrame(blow.tool).position.distanceTo(to) / CARRY_SPEED);
    },
  };
}

/** Whether a sculptor on the yard floor or the scaffold decks reaches `point` with a tool: within arm's reach of the block's sides and no higher than the top deck plus a standing reach. */
export function isReachable(point: Vec3): boolean {
  const [x, y, z] = point;
  const top = SCAFFOLD.decks[SCAFFOLD.decks.length - 1] ?? 0;
  return y >= 0 && y <= top + SCAFFOLD.reachAbove && Math.abs(x) <= BLOCK_M.width / 2 + SCAFFOLD.armReach && Math.abs(z) <= BLOCK_M.depth / 2 + SCAFFOLD.armReach;
}
