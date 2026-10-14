/**
 * The regions of docs/design/choreography.md as boxes in world metres on the figure placed by src/david/frame.ts (coordinator-owned).
 * The figure faces +z; its left is +x. Bands were read off the pipeline's silhouettes of the fetched mesh (output/model/front.png, left.png, back.png, 215 px per metre) and the reference photographs in docs/research/references.md, so every number here is an inference to check against captures.
 * The sling and the stump are masks read from the David grid itself (public/model/david.json, 8 mm cells): the strap a tube around a polyline on its surface, the stump a stack of horizontal slices; their comments give the probe's evidence.
 */
import type { RegionDef, Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';

const WIDE = 1.3;
const DEEP = 1.0;
/** Regions reach above the block's top (5.25 m), not only the statue's (5.17 m): a region capped at the statue left the top 8 cm of the block as a slab floating over the head, seen in the captures of 2026-10-11. */
const TOP = BLOCK_M.height + 0.05;

function box(label: string, y0: number, y1: number, x0 = -WIDE, x1 = WIDE, z0 = -DEEP, z1 = DEEP, contains?: RegionDef['contains']): RegionDef {
  const region: RegionDef = { label, min: [x0, y0, z0], max: [x1, y1, z1] };
  return contains === undefined ? region : { ...region, contains };
}

const facing = (axis: 0 | 1 | 2, sign: 1 | -1, least: number) => (_point: Vec3, normal: Vec3): boolean => sign * normal[axis] > least;

/** A point of a polyline tube: x, y, z and the tube's radius there, metres. */
export type TubePoint = readonly [number, number, number, number];

/** A horizontal slice of a mask: its height y, then its box in that plane, x0 ≤ x ≤ x1 and z0 ≤ z ≤ z1, metres. */
export type Slice = readonly [number, number, number, number, number];

/** A predicate true within `radius` of the polyline through `points`: one radius for the whole polyline, or one per point interpolated along each segment. */
export function tube(points: readonly Vec3[], radius: number | readonly number[]): NonNullable<RegionDef['contains']> {
  const radii = typeof radius === 'number' ? points.map(() => radius) : radius;
  if (points.length === 0) throw new Error('a tube needs at least one point');
  if (radii.length !== points.length) throw new Error(`a tube with ${String(points.length)} points was given ${String(radii.length)} radii; give one radius or one per point`);
  return (point) => {
    for (let n = 0; n < points.length; n += 1) {
      const a = points[n] ?? [0, 0, 0];
      const b = points[n + 1] ?? a;
      const ra = radii[n] ?? 0;
      const rb = radii[n + 1] ?? ra;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const length2 = dx * dx + dy * dy + dz * dz;
      let t = length2 > 0 ? ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy + (point[2] - a[2]) * dz) / length2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const distance = Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t), point[2] - (a[2] + dz * t));
      if (distance <= ra + (rb - ra) * t) return true;
    }
    return false;
  };
}

/** The box around a tube: the points' extent plus each point's radius. */
function tubeBox(points: readonly Vec3[], radii: readonly number[]): { min: Vec3; max: Vec3 } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  points.forEach((p, n) => {
    const r = radii[n] ?? 0;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? Infinity, (p[axis] ?? 0) - r);
      max[axis] = Math.max(max[axis] ?? -Infinity, (p[axis] ?? 0) + r);
    }
  });
  return { min, max };
}

/** A predicate for a stack of horizontal slices sorted by height: between two slices the box is interpolated, and the first and the last hold for `reach` metres beyond them. */
export function stack(slices: readonly Slice[], reach: number): NonNullable<RegionDef['contains']> {
  const first = slices[0];
  const last = slices[slices.length - 1];
  if (first === undefined || last === undefined) throw new Error('a stack needs at least one slice');
  return (point) => {
    const y = point[1];
    if (y < first[0] - reach || y > last[0] + reach) return false;
    let n = 0;
    while (n + 1 < slices.length && (slices[n + 1]?.[0] ?? Infinity) < y) n += 1;
    const a = slices[n] ?? first;
    const b = slices[n + 1] ?? a;
    const t = b[0] > a[0] ? Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))) : 0;
    const at = (c: 1 | 2 | 3 | 4): number => a[c] + (b[c] - a[c]) * t;
    return point[0] >= at(1) && point[0] <= at(2) && point[2] >= at(3) && point[2] <= at(4);
  };
}

