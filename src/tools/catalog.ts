/**
 * The tool catalog (docs/design/spec.md, Tools): every ToolId plus the mallet, with Italian and English names, material, dimensions, working angle, the real blows a shown blow stands for, chip parameters and the source line in docs/research/tools.md.
 *
 * Units: metres, except `toothCount` (a count) and `headMass` (kilograms). Angles are degrees between the tool axis and the stone surface (90 is straight in).
 * Every number is a `Measured`: `inferred: true` marks a value docs/research/tools.md derives or this file picks inside a stated range; `inferred: false` marks a value a source states (modern catalogue figures count as stated by the modern source, as the note says).
 * `blowsPerShown` has a basis only for the struck chisels: the note's inferred rhythm (point 1.5 blows a second, toothed chisels 2) over the documented 865 working days at 8 hours a day, against the 20,000 shown blows of docs/research/decisions.md; the ratio is independent of a stage's share of the time. The other tools have none and carry null.
 * `src/tools/catalog.test.ts` checks completeness; `src/tools/geometry/geometry.test.ts` checks each model's bounding box against these numbers.
 */
import type { ToolId } from '../contracts/making';

export type CatalogId = ToolId | 'mallet';

export interface Measured {
  readonly value: number;
  readonly inferred: boolean;
}

export interface Range {
  readonly min: number;
  readonly max: number;
  readonly inferred: boolean;
}

/** How the blow cycle moves the tool: struck by the mallet; the bow drill spinning; an edge-on tool lying along the surface and stroking; a face-on block stroking; a tip trailing along the surface; the mallet itself. */
export type Motion = 'struck' | 'drill' | 'edge' | 'face' | 'trail' | 'mallet';

export type DimensionKey =
  | 'shaftLength'
  | 'shaftDiameter'
  | 'tipLength'
  | 'bladeWidth'
  | 'toothCount'
  | 'toothPitch'
  | 'notchDepth'
  | 'headWidth'
  | 'headHeight'
  | 'headLength'
  | 'headMass'
  | 'handleLength'
  | 'handleDiameter'
  | 'height'
  | 'bitDiameter'
  | 'bitDiameterMin'
  | 'bitDiameterMax'
  | 'spindleDiameter'
  | 'bowLength'
  | 'length'
  | 'width'
  | 'thickness'
  | 'diameter'
  | 'leafSize';

export interface ChipSpec {
  /** Chips one blow sends. */
  readonly count: Range;
  /** Longest dimension of a chip, metres. */
  readonly size: Range;
}

export interface ToolSpec {
  readonly id: CatalogId;
  readonly italian: string;
  readonly english: string;
  readonly material: string;
  readonly motion: Motion;
  readonly dimensions: Readonly<Partial<Record<DimensionKey, Measured>>>;
  /** Documented working angle to the surface; null for the mallet. */
  readonly angle: Range | null;
  /** Real blows one shown blow stands for, where the research gives a basis. */
  readonly blowsPerShown: Measured | null;
  readonly chips: ChipSpec;
  /** The docs/research/tools.md section and the `[S n]` references the numbers rest on. */
  readonly source: string;
}

const stated = (value: number): Measured => ({ value, inferred: false });
const inferred = (value: number): Measured => ({ value, inferred: true });
const NO_CHIPS: ChipSpec = { count: { min: 0, max: 0, inferred: true }, size: { min: 0, max: 0, inferred: true } };
const TOOTHED_ANGLE: Range = { min: 35, max: 60, inferred: false };
/** Lying along the surface, handle a little raised; nothing in the note gives a figure. */
const STROKING_ANGLE: Range = { min: 5, max: 15, inferred: true };

/** 865 days (13 September 1501 to 25 January 1504, technique.md) × 8 h × 3600 s / 20,000 shown blows = 1,245.6 real seconds per shown blow. */
const REAL_SECONDS_PER_SHOWN = (865 * 8 * 3600) / 20_000;
const blowsPerShownAt = (blowsPerSecond: number): Measured => inferred(Math.round((REAL_SECONDS_PER_SHOWN * blowsPerSecond) / 100) * 100);

