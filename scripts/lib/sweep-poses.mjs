/**
 * The sweep's poses (scripts/sweep.mjs): a seeded generator of camera poses around the block, each outside the block as src/david/frame.ts sizes it and inside the orbit's limits (src/viewer/orbit-limits.ts), so the page keeps every pose exactly and the manifest describes the camera that rendered.
 * Pure and deterministic per seed; sweep-poses.test.ts pins both properties. The block's size is read from the frame, never restated (the sweep once carried a 2.1 × 5.5 × 1.4 m block of its own against the frame's 2.22 × 5.25 × 1.54 m).
 */
import { BLOCK_M } from '../../src/david/frame.ts';
import { poseProblem } from '../../src/viewer/orbit-limits.ts';

/** @typedef {readonly [number, number, number]} Vec3 */
/** @typedef {{ kind: 'whole' | 'close', yawDeg: number, pitchDeg: number, distance: number, target: Vec3, position: Vec3 }} SweepPose */

/** @type {Vec3} */
export const BLOCK_CENTRE = Object.freeze([0, BLOCK_M.height / 2, 0]);
/** The camera never goes below this height, metres. */
export const MIN_CAMERA_Y = 0.3;
/** How often a close pose that lands inside the block or outside the orbit limits is redrawn before the last draw is kept. */
export const REDRAWS = 20;
/** Whole poses target the block's centre: yaw anywhere; pitch 5° to 50° above the horizon; 6 to 14 m away. */
export const WHOLE = Object.freeze({ pitch: [5, 50], distance: [6, 14] });
/** Close poses target a random point on the block: yaw anywhere; pitch 2° to 40° (the orbit keeps the camera above its target's horizon, src/viewer/orbit-limits.ts); 1.5 to 4 m away. */
export const CLOSE = Object.freeze({
  pitch: [2, 40],
  distance: [1.5, 4],
  target: { x: [-BLOCK_M.width / 2, BLOCK_M.width / 2], y: [0.5, BLOCK_M.height - 0.05], z: [-BLOCK_M.depth / 2, BLOCK_M.depth / 2] },
});

/**
 * mulberry32: a small seeded generator, uniform in [0, 1), the same sequence for the same seed on every platform.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => number} random @param {readonly number[]} range */
const uniform = (random, [low = 0, high = 1]) => low + random() * (high - low);
/** @param {number} degrees */
const radians = (degrees) => (degrees * Math.PI) / 180;

/**
 * The camera `distance` metres from `target`, turned `yaw` degrees around +y (0 looks from +z, the front) and raised `pitch` degrees above the horizon, never below MIN_CAMERA_Y.
 * @param {Vec3} target @param {number} yaw @param {number} pitch @param {number} distance
 * @returns {Vec3}
 */
export function placeCamera(target, yaw, pitch, distance) {
  const [tx, ty, tz] = target;
  const flat = distance * Math.cos(radians(pitch));
  return [tx + flat * Math.sin(radians(yaw)), Math.max(MIN_CAMERA_Y, ty + distance * Math.sin(radians(pitch))), tz + flat * Math.cos(radians(yaw))];
}

/**
 * True inside the block's box as src/david/frame.ts sizes it, standing on the origin.
 * @param {Vec3} point
 */
export function insideBlock([x, y, z]) {
  return Math.abs(x) <= BLOCK_M.width / 2 && y >= 0 && y <= BLOCK_M.height && Math.abs(z) <= BLOCK_M.depth / 2;
}

/**
 * True when the page would render `pose` as given: the camera outside the block and inside the orbit's limits.
 * @param {SweepPose} pose
 */
export function acceptable(pose) {
  return !insideBlock(pose.position) && poseProblem(pose) === null;
}

/**
 * Pose `index` of the sweep (0-based): every third is close, the rest whole. An unacceptable pose is redrawn up to REDRAWS times, so the sequence stays deterministic per seed.
 * @param {() => number} random @param {number} index
 * @returns {SweepPose}
 */
export function drawPose(random, index) {
  const kind = index % 3 === 2 ? 'close' : 'whole';
  const range = kind === 'close' ? CLOSE : WHOLE;
  /** @returns {SweepPose} */
  const draw = () => {
    /** @type {Vec3} */
    const target = kind === 'close' ? [uniform(random, CLOSE.target.x), uniform(random, CLOSE.target.y), uniform(random, CLOSE.target.z)] : BLOCK_CENTRE;
    const yaw = random() * 360;
    const pitch = uniform(random, range.pitch);
    const distance = uniform(random, range.distance);
    return { kind, yawDeg: yaw, pitchDeg: pitch, distance, target, position: placeCamera(target, yaw, pitch, distance) };
  };
  let pose = draw();
  for (let attempt = 0; attempt < REDRAWS && !acceptable(pose); attempt += 1) pose = draw();
  return pose;
}

/**
 * Metres to 3 decimals, without a negative zero.
 * @param {number} value
 */
export function metres(value) {
  return Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3);
}

/**
 * The `cam=` value of a pose: position then target, metres to 3 decimals.
 * @param {{ position: Vec3, target: Vec3 }} pose
 */
export function cameraParam(pose) {
  return [...pose.position, ...pose.target].map(metres).join(',');
}
