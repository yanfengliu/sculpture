/**
 * The making of the David, step by step: the 21 steps of docs/design/choreography.md (coordinator-owned), each citing docs/research/technique.md and tools.md, over the regions of ./regions.ts and the generators of ./generators/.
 * The calendar follows the two documented anchors (half done on 28 February 1502, nearly finished on 25 January 1504) with the technique note's inferred shares inside each span; `blowsPerShown` is the step's days × five hours × the tool's documented rate ÷ the shown blows the generator plans, rounded (docs/design/choreography.md, Steps).
 * Known compromises, stated in the details: a shown blow stands for many, the toothed marks are shading at 8 mm, drill holes come out oversized, the sling and stump regions are boxes (docs/research/decisions.md).
 */
import type { Blow, PlanContext, StepDef, ToolId } from '../contracts/making';
import { combing } from './generators/combing';
import { drawing } from './generators/drawing';
import { furrows } from './generators/furrows';
import { gild } from './generators/gild';
import { holes } from './generators/holes';
import { abrading, rasping } from './generators/rasping';
import { scoop } from './generators/scoop';
import { BACK, CHEST_AND_FACE, DETAILS, FACE, FLESH, FRONT, GILT, HAIR, HIGH_POINTS, HOLLOWS, LEFT_HAND, LEFT_SIDE, NODO, RIGHT_SIDE, SIDES_AND_BACK, SLING, STUMP, WHOLE, WHOLE_BUT_CROWN, relief, union } from './regions';

/** The bulk cuts of the heavy point: one shown blow stands for a field of real pits, so its crater is flat-floored (src/stock/tool-volumes.ts); the pitch keeps neighbouring craters overlapping. */
const BULK = { pitch: 0.2, size: 0.15, angle: 85 } as const;
/** The sculptor's stroke: the point at 45 degrees, not lifted between blows (tools.md, Subbia). */
const STROKE = { pitch: 0.04, rowPitch: 0.12, size: 0.035, angle: 45, maxPasses: 1 } as const;

/** Real blows one shown blow stands for: `days` of work at five hours a day and `rate` blows a second, over `shown` planned blows. */
function ratio(days: number, rate: number, shown: number): number {
  return Math.max(1, Math.round((days * 5 * 3600 * rate) / shown));
}

/** Concatenates generator outputs into one step's plan, renumbering strokes so every stroke index is unique and consecutive runs stay runs. */
function sequence(...parts: readonly (readonly Blow[])[]): Blow[] {
  const out: Blow[] = [];
  let base = 0;
  for (const part of parts) {
    let highest = -1;
    for (const blow of part) {
      out.push({ ...blow, stroke: blow.stroke + base });
      highest = Math.max(highest, blow.stroke);
    }
    base += highest + 1;
  }
  return out;
}

const RATE: Readonly<Record<ToolId, number>> = { charcoal: 1, point: 1, 'two-tooth': 1.5, claw: 1.5, 'fine-claw': 1.5, roundel: 1.5, flat: 1.5, drill: 1, rasp: 1, file: 1, pumice: 1, polish: 1, gilding: 1 };

interface StepSpec {
  readonly id: string;
  readonly stage: StepDef['stage'];
  readonly title: string;
  readonly detail: string;
  readonly tool: ToolId;
  readonly region: StepDef['region'];
  readonly margin: number;
  readonly weight: number;
  readonly from: string;
  readonly to: string;
  /** Planned blows the generator is expected to produce (docs/design/choreography.md); only the ratio uses it. */
  readonly shown: number;
  /** Real blows per shown blow when the record gives them directly (the nodo's one or two blows, a drawn mark, a drilled hole), instead of the rate ratio. */
  readonly realPerShown?: number;
  readonly focus?: StepDef['focus'];
  readonly plan: (ctx: PlanContext) => readonly Blow[];
}

