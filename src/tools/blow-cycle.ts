/**
 * The blow cycle (docs/design/spec.md, Tools; src/contracts/making.ts, BlowCycle): tool poses and chips as pure functions of a blow, the blow before it and the phase.
 *
 * Phase p in [0, 1): approach [0, APPROACH_END) moves the tool from its previous settled pose (or its bench slot when `previous` is null) to this blow along the path of src/tools/approach.ts with a hand's minimum-jerk ease; raise [APPROACH_END, RAISE_PEAK] lifts the mallet along its arc; it falls and meets the chisel's head at STRIKE, the contract's STRIKE_PHASE at which the engine applies the cut, when the tip is exactly at `blow.point`; after it the chisel bites in by at most `blow.size` and the drill feeds in, both lifting out again by the cycle's end so the next cycle starts where this one ends.
 * Angles (docs/research/tools.md; technique.md, Why angles matter): the tool axis follows `blow.direction`, tilted within the plane of the direction and the normal into the tool's documented range: the point at the sculptor's 45° stroke (30 to 50) unless the engine marks a bulk cut by `size` at or above BULK_CUT_SIZE_M (60 to 90); toothed chisels and the roundel 35 to 60; the drill 35 to 45 when running and straight in for a single hole; rasps, files and straw lying along the surface; pumice and leather flat on it; charcoal and the brush trailing.
 * Clearance: the settled axis makes at least the tool's minimum angle with the surface, so the settled shaft lies outside the half-space behind the tangent plane (the engine supplies `blow.normal` as the stock's gradient); a rubbing tool is laid on the surface by its working face, its axis `faceOffset` above the point. Between blows of one stroke the tip slides along the surface under a small clearance lift; between strokes, or further than STROKE_SPAN apart, it lifts out along the normal by at least the tool's length and, between faces or from the bench, carries round the block's box.
 * The mallet swings about a wrist pivot SWING_RADIUS from the chisel head on the side away from the stone, so handle and head never pass through stock. Tools that are not struck have no mallet pose. Tools absent from `posesAt` are at their `restPose`.
 * Reach: `isReachable` (src/tools/scaffold.ts) is the bound of the decks and bridges; the cycle cannot refuse a blow, so the choreography's tests assert it on every planned point.
 */
import { Quaternion, Vector3 } from 'three';

import type { Blow, BlowCycle, ToolPose } from '../contracts/making';
import { STRIKE_PHASE } from '../contracts/making';
import { alongPath, carryPath, pathLength, strokePath } from './approach';
import { benchPose } from './bench';
import type { CatalogId } from './catalog';
import { BULK_CUT_SIZE_M, TOOL_CATALOG, dimension } from './catalog';
import { chipsAt } from './chip-burst';
import { TOOTH_HEIGHT_RATIO } from './geometry/rasps';
import { DEG, clamp, easeHand, fromQuat, perpendicularTo, quatFromBasis, toQuat, toVec3, toVector } from './math';

export { isReachable } from './scaffold';

export const APPROACH_END = 0.3;
/** The strike is the contract's phase, so the engine's cut and the mallet's blow coincide. */
export const STRIKE = STRIKE_PHASE;
export const RAISE_PEAK = STRIKE - 0.13;
const BITE_IN_END = STRIKE + 0.06;
/** The drill feeds in more slowly than a mallet blow bites. */
const FEED_IN_END = STRIKE + 0.23;
const BITE_OUT_START = 0.9;
/** Blows of one stroke further apart than this, metres, are treated as a new stroke: the tool lifts out and carries. */
export const STROKE_SPAN = 0.2;

/** Wrist pivot distance from the mallet face, metres, and the swing's ready and peak angles. */
export const SWING_RADIUS = 0.28;
const READY_ANGLE = 30 * DEG;
const PEAK_ANGLE = 75 * DEG;

/** Stroke amplitude of a tool rubbed back and forth, metres (technique.md: rasp strokes 5 to 15 cm). */
const STROKE_AMPLITUDE: Readonly<Partial<Record<CatalogId, number>>> = { rasp: 0.05, file: 0.04, polish: 0.06, pumice: 0.04 };

