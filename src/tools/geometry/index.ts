/**
 * The tool models by catalog id (docs/design/spec.md, Tools): each built once at its catalog size and cached; `toolModel` hands out clones that share the geometry and materials, so a page can show the same tool twice.
 * `animateToolParts` moves the parts a rigid `ToolPose` cannot: the drill's spindle spins and its bow saws, pure in the cycle phase.
 */
import { Box3, Vector3 } from 'three';
import type { Group } from 'three';

import type { CatalogId } from '../catalog';
import { buildCharcoal, buildGildingBrush, buildPumice, buildStrawBunch } from './abrasives';
import { buildClaw, buildFineClaw, buildFlat, buildPoint, buildRoundel, buildTwoTooth } from './chisels';
import { BOW_STROKE, SPINDLE_TURN_PER_STROKE, buildDrill } from './drill';
import { buildMallet } from './mallet';
import { buildFile, buildRasp } from './rasps';

const BUILDERS: Readonly<Record<CatalogId, () => Group>> = {
  charcoal: buildCharcoal,
  point: buildPoint,
  'two-tooth': buildTwoTooth,
  claw: buildClaw,
  'fine-claw': buildFineClaw,
  roundel: buildRoundel,
  flat: buildFlat,
  drill: buildDrill,
  rasp: buildRasp,
  file: buildFile,
  pumice: buildPumice,
  polish: buildStrawBunch,
  gilding: buildGildingBrush,
  mallet: buildMallet,
};

const masters = new Map<CatalogId, Group>();
const extents = new Map<CatalogId, Vector3>();

function master(id: CatalogId): Group {
  let found = masters.get(id);
  if (found === undefined) {
    found = BUILDERS[id]();
    found.name = id;
    masters.set(id, found);
  }
  return found;
}

/** A fresh instance of the tool in its local frame, sharing the cached geometry. */
export function toolModel(id: CatalogId): Group {
  return master(id).clone();
}

/** Size of the tool's bounding box in its local frame, metres, from the vertices themselves. */
export function toolExtent(id: CatalogId): Vector3 {
  let found = extents.get(id);
  if (found === undefined) {
    found = new Box3().setFromObject(master(id), true).getSize(new Vector3());
    extents.set(id, found);
  }
  return found.clone();
}

/** Local bounding box of the tool, min and max, metres. */
export function toolBounds(id: CatalogId): Box3 {
  return new Box3().setFromObject(master(id), true);
}

/** Poses the moving parts of `model` (a `toolModel(id)` instance) for cycle phase `p` in [0, 1); a no-op for tools without moving parts. */
export function animateToolParts(model: Group, id: CatalogId, phase: number): void {
  if (id !== 'drill') return;
  const bow = model.getObjectByName('bow');
  const spindle = model.getObjectByName('spindle');
  const stroke = Math.sin(Math.PI * 2 * phase);
  if (bow !== undefined) bow.position.x = BOW_STROKE * stroke;
  if (spindle !== undefined) spindle.rotation.y = SPINDLE_TURN_PER_STROKE * stroke;
}
