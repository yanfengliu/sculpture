/**
 * The drill's targets on the David (docs/research/technique.md, Stage 5): the head's landmarks from the probed tables of ./regions.ts, and the gaps the chisel cannot reach between the fingers, under the sling and by the stump, out of ./david-steps.ts to keep it short.
 */
import { facePair, NOSTRILS_MARK, onHeadRing, PUPILS_MARK } from './regions';

/**
 * The drill's landmarks on the head, built from the probed tables of ./regions.ts (HAIR_AXIS, the hairline, the head's radii and FACE_AZIMUTH), so every target lies on the David's surface and lands in its step's region; the values read off photographs before (review F16) were centred near x 0 facing +z, 10 cm off a head whose axis is at x −0.323 and whose face looks toward azimuth 38, so the generator moved them to the wrong part of the head or dropped them.
 * The hairline path runs the face side of the hairline from the left temple to the right (azimuth 337.5 to 90), 1 cm above it so its holes fall in HAIR; the curls ring runs 8 cm above the hairline round the whole head, open at the nape (from 202.5 round to 180): the generator drills every segment's start and the last segment's end, so a ring closed on its first vertex would get two holes at the seam. The pupils and the nostrils are the face marks' pairs. The David-grid case of ./david-steps.test.ts checks them.
 */
export const DAVID_LANDMARKS: Readonly<Record<'hairline' | 'curls' | 'pupils' | 'nostrils', readonly [number, number, number][]>> = {
  hairline: [337.5, 0, 22.5, 45, 67.5, 90].map((azimuth) => onHeadRing(azimuth, 'hairline')),
  curls: Array.from({ length: 16 }, (_, n) => onHeadRing((202.5 + n * 22.5) % 360, 'curls')),
  pupils: facePair(PUPILS_MARK),
  nostrils: facePair(NOSTRILS_MARK),
};
export const FINGER_GAPS: readonly [number, number, number][] = [
  [0.26, 4.15, 0.22],
  [0.29, 4.08, 0.22],
  [0.31, 4.02, 0.2],
];
export const SLING_GAP: readonly [number, number, number][] = [[0.34, 4.35, -0.05]];
export const STUMP_GAPS: readonly [number, number, number][] = [
  [-0.3, 1.0, -0.2],
  [-0.3, 0.8, -0.25],
];