/** The box around a stack: the slices' extent, `reach` beyond the first and the last. */
function stackBox(slices: readonly Slice[], reach: number): { min: Vec3; max: Vec3 } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const [y, x0, x1, z0, z1] of slices) {
    min[0] = Math.min(min[0], x0);
    max[0] = Math.max(max[0], x1);
    min[1] = Math.min(min[1], y - reach);
    max[1] = Math.max(max[1], y + reach);
    min[2] = Math.min(min[2], z0);
    max[2] = Math.max(max[2], z1);
  }
  return { min, max };
}

/** The whole figure. */
export const WHOLE = box('whole', 0, TOP);
/** The principal view: surfaces facing the front. */
export const FRONT = box('front', 0, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(2, 1, 0.2));
export const BACK = box('back', 0, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(2, -1, 0.2));
export const LEFT_SIDE = box('left-side', 0, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(0, 1, 0.6));
export const RIGHT_SIDE = box('right-side', 0, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(0, -1, 0.6));
/** The left knee and the right hand, the parts nearest the front face of the block. */
export const HIGH_POINTS = box('high-points', 1.3, 3.2, -WIDE, WIDE, -DEEP, DEEP, facing(2, 1, 0.5));
export const CHEST_AND_FACE = box('chest-and-face', 3.2, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(2, 1, 0.2));
/** The head with its hair. */
export const HEAD = box('head', 4.36, TOP);
/** The crown and the curls; keeps its tooth texture. */
export const HAIR = box('hair', 4.78, TOP, -WIDE, WIDE, -DEEP, DEEP, facing(1, 1, -0.2));
/** Eyes, nose and mouth. */
export const FACE = box('face', 4.5, 4.82, -WIDE, WIDE, -DEEP, DEEP, facing(2, 1, 0.3));
/** The hand at the shoulder, holding the sling. */
export const LEFT_HAND = box('left-hand', 3.95, 4.4, 0.05, 0.6, -0.3, DEEP);
/** The hand at the thigh, with the stone. */
export const RIGHT_HAND = box('right-hand', 2.0, 2.45, -0.95, -0.5, -0.4, DEEP);

/**
 * The sling strap on the David grid, traced 2026-10-11 from the grid's depth maps (the first zero crossing of the signed distance along a ray) under grazing light from +x and −x and from the steps those maps take at the band's two edges; the probe lived under tmp/ and is not kept.
 * The strap is a raised band 4 to 29 mm proud whose edges swap brightness when the light swaps sides, so both lines are flanks of one band, not grooves. It is 16 cm wide where it comes over the shoulder behind the neck (y 4.40: x −0.134 to 0.026), 10 to 12 cm down the back (y 3.90: −0.174 to −0.070; y 3.40: −0.310 to −0.166; y 3.08: −0.518 to −0.342), then wraps the right hip, where only its back edge shows from the side (y 2.80: z −0.186; y 2.40: z 0.030) and the arm hides its front edge, and ends in the right hand.
 * Over the shoulder top only the +x edge shows from above, a lit line from under the fingers (x 0.168, z 0.13) back to (x 0.024, z −0.40); the strap lies between that line and the neck's foot. The polyline runs the band's centre on the surface (|sdf| ≤ 4 mm at every point); each radius is the band's half-width there.
 * Surface inside the tube on the David: 0.41 m² (surface cells with |sdf| under half a cell, times the cell's area), none above y 4.47 (the nape), a deltoid point 15 cm from the strap outside; the box it replaces held 1.14 m² with the left shoulder, the upper arm and the upper back.
 */
export const SLING_PATH: readonly TubePoint[] = [
  [0.105, 4.267, 0.04, 0.045],
  [0.078, 4.339, -0.1, 0.045],
  [0.0, 4.432, -0.22, 0.07],
  [-0.05, 4.405, -0.32, 0.075],
  [-0.078, 4.2, -0.451, 0.072],
  [-0.104, 4.0, -0.462, 0.06],
  [-0.13, 3.8, -0.476, 0.058],
  [-0.148, 3.7, -0.467, 0.072],
  [-0.168, 3.6, -0.446, 0.078],
  [-0.2, 3.5, -0.416, 0.078],
  [-0.234, 3.4, -0.376, 0.07],
  [-0.27, 3.34, -0.348, 0.065],
  [-0.31, 3.24, -0.313, 0.068],
  [-0.338, 3.2, -0.303, 0.075],
  [-0.442, 3.08, -0.24, 0.07],
  [-0.462, 3.04, -0.228, 0.068],
  [-0.558, 2.96, -0.15, 0.065],
  [-0.598, 2.88, -0.16, 0.065],
  [-0.648, 2.8, -0.11, 0.065],
  [-0.68, 2.7, -0.05, 0.065],
  [-0.702, 2.6, 0.005, 0.065],
  [-0.721, 2.5, 0.05, 0.065],
  [-0.725, 2.4, 0.09, 0.065],
  [-0.717, 2.33, 0.125, 0.06],
];
const SLING_POINTS: readonly Vec3[] = SLING_PATH.map(([x, y, z]) => [x, y, z]);
const SLING_RADII: readonly number[] = SLING_PATH.map((p) => p[3]);
/** The strap over the left shoulder and down the back to the right hand. */
export const SLING: RegionDef = { label: 'sling', ...tubeBox(SLING_POINTS, SLING_RADII), contains: tube(SLING_POINTS, SLING_RADII) };