function days(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

function step(spec: StepSpec): StepDef {
  const blowsPerShown = spec.realPerShown ?? ratio(days(spec.from, spec.to), RATE[spec.tool], spec.shown);
  const def: StepDef = {
    id: spec.id,
    stage: spec.stage,
    title: spec.title,
    detail: spec.detail,
    tool: spec.tool,
    region: spec.region,
    margin: spec.margin,
    blowsPerShown,
    weight: spec.weight,
    calendar: { from: spec.from, to: spec.to },
    plan: spec.plan,
  };
  return spec.focus === undefined ? def : { ...def, focus: spec.focus };
}

/** The hairline, the curls, the pupils and the nostrils, world metres near the surface of the head as placed by src/david/frame.ts; the drill generator moves each onto the figure. */
const HAIRLINE_PATH: readonly [number, number, number][] = [
  [-0.19, 4.86, 0.12],
  [-0.12, 4.9, 0.21],
  [-0.03, 4.92, 0.25],
  [0.06, 4.92, 0.25],
  [0.14, 4.9, 0.21],
  [0.2, 4.86, 0.12],
];
const CURLS_PATH: readonly [number, number, number][] = [
  [-0.22, 5.02, 0.0],
  [-0.16, 5.05, 0.15],
  [0.0, 5.07, 0.22],
  [0.16, 5.05, 0.15],
  [0.22, 5.02, 0.0],
  [0.16, 5.03, -0.15],
  [0.0, 5.04, -0.21],
  [-0.16, 5.03, -0.15],
];
const PUPILS: readonly [number, number, number][] = [
  [-0.03, 4.76, 0.27],
  [0.07, 4.76, 0.26],
];
const NOSTRILS: readonly [number, number, number][] = [
  [0.01, 4.6, 0.3],
  [0.05, 4.6, 0.3],
];
const FINGER_GAPS: readonly [number, number, number][] = [
  [0.26, 4.15, 0.22],
  [0.29, 4.08, 0.22],
  [0.31, 4.02, 0.2],
];
const SLING_GAP: readonly [number, number, number][] = [[0.34, 4.35, -0.05]];
const STUMP_GAPS: readonly [number, number, number][] = [
  [-0.3, 1.0, -0.2],
  [-0.3, 0.8, -0.25],
];

export const DAVID_STEPS: readonly StepDef[] = [
  step({
    id: 'nodo',
    stage: 'setup',
    title: 'The knot on the chest',
    detail: 'Subbia (point): one or two blows take off the knot on the chest in the Operai record of 9 September 1501, the first blows on the Giant; one shown blow is one real (technique.md, stage 0).',
    tool: 'point',
    region: NODO,
    margin: 0.03,
    weight: 0.5,
    from: '1501-09-09',
    to: '1501-09-09',
    shown: 2,
    realPerShown: 1,
    focus: { kind: 'tip', distance: 1.6 },
    plan: (ctx) => furrows(ctx, { faces: ['front'], pitch: 0.2, size: 0.06, angle: 85, maxPasses: 1 }),
  }),
  step({
    id: 'principal-view',
    stage: 'layout',
    title: 'The principal view drawn on the stone',
    detail: 'Charcoal: the figure drawn on the front face from the small wax model, as Cellini prescribes, checked with square and plumb line; one mark is one real mark (technique.md, stage 1).',
    tool: 'charcoal',
    region: FRONT,
    margin: 0,
    weight: 0.6,
    from: '1501-09-13',
    to: '1501-09-20',
    shown: 400,
    realPerShown: 1,
    plan: (ctx) => drawing(ctx, { stride: 0.05, angle: 35 }),
  }),
  step({
    id: 'high-points',
    stage: 'roughing',
    title: 'The knee and the hand come out first',
    detail: 'Subbia (point) and iron mallet: the highest points of the front first, the left knee and the right hand, by Vasari\'s water rule; one shown blow for many real ones (technique.md, stage 2).',
    tool: 'point',
    region: relief(HIGH_POINTS, 'front'),
    margin: 0.03,
    weight: 0.85,
    from: '1501-09-20',
    to: '1501-10-22',
    shown: 1500,
    focus: { kind: 'tip', distance: 2.2 },
    plan: (ctx) => furrows(ctx, { faces: ['front'], ...BULK }),
  }),
  step({
    id: 'chest-and-face',
    stage: 'roughing',
    title: 'The chest and the face',
    detail: 'Subbia (point): the chest where the knot stood and the face, the front worked as a half relief toward the back; one shown blow for many real ones (technique.md, stage 2).',
    tool: 'point',
    region: relief(CHEST_AND_FACE, 'front'),
    margin: 0.03,
    weight: 0.85,
    from: '1501-10-22',
    to: '1501-11-23',
    shown: 1500,
    focus: { kind: 'tip', distance: 2.2 },
    plan: (ctx) => furrows(ctx, { faces: ['front'], ...BULK }),
  }),
  step({
    id: 'front-furrows',
    stage: 'roughing',
    title: "The sculptor's stroke over the front",
    detail: 'Subbia (point): the legs and base taken down, then the point at 45 degrees cutting parallel furrows over the whole front to a finger of the skin; one shown blow for many (technique.md, stage 2).',
    tool: 'point',
    region: relief(FRONT, 'front'),
    margin: 0.02,
    weight: 2.5,
    from: '1501-11-23',
    to: '1502-01-04',
    shown: 3000,
    plan: (ctx) => sequence(furrows({ ...ctx, region: relief({ ...WHOLE, min: [WHOLE.min[0], 0, WHOLE.min[2]], max: [WHOLE.max[0], 1.3, WHOLE.max[2]], label: 'legs-and-base' }, 'front') }, { faces: ['front'], ...BULK }), furrows(ctx, { faces: ['front'], ...STROKE })),
  }),
  step({
    id: 'two-tooth-front',
    stage: 'coarse-claw',
    title: 'The calcagnuolo over the front',
    detail: 'Calcagnuolo (two-tooth chisel): after the point, bands around the form comb the furrows down to a few millimetres; one shown blow for many real ones (technique.md, stage 3; tools.md).',
    tool: 'two-tooth',
    region: relief(FRONT, 'front'),
    margin: 0.008,
    weight: 1.0,
    from: '1502-01-04',
    to: '1502-01-31',
    shown: 1200,
    plan: (ctx) => combing(ctx, { tool: 'two-tooth', pitch: 0.1, stride: 0.08, size: 0.012, angle: 45, passes: ['horizontal'] }),
  }),
  step({
    id: 'claw-front',
    stage: 'coarse-claw',
    title: 'The coarse gradina to the half-done report',
    detail: 'Gradina (claw chisel): over the figure to keep the masses in proportion, crossing the calcagnuolo bands, to the half-done valuation of 28 February 1502 (technique.md, stage 3).',
    tool: 'claw',
    region: relief(FRONT, 'front'),
    margin: 0.004,
    weight: 1.1,
    from: '1502-01-31',
    to: '1502-02-28',
    shown: 1200,
    plan: (ctx) => combing(ctx, { tool: 'claw', pitch: 0.1, stride: 0.08, size: 0.008, angle: 45, passes: ['diagonal'] }),
  }),
  step({
    id: 'sides-point',
    stage: 'fine-claw',
    title: 'The point opens the sides',
    detail: 'Subbia (point): the sides reached last in the same order of tools, the crown kept under its crust as Condivi saw it; one shown blow for many real ones (technique.md, stage 4).',
    tool: 'point',
    region: union('sides', LEFT_SIDE, RIGHT_SIDE),
    margin: 0.02,
    weight: 3.0,
    from: '1502-02-28',
    to: '1502-05-09',
    shown: 1500,
    plan: (ctx) => sequence(furrows(ctx, { faces: ['left', 'right', 'top'], ...BULK }), furrows(ctx, { faces: ['left', 'right'], ...STROKE, pitch: 0.06, rowPitch: 0.2 })),
  }),
  step({
    id: 'back-point',
    stage: 'fine-claw',
    title: 'The point opens the back',
    detail: 'Subbia (point): the back worked to the centre plane the same way once the front stands as a relief, never cut rashly as Vasari warns (technique.md, stage 4).',
    tool: 'point',
    region: relief(BACK, 'back'),
    margin: 0.02,
    weight: 0.5,
    from: '1502-05-09',
    to: '1502-07-11',
    shown: 1200,
    plan: (ctx) => sequence(furrows(ctx, { faces: ['back'], ...BULK }), furrows(ctx, { faces: ['back'], ...STROKE })),
  }),
  step({
    id: 'sides-and-back-claw',
    stage: 'fine-claw',
    title: 'The gradina round the sides and back',
    detail: 'Gradina (claw chisel): the sides and the back brought level with the front in diagonal bands crossing the point furrows (technique.md, stage 4).',
    tool: 'claw',
    region: SIDES_AND_BACK,
    margin: 0.004,
    weight: 1.75,
    from: '1502-07-11',
    to: '1502-09-19',
    shown: 1500,
    plan: (ctx) => combing(ctx, { tool: 'claw', pitch: 0.1, stride: 0.08, size: 0.008, angle: 45, passes: ['diagonal'] }),
  }),
  step({
    id: 'fine-claw-all',
    stage: 'fine-claw',
    title: 'The dente di cane over the whole figure',
    detail: 'Dente di cane (fine claw): fine bands under a millimetre over the whole figure, crossing the claw bands, as the 2003 traces show; no flat chisel; the crown keeps its crust (technique.md, stage 4).',
    tool: 'fine-claw',
    region: WHOLE_BUT_CROWN,
    margin: 0.0015,
    weight: 1.9,
    from: '1502-09-19',
    to: '1502-12-26',
    shown: 2000,
    plan: (ctx) => combing(ctx, { tool: 'fine-claw', pitch: 0.14, stride: 0.08, size: 0.005, angle: 45, passes: ['diagonal'] }),
  }),
  step({
    id: 'roundel-hollows',
    stage: 'fine-claw',
    title: 'The unghietto in the hollows',
    detail: 'Unghietto (roundel): short scoops in the creases of the head and the hands, the hair and the gaps between the fingers, as the 2003 traces show (technique.md, stage 4; tools.md, Ugnetto).',
    tool: 'roundel',
    region: HOLLOWS,
    margin: 0.0015,
    weight: 0.4,
    from: '1502-12-26',
    to: '1503-02-21',
    shown: 600,
    focus: { kind: 'tip', distance: 1.4 },
    plan: (ctx) => scoop(ctx, { stride: 0.05, size: 0.004, angle: 45 }),
  }),
  step({
    id: 'hairline-and-curls',
    stage: 'drilling',
    title: 'The bow drill at the hairline and the curls',
    detail: 'Trapano a violino (bow drill): running holes along the hairline and between the curls, the webbing partly knocked out; at 8 mm the holes come out wider than the bits (technique.md, stage 5).',
    tool: 'drill',
    region: HAIR,
    margin: 0,
    weight: 0.5,
    from: '1503-02-21',
    to: '1503-03-25',
    shown: 300,
    realPerShown: 3,
    focus: { kind: 'tip', distance: 1.2 },
    plan: (ctx) => holes(ctx, { paths: [HAIRLINE_PATH, CURLS_PATH], pitch: 0.02, depth: 0.015, runningAngle: 40 }),
  }),
  step({
    id: 'pupils-and-nostrils',
    stage: 'drilling',
    title: 'The pupils and the nostrils',
    detail: 'Trapano (drill): the pupils bored as holes in the spheres of the eyes, as the Stanford model shows, and the nostrils; single holes, straight in (technique.md, stage 5; decisions.md).',
    tool: 'drill',
    region: FACE,
    margin: 0,
    weight: 0.3,
    from: '1503-03-25',
    to: '1503-04-10',
    shown: 12,
    realPerShown: 1,
    focus: { kind: 'tip', distance: 1.0 },
    plan: (ctx) => holes(ctx, { points: [...PUPILS, ...NOSTRILS], pitch: 0.02, depth: 0.012, runningAngle: 40 }),
  }),
  step({
    id: 'fingers-sling-stump',
    stage: 'drilling',
    title: 'Between the fingers, the sling and the stump',
    detail: 'Trapano (drill): the gaps the chisel cannot reach, between the fingers of the left hand, under the sling at the shoulder and by the stump, after Cellini on undercutting (technique.md, stage 5).',
    tool: 'drill',
    region: union('undercuts', LEFT_HAND, SLING, STUMP),
    margin: 0,
    weight: 0.4,
    from: '1503-04-10',
    to: '1503-05-09',
    shown: 200,
    realPerShown: 2,
    focus: { kind: 'tip', distance: 1.2 },
    plan: (ctx) => holes(ctx, { points: [...FINGER_GAPS, ...SLING_GAP, ...STUMP_GAPS], paths: [FINGER_GAPS, STUMP_GAPS], pitch: 0.02, depth: 0.02, runningAngle: 40 }),
  }),
  step({
    id: 'rasp-flesh',
    stage: 'rasping',
    title: 'Rasps over the flesh',
    detail: 'Raspa (rasp): rasps crossing over the flesh erase the claw bands, the public let in to see the Giant on 23 June 1503; hair, sling and stump keep their texture (technique.md, stage 6).',
    tool: 'rasp',
    region: FLESH,
    margin: 0.0005,
    weight: 2.4,
    from: '1503-05-09',
    to: '1503-07-19',
    shown: 1500,
    plan: (ctx) => rasping(ctx, { tool: 'rasp', pitch: 0.06, stride: 0.12, size: 0.003, angle: 10, passes: ['diagonal'] }),
  }),
  step({
    id: 'file-details',
    stage: 'rasping',
    title: 'Files on the face and the hands',
    detail: 'Lima (file) and rifflers: the face and the hands softened after the rasp, the files finer than the rasp and the rifflers for the hollows (technique.md, stage 6; tools.md, Raspe e lime).',
    tool: 'file',
    region: DETAILS,
    margin: 0.0002,
    weight: 0.5,
    from: '1503-07-19',
    to: '1503-09-02',
    shown: 500,
    focus: { kind: 'tip', distance: 1.2 },
    plan: (ctx) => rasping(ctx, { tool: 'file', pitch: 0.05, stride: 0.06, size: 0.0015, angle: 10, passes: ['vertical'] }),
  }),
  step({
    id: 'pumice-flesh',
    stage: 'polishing',
    title: 'Pumice worked wet over the flesh',
    detail: 'Pomice (pumice): fine white pumice rubbed wet over the flesh for the flesh-like skin Vasari describes, Cellini\'s last stone (technique.md, stage 7; tools.md, Abrasives and polish).',
    tool: 'pumice',
    region: FLESH,
    margin: 0,
    weight: 1.3,
    from: '1503-09-02',
    to: '1503-11-21',
    shown: 1500,
    plan: (ctx) => abrading(ctx, { tool: 'pumice', pitch: 0.1, stride: 0.12, size: 0.0005, angle: 5, passes: ['horizontal'] }),
  }),
  step({
    id: 'tripoli-straw-leather',
    stage: 'polishing',
    title: 'Tripoli, straw and leather',
    detail: 'Straw bunches with tripoli on leather raise the satin sheen Vasari names, no mirror gloss, to the minute of 25 January 1504 calling it nearly finished (technique.md, stage 7).',
    tool: 'polish',
    region: FLESH,
    margin: 0,
    weight: 0.95,
    from: '1503-11-21',
    to: '1504-01-25',
    shown: 1000,
    plan: (ctx) => abrading(ctx, { tool: 'polish', pitch: 0.12, stride: 0.15, size: 0, angle: 8, passes: ['diagonal'] }),
  }),
  step({
    id: 'last-touches',
    stage: 'on-site',
    title: 'Last touches on the nose and the hair',
    detail: 'Lima (file) and rifflers: on the ringhiera from 8 June 1504, the scaffold still up when Soderini spoke of the nose, last touches on the finished face and hair with the file (technique.md, stage 8).',
    tool: 'file',
    region: union('face-and-hair', FACE, HAIR),
    margin: 0.001,
    weight: 0.3,
    from: '1504-06-08',
    to: '1504-06-30',
    shown: 60,
    realPerShown: 50,
    focus: { kind: 'tip', distance: 1.2 },
    plan: (ctx) => rasping(ctx, { tool: 'file', pitch: 0.2, stride: 0.15, size: 0.001, angle: 10, passes: ['diagonal'] }),
  }),
  step({
    id: 'gilding',
    stage: 'on-site',
    title: 'Gilding the sling and the stump',
    detail: 'Gilding brush and leaf: the sling and the tree stump, the broncone of the documents, gilded that summer before the unveiling of 8 September 1504; the copper garland not shown (technique.md, stage 8).',
    tool: 'gilding',
    region: GILT,
    margin: 0,
    weight: 1.3,
    from: '1504-07-01',
    to: '1504-09-08',
    shown: 300,
    realPerShown: 4,
    focus: { kind: 'tip', distance: 1.6 },
    plan: (ctx) => gild(ctx, { pitch: 0.05, stride: 0.04, angle: 30 }),
  }),
];