export const TOOL_CATALOG: Readonly<Record<CatalogId, ToolSpec>> = {
  charcoal: {
    id: 'charcoal',
    italian: 'carbone',
    english: 'charcoal stick',
    material: 'willow charcoal',
    motion: 'trail',
    dimensions: { length: inferred(0.12), diameter: inferred(0.012) },
    angle: { min: 25, max: 45, inferred: true },
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Measuring tools, and technique.md, Stage 1 (the drawn principal view, chalk or charcoal, inferred) [S1] [S2]',
  },
  point: {
    id: 'point',
    italian: 'subbia',
    english: 'point',
    material: 'wrought iron bar with a steeled, tempered tip',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.28), shaftDiameter: inferred(0.018), tipLength: inferred(0.035) },
    // 90 for bulk removal, 70 for the mason's stroke, 45 for the sculptor's stroke [S4]; practice guides give 30 to 45 [S6].
    angle: { min: 30, max: 90, inferred: false },
    blowsPerShown: blowsPerShownAt(1.5),
    // A few chips of 20 to 60 mm; Vigenère's "three or four fingers" (60 to 80 mm) is the expert upper bound [S7].
    chips: { count: { min: 2, max: 5, inferred: true }, size: { min: 0.02, max: 0.06, inferred: true } },
    source: 'tools.md, Subbia: the point. Shaft 20 to 30 cm by 1 to 2.5 cm stated [S4]; the heavy roughing point 25 to 30 cm on a 16 to 20 mm shank with a 30 to 40 mm pyramid tip inferred; angles stated [S4] [S6]',
  },
  'two-tooth': {
    id: 'two-tooth',
    italian: 'calcagnuolo',
    english: 'two-tooth chisel',
    material: 'wrought iron with a steeled edge',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.2), shaftDiameter: inferred(0.013), bladeWidth: inferred(0.017), toothCount: stated(2), toothPitch: inferred(0.011), notchDepth: inferred(0.005) },
    angle: TOOTHED_ANGLE,
    blowsPerShown: blowsPerShownAt(2),
    chips: { count: { min: 4, max: 8, inferred: true }, size: { min: 0.008, max: 0.02, inferred: true } },
    source: 'tools.md, Calcagnuolo: the two-tooth chisel. Shaft 16 to 22 cm by 1 to 2 cm stated [S4]; the notch in the middle stated [S1]; shank 20 cm by 12 to 14 mm, edge 15 to 20 mm, teeth 5 to 7 mm with a 4 to 6 mm notch inferred; angle 35 to 60 stated [S4]',
  },
  claw: {
    id: 'claw',
    italian: 'gradina',
    english: 'claw chisel',
    material: 'wrought iron with a steeled edge',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.2), shaftDiameter: inferred(0.012), bladeWidth: inferred(0.017), toothCount: stated(3), toothPitch: inferred(0.0057), notchDepth: inferred(0.003) },
    angle: TOOTHED_ANGLE,
    blowsPerShown: blowsPerShownAt(2),
    chips: { count: { min: 6, max: 10, inferred: true }, size: { min: 0.004, max: 0.012, inferred: true } },
    source: 'tools.md, Gradina: the claw or tooth chisel. Two notches, so three teeth, stated [S1]; shaft 16 to 22 cm by 1 to 2 cm stated [S4]; the coarse gradina 20 cm by 12 mm with three squared teeth on a 15 to 18 mm edge inferred; angle 35 to 60 stated [S4]',
  },
  'fine-claw': {
    id: 'fine-claw',
    italian: 'dente di cane',
    english: 'fine claw chisel',
    material: 'wrought iron with a steeled edge',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.18), shaftDiameter: inferred(0.01), bladeWidth: inferred(0.011), toothCount: inferred(5), toothPitch: inferred(0.0022), notchDepth: inferred(0.002) },
    angle: TOOTHED_ANGLE,
    blowsPerShown: blowsPerShownAt(2),
    chips: { count: { min: 6, max: 12, inferred: true }, size: { min: 0.003, max: 0.008, inferred: true } },
    source: 'tools.md, Gradina: the claw or tooth chisel (the 2003 dente di cane [S3]). Fine gradina 18 cm by 10 mm with four or five small teeth on a 10 to 12 mm edge inferred; angle 35 to 60 stated for toothed chisels [S4]',
  },
  roundel: {
    id: 'roundel',
    italian: 'unghietto',
    english: 'roundel',
    material: 'wrought iron with a steeled, curved edge',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.2), shaftDiameter: inferred(0.012), bladeWidth: stated(0.009) },
    angle: TOOTHED_ANGLE,
    blowsPerShown: blowsPerShownAt(2),
    chips: { count: { min: 3, max: 6, inferred: true }, size: { min: 0.004, max: 0.01, inferred: true } },
    source: 'tools.md, Ugnetto or unghietto: the roundel. Flat-chisel shaft 15 to 25 cm by 1 to 2 cm and the 35 to 60 angle stated [S4]; the 9 mm size sold today stated [S13]; the shaft picked inside the stated range',
  },
  flat: {
    id: 'flat',
    italian: 'scalpello',
    english: 'flat chisel',
    material: 'wrought iron with a steeled edge',
    motion: 'struck',
    dimensions: { shaftLength: inferred(0.2), shaftDiameter: inferred(0.014), bladeWidth: inferred(0.025) },
    angle: TOOTHED_ANGLE,
    blowsPerShown: blowsPerShownAt(2),
    chips: { count: { min: 3, max: 6, inferred: true }, size: { min: 0.005, max: 0.015, inferred: true } },
    source: 'tools.md, Scalpello or scarpello: the flat chisel. Shaft 15 to 25 cm by 1 to 2 cm, edge 0.5 to 10 cm and the 35 to 60 angle stated [S4]; a 25 mm edge picked inside the range; no evidence of it on the David [S3]',
  },
  drill: {
    id: 'drill',
    italian: 'trapano a violino',
    english: 'bow drill',
    material: 'iron spade bit; wooden spindle, cap and bow; hemp cord',
    motion: 'drill',
    dimensions: { height: stated(0.22), bitDiameter: inferred(0.005), bitDiameterMin: inferred(0.003), bitDiameterMax: inferred(0.015), spindleDiameter: inferred(0.02), bowLength: inferred(0.6) },
    angle: { min: 35, max: 45, inferred: false },
    blowsPerShown: null,
    chips: { count: { min: 10, max: 16, inferred: true }, size: { min: 0.001, max: 0.003, inferred: true } },
    source: 'tools.md, Trapano: the drill. Surviving Tuscan violino drills 21 to 22 cm high stated [S13]; running drill at 35 to 45 degrees stated [S4]; bits 3 to 8 mm and 10 to 15 mm, the spade point and a bow of about 60 cm inferred [S4] [S18]',
  },
  rasp: {
    id: 'rasp',
    italian: 'raspa',
    english: 'rasp',
    material: 'iron with raised cut teeth',
    motion: 'edge',
    dimensions: { length: inferred(0.3), width: inferred(0.025), thickness: inferred(0.008), toothPitch: inferred(0.004) },
    angle: STROKING_ANGLE,
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Raspe and lime: rasps, files and rifflers. Rasps straight and curved stated [S1]; rifflers 12 to 40 cm stated [S4]; a 30 cm straight rasp with 4 mm teeth picked inside the range; scratch fields under 0.5 mm inferred',
  },
  file: {
    id: 'file',
    italian: 'lima',
    english: 'file',
    material: 'iron with fine cut teeth',
    motion: 'edge',
    dimensions: { length: inferred(0.25), width: inferred(0.018), thickness: inferred(0.006), toothPitch: inferred(0.0015) },
    angle: STROKING_ANGLE,
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Raspe and lime: rasps, files and rifflers. Slender files and half-round files stated [S1] [S2]; a 25 cm half-round file with 1.5 mm cuts inferred',
  },
  pumice: {
    id: 'pumice',
    italian: 'pomice',
    english: 'pumice block',
    material: 'grey pumice, worked wet',
    motion: 'face',
    dimensions: { length: inferred(0.1), width: inferred(0.07), height: inferred(0.05) },
    angle: { min: 0, max: 10, inferred: true },
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Abrasives and polish. Pumice points worked wet stated [S1] [S2]; a hand-sized lump of 100 by 70 by 50 mm inferred',
  },
  polish: {
    id: 'polish',
    italian: 'paglia in mazzetti',
    english: 'straw bunch',
    material: 'straw bound with cord',
    motion: 'edge',
    dimensions: { length: inferred(0.25), diameter: inferred(0.05) },
    angle: { min: 0, max: 15, inferred: true },
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Abrasives and polish. Straw made into bunches for the final shine, tripoli earth and leather stated [S1]; a bunch of 25 cm by 5 cm inferred; the leather pad with tripoli is in src/tools/props.ts',
  },
  gilding: {
    id: 'gilding',
    italian: 'pennello da doratura con foglia d’oro',
    english: 'gilding brush with gold leaf',
    material: 'card handle, squirrel hair, beaten gold leaf',
    motion: 'trail',
    dimensions: { length: inferred(0.24), width: inferred(0.08), leafSize: inferred(0.08) },
    angle: { min: 20, max: 45, inferred: true },
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'technique.md, Stage 8 (the sling and stump gilded in the summer of 1504 [S3]; the gilding must arrive through a tool, inferred); the gilder’s tip and an 80 mm leaf inferred',
  },
  mallet: {
    id: 'mallet',
    italian: 'mazzuolo',
    english: 'mallet',
    material: 'forged iron head on an ash handle',
    motion: 'mallet',
    dimensions: { headWidth: inferred(0.04), headHeight: inferred(0.04), headLength: inferred(0.08), headMass: inferred(1.2), handleLength: stated(0.175), handleDiameter: inferred(0.03) },
    angle: null,
    blowsPerShown: null,
    chips: NO_CHIPS,
    source: 'tools.md, Mazzuolo: the mallet. Square head and a 15 to 20 cm handle stated [S4]; a 1 to 1.5 kg iron head of about 40 by 40 by 80 mm inferred [S5] [S13]',
  },
};

export const CATALOG_IDS: readonly CatalogId[] = Object.keys(TOOL_CATALOG) as CatalogId[];

/** The value of one dimension; throws naming the tool and the key when the catalog lacks it, so a geometry builder cannot silently use zero. */
export function dimension(tool: CatalogId, key: DimensionKey): number {
  const measured = TOOL_CATALOG[tool].dimensions[key];
  if (measured === undefined) throw new Error(`the catalog entry for ${tool} has no ${key}: add it to TOOL_CATALOG in src/tools/catalog.ts with its source.`);
  return measured.value;
}

/** Blows of a `size` at or above this, metres, are the first bulk cuts the point drives steeply (technique.md, Stage 2: chips three or four fingers thick). */
export const BULK_CUT_SIZE_M = 0.04;
