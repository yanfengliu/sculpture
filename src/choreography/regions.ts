/**
 * The regions of docs/design/choreography.md as boxes in world metres on the figure placed by src/david/frame.ts (coordinator-owned).
 * The figure faces +z; its left is +x. Bands were read off the pipeline's silhouettes of the fetched mesh (output/model/front.png, left.png, back.png, 215 px per metre) and the reference photographs in docs/research/references.md, so every number here is an inference to check against captures.
 * The sling and the stump are masks read from the David grid itself (public/model/david.json, 8 mm cells): the strap a tube around a polyline on its surface, the stump a stack of horizontal slices; their comments give the probe's evidence. The hairline, the head's radii and the face marks are read from the same grid, for HAIR and FACE and for the drill's landmarks in ./david-steps.ts.
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
/**
 * The hairline on the David grid, probed 2026-10-13 (a read-only probe under tmp/, not kept): the head's surface cells above y 4.7 have their centroid at x -0.323, z -0.008, which is the head's axis; around it, per 22.5 degrees of azimuth (0 along +x, 90 along +z), the height where the surface's roughness (the mean magnitude of the figure field's Laplacian over 1 cm of height) steps from the smooth skin (5 to 30 per metre) to the curls (60 to 140) is the hairline.
 * The face looks toward azimuth 25 to 45 (turned about 50 degrees from +z toward the figure's left): there the forehead is smooth to 4.93 and the curls begin at 4.95 (ratios of 4 to 6, the clearest steps); at azimuth 90 and 338 the step is at 4.84 to 4.86; at 113 to 158 and at 315 the hair comes down to 4.70 to 4.75 (the ears sit under the curls there); from 180 to 293 the surface is rough all the way down to 4.61, the lowest height probed, so the hair reaches the nape and the table takes the neck's top there. Between table entries the height is interpolated.
 */
export const HAIR_AXIS: readonly [number, number] = [-0.323, -0.008];
/** The azimuth of a point around HAIR_AXIS in degrees, 0 along +x and 90 along +z, in [0, 360). */
export function azimuthOf(point: Vec3): number {
  const azimuth = (Math.atan2(point[2] - HAIR_AXIS[1], point[0] - HAIR_AXIS[0]) * 180) / Math.PI;
  return azimuth < 0 ? azimuth + 360 : azimuth;
}
/** A row per AZIMUTH_STEP of azimuth from 0 to 360, the last row repeating the first: the azimuth, then the values at it. */
type AzimuthTable = readonly (readonly number[])[];
const AZIMUTH_STEP = 22.5;
/** Column `column` of `table` at `azimuth` (any angle in degrees), interpolated between the rows either side. */
function byAzimuth(table: AzimuthTable, azimuth: number, column: number): number {
  const wrapped = ((azimuth % 360) + 360) % 360;
  const n = Math.min(table.length - 2, Math.floor(wrapped / AZIMUTH_STEP));
  const a = table[n] ?? [0];
  const b = table[n + 1] ?? a;
  const t = Math.min(1, Math.max(0, (wrapped - (a[0] ?? 0)) / AZIMUTH_STEP));
  const va = a[column] ?? 0;
  const vb = b[column] ?? va;
  return va + (vb - va) * t;
}
const HAIRLINE_BY_AZIMUTH: readonly (readonly [number, number])[] = [
  [0, 4.93],
  [22.5, 4.95],
  [45, 4.95],
  [67.5, 4.85],
  [90, 4.84],
  [112.5, 4.75],
  [135, 4.7],
  [157.5, 4.7],
  [180, 4.61],
  [202.5, 4.61],
  [225, 4.61],
  [247.5, 4.61],
  [270, 4.61],
  [292.5, 4.61],
  [315, 4.72],
  [337.5, 4.86],
  [360, 4.93],
];
/** The hairline's height at an azimuth around the head's axis, interpolated between the table's entries. */
export function hairlineAtAzimuth(azimuth: number): number {
  return byAzimuth(HAIRLINE_BY_AZIMUTH, azimuth, 1);
}
/** The hairline's height at a point, from its azimuth around the head's axis. */
export function hairlineAt(point: Vec3): number {
  return hairlineAtAzimuth(azimuthOf(point));
}
/**
 * The head's surface radius from HAIR_AXIS on the David grid, probed 2026-10-13 (a read-only script under tmp/, not kept, on the 8 mm grid): a horizontal ray from the axis at each table azimuth and height, marched outward in millimetre steps to the figure's first zero crossing and bisected to 0.1 mm. The first crossing is the head's own surface under the overhanging locks, where the drill's holes sit, not the locks' outer faces (at azimuth 45, 1 cm above the hairline, the forehead is at 25.6 cm and the curl over it reaches 30.3).
 * The head is no cylinder, so each ring has its own column: 1 cm above the hairline (where the hairline holes run, inside HAIR, whose boundary the hairline is) the radius runs from 17 cm beside the right ear (azimuth 135 to 157.5) to 32 cm through the hair mass at the nape (225 to 270, where the table's hairline is the neck's top); 8 cm above the hairline the curls over the forehead stand 10 cm proud of the skin below them (azimuth 90: 31.3 against 21.7) and the lock over the left temple reaches 31 cm (azimuth 0). Between table azimuths the radius is interpolated, which a landmark on a table azimuth never needs.
 */
