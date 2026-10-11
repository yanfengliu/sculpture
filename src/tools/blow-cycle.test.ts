/**
 * The blow cycle's invariants (docs/design/spec.md, Tools): continuity in phase and across blows, the tip at the point at the strike, the mallet's face on the chisel's head at the strike, the documented angles, the bite bound, the rest poses on the bench and the reach bound.
 * Bound: poses are checked against the blow's own point and normal; whether a pose clips the stock elsewhere needs the stock and is the page's visual check.
 */
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import type { Blow, ToolId, ToolPose } from '../contracts/making';
import { BENCH } from './bench';
import { APPROACH_END, STRIKE, SWING_RADIUS, clampAngle, createBlowCycle, isReachable, swingAngle } from './blow-cycle';
import { CATALOG_IDS, dimension } from './catalog';
import { DEG, fromQuat, toVector } from './math';

const cycle = createBlowCycle();
const FRONT_Z = 0.7;

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

const STRUCK: readonly ToolId[] = ['point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat'];
const UNSTRUCK: readonly ToolId[] = ['charcoal', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

describe('blow cycle', () => {
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

  it.each(UNSTRUCK)('%s: tip at the point at the strike and no mallet', (tool) => {
    const poses = cycle.posesAt(blow(tool, 1.5, 40), null, STRIKE);
    expect(poses.map((p) => p.tool)).toEqual([tool]);
    expect(toVector(find(poses, tool).position).distanceTo(new Vector3(0.2, 1.5, FRONT_Z))).toBeLessThan(1e-9);
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
    expect(angleOf(blow('drill', 1.5, 20))).toBeCloseTo(35, 6);
    expect(angleOf(blow('rasp', 1.5, 45))).toBeCloseTo(15, 6);
  });

  it('clamps a direction pointing out of the stone back into it', () => {
    const out = clampAngle(new Vector3(0, 0, 1), new Vector3(0, 0, 1), 30, 50);
    expect(Math.asin(-out.dot(new Vector3(0, 0, 1))) / DEG).toBeCloseTo(30, 6);
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
    check(first, null, 0.12);
    check(second, first, 0.04);
    check(third, second, 0.04);
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
    // A chisel lies along the bench: its axis (local +Y) is horizontal along +x, so its tip is the lowest point and the handle points at the block.
    const axis = new Vector3(0, 1, 0).applyQuaternion(fromQuat(cycle.restPose('point').quaternion));
    expect(axis.x).toBeCloseTo(1, 6);
    expect(Math.abs(axis.y)).toBeLessThan(1e-6);
    const strawAxis = new Vector3(0, 1, 0).applyQuaternion(fromQuat(cycle.restPose('polish').quaternion));
    expect(Math.abs(strawAxis.y)).toBeLessThan(1e-6);
  });

  it('bounds reach by the scaffold decks and the block', () => {
    expect(isReachable([0, 0.1, 0.7])).toBe(true);
    expect(isReachable([1.0, 5.4, 0.7])).toBe(true);
    expect(isReachable([0, 5.7, 0.7])).toBe(false);
    expect(isReachable([0, -0.1, 0.7])).toBe(false);
    expect(isReachable([3, 1, 0])).toBe(false);
    expect(isReachable([0, 1, 2.5])).toBe(false);
  });

  it('gives a carry from the bench more time than a slide along a furrow', () => {
    const first = blow('point', 1.5, 45);
    const second = blow('point', 1.48, 45);
    const carry = cycle.approachSeconds(first, null);
    const slide = cycle.approachSeconds(second, first);
    expect(carry).toBeGreaterThan(1.5);
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
