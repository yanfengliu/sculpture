/**
 * The regions of docs/design/choreography.md as boxes in world metres on the figure placed by src/david/frame.ts (coordinator-owned).
 * The figure faces +z; its left is +x. Bands were read off the pipeline's silhouettes of the fetched mesh (output/model/front.png, left.png, back.png, 215 px per metre) and the reference photographs in docs/research/references.md, so every number here is an inference to check against captures.
 */
import type { RegionDef, Vec3 } from '../contracts/making';
import { STATUE_HEIGHT_M } from '../david/frame';

const WIDE = 1.3;
const DEEP = 1.0;
const TOP = STATUE_HEIGHT_M;

function box(label: string, y0: number, y1: number, x0 = -WIDE, x1 = WIDE, z0 = -DEEP, z1 = DEEP, contains?: RegionDef['contains']): RegionDef {
  const region: RegionDef = { label, min: [x0, y0, z0], max: [x1, y1, z1] };
  return contains === undefined ? region : { ...region, contains };
}

const facing = (axis: 0 | 1 | 2, sign: 1 | -1, least: number) => (_point: Vec3, normal: Vec3): boolean => sign * normal[axis] > least;

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
/** The strap over the left shoulder and down the back. */
export const SLING = box('sling', 3.5, 4.5, 0, WIDE, -DEEP, 0.3, facing(2, -1, -0.3));
/** The tree stump behind the right leg. */
export const STUMP = box('stump', 0.3, 1.55, -0.65, 0.05, -DEEP, 0.1, facing(2, -1, -0.5));
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

export const REGIONS: readonly RegionDef[] = [WHOLE, FRONT, BACK, LEFT_SIDE, RIGHT_SIDE, HIGH_POINTS, CHEST_AND_FACE, HEAD, HAIR, FACE, LEFT_HAND, RIGHT_HAND, SLING, STUMP, BASE, FLESH, NODO];