export const HEAD_RINGS = { hairline: 0.01, curls: 0.08 } as const;
export type HeadRing = keyof typeof HEAD_RINGS;
/** Per table azimuth: the radius 1 cm above the hairline, then 8 cm above it, metres. */
export const HEAD_RADIUS_BY_AZIMUTH: readonly (readonly [number, number, number])[] = [
  [0, 0.307, 0.313],
  [22.5, 0.271, 0.318],
  [45, 0.256, 0.342],
  [67.5, 0.258, 0.249],
  [90, 0.217, 0.313],
  [112.5, 0.199, 0.222],
  [135, 0.173, 0.183],
  [157.5, 0.172, 0.187],
  [180, 0.188, 0.272],
  [202.5, 0.307, 0.296],
  [225, 0.321, 0.296],
  [247.5, 0.329, 0.311],
  [270, 0.311, 0.311],
  [292.5, 0.214, 0.204],
  [315, 0.211, 0.215],
  [337.5, 0.219, 0.293],
  [360, 0.307, 0.313],
];
/** The head's surface radius from HAIR_AXIS at an azimuth, at a ring's height above the hairline. */
export function headRadiusAt(azimuth: number, ring: HeadRing): number {
  return byAzimuth(HEAD_RADIUS_BY_AZIMUTH, azimuth, ring === 'hairline' ? 1 : 2);
}
/** The point at `radius` from HAIR_AXIS at `azimuth` (degrees, 0 along +x, 90 along +z) and height `y`. */
export function onHead(azimuth: number, y: number, radius: number): [number, number, number] {
  const a = (azimuth * Math.PI) / 180;
  return [HAIR_AXIS[0] + Math.cos(a) * radius, y, HAIR_AXIS[1] + Math.sin(a) * radius];
}
/** The point of the head's surface at `azimuth` on `ring`: the ring's height above the hairline there, at the probed radius. */
export function onHeadRing(azimuth: number, ring: HeadRing): [number, number, number] {
  return onHead(azimuth, hairlineAtAzimuth(azimuth) + HEAD_RINGS[ring], headRadiusAt(azimuth, ring));
}
/**
 * The face on the David grid, from the same probe over azimuths −25 to 95 and heights 4.30 to 5.10: the nose's ridge (the largest radius at each height) lies at azimuth 37 to 38 from the tip (y 4.69 to 4.70, 28.4 cm) to the bridge (4.83), and the eye sockets, the hollows either side of it at 4.77 to 4.83, at 23 to 26 and 51 to 55, so the face looks toward azimuth 38, turned 52 degrees from +z toward the figure's left: the hairline probe's 25 to 45 made exact. The chin's front is at 4.52, the lips 4.60 to 4.66, the brow ridge 4.84 to 4.86 and the curls from 4.96.
 * A mark is a pair of drill targets: the height below the hairline at FACE_AZIMUTH (4.95), the azimuth offset of each side's target and the surface radius there, the figure's left (toward +x) first. The pupils sit 16 cm below the hairline, 15 degrees either side, on the sockets' floors (radius 20.0 and 20.2 cm; the hollow is 20.0 to 20.3 against 21.5 to 22 beside it); the nostrils 26 cm below, 9 degrees either side, under the wings of the nose (22.1 and 23.4 cm), where the figure's gradient faces forward and down (z 0.81 and 0.95) so FACE holds, while the grooves against the columella, 6 to 8 degrees out, face sideways (z 0.1 to 0.2) and FACE rejects them.
 */
