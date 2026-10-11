/**
 * The blow cycle's invariants (docs/design/spec.md, Tools): continuity in phase and across blows, the tip at the point at the strike, the mallet's face on the chisel's head at the strike, the documented angles, the bite and feed bounds, the clearance of the approach, the rest poses on the bench and the reach bound.
 * Bound: poses are checked against the blow's own point and normal, the block's box and the tangent planes; whether a pose clips a carved, non-convex stock elsewhere needs the stock and is the page's visual check.
 */
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import type { Blow, ToolId, ToolPose } from '../contracts/making';
import { STRIKE_PHASE } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { BENCH } from './bench';
import { APPROACH_END, MAX_CARRY_SECONDS, STRIKE, SWING_RADIUS, clampAngle, createBlowCycle, faceOffset, isReachable, swingAngle, toolLength } from './blow-cycle';
import { CATALOG_IDS, dimension } from './catalog';
import { DEG, fromQuat, toVector } from './math';

const cycle = createBlowCycle();
const FRONT_Z = BLOCK_M.depth / 2;
const HALF_W = BLOCK_M.width / 2;

/** A blow on the block's front face (normal +z) at `height`, the tool pointing down into the stone at `angle` degrees to the surface. */
function blow(tool: ToolId, height: number, angle: number, overrides: Partial<Blow> = {}): Blow {
  const a = angle * DEG;
  return { tool, point: [0.2, height, FRONT_Z], normal: [0, 0, 1], direction: [0, -Math.cos(a), -Math.sin(a)], size: 0.01, stroke: 0, ...overrides };
}

const find = (poses: readonly ToolPose[], tool: string): ToolPose => {
  const found = poses.find((p) => p.tool === tool);
  if (found === undefined) throw new Error(`no pose for ${tool}`);
  return found;
};

/** Where a posed tool touches the stone: its origin, or for a rubbing tool the working face below its axis. */
function contactPoint(pose: ToolPose): Vector3 {
  return toVector(pose.position).sub(new Vector3(0, 0, faceOffset(pose.tool)).applyQuaternion(fromQuat(pose.quaternion)));
}

/** The tip and the shaft's far end of a posed tool. */
function shaft(pose: ToolPose, length: number): [Vector3, Vector3] {
  const tip = toVector(pose.position);
  return [tip, tip.clone().add(new Vector3(0, length, 0).applyQuaternion(fromQuat(pose.quaternion)))];
}

function strictlyInsideBlock(p: Vector3): boolean {
  const eps = 1e-6;
  return Math.abs(p.x) < HALF_W - eps && Math.abs(p.z) < BLOCK_M.depth / 2 - eps && p.y > eps && p.y < BLOCK_M.height - eps;
}

