/**
 * Camera presets (docs/design/spec.md, Page, View menu): fixed poses around the block in world metres, each named for what it frames.
 * The figure faces +Z and its right side is at −x (right = forward × up in the right-handed frame), so the right hand hangs at −x and the tree stump stands behind the right leg at (−x, −z); the sling runs over the left shoulder (+x) and down the back.
 * Heights come from src/david/frame.ts: the block is `BLOCK_M.height` tall and the statue `STATUE_HEIGHT_M` with its base; the head fills the top 0.7 m of the statue.
 * `free` is the orbit without a preset: it applies no pose when chosen from the menu and the default pose on load.
 */
import { BLOCK_M, STATUE_HEIGHT_M } from '../david/frame';
import type { CameraPose } from './query';

export type PresetId = 'front' | 'back' | 'left' | 'right' | 'three-quarter' | 'head' | 'hands' | 'sling-and-stump' | 'free';

export interface Preset {
  readonly id: PresetId;
  readonly label: string;
  readonly pose: CameraPose;
}

/** Query-only view id: frames the working tip of the blow in progress at the requested `t` (src/viewer/follow.ts), for the follow shots of the standard capture set. */
export const FOLLOW_VIEW = 'follow';

export const DEFAULT_PRESET: PresetId = 'three-quarter';

const MID = BLOCK_M.height / 2;
/** Distance that fits the whole block in a 45° vertical field at the capture aspect. */
const WHOLE = 10.5;
const HEAD_Y = STATUE_HEIGHT_M - 0.35;
const CENTRE: readonly [number, number, number] = [0, MID, 0];

export const PRESETS: readonly Preset[] = [
  { id: 'front', label: 'Front', pose: { position: [0, 3.2, WHOLE], target: CENTRE } },
  { id: 'back', label: 'Back', pose: { position: [0, 3.2, -WHOLE], target: CENTRE } },
  { id: 'left', label: 'Left', pose: { position: [-WHOLE, 3.2, 0], target: CENTRE } },
  { id: 'right', label: 'Right', pose: { position: [WHOLE, 3.2, 0], target: CENTRE } },
  { id: 'three-quarter', label: 'Three-quarter', pose: { position: [7, 4.2, 8.2], target: [0, MID - 0.15, 0] } },
  { id: 'head', label: 'Head', pose: { position: [0.9, HEAD_Y + 0.15, 2.3], target: [0, HEAD_Y, 0.15] } },
  // From just outside the front deck, between its posts, so no scaffold timber crosses the view.
  { id: 'hands', label: 'Hands', pose: { position: [-1.0, 2.55, 2.8], target: [-0.45, 2.3, 0.4] } },
  { id: 'sling-and-stump', label: 'Sling and stump', pose: { position: [-3.2, 2.0, -3.0], target: [-0.3, 1.6, -0.3] } },
  { id: 'free', label: 'Free orbit', pose: { position: [7, 4.2, 8.2], target: [0, MID - 0.15, 0] } },
];

export function findPreset(id: string | null): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function isPresetId(id: string | null): id is PresetId {
  return findPreset(id) !== undefined;
}