/**
 * The tree stump (the broncone) on the David grid, 2026-10-11: each horizontal cross-section's inside cells were split by a watershed on the grid's own depth (cells taken from the deepest outward, each joining a labelled neighbour, the two basins seeded behind and before z −0.2), the probe under tmp/ and not kept.
 * The stump is its own component with a gap of one or two cells from the calf for y 0.388 to 0.852 and from 1.188 up to its top; it is fused to the heel below 0.388 and to the back of the calf from 0.86 to 1.18, where the basins meet along a flat line in z (−0.17 at the heel, −0.25 behind the calf). So each slice is a box: the stump's extent plus 12 mm on its three free sides, and on the leg's side the cut between the basins, the lowest over the two slices either way, so the calf is never inside.
 * Slice sizes: 2,300 to 2,700 cells (147 to 173 cm²) below y 0.8, 1,000 to 1,400 from 0.83 to 1.44 (two prongs from 1.37 to 1.43), the last prong 95 cells at 1.564 and none from 1.588; slices every 32 mm, interpolated between. Surface inside the stack: 1.55 m², matching the stump's own surface cells to within 50 cm² per 10 cm of height; the box it replaced held 1.63 m² with the calf's back and the right lower leg and missed the stump's faces toward the front.
 */
export const STUMP_SLICES: readonly Slice[] = [
  [0.284, -0.47, 0.162, -0.586, -0.17],
  [0.316, -0.478, 0.106, -0.578, -0.178],
  [0.348, -0.486, 0.09, -0.594, -0.178],
  [0.38, -0.51, 0.082, -0.61, -0.178],
  [0.412, -0.526, 0.074, -0.602, -0.178],
  [0.444, -0.526, 0.066, -0.586, -0.178],
  [0.476, -0.55, 0.05, -0.538, -0.174],
  [0.508, -0.566, 0.026, -0.538, -0.17],
  [0.54, -0.59, 0.018, -0.554, -0.174],
  [0.572, -0.614, 0.01, -0.562, -0.174],
  [0.604, -0.638, 0.01, -0.562, -0.178],
  [0.636, -0.654, 0.018, -0.53, -0.178],
  [0.668, -0.654, 0.01, -0.514, -0.182],
  [0.7, -0.638, 0.01, -0.514, -0.186],
  [0.732, -0.622, -0.014, -0.506, -0.194],
  [0.764, -0.598, -0.03, -0.498, -0.202],
  [0.796, -0.574, -0.038, -0.482, -0.202],
  [0.828, -0.438, -0.046, -0.49, -0.21],
  [0.86, -0.446, -0.046, -0.514, -0.21],
  [0.892, -0.446, -0.046, -0.538, -0.218],
  [0.924, -0.43, -0.038, -0.554, -0.234],
  [0.956, -0.422, -0.038, -0.554, -0.226],
  [0.988, -0.43, -0.046, -0.546, -0.218],
  [1.02, -0.422, -0.046, -0.53, -0.25],
  [1.052, -0.43, -0.054, -0.49, -0.258],
  [1.084, -0.454, -0.054, -0.474, -0.25],
  [1.116, -0.47, -0.054, -0.474, -0.226],
  [1.148, -0.446, -0.046, -0.474, -0.25],
  [1.18, -0.438, -0.038, -0.474, -0.254],
  [1.212, -0.446, -0.046, -0.474, -0.25],
  [1.244, -0.454, -0.054, -0.474, -0.25],
  [1.276, -0.454, -0.062, -0.482, -0.254],
  [1.308, -0.462, -0.062, -0.482, -0.254],
  [1.34, -0.47, -0.062, -0.482, -0.25],
  [1.372, -0.47, -0.054, -0.482, -0.246],
  [1.404, -0.462, -0.046, -0.482, -0.242],
  [1.436, -0.438, -0.046, -0.474, -0.238],
  [1.468, -0.262, -0.046, -0.474, -0.234],
  [1.5, -0.254, -0.062, -0.474, -0.23],
  [1.532, -0.238, -0.062, -0.466, -0.234],
  [1.564, -0.222, -0.078, -0.458, -0.274],
];
/** The stack's slices hold this far below the first (the rock's top) and above the last (the prong's tip, a cell and a half higher). */
const STUMP_REACH = 0.012;
/** The tree stump behind the right leg. */
export const STUMP: RegionDef = { label: 'stump', ...stackBox(STUMP_SLICES, STUMP_REACH), contains: stack(STUMP_SLICES, STUMP_REACH) };

