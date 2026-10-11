/**
 * Normalisation of the fetched figure into the world frame (docs/design/spec.md, World frame): +Y up, the figure facing +Z, the footprint centred on the origin, the lowest point on y = 0, the height scaled to the statue's documented height, then the figure offset.
 * Every rotation is proper (determinant +1): a mirrored David would carry the sling over the wrong shoulder.
 *
 * Decisions, each logged with its numbers:
 * - Up: the longest axis of the bounding box; its bottom end is the one whose end slab (3 percent of the length) has the larger footprint, because the rock base is wide and the top of the head is small.
 * - Left-right axis: the horizontal axis with the larger extent (the figure is wider across the shoulders and arms than it is deep).
 * - Front: with the figure facing +Z its right side is −X. David's right arm hangs with the hand by the right thigh and his right hip juts, so in the thigh band (40 to 55 percent of the height) the figure reaches further from the footprint centre on its right; when the +X side reaches further, the figure is turned 180 degrees about Y. A 180° turn flips this statistic, so it decides.
 * - Chirality check: David's left leg is forward and the tree stump stands behind his right leg, so in the lower-leg band (15 to 35 percent of the height) the +X half has the larger mean z. A 180° turn leaves this statistic unchanged, so it cannot decide the facing, but a mirror image flips it: when it fails after the turn the model is mirrored and the caller stops.
 */
import { boundingBox } from './topology.mjs';

const END_SLAB_FRACTION = 0.03;
const LEG_BAND = [0.15, 0.35];
const THIGH_BAND = [0.4, 0.55];

/** A 3×3 rotation as nine numbers in row-major order. */
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Rotations taking the longest axis (with its sign) to +Y: for +Z, −90° about X; for −Z, +90° about X; for +X, +90° about Z; for −X, −90° about Z; for −Y, 180° about X. */
const TO_Y = {
  '2+': [1, 0, 0, 0, 0, 1, 0, -1, 0],
  '2-': [1, 0, 0, 0, 0, -1, 0, 1, 0],
  '0+': [0, -1, 0, 1, 0, 0, 0, 0, 1],
  '0-': [0, 1, 0, -1, 0, 0, 0, 0, 1],
  '1+': IDENTITY,
  '1-': [1, 0, 0, 0, -1, 0, 0, 0, -1],
};
/** +90° about Y: (x, y, z) → (z, y, −x), which swaps the horizontal axes. */
const SWAP_HORIZONTAL = [0, 0, 1, 0, 1, 0, -1, 0, 0];
/** 180° about Y: (x, y, z) → (−x, y, −z). */
const TURN_AROUND = [-1, 0, 0, 0, 1, 0, 0, 0, -1];

function multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}

function determinant(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/**
 * Applies `rotation`, then `scale`, then `translation` to every point of `positions`, into a new array of the same type.
 * @param {Float32Array} positions
 * @param {number[]} rotation
 * @param {number} scale
 * @param {number[]} translation
 */
export function transformPositions(positions, rotation, scale, translation) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    out[i] = (rotation[0] * x + rotation[1] * y + rotation[2] * z) * scale + translation[0];
    out[i + 1] = (rotation[3] * x + rotation[4] * y + rotation[5] * z) * scale + translation[1];
    out[i + 2] = (rotation[6] * x + rotation[7] * y + rotation[8] * z) * scale + translation[2];
  }
  return out;
}

/** Footprint area (bounding rectangle of the two axes other than `axis`) of the points whose `axis` coordinate lies in [lo, hi]. */
function slabFootprint(positions, axis, lo, hi) {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  let count = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const a = positions[i + axis];
    if (a < lo || a > hi) continue;
    count += 1;
    const pu = positions[i + u];
    const pv = positions[i + v];
    if (pu < umin) umin = pu;
    if (pu > umax) umax = pu;
    if (pv < vmin) vmin = pv;
    if (pv > vmax) vmax = pv;
  }
  return { area: count > 0 ? (umax - umin) * (vmax - vmin) : 0, count };
}

/**
 * The rotation taking the longest axis to +Y with the base at the bottom, and the evidence.
 * @param {Float32Array} positions
 */
export function decideUp(positions) {
  const box = boundingBox(positions);
  let axis = 0;
  for (let a = 1; a < 3; a += 1) if (box.extent[a] > box.extent[axis]) axis = a;
  const slab = box.extent[axis] * END_SLAB_FRACTION;
  const low = slabFootprint(positions, axis, box.min[axis], box.min[axis] + slab);
  const high = slabFootprint(positions, axis, box.max[axis] - slab, box.max[axis]);
  const baseAtMin = low.area >= high.area;
  const sign = baseAtMin ? '+' : '-';
  return {
    axis: 'xyz'[axis],
    baseAtMin,
    lowSlabArea: low.area,
    highSlabArea: high.area,
    rotation: TO_Y[`${String(axis)}${sign}`],
    box,
  };
}

