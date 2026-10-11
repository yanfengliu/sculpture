/**
 * The tools that leave no chips (docs/research/tools.md, Abrasives and polish; Measuring tools; technique.md, Stage 8): the pumice block, the straw bunch, the leather pad with tripoli, the charcoal stick and the gilder's tip with its leaf of gold.
 * Local frames: a face-on tool (pumice, leather) has its working face at y = 0 and its body along +Y; an edge-on tool (straw) lies along +Y from its far end; the charcoal and the brush have their tip at the origin and their handle along +Y.
 */
import { ConeGeometry, CylinderGeometry, Group, LatheGeometry, Vector2, Vector3 } from 'three';

import { dimension } from '../catalog';
import { box, part, shank } from './parts';

export function buildPumice(): Group {
  const length = dimension('pumice', 'length');
  const width = dimension('pumice', 'width');
  const height = dimension('pumice', 'height');
  // An eight-sided lump with vertices on both axes, so it spans the full length across x and, once squeezed, the full width across z.
  const lump = new CylinderGeometry(length / 2, length * 0.46, height, 8);
  lump.scale(1, 1, width / length);
  lump.translate(0, height / 2, 0);
  const group = new Group();
  group.add(part(lump, 'pumice', 'lump'));
  return group;
}

/** The straw bunch: a lathe of a bound bundle, waisted where the cords tie it. */
export function buildStrawBunch(): Group {
  const length = dimension('polish', 'length');
  const radius = dimension('polish', 'diameter') / 2;
  const profile = [new Vector2(0, 0), new Vector2(radius * 0.7, 0), new Vector2(radius * 0.72, length * 0.22), new Vector2(radius, length * 0.5), new Vector2(radius * 0.72, length * 0.78), new Vector2(radius * 0.7, length), new Vector2(0, length)];
  const bundle = new LatheGeometry(profile, 14);
  const group = new Group();
  group.add(part(bundle, 'straw', 'bundle'));
  for (const y of [length * 0.22, length * 0.78]) {
    const tie = new CylinderGeometry(radius * 0.76, radius * 0.76, 0.006, 14);
    tie.translate(0, y, 0);
    group.add(part(tie, 'cord', 'tie'));
  }
  return group;
}

/** Leather pad with tripoli: a hand-sized pad, its dusted working face at y = 0. Dimensions inferred (tools.md, Abrasives and polish: tripoli earth on leather [S1]). */
export const LEATHER_PAD = { length: 0.15, width: 0.1, thickness: 0.012 } as const;

export function buildLeatherPad(): Group {
  const { length, width, thickness } = LEATHER_PAD;
  const group = new Group();
  group.add(
    part(box(length, thickness, width, new Vector3(0, thickness / 2, 0)), 'leather', 'pad'),
    part(box(length * 0.92, 0.0008, width * 0.9, new Vector3(0, 0.0004, 0)), 'card', 'tripoli'),
  );
  return group;
}

export function buildCharcoal(): Group {
  const length = dimension('charcoal', 'length');
  const radius = dimension('charcoal', 'diameter') / 2;
  const tipLength = radius * 2;
  const tip = new ConeGeometry(radius, tipLength, 6);
  tip.translate(0, tipLength / 2, 0);
  const group = new Group();
  group.add(part(tip, 'charcoal', 'tip'), part(shank(tipLength, length, radius, radius * 0.9, 6), 'charcoal', 'stick'));
  return group;
}

/** The gilder's tip: a wide flat brush of squirrel hair between two cards, carrying a leaf of gold at its hair's end; the leaf's far edge is the working tip. */
export function buildGildingBrush(): Group {
  const length = dimension('gilding', 'length');
  const width = dimension('gilding', 'width');
  const leaf = dimension('gilding', 'leafSize');
  const hairLength = 0.05;
  const overlap = 0.01;
  const group = new Group();
  group.add(
    part(box(leaf, leaf, 0.0003, new Vector3(0, leaf / 2, 0)), 'gold', 'leaf'),
    part(box(width * 0.94, hairLength, 0.003, new Vector3(0, leaf - overlap + hairLength / 2, 0.002)), 'hair', 'hair'),
    part(box(width * 0.94, length - (leaf - overlap + hairLength), 0.004, new Vector3(0, (length + leaf - overlap + hairLength) / 2, 0.002)), 'card', 'handle'),
  );
  return group;
}