const STRUCK: readonly ToolId[] = ['point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat'];
const UNSTRUCK: readonly ToolId[] = ['charcoal', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

describe('blow cycle', () => {
  it('strikes at the contract\u2019s STRIKE_PHASE, the symbol the engine applies the cut at, not a number of its own', () => {
    expect(STRIKE).toBe(STRIKE_PHASE);
  });

  it.each(STRUCK)('%s: tip at the point at the strike, mallet face on the chisel head, both poses present', (tool) => {
    const b = blow(tool, 1.5, 45);
    const poses = cycle.posesAt(b, null, STRIKE);
    expect(poses.map((p) => p.tool)).toEqual([tool, 'mallet']);
    const chisel = find(poses, tool);
    expect(toVector(chisel.position).distanceTo(toVector(b.point))).toBeLessThan(1e-9);
    const head = toVector(chisel.position).add(new Vector3(0, dimension(tool, 'shaftLength'), 0).applyQuaternion(fromQuat(chisel.quaternion)));
    expect(head.distanceTo(toVector(find(poses, 'mallet').position))).toBeLessThan(1e-9);
    // The mallet face (local -Y) points down the chisel axis toward the tip.
    const faceNormal = new Vector3(0, -1, 0).applyQuaternion(fromQuat(find(poses, 'mallet').quaternion));
    const axisDown = new Vector3(0, -1, 0).applyQuaternion(fromQuat(chisel.quaternion));
    expect(faceNormal.dot(axisDown)).toBeCloseTo(1, 6);
  });

  it.each(UNSTRUCK)('%s: working point at the blow point at the strike and no mallet', (tool) => {
    const poses = cycle.posesAt(blow(tool, 1.5, 40), null, STRIKE);
    expect(poses.map((p) => p.tool)).toEqual([tool]);
    expect(contactPoint(find(poses, tool)).distanceTo(new Vector3(0.2, 1.5, FRONT_Z))).toBeLessThan(1e-9);
  });

  it.each(['rasp', 'file', 'polish'] as const)('%s: lies on the stone by its working face, its axis above the surface by the face offset', (tool) => {
    expect(faceOffset(tool)).toBeGreaterThan(0.003);
    const b = blow(tool, 1.5, 10);
    const pose = find(cycle.posesAt(b, null, STRIKE), tool);
    const above = toVector(pose.position).sub(toVector(b.point)).dot(toVector(b.normal));
    expect(above).toBeGreaterThan(0.9 * faceOffset(tool));
    expect(above).toBeLessThanOrEqual(faceOffset(tool) + 1e-9);
    expect(contactPoint(pose).distanceTo(toVector(b.point))).toBeLessThan(1e-9);
  });

  it('settles the point at the sculptor’s stroke, steeply only for bulk cuts, and the toothed chisels within 35 to 60 degrees', () => {
    const angleOf = (b: Blow): number => {
      const chisel = find(cycle.posesAt(b, null, STRIKE), b.tool);
      const axis = new Vector3(0, 1, 0).applyQuaternion(fromQuat(chisel.quaternion));
      return Math.asin(axis.dot(toVector(b.normal))) / DEG;
    };
    expect(angleOf(blow('point', 1.5, 90))).toBeCloseTo(50, 6);
    expect(angleOf(blow('point', 1.5, 45))).toBeCloseTo(45, 6);
    expect(angleOf(blow('point', 1.5, 90, { size: 0.05 }))).toBeCloseTo(90, 6);
    expect(angleOf(blow('point', 1.5, 45, { size: 0.05 }))).toBeCloseTo(60, 6);
    expect(angleOf(blow('claw', 1.5, 20))).toBeCloseTo(35, 6);
    expect(angleOf(blow('claw', 1.5, 45))).toBeCloseTo(45, 6);
    expect(angleOf(blow('claw', 1.5, 80))).toBeCloseTo(60, 6);
    expect(angleOf(blow('drill', 1.5, 90))).toBeCloseTo(90, 6);
    expect(angleOf(blow('drill', 1.5, 80))).toBeCloseTo(90, 6);
    expect(angleOf(blow('drill', 1.5, 60))).toBeCloseTo(45, 6);
    expect(angleOf(blow('drill', 1.5, 40))).toBeCloseTo(40, 6);
    expect(angleOf(blow('drill', 1.5, 20))).toBeCloseTo(35, 6);
    expect(angleOf(blow('rasp', 1.5, 45))).toBeCloseTo(15, 6);
  });

  it('clamps a direction pointing out of the stone back into it', () => {
    const out = clampAngle(new Vector3(0, 0, 1), new Vector3(0, 0, 1), 30, 50);
    expect(Math.asin(-out.dot(new Vector3(0, 0, 1))) / DEG).toBeCloseTo(30, 6);
  });

  it.each([...STRUCK, ...UNSTRUCK])('%s: the settled shaft lies outside the half-space behind the surface, whatever direction the engine gives', (tool) => {
    const normals: [number, number, number][] = [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
      [0.6, 0.8, 0],
      [-0.5, 0.5, 0.707],
    ];
    const directions: [number, number, number][] = [
      [0, -0.707, -0.707],
      [0, 0, -1],
      [0.9, -0.1, -0.4],
      [0, 0.2, -0.98],
      [0.3, -0.95, 0.1],
    ];
    for (const n of normals) {
      const normal = new Vector3(...n).normalize();
      for (const d of directions) {
        const b: Blow = { tool, point: [0.2, 2.0, 0.6], normal: [normal.x, normal.y, normal.z], direction: d, size: 0.01, stroke: 0 };
        const posed = find(cycle.posesAt(b, null, STRIKE), tool);
        const [tip, far] = shaft(posed, toolLength(tool));
        expect(contactPoint(posed).distanceTo(new Vector3(0.2, 2.0, 0.6))).toBeLessThan(1e-9);
        expect(far.clone().sub(tip).dot(normal), `${tool} with normal ${n.join(',')} and direction ${d.join(',')}`).toBeGreaterThan(0.08 * toolLength(tool));
      }
    }
  });

  it('bites in by at most the blow size after the strike and lifts out before the cycle ends', () => {
    const b = blow('point', 1.5, 45, { size: 0.02 });
    let deepest = 0;
    for (let phase = 0; phase < 1; phase += 0.01) {
      const tip = toVector(find(cycle.posesAt(b, null, phase), 'point').position);
      const depth = -tip.clone().sub(toVector(b.point)).dot(toVector(b.normal));
      deepest = Math.max(deepest, depth);
      expect(depth, `phase ${phase.toFixed(2)}`).toBeLessThanOrEqual(b.size + 1e-9);
    }
    expect(deepest).toBeGreaterThan(b.size * 0.5);
    const end = toVector(find(cycle.posesAt(b, null, 1 - 1e-6), 'point').position);
    expect(end.distanceTo(toVector(b.point))).toBeLessThan(1e-6);
  });

  it('keeps the drill bit at the surface until the strike, feeds it in after the hole is cut and draws it out by the end', () => {
    const b = blow('drill', 1.5, 90, { direction: [0, 0, -1], size: 0.015 });
    const depthAt = (phase: number): number => -toVector(find(cycle.posesAt(b, null, phase), 'drill').position).sub(toVector(b.point)).dot(toVector(b.normal));
    for (let phase = APPROACH_END; phase < STRIKE; phase += 0.005) expect(Math.abs(depthAt(phase)), `phase ${phase.toFixed(3)} before the strike`).toBeLessThan(1e-9);
    expect(depthAt(STRIKE)).toBeLessThan(1e-9);
    expect(depthAt(STRIKE + 0.1)).toBeGreaterThan(0.2 * b.size);
    expect(depthAt(STRIKE + 0.2)).toBeGreaterThan(0.8 * b.size);
    let deepest = 0;
    for (let phase = STRIKE; phase < 1; phase += 0.005) {
      const depth = depthAt(phase);
      deepest = Math.max(deepest, depth);
      expect(depth).toBeLessThanOrEqual(b.size + 1e-9);
      expect(depth).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(deepest).toBeCloseTo(b.size, 6);
    expect(depthAt(1 - 1e-6)).toBeLessThan(1e-6);
  });

  it('moves continuously in phase within a blow and across blows, from the bench and along a stroke', () => {
    const first = blow('point', 1.5, 45);
    const second = blow('point', 1.48, 45, { stroke: 0 });
    const third = blow('point', 1.2, 45, { point: [0.4, 1.2, FRONT_Z], stroke: 1 });
    const steps = 200;
    const check = (b: Blow, previous: Blow | null, bound: number): void => {
      let before = cycle.posesAt(b, previous, 0);
      for (let i = 1; i <= steps; i += 1) {
        const now = cycle.posesAt(b, previous, Math.min(i / steps, 1 - 1e-9));
        for (const p of now) {
          const jump = toVector(p.position).distanceTo(toVector(find(before, p.tool).position));
          expect(jump, `${p.tool} at phase ${(i / steps).toFixed(3)} after ${previous === null ? 'rest' : `stroke ${String(previous.stroke)}`}`).toBeLessThan(bound);
        }
        before = now;
      }
    };
    check(first, null, 0.25);
    check(second, first, 0.04);
    check(third, second, 0.06);
    const endOfFirst = cycle.posesAt(first, null, 1 - 1e-9);
    const startOfSecond = cycle.posesAt(second, first, 0);
    for (const p of startOfSecond) expect(toVector(p.position).distanceTo(toVector(find(endOfFirst, p.tool).position))).toBeLessThan(1e-6);
    const endOfSecond = cycle.posesAt(second, first, 1 - 1e-9);
    const startOfThird = cycle.posesAt(third, second, 0);
    for (const p of startOfThird) expect(toVector(p.position).distanceTo(toVector(find(endOfSecond, p.tool).position))).toBeLessThan(1e-6);
  });

  it('slides the chisel along the stroke between blows of one stroke without a large lift', () => {
    const first = blow('point', 1.5, 45);
    const second = blow('point', 1.47, 45);
    const mid = toVector(find(cycle.posesAt(second, first, APPROACH_END / 2), 'point').position);
    const expected = new Vector3(0.2, 1.485, FRONT_Z);
    expect(mid.distanceTo(expected)).toBeLessThan(0.01);
    expect(mid.z).toBeGreaterThanOrEqual(FRONT_Z);
  });

  it('lifts out along the normal by at least the tool’s length between strokes on one face, the whole shaft staying outside the stone', () => {
    const first = blow('point', 1.5, 45, { point: [0.2, 1.5, FRONT_Z], stroke: 0 });
    const second = blow('point', 1.2, 45, { point: [0.6, 1.2, FRONT_Z], stroke: 1 });
    const length = toolLength('point');
    let highest = 0;
    for (let phase = 0; phase < APPROACH_END; phase += 0.002) {
      const [tip, far] = shaft(find(cycle.posesAt(second, first, phase), 'point'), length);
      highest = Math.max(highest, tip.z - FRONT_Z);
      for (const s of [0, 0.25, 0.5, 0.75, 1]) expect(tip.clone().lerp(far, s).z, `shaft point at phase ${phase.toFixed(3)}`).toBeGreaterThanOrEqual(FRONT_Z - 1e-6);
    }
    expect(highest).toBeGreaterThanOrEqual(length - 1e-6);
    // Blows of one stroke further apart than STROKE_SPAN carry too.
    const far = blow('point', 1.5, 45, { point: [0.2, 1.1, FRONT_Z], stroke: 0 });
    let farHighest = 0;
    for (let phase = 0; phase < APPROACH_END; phase += 0.002) farHighest = Math.max(farHighest, toVector(find(cycle.posesAt(far, first, phase), 'point').position).z - FRONT_Z);
    expect(farHighest).toBeGreaterThanOrEqual(length - 1e-6);
  });

  it('carries round the block’s corner between a front and a side face, every shaft point outside one of the two half-spaces', () => {
    const front = blow('claw', 2.0, 45, { point: [0.5, 2.0, FRONT_Z], stroke: 0 });
    const side: Blow = { tool: 'claw', point: [HALF_W, 2.0, 0.3], normal: [1, 0, 0], direction: [-0.707, -0.707, 0], size: 0.01, stroke: 1 };
    const length = toolLength('claw');
    for (let phase = 0; phase < APPROACH_END; phase += 0.002) {
      const [tip, far] = shaft(find(cycle.posesAt(side, front, phase), 'claw'), length);
      for (const s of [0, 0.5, 1]) {
        const p = tip.clone().lerp(far, s);
        const outsideFront = p.z >= FRONT_Z - 1e-6;
        const outsideSide = p.x >= HALF_W - 1e-6;
        expect(outsideFront || outsideSide, `shaft point ${p.toArray().map((n) => n.toFixed(3)).join(',')} at phase ${phase.toFixed(3)} is inside the corner`).toBe(true);
      }
    }
  });

  it.each([
    ['front', [0.0, 2.0, FRONT_Z], [0, 0, 1], [0, -0.707, -0.707]],
    ['right', [HALF_W, 2.0, 0.0], [1, 0, 0], [-0.707, -0.707, 0]],
    ['back', [0.0, 2.0, -FRONT_Z], [0, 0, -1], [0, -0.707, 0.707]],
    ['top', [0.0, BLOCK_M.height, 0.0], [0, 1, 0], [0.707, -0.707, 0]],
  ] as const)('carries the chisel and the mallet from the bench to the %s face without passing through the block', (_face, point, normal, direction) => {
    const b: Blow = { tool: 'point', point, normal, direction, size: 0.01, stroke: 0 };
    for (let phase = 0; phase < APPROACH_END; phase += 0.001) {
      for (const p of cycle.posesAt(b, null, phase)) {
        const position = toVector(p.position);
        expect(strictlyInsideBlock(position), `${p.tool} at phase ${phase.toFixed(3)} is inside the block at ${position.toArray().map((n) => n.toFixed(3)).join(',')}`).toBe(false);
      }
    }
    expect(toVector(find(cycle.posesAt(b, null, APPROACH_END), 'point').position).distanceTo(toVector(point))).toBeLessThan(1e-9);
  });

  it('keeps the mallet swinging on the side away from the stone and its arc within the swing radius', () => {
    const b = blow('point', 1.5, 45);
    for (let phase = APPROACH_END; phase < 1; phase += 0.02) {
      const poses = cycle.posesAt(b, null, phase);
      const mallet = toVector(find(poses, 'mallet').position);
      const chisel = find(poses, 'point');
      const head = toVector(chisel.position).add(new Vector3(0, dimension('point', 'shaftLength'), 0).applyQuaternion(fromQuat(chisel.quaternion)));
      expect(mallet.z, `mallet in front of the face at phase ${phase.toFixed(2)}`).toBeGreaterThan(FRONT_Z);
      expect(mallet.distanceTo(head)).toBeLessThanOrEqual(2 * SWING_RADIUS + 1e-9);
    }
    expect(swingAngle(STRIKE)).toBe(0);
    expect(swingAngle(0)).toBeCloseTo(swingAngle(1 - 1e-9), 3);
  });

  it('rests every tool flat on the bench in its own slot, with a unit quaternion', () => {
    const spots: Vector3[] = [];
    for (const id of CATALOG_IDS) {
      const rest = cycle.restPose(id);
      expect(rest.tool).toBe(id);
      const [x, y, z] = rest.position;
      expect(x, `${id} x`).toBeGreaterThanOrEqual(BENCH.xMin);
      expect(x, `${id} x`).toBeLessThanOrEqual(BENCH.xMax);
      expect(z, `${id} z`).toBeGreaterThanOrEqual(BENCH.zMin);
      expect(z, `${id} z`).toBeLessThanOrEqual(BENCH.zMax);
      expect(y, `${id} y`).toBeGreaterThanOrEqual(BENCH.top);
      expect(y, `${id} y`).toBeLessThanOrEqual(BENCH.top + 0.05);
      expect(Math.abs(fromQuat(rest.quaternion).length() - 1)).toBeLessThan(1e-9);
      const spot = new Vector3(x, 0, z);
      for (const other of spots) expect(spot.distanceTo(other), `${id} shares a slot`).toBeGreaterThan(0.015);
      spots.push(spot);
    }
    const axis = new Vector3(0, 1, 0).applyQuaternion(fromQuat(cycle.restPose('point').quaternion));
    expect(axis.x).toBeCloseTo(1, 6);
    expect(Math.abs(axis.y)).toBeLessThan(1e-6);
    const strawAxis = new Vector3(0, 1, 0).applyQuaternion(fromQuat(cycle.restPose('polish').quaternion));
    expect(Math.abs(strawAxis.y)).toBeLessThan(1e-6);
  });

  it('bounds reach by the scaffold’s decks and bridges (src/tools/scaffold.ts)', () => {
    expect(isReachable([0, 0.1, FRONT_Z])).toBe(true);
    expect(isReachable([-0.103, 4.707, 0.199])).toBe(true);
    expect(isReachable([0, 5.7, FRONT_Z])).toBe(false);
    expect(isReachable([0, -0.1, FRONT_Z])).toBe(false);
    expect(isReachable([5, 3, 5])).toBe(false);
  });

  it('gives a carry from the bench more time than a slide along a furrow', () => {
    const first = blow('point', 1.5, 45);
    const second = blow('point', 1.48, 45);
    const carry = cycle.approachSeconds(first, null);
    const slide = cycle.approachSeconds(second, first);
    expect(carry).toBeGreaterThan(1.5);
    expect(carry).toBeLessThanOrEqual(MAX_CARRY_SECONDS);
    expect(slide).toBeGreaterThanOrEqual(0.05);
    expect(slide).toBeLessThan(0.1);
  });

  it('is pure: the same inputs give the same poses, and the mallet rides with an interpolated chisel', () => {
    const b = blow('claw', 2.0, 40, { point: [-0.3, 2.0, FRONT_Z] });
    const a = cycle.posesAt(b, null, 0.42);
    const again = cycle.posesAt(b, null, 0.42);
    expect(a).toEqual(again);
    const quaternion = fromQuat(find(a, 'mallet').quaternion);
    expect(Math.abs(quaternion.length() - 1)).toBeLessThan(1e-9);
    expect(new Quaternion().copy(quaternion).normalize().equals(quaternion)).toBe(true);
  });
});