/** Mean z of the points in the height band [lo, hi] (fractions of the height) on the half `sideSign` of x. */
function bandMeanZ(positions, box, band, sideSign) {
  const lo = box.min[1] + band[0] * box.extent[1];
  const hi = box.min[1] + band[1] * box.extent[1];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    if (y < lo || y > hi) continue;
    if (Math.sign(positions[i]) !== sideSign) continue;
    sum += positions[i + 2];
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/** Extent of x on each side of the footprint centre in the height band [lo, hi]: the hanging right hand and the jutting right hip reach further on the right (−X) than the left side does. */
function bandReach(positions, box, band) {
  const lo = box.min[1] + band[0] * box.extent[1];
  const hi = box.min[1] + band[1] * box.extent[1];
  const centre = (box.min[0] + box.max[0]) / 2;
  let left = 0;
  let right = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    if (y < lo || y > hi) continue;
    const x = positions[i] - centre;
    if (x > left) left = x;
    if (-x > right) right = -x;
  }
  return { left, right };
}

/**
 * With the figure already +Y up: picks the left-right axis, then the facing by the thigh-band reach, then checks the chirality by the lower-leg band; returns the yaw rotation and the evidence.
 * @param {Float32Array} upright
 */
export function decideFront(upright) {
  const box = boundingBox(upright);
  const swapped = box.extent[2] > box.extent[0];
  let rotation = swapped ? SWAP_HORIZONTAL : IDENTITY;
  let positions = swapped ? transformPositions(upright, rotation, 1, [0, 0, 0]) : upright;
  const reach = bandReach(positions, boundingBox(positions), THIGH_BAND);
  const turned = reach.left > reach.right;
  if (turned) {
    rotation = multiply(TURN_AROUND, rotation);
    positions = transformPositions(upright, rotation, 1, [0, 0, 0]);
  }
  const finalBox = boundingBox(positions);
  const centreX = (finalBox.min[0] + finalBox.max[0]) / 2;
  const centred = transformPositions(positions, IDENTITY, 1, [-centreX, 0, 0]);
  const leftHalfMeanZ = bandMeanZ(centred, finalBox, LEG_BAND, 1);
  const rightHalfMeanZ = bandMeanZ(centred, finalBox, LEG_BAND, -1);
  return {
    swappedHorizontalAxes: swapped,
    thighBand: THIGH_BAND,
    thighReachLeft: turned ? reach.right : reach.left,
    thighReachRight: turned ? reach.left : reach.right,
    turnedAround: turned,
    legBand: LEG_BAND,
    leftHalfMeanZ,
    rightHalfMeanZ,
    /** False when the +X half does not lead in z after the turn: the model is a mirror image, which no proper rotation fixes. */
    chiralityOk: leftHalfMeanZ > rightHalfMeanZ,
    rotation,
  };
}

/**
 * The whole normalisation: rotation (up, then yaw), uniform scale to `height`, translation centring the footprint on the origin with the lowest point at y = 0, plus `offset`.
 * @param {Float32Array} positions
 * @param {number} height metres
 * @param {{ x: number, y: number, z: number }} offset
 */
export function normalise(positions, height, offset) {
  const up = decideUp(positions);
  const upright = transformPositions(positions, up.rotation, 1, [0, 0, 0]);
  const front = decideFront(upright);
  const rotation = multiply(front.rotation, up.rotation);
  if (Math.abs(determinant(rotation) - 1) > 1e-9) throw new Error(`normalise: the rotation has determinant ${String(determinant(rotation))}, not +1; it would mirror the figure.`);
  const rotated = transformPositions(positions, rotation, 1, [0, 0, 0]);
  const rotatedBox = boundingBox(rotated);
  const scale = height / rotatedBox.extent[1];
  const translation = [
    -((rotatedBox.min[0] + rotatedBox.max[0]) / 2) * scale + offset.x,
    -rotatedBox.min[1] * scale + offset.y,
    -((rotatedBox.min[2] + rotatedBox.max[2]) / 2) * scale + offset.z,
  ];
  const result = transformPositions(positions, rotation, scale, translation);
  return { positions: result, rotation, scale, translation, up, front, rawBox: up.box, box: boundingBox(result) };
}

/** The 4×4 matrix (row-major) of a rotation, scale and translation, for the log. */
export function matrixRows(rotation, scale, translation) {
  const row = (r) => [rotation[r * 3] * scale, rotation[r * 3 + 1] * scale, rotation[r * 3 + 2] * scale, translation[r]];
  return [row(0), row(1), row(2), [0, 0, 0, 1]];
}
