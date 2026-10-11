/**
 * A minimal BlowCycle for the engine's development page: the chisel as a box at the blow point, lowered along its axis through the approach and lifted after the strike, no mallet, no chips.
 * The tools worker delivers the real cycle (src/tools/blow-cycle.ts); the page wires that one in.
 */
import { Quaternion, Vector3 } from 'three';

import type { BlowCycle, ToolPose } from '../../contracts/making';

const APPROACH_END = 0.6;
const RECOIL_START = 0.7;
const LIFT = 0.05;
const UP = new Vector3(0, 1, 0);

export const devBlowCycle: BlowCycle = {
  posesAt(blow, _previous, phase): ToolPose[] {
    const lift = phase < APPROACH_END ? LIFT * (1 - phase / APPROACH_END) : phase < RECOIL_START ? 0 : LIFT * 0.4 * ((phase - RECOIL_START) / (1 - RECOIL_START));
    const direction = new Vector3(...blow.direction).normalize();
    const position = new Vector3(...blow.point).addScaledVector(direction, -lift);
    // The tool's shaft runs along +Y from its tip; it points back up the axis, away from the stone.
    const quaternion = new Quaternion().setFromUnitVectors(UP, direction.clone().negate());
    return [{ tool: blow.tool, position: [position.x, position.y, position.z], quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] }];
  },
  chipsAt() {
    return [];
  },
  restPose(tool): ToolPose {
    return { tool, position: [1.6, 0.9, 1.2], quaternion: [0, 0, 0, 1] };
  },
};
