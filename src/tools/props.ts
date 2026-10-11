/**
 * The workshop props that are not blow tools (docs/research/tools.md, Measuring tools; technique.md, Stage 1): the carpenter's square, the plumb line with its bob, the small wax model on its stand, and two more exhibits the catalog folds into a tool id, the curved riffler and the leather pad with tripoli.
 * Each has names, dimensions with their inferred flags, a source line and a cached model, built like the tools (origin at the working point or the base, the long axis along +Y).
 * The wax model is the sculptor's maquette of the statue, not a person: it stands in for the "small wax model about eighteen inches in height" the sources describe, as the stage 1 layout needs it.
 */
import { Box3, CylinderGeometry, Group, LatheGeometry, Vector2, Vector3 } from 'three';

import type { Measured } from './catalog';
import { LEATHER_PAD, buildLeatherPad } from './geometry/abrasives';
import { box, part, rod, shank } from './geometry/parts';
import { CURVED_RASP_LENGTH, buildCurvedRasp } from './geometry/rasps';

export type PropId = 'square' | 'plumb-line' | 'wax-model' | 'curved-rasp' | 'leather-pad';

export interface PropSpec {
  readonly id: PropId;
  readonly italian: string;
  readonly english: string;
  readonly material: string;
  readonly dimensions: Readonly<Record<string, Measured>>;
  readonly source: string;
  readonly build: () => Group;
}

const stated = (value: number): Measured => ({ value, inferred: false });
const inferred = (value: number): Measured => ({ value, inferred: true });

/** Figure height from Symonds' "about eighteen inches" (0.457 m), stated; the stand and the rock base under the feet inferred. */
const WAX_FIGURE_HEIGHT = 0.45;
const WAX_STAND_HEIGHT = 0.06;
const SQUARE_LONG = 0.6;
const SQUARE_SHORT = 0.4;
const SQUARE_SECTION = { width: 0.04, thickness: 0.02 } as const;
const BOB_HEIGHT = 0.06;
const BOB_RADIUS = 0.015;
const CORD_LENGTH = 1.5;
const REEL_HEIGHT = 0.02;

export function buildSquare(): Group {
  const { width, thickness } = SQUARE_SECTION;
  const group = new Group();
  group.add(
    part(box(width, SQUARE_LONG, thickness, new Vector3(width / 2, SQUARE_LONG / 2, 0)), 'wood', 'upright'),
    part(box(SQUARE_SHORT, width, thickness, new Vector3(SQUARE_SHORT / 2, width / 2, 0)), 'wood', 'foot'),
  );
  return group;
}

export function buildPlumbLine(): Group {
  const profile = [new Vector2(0, 0), new Vector2(BOB_RADIUS, BOB_HEIGHT * 0.55), new Vector2(BOB_RADIUS * 0.9, BOB_HEIGHT * 0.85), new Vector2(BOB_RADIUS * 0.3, BOB_HEIGHT), new Vector2(0, BOB_HEIGHT)];
  const reel = new CylinderGeometry(0.02, 0.02, REEL_HEIGHT, 10);
  reel.translate(0, BOB_HEIGHT + CORD_LENGTH + REEL_HEIGHT / 2, 0);
  const group = new Group();
  group.add(
    part(new LatheGeometry(profile, 14), 'lead', 'bob'),
    part(rod(new Vector3(0, BOB_HEIGHT, 0), new Vector3(0, BOB_HEIGHT + CORD_LENGTH, 0), 0.001), 'cord', 'cord'),
    part(reel, 'wood', 'reel'),
  );
  return group;
}

