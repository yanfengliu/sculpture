/**
 * The struck chisels at their catalog sizes (docs/research/tools.md): the point with its octagonal tapering shank and four-faceted pyramid tip; the two-tooth, claw and fine claw with their teeth cut into the blade profile; the roundel with its semicircular edge; the flat chisel.
 * Local frame: origin at the working tip, shaft along +Y, the struck head at `y = shaftLength`. The blade's width lies along X and its teeth face -Y.
 */
import { Group, Vector2 } from 'three';

import type { CatalogId } from '../catalog';
import { dimension } from '../catalog';
import { bladeFromProfile, part, pyramidTip, shank, struckHead, toothedOutline } from './parts';

/** Length of the flattened, steeled end of a toothed or flat chisel, metres; inferred from the catalogue photographs the note cites. */
const BLADE_LENGTH = 0.04;
const EDGE_THICKNESS = 0.0015;
const HEAD_LENGTH = 0.018;

export function buildPoint(): Group {
  const length = dimension('point', 'shaftLength');
  const diameter = dimension('point', 'shaftDiameter');
  const tipLength = dimension('point', 'tipLength');
  const group = new Group();
  group.add(
    part(pyramidTip(diameter * 0.42, tipLength), 'steel', 'tip'),
    part(shank(tipLength, length - HEAD_LENGTH, diameter * 0.42, diameter * 0.47), 'iron', 'shank'),
    part(struckHead(length - HEAD_LENGTH, length, diameter / 2), 'iron', 'head'),
  );
  return group;
}

function bladedChisel(id: CatalogId, outline: Vector2[]): Group {
  const length = dimension(id, 'shaftLength');
  const diameter = dimension(id, 'shaftDiameter');
  const group = new Group();
  group.add(
    part(bladeFromProfile(outline, BLADE_LENGTH, diameter * 0.8, EDGE_THICKNESS), 'steel', 'blade'),
    part(shank(BLADE_LENGTH * 0.9, length - HEAD_LENGTH, diameter * 0.42, diameter * 0.47), 'iron', 'shank'),
    part(struckHead(length - HEAD_LENGTH, length, diameter / 2), 'iron', 'head'),
  );
  return group;
}

function toothedChisel(id: 'two-tooth' | 'claw' | 'fine-claw'): Group {
  const width = dimension(id, 'bladeWidth');
  const teeth = dimension(id, 'toothCount');
  const notchWidth = dimension(id, 'toothPitch') * 0.35;
  const notchDepth = dimension(id, 'notchDepth');
  return bladedChisel(id, toothedOutline(width, BLADE_LENGTH, dimension(id, 'shaftDiameter') * 0.85, teeth, notchWidth, notchDepth));
}

export const buildTwoTooth = (): Group => toothedChisel('two-tooth');
export const buildClaw = (): Group => toothedChisel('claw');
export const buildFineClaw = (): Group => toothedChisel('fine-claw');

export function buildFlat(): Group {
  return bladedChisel('flat', toothedOutline(dimension('flat', 'bladeWidth'), BLADE_LENGTH, dimension('flat', 'shaftDiameter') * 0.85, 1, 0, 0));
}

/** The roundel's edge is a semicircle of the blade's width, the deepest point at the origin. */
export function buildRoundel(): Group {
  const width = dimension('roundel', 'bladeWidth');
  const topWidth = dimension('roundel', 'shaftDiameter') * 0.85;
  const radius = width / 2;
  const outline: Vector2[] = [];
  const arcPoints = 8;
  for (let i = 0; i <= arcPoints; i += 1) {
    const angle = Math.PI + (Math.PI * i) / arcPoints;
    outline.push(new Vector2(radius * Math.cos(angle), radius + radius * Math.sin(angle)));
  }
  outline.push(new Vector2(radius, BLADE_LENGTH * 0.55), new Vector2(topWidth / 2, BLADE_LENGTH), new Vector2(-topWidth / 2, BLADE_LENGTH), new Vector2(-radius, BLADE_LENGTH * 0.55));
  return bladedChisel('roundel', outline);
}
