/**
 * The tool bench and where each tool rests on it (docs/design/spec.md, Tools: tools are set down at rest positions when the step changes tool; docs/policies/local-rules.md: a tool rests where a sculptor would set it down).
 * The bench is a plank table the page builds: top at y = 0.85 m, x from -2.4 to -1.6 m, z from 1.0 to 1.6 m, beside the block's left front corner. Every tool lies flat in its own slot, tips toward the wall (-x), handles toward the block.
 * Slots: column A (tips at x = -2.37) holds the chisels, the rasp, the file, the charcoal and the brush; column B (x = -2.0) the mallet, the pumice, the straw and (the page's prop) the leather pad; the back strip (z from 1.38) the drill with its bow along x.
 */
import { Quaternion, Vector3 } from 'three';

import type { ToolPose } from '../contracts/making';
import type { CatalogId } from './catalog';
import { dimension } from './catalog';
import { quatFromBasis, toQuat } from './math';

export const BENCH = { top: 0.85, xMin: -2.4, xMax: -1.6, zMin: 1.0, zMax: 1.6 } as const;

const COLUMN_A_X = -2.37;
const COLUMN_B_X = -2.0;

interface Slot {
  /** World x of the tool's origin (its working tip) and world z of its axis. */
  readonly x: number;
  readonly z: number;
  /** How the tool lies: which world axes its local X, Y and Z take. */
  readonly lie: 'chisel' | 'face-down' | 'mallet' | 'drill';
  /** Height of the origin above the plank, metres: the half-thickness of whatever part touches the wood. */
  readonly lift: number;
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** Local +Y along world +X (tip toward the wall), the blade's width (local X) along world Z, the toothed face (local -Z) down. */
const LIE_CHISEL = quatFromBasis(Z, X, Y);
/** Working face on the plank: local axes unchanged. */
const LIE_FACE_DOWN = new Quaternion();
/** The mallet's head along world Z, its handle (local +Z) along world +X toward the block, the face (local -Y) toward -z. */
const LIE_MALLET = quatFromBasis(Y, Z, X);
/** The drill's spindle (local +Y) along world +Z, its bow (local X) along world -X so it lies across the bench, the bow side (local +Z) up. */
const LIE_DRILL = quatFromBasis(X.clone().negate(), Z, Y);

const LIES: Readonly<Record<Slot['lie'], Quaternion>> = { chisel: LIE_CHISEL, 'face-down': LIE_FACE_DOWN, mallet: LIE_MALLET, drill: LIE_DRILL };

const SLOTS: Readonly<Record<CatalogId, Slot>> = {
  point: { x: COLUMN_A_X, z: 1.012, lie: 'chisel', lift: dimension('point', 'shaftDiameter') / 2 },
  'two-tooth': { x: COLUMN_A_X, z: 1.045, lie: 'chisel', lift: dimension('two-tooth', 'shaftDiameter') / 2 },
  claw: { x: COLUMN_A_X, z: 1.078, lie: 'chisel', lift: dimension('claw', 'shaftDiameter') / 2 },
  'fine-claw': { x: COLUMN_A_X, z: 1.111, lie: 'chisel', lift: dimension('fine-claw', 'shaftDiameter') / 2 },
  roundel: { x: COLUMN_A_X, z: 1.144, lie: 'chisel', lift: dimension('roundel', 'shaftDiameter') / 2 },
  flat: { x: COLUMN_A_X, z: 1.177, lie: 'chisel', lift: dimension('flat', 'shaftDiameter') / 2 },
  rasp: { x: COLUMN_A_X, z: 1.21, lie: 'chisel', lift: dimension('rasp', 'thickness') / 2 + dimension('rasp', 'toothPitch') * 0.4 },
  file: { x: COLUMN_A_X, z: 1.24, lie: 'chisel', lift: dimension('file', 'thickness') / 2 + dimension('file', 'toothPitch') * 0.35 },
  charcoal: { x: COLUMN_A_X, z: 1.26, lie: 'chisel', lift: dimension('charcoal', 'diameter') / 2 },
  gilding: { x: COLUMN_A_X, z: 1.315, lie: 'chisel', lift: 0.002 },
  mallet: { x: COLUMN_B_X, z: 1.01, lie: 'mallet', lift: dimension('mallet', 'headWidth') / 2 },
  pumice: { x: COLUMN_B_X, z: 1.13, lie: 'face-down', lift: 0 },
  polish: { x: COLUMN_B_X, z: 1.195, lie: 'chisel', lift: dimension('polish', 'diameter') / 2 },
  drill: { x: COLUMN_B_X, z: 1.38, lie: 'drill', lift: 0.025 },
};

/** Where `tool` rests on the bench when it is not in use. */
export function benchPose(tool: CatalogId): ToolPose {
  const slot = SLOTS[tool];
  return { tool, position: [slot.x, BENCH.top + slot.lift, slot.z], quaternion: toQuat(LIES[slot.lie]) };
}

/** Rest spot for the page's leather pad prop, face down beside the straw; not a ToolPose because the pad has no tool id. */
export const LEATHER_PAD_REST = { position: [COLUMN_B_X + 0.08, BENCH.top, 1.29] as const, quaternion: toQuat(LIE_FACE_DOWN) } as const;