/** The rock the figure stands on; left rough. */
export const BASE = box('base', 0, 0.3);
/** What is rasped and polished: the figure above the rock, minus the hair, the sling and the stump. */
export const FLESH: RegionDef = {
  label: 'flesh',
  min: [-WIDE, 0.3, -DEEP],
  max: [WIDE, TOP, DEEP],
  contains: (point, normal) => !inside(HAIR, point, normal) && !inside(SLING, point, normal) && !inside(STUMP, point, normal),
};

/** A 0.2 m box at the chest where the knot stood, on the front. */
export const NODO = box('nodo', 3.7, 3.9, -0.1, 0.1, 0.2, DEEP);

/** Whether a figure-surface point with its outward normal lies in the region. */
export function inside(region: RegionDef, point: Vec3, normal: Vec3): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis] ?? 0;
    if (value < (region.min[axis] ?? 0) || value > (region.max[axis] ?? 0)) return false;
  }
  return region.contains === undefined ? true : region.contains(point, normal);
}

/** The union of regions, over the box that holds them all. */
export function union(label: string, ...regions: readonly RegionDef[]): RegionDef {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const region of regions) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? Infinity, region.min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? -Infinity, region.max[axis] ?? 0);
    }
  }
  return { label, min, max, contains: (point, normal) => regions.some((region) => inside(region, point, normal)) };
}

/** The crown of the head, where Condivi saw the block's old crust left: untouched after the point. */
export const CROWN = box('crown', 5.08, TOP + 0.1, -WIDE, WIDE, -DEEP, DEEP, facing(1, 1, 0.8));

/** The whole figure except the crown, for the passes that bring the skin to its last millimetres. */
export const WHOLE_BUT_CROWN: RegionDef = { label: 'whole-but-crown', min: WHOLE.min, max: WHOLE.max, contains: (point, normal) => !inside(CROWN, point, normal) };

/** The sides and the back together, reached last in the same order of tools. */
export const SIDES_AND_BACK = union('sides-and-back', LEFT_SIDE, RIGHT_SIDE, BACK);
/** Where the roundel scoops: the head's hollows and the two hands. */
export const HOLLOWS = union('hollows', HEAD, LEFT_HAND, RIGHT_HAND);
/** What the files and the last touches refine. */
export const DETAILS = union('details', FACE, LEFT_HAND, RIGHT_HAND);
/** What was gilded in 1504. */
export const GILT = union('gilt', SLING, STUMP);

/** A region cut to the front half of the block (z at or above -0.1), the half relief Cellini describes; `back` the same from behind. */
export function relief(region: RegionDef, side: 'front' | 'back'): RegionDef {
  const min: Vec3 = side === 'front' ? [region.min[0], region.min[1], -0.1] : region.min;
  const max: Vec3 = side === 'back' ? [region.max[0], region.max[1], 0.1] : region.max;
  const result: RegionDef = { label: `${region.label}-${side}-relief`, min, max };
  return region.contains === undefined ? result : { ...result, contains: region.contains };
}

export const REGIONS: readonly RegionDef[] = [WHOLE, FRONT, BACK, LEFT_SIDE, RIGHT_SIDE, HIGH_POINTS, CHEST_AND_FACE, HEAD, HAIR, FACE, LEFT_HAND, RIGHT_HAND, SLING, STUMP, BASE, FLESH, NODO, CROWN, WHOLE_BUT_CROWN, SIDES_AND_BACK, HOLLOWS, DETAILS, GILT];