/** Hand speeds, metres per second: carrying a tool from the bench or to a new stroke, and sliding it along a furrow. */
export const CARRY_SPEED = 1.2;
export const SLIDE_SPEED = 0.4;
/** A carry never holds the time-lapse longer than this, seconds: a longer route round the block is walked faster, so twenty-one step carries cannot add minutes to a five-minute playback. */
export const MAX_CARRY_SECONDS = 2.5;

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

/** Working angle bounds the cycle settles into, degrees to the surface; every minimum is above zero, which keeps the settled shaft outside the stone. */
function angleRange(blow: Blow): readonly [number, number] {
  const spec = TOOL_CATALOG[blow.tool];
  if (blow.tool === 'point') return blow.size >= BULK_CUT_SIZE_M ? [60, 90] : [30, 50];
  if (blow.tool === 'drill') {
    // Running cuts at 35 to 45 degrees, single holes straight in (tools.md, Trapano): a direction nearer straight in than the running range snaps to 90.
    const into = clamp(-toVector(blow.direction).normalize().dot(toVector(blow.normal).normalize()), -1, 1);
    return Math.asin(into) / DEG >= 67.5 ? [90, 90] : [35, 45];
  }
  const angle = spec.angle ?? { min: 5, max: 90 };
  return [Math.max(angle.min, 5), angle.max];
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

/** Distance from a rubbing tool's axis to its working face, metres: half the bar and its teeth for the rasp and the file, the straw bunch's radius; zero for a tool that works with its tip or its base. */
export function faceOffset(tool: CatalogId): number {
  const d = TOOL_CATALOG[tool].dimensions;
  switch (tool) {
    case 'rasp':
      return (d.thickness?.value ?? 0) / 2 + (d.toothPitch?.value ?? 0) * TOOTH_HEIGHT_RATIO.rasp;
    case 'file':
      return (d.thickness?.value ?? 0) / 2 + (d.toothPitch?.value ?? 0) * TOOTH_HEIGHT_RATIO.file;
    case 'polish':
      return (d.diameter?.value ?? 0) / 2;
    default:
      return 0;
  }
}

/** The length of the tool from its tip along its axis, metres: how far its shaft reaches behind the tip. */
export function toolLength(tool: CatalogId): number {
  const d = TOOL_CATALOG[tool].dimensions;
  return (d.shaftLength ?? d.length ?? d.height ?? d.headLength ?? { value: 0.2 }).value;
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
  const position = toVector(blow.point);
  switch (spec.motion) {
    case 'drill': {
      const bow = perpendicularTo(axis, UP.clone().cross(axis));
      quaternion = quatFromBasis(bow, axis, bow.clone().cross(axis));
      break;
    }
    case 'edge': {
      const z = perpendicularTo(axis, normal);
      quaternion = quatFromBasis(axis.clone().cross(z), axis, z);
      position.addScaledVector(z, faceOffset(blow.tool));
      break;
    }
    case 'face':
      quaternion = quatFromBasis(tangent, normal, tangent.clone().cross(normal));
      break;
    default:
      quaternion = quatFromBasis(side, axis, side.clone().cross(axis));
  }
  return { frame: { position, quaternion }, direction, normal, tangent };
}

function restFrame(tool: CatalogId): Frame {
  const pose = benchPose(tool);
  return { position: toVector(pose.position), quaternion: fromQuat(pose.quaternion) };
}

function sameTool(blow: Blow, previous: Blow | null): previous is Blow {
  return previous !== null && previous.tool === blow.tool;
}

/** Whether the move from `previous` is a slide along one stroke rather than a lift and carry. */
function slides(blow: Blow, previous: Blow): boolean {
  return previous.stroke === blow.stroke && toVector(previous.point).distanceTo(toVector(blow.point)) <= STROKE_SPAN;
}

/** The waypoints the tip follows from its previous settled pose, or from the bench, to this blow's settled pose. */
function approachPath(blow: Blow, previous: Blow | null, settled: Settled): Vector3[] {
  const length = toolLength(blow.tool);
  if (sameTool(blow, previous)) {
    const before = settle(previous);
    return strokePath(before.frame.position, before.normal, settled.frame.position, settled.normal, length);
  }
  return carryPath(restFrame(blow.tool).position, settled.frame.position, settled.normal, length);
}

function toolFrame(blow: Blow, previous: Blow | null, phase: number, settled: Settled): Frame {
  if (phase < APPROACH_END) {
    const e = easeHand(phase / APPROACH_END);
    if (sameTool(blow, previous) && slides(blow, previous)) {
      const before = settle(previous);
      const distance = before.frame.position.distanceTo(settled.frame.position);
      const meanNormal = before.normal.clone().add(settled.normal);
      const liftAxis = meanNormal.lengthSq() > 1e-6 ? meanNormal.normalize() : settled.normal;
      const position = before.frame.position.clone().lerp(settled.frame.position, e).addScaledVector(liftAxis, clamp(0.1 * distance, 0.003, 0.02) * Math.sin(Math.PI * e));
      return { position, quaternion: before.frame.quaternion.clone().slerp(settled.frame.quaternion, e) };
    }
    const from = sameTool(blow, previous) ? settle(previous).frame : restFrame(blow.tool);
    return { position: alongPath(approachPath(blow, previous, settled), e), quaternion: from.quaternion.clone().slerp(settled.frame.quaternion, e) };
  }
  const u = (phase - APPROACH_END) / (1 - APPROACH_END);
  const offset = workOffset(blow, u, phase, settled);
  return { position: settled.frame.position.clone().add(offset), quaternion: settled.frame.quaternion };
}

/** Where the tip is relative to the point while the tool works: biting in, feeding the drill in, or stroking along the surface. */
function workOffset(blow: Blow, u: number, phase: number, settled: Settled): Vector3 {
  const motion = TOOL_CATALOG[blow.tool].motion;
  if (motion === 'struck') return settled.direction.clone().multiplyScalar(bite(phase) * blow.size);
  if (motion === 'drill') return settled.direction.clone().multiplyScalar(feed(phase) * blow.size);
  const amplitude = STROKE_AMPLITUDE[blow.tool] ?? 0;
  return settled.tangent.clone().multiplyScalar(amplitude * Math.sin(Math.PI * 2 * u));
}

/** 0 before the strike, 1 while the chisel sits in its cut, back to 0 as it lifts out before the cycle ends. */
function bite(phase: number): number {
  return inAndOut(phase, BITE_IN_END);
}

/** The drill's bit: at the surface until the strike, when the hole is cut, then fed in to the blow's depth and drawn out again. */
function feed(phase: number): number {
  return inAndOut(phase, FEED_IN_END);
}

function inAndOut(phase: number, inEnd: number): number {
  if (phase < STRIKE) return 0;
  if (phase < inEnd) return smooth((phase - STRIKE) / (inEnd - STRIKE));
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
          const readyAtBlow = malletFrame(settled.frame, blow.tool, READY_ANGLE, pivotPreference(blow, null, p));
          const e = easeHand(p / APPROACH_END);
          const path = carryPath(atRest.position, readyAtBlow.position, settled.normal, toolLength('mallet'));
          poses.push(pose('mallet', { position: alongPath(path, e), quaternion: atRest.quaternion.clone().slerp(readyAtBlow.quaternion, e) }));
        } else {
          poses.push(pose('mallet', ready));
        }
      }
      return poses;
    },
    chipsAt,
    restPose: benchPose,
    approachSeconds(blow, previous) {
      const settled = settle(blow);
      if (sameTool(blow, previous) && slides(blow, previous)) return Math.max(0.05, toVector(previous.point).distanceTo(settled.frame.position) / SLIDE_SPEED);
      return Math.min(MAX_CARRY_SECONDS, Math.max(0.05, pathLength(approachPath(blow, previous, settled)) / CARRY_SPEED));
    },
  };
}
