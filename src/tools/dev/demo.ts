/**
 * The strike demonstration on the gallery page: a point on a marble slab, the mallet cycling through approach, raise, strike and recoil at four strikes a second, and the chips of the last few blows in flight.
 * The blows run along furrows in the sculptor's stroke (docs/research/technique.md, Stage 2): eight blows 2 cm apart per furrow, then the next furrow 3 cm over, so the lift between strokes shows too.
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Scene } from 'three';

import type { Blow, ChipState } from '../../contracts/making';
import { STRIKE, createBlowCycle } from '../blow-cycle';
import { FADE_END } from '../chip-burst';
import { ChipPool } from '../chips';
import { toolModel } from '../geometry/index';
import { fromQuat } from '../math';

/** Strikes a second at 1× (docs/research/decisions.md, Time and scale). */
export const STRIKES_PER_SECOND = 4;
const SLAB = { width: 0.8, height: 0.3, depth: 0.5, centre: new Vector3(2.0, 0.15, 1.3) } as const;
const BLOWS_PER_FURROW = 8;
const FURROWS = 4;
const BLOW_SPACING = 0.02;
const FURROW_SPACING = 0.03;
const MARBLE = new MeshStandardMaterial({ color: 0xece9e2, roughness: 0.85 });

export interface StrikeDemo {
  /** Poses the chisel, the mallet and the chips for `seconds` of demo time. */
  setTime(seconds: number): void;
  readonly blows: readonly Blow[];
}

/** The demo's blows: furrows along -x across the slab's top, the point at 45 degrees. */
function planBlows(): Blow[] {
  const blows: Blow[] = [];
  const top = SLAB.centre.y + SLAB.height / 2;
  const angle = Math.PI / 4;
  for (let furrow = 0; furrow < FURROWS; furrow += 1) {
    for (let i = 0; i < BLOWS_PER_FURROW; i += 1) {
      blows.push({
        tool: 'point',
        point: [SLAB.centre.x + 0.08 - i * BLOW_SPACING, top, SLAB.centre.z - 0.045 + furrow * FURROW_SPACING],
        normal: [0, 1, 0],
        direction: [-Math.cos(angle), -Math.sin(angle), 0],
        size: 0.012,
        stroke: furrow,
      });
    }
  }
  return blows;
}

export function createStrikeDemo(scene: Scene): StrikeDemo {
  const cycle = createBlowCycle();
  const blows = planBlows();
  const slab = new Mesh(new BoxGeometry(SLAB.width, SLAB.height, SLAB.depth), MARBLE);
  slab.position.copy(SLAB.centre);
  slab.castShadow = true;
  slab.receiveShadow = true;
  const chisel = toolModel('point');
  const mallet = toolModel('mallet');
  const pool = new ChipPool();
  const group = new Group();
  group.add(slab, chisel, mallet, pool.mesh);
  scene.add(group);

  const blowAt = (index: number): Blow => {
    const found = blows[((index % blows.length) + blows.length) % blows.length];
    if (found === undefined) throw new Error('the demo has no blows');
    return found;
  };

  return {
    blows,
    setTime(seconds) {
      const cycles = seconds * STRIKES_PER_SECOND;
      const index = Math.floor(cycles);
      const phase = cycles - index;
      const blow = blowAt(index);
      const previous = blowAt(index - 1);
      for (const pose of cycle.posesAt(blow, previous, phase)) {
        const model = pose.tool === 'mallet' ? mallet : chisel;
        model.position.set(...pose.position);
        model.quaternion.copy(fromQuat(pose.quaternion));
      }
      const chips: ChipState[] = [];
      for (let back = 0; back <= Math.ceil(FADE_END * STRIKES_PER_SECOND); back += 1) {
        const struckAt = (index - back + STRIKE) / STRIKES_PER_SECOND;
        chips.push(...cycle.chipsAt(blowAt(index - back), seconds - struckAt));
      }
      pool.update(chips);
    },
  };
}

/** Where a camera sees the demo: a little above the slab, from the front right. */
export const DEMO_CAMERA = { position: [SLAB.centre.x + 0.55, SLAB.centre.y + 0.65, SLAB.centre.z + 0.9] as const, target: [SLAB.centre.x, SLAB.centre.y + 0.2, SLAB.centre.z] as const } as const;

/** Demo time at which a still capture shows the mallet on the chisel head and the chips of the last blows in the air. */
export const DEMO_STILL_SECONDS = (3 + STRIKE) / STRIKES_PER_SECOND + 0.02;