export const FACE_AZIMUTH = 38;
/** A pair of drill targets on the face, see FACE_AZIMUTH. */
export interface FaceMark {
  /** Metres below the hairline at FACE_AZIMUTH. */
  readonly below: number;
  /** Degrees of azimuth either side of FACE_AZIMUTH. */
  readonly offset: number;
  /** The probed surface radius from HAIR_AXIS at each target, metres: the one toward +x, then the other. */
  readonly radii: readonly [number, number];
}
export const PUPILS_MARK: FaceMark = { below: 0.16, offset: 15, radii: [0.2, 0.202] };
export const NOSTRILS_MARK: FaceMark = { below: 0.26, offset: 9, radii: [0.221, 0.234] };
/** The two targets of a face mark on the head's surface, the one toward +x (the figure's left) first. */
export function facePair(mark: FaceMark): [[number, number, number], [number, number, number]] {
  const y = hairlineAtAzimuth(FACE_AZIMUTH) - mark.below;
  return [onHead(FACE_AZIMUTH - mark.offset, y, mark.radii[0]), onHead(FACE_AZIMUTH + mark.offset, y, mark.radii[1])];
}
/** The crown and the curls: the head above the hairline; keeps its tooth texture. */
export const HAIR: RegionDef = { label: 'hair', min: [-WIDE, 4.61, -DEEP], max: [WIDE, TOP, DEEP], contains: (point) => point[1] >= hairlineAt(point) };
/** Eyes, nose and mouth, up to the brow under the hairline (the probe of 2026-10-13 put the eyes and brow at 4.91 to 4.94). */
export const FACE: RegionDef = { label: 'face', min: [-WIDE, 4.5, -DEEP], max: [WIDE, 4.95, DEEP], contains: (point, normal) => normal[2] > 0.3 && point[1] < hairlineAt(point) };
/** The hand at the shoulder, holding the sling. */
export const LEFT_HAND = box('left-hand', 3.95, 4.4, 0.05, 0.6, -0.3, DEEP);
/** The hand at the thigh, with the stone. */
export const RIGHT_HAND = box('right-hand', 2.0, 2.45, -0.95, -0.5, -0.4, DEEP);
/** Between the thighs, where the crease under the crotch narrows to a centimetre or two (./landmarks.ts, LEG_GAPS): the walls the drill's rows run along. */
export const BETWEEN_THE_LEGS = box('between-the-legs', 2.0, 2.4, -0.35, 0.05, -0.2, 0.3);

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
/** What Agostino di Duccio began in 1464 to 1466, "only the trunk, lower limbs and feet" (technique.md, Stage 0): the front from the rock's top to the lower trunk. */
export const AGOSTINO = box('agostino', 0.3, 2.6, -WIDE, WIDE, -DEEP, DEEP, facing(2, 1, 0.2));
/**
 * The hole between the legs that Vasari blames on a Maestro Simone (david-history.md, The block): the gap between the legs on the David grid, probed 2026-10-14 by columns front to back at a 3 cm margin (a read-only probe, not kept), open from x -0.02 to 0.25 at y 1.2, -0.02 to 0.20 at 1.4 and -0.08 to 0.09 at 1.6, closing at 2.1; the box runs through the block's depth so the cut goes through. No figure surface belongs to the hole (`contains` is false), so the point strikes only the columns that run through the gap without meeting the figure, and a column stopping on a leg in the box's corner is left alone (review of 2026-10-14: the box alone roughed a leg's front to 3 cm).
 */
export const HOLE: RegionDef = { ...box('hole', 1.2, 1.6, -0.05, 0.22, -DEEP, DEEP), contains: () => false };

/** Whether a figure-surface point with its outward normal lies in the region. */
export function inside(region: RegionDef, point: Vec3, normal: Vec3): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis] ?? 0;
    if (value < (region.min[axis] ?? 0) || value > (region.max[axis] ?? 0)) return false;
  }
  return region.contains === undefined ? true : region.contains(point, normal);
}

/** `region` without the points of `cut`. */
export function minus(region: RegionDef, cut: RegionDef): RegionDef {
  return { label: `${region.label}-but-${cut.label}`, min: region.min, max: region.max, contains: (point, normal) => inside(region, point, normal) && !inside(cut, point, normal) };
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
/** Where the webs are cleared (./generators/webs.ts): the figure above the rock, which is left rough, and under the crown's crust. */
export const GAPS: RegionDef = { label: 'gaps', min: [WHOLE.min[0], BASE.max[1], WHOLE.min[2]], max: WHOLE.max, contains: (point, normal) => !inside(CROWN, point, normal) };

/** The sides and the back together, reached last in the same order of tools. */
export const SIDES_AND_BACK = union('sides-and-back', LEFT_SIDE, RIGHT_SIDE, BACK);
/** Where the roundel scoops: the head's hollows under the crown's crust, and the two hands. */
export const HOLLOWS = union('hollows', minus(HEAD, CROWN), LEFT_HAND, RIGHT_HAND);
/** The hair under the crown's crust, for the touches on site. */
export const HAIR_BUT_CROWN = minus(HAIR, CROWN);
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

export const REGIONS: readonly RegionDef[] = [WHOLE, FRONT, BACK, LEFT_SIDE, RIGHT_SIDE, HIGH_POINTS, CHEST_AND_FACE, HEAD, HAIR, FACE, LEFT_HAND, RIGHT_HAND, BETWEEN_THE_LEGS, SLING, STUMP, BASE, FLESH, NODO, AGOSTINO, HOLE, CROWN, WHOLE_BUT_CROWN, GAPS, SIDES_AND_BACK, HOLLOWS, HAIR_BUT_CROWN, DETAILS, GILT];