/** A rough wax maquette in the statue's stance on a turned wooden stand: hips, torso and head as lathes, limbs as rods. Proportions follow the statue's silhouette only loosely; it is a model on a bench, seen from metres away. */
export function buildWaxModel(): Group {
  const group = new Group();
  const stand = new CylinderGeometry(0.1, 0.11, 0.04, 16);
  stand.translate(0, 0.02, 0);
  group.add(part(stand, 'wood', 'stand'), part(box(0.1, 0.02, 0.08, new Vector3(0, 0.05, 0)), 'wax', 'rock'));
  const feet = WAX_STAND_HEIGHT;
  const hips = feet + WAX_FIGURE_HEIGHT * 0.47;
  const shoulders = feet + WAX_FIGURE_HEIGHT * 0.82;
  const torso = [new Vector2(0.03, hips - 0.01), new Vector2(0.034, hips + 0.03), new Vector2(0.028, hips + 0.08), new Vector2(0.04, shoulders - 0.02), new Vector2(0.044, shoulders), new Vector2(0.02, shoulders + 0.02)];
  const head = [new Vector2(0, shoulders + 0.02), new Vector2(0.02, shoulders + 0.03), new Vector2(0.028, shoulders + 0.055), new Vector2(0.024, shoulders + 0.075), new Vector2(0, feet + WAX_FIGURE_HEIGHT)];
  group.add(
    part(new LatheGeometry(torso, 12), 'wax', 'torso'),
    part(new LatheGeometry(head, 12), 'wax', 'head'),
    part(rod(new Vector3(0.02, feet, 0.01), new Vector3(0.022, hips, 0), 0.016, 8), 'wax', 'right-leg'),
    part(rod(new Vector3(-0.05, feet, -0.02), new Vector3(-0.022, hips, 0), 0.015, 8), 'wax', 'left-leg'),
    part(rod(new Vector3(0.05, shoulders - 0.01, 0), new Vector3(0.06, hips + 0.01, 0.01), 0.011, 8), 'wax', 'right-arm'),
    part(rod(new Vector3(-0.05, shoulders - 0.01, 0), new Vector3(-0.07, hips + 0.09, 0.03), 0.011, 8), 'wax', 'left-upper-arm'),
    part(rod(new Vector3(-0.07, hips + 0.09, 0.03), new Vector3(-0.03, shoulders + 0.01, 0.03), 0.01, 8), 'wax', 'left-forearm'),
    part(shank(hips - 0.012, hips + 0.01, 0.036, 0.034, 10), 'wax', 'hips'),
  );
  return group;
}

export const PROPS: Readonly<Record<PropId, PropSpec>> = {
  square: {
    id: 'square',
    italian: 'squadra',
    english: "carpenter's square",
    material: 'wood',
    dimensions: { armLong: inferred(SQUARE_LONG), armShort: inferred(SQUARE_SHORT), sectionWidth: inferred(SQUARE_SECTION.width), thickness: inferred(SQUARE_SECTION.thickness) },
    source: 'tools.md, Measuring tools. The square with one leg horizontal at the foot of the figure and the other upright stated [S1]; a large wooden square of 60 by 40 cm inferred',
    build: buildSquare,
  },
  'plumb-line': {
    id: 'plumb-line',
    italian: 'filo a piombo',
    english: 'plumb line',
    material: 'lead bob on a hemp cord with a wooden reel',
    dimensions: { bobHeight: inferred(BOB_HEIGHT), bobDiameter: inferred(BOB_RADIUS * 2), cordLength: inferred(CORD_LENGTH), reelHeight: inferred(REEL_HEIGHT) },
    source: 'tools.md, Measuring tools, and technique.md, Stage 0 (a plumb line hangs from the top beam, inferred) [S1]; the bob and the 1.5 m of cord shown inferred',
    build: buildPlumbLine,
  },
  'wax-model': {
    id: 'wax-model',
    italian: 'modello di cera',
    english: 'wax model on its stand',
    material: 'modelling wax on a turned wooden stand',
    dimensions: { figureHeight: stated(WAX_FIGURE_HEIGHT), standHeight: inferred(WAX_STAND_HEIGHT) },
    source: 'technique.md, Stage 1. A wax model of a young David with a sling stated [S25]; "a small wax model about eighteen inches in height" stated [S26]; the stand inferred',
    build: buildWaxModel,
  },
  'curved-rasp': {
    id: 'curved-rasp',
    italian: 'raspa curva',
    english: 'curved rasp (riffler)',
    material: 'iron with raised cut teeth',
    dimensions: { length: inferred(CURVED_RASP_LENGTH), diameter: inferred(0.01) },
    source: 'tools.md, Raspe and lime. Iron rasps straight and curved stated [S1]; double-ended rifflers 12 to 40 cm stated [S4]; 24 cm picked inside the range',
    build: buildCurvedRasp,
  },
  'leather-pad': {
    id: 'leather-pad',
    italian: 'cuoio e tripoli',
    english: 'leather pad with tripoli',
    material: 'leather dusted with tripoli earth',
    dimensions: { length: inferred(LEATHER_PAD.length), width: inferred(LEATHER_PAD.width), thickness: inferred(LEATHER_PAD.thickness) },
    source: 'tools.md, Abrasives and polish. Tripoli earth and leather stated [S1]; a hand-sized pad inferred',
    build: buildLeatherPad,
  },
};

export const PROP_IDS: readonly PropId[] = Object.keys(PROPS) as PropId[];

const masters = new Map<PropId, Group>();

function master(id: PropId): Group {
  let found = masters.get(id);
  if (found === undefined) {
    found = PROPS[id].build();
    found.name = id;
    masters.set(id, found);
  }
  return found;
}

export function propModel(id: PropId): Group {
  return master(id).clone();
}

export function propExtent(id: PropId): Vector3 {
  return new Box3().setFromObject(master(id), true).getSize(new Vector3());
}
