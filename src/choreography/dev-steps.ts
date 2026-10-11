/**
 * PROVISIONAL: the engine's development steps over the synthetic figure, one or two per stage of docs/research/technique.md, so the carving can be looked at before the coordinator writes the real David steps from the research. Nothing here is the David's choreography; the regions are boxes around the mannequin, the calendar spans are the technique note's shares of the 865 days interpolated by the engine, and the pitches are set for a plan under 20,000 blows at 8 mm cells, which the dev-steps test counts.
 * Order and tools follow technique.md stage by stage: the nodo blows and the formal start, the drawn principal view, bulk roughing of the front then the sides and back with the heavy point, the sculptor's furrows, the calcagnuolo and the coarse gradina to the half-done report, the fine gradina and the roundel, the bow drill, rasps and files, pumice and straw, and the gilding of the sling on site.
 * Known compromises, stated in the details: coverage is sparse (a shown blow stands for many real ones), the crust at the crown is not kept, and drill holes at 8 mm come out oversized (docs/research/decisions.md).
 */
import type { RegionDef, StageDef, StepDef } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { combing } from './generators/combing';
import { drawing } from './generators/drawing';
import { furrows } from './generators/furrows';
import { gild } from './generators/gild';
import { holes } from './generators/holes';
import { abrading, rasping } from './generators/rasping';
import { scoop } from './generators/scoop';

const W = BLOCK_M.width / 2;
const H = BLOCK_M.height;
const D = BLOCK_M.depth / 2;

const WHOLE_BLOCK: RegionDef = { min: [-W, 0, -D], max: [W, H, D], label: 'the whole block' };
/** The front of the block to just past the figure's centre plane: the half relief Cellini describes; the back the same from behind. */
const FRONT_RELIEF: RegionDef = { min: [-W, 0, -0.1], max: [W, H, D], label: 'the front half, as a relief' };
const BACK_RELIEF: RegionDef = { min: [-W, 0, -D], max: [W, H, 0.1], label: 'the back half, as a relief' };
/** The knot on the chest the Operai record of 9 September 1501 mentions. */
const NODO: RegionDef = { min: [-0.2, 3.55, 0], max: [0.2, 3.95, D], label: 'the nodo on the chest' };
/** The hairline of the mannequin's head, for the bow drill. */
const HAIRLINE: RegionDef = { min: [-0.5, 4.4, -0.5], max: [0.5, 5.2, 0.5], label: 'the head' };
/** Where the sling runs over the left shoulder to the left hand. */
const SLING: RegionDef = { min: [0.25, 3.9, -0.4], max: [0.75, 4.35, 0.15], label: 'the sling over the left shoulder' };

export const DEV_STAGES: readonly StageDef[] = [
  { id: 'setup', title: 'The stock', detail: 'The block upright in the yard and the nodo blows of 9 September 1501 (technique.md, Stage 0).' },
  { id: 'layout', title: 'Laying out', detail: 'The principal view drawn on the front face (technique.md, Stage 1).' },
  { id: 'roughing', title: 'Roughing out', detail: 'The heavy point takes the bulk, front first, then the sides and back (technique.md, Stage 2).' },
  { id: 'coarse-claw', title: 'Calcagnuolo and claw', detail: 'The two-tooth chisel and the coarse gradina to the half-done report of 28 February 1502 (technique.md, Stage 3).' },
  { id: 'fine-claw', title: 'Fine claw and roundel', detail: 'The fine gradina over the whole figure and the roundel in the hollows (technique.md, Stage 4).' },
  { id: 'drilling', title: 'Drilling', detail: 'The bow drill at the hairline and the pupils (technique.md, Stage 5).' },
  { id: 'rasping', title: 'Rasps and files', detail: 'Rasps remove the tooth marks, files soften the skin (technique.md, Stage 6).' },
  { id: 'polishing', title: 'Abrasives and polish', detail: 'Pumice worked wet, then tripoli, straw and leather (technique.md, Stage 7).' },
  { id: 'on-site', title: 'On site', detail: 'The sling and the stump gilded in the summer of 1504 (technique.md, Stage 8).' },
];

/** The bulk cuts: one shown blow stands for about 1,100 real ones, so its crater is the flat-floored union of a field of pits (src/stock/tool-volumes.ts, BULK_RADIUS_RATIO); the pitch keeps neighbouring craters overlapping at every depth (under 2 × radius / √2 = 0.2 m). */
const BULK = { pitch: 0.17, size: 0.12, angle: 85 } as const;

export const DEV_STEPS: readonly StepDef[] = [
  {
    id: 'setup-nodo',
    stage: 'setup',
    title: 'The nodo on the chest',
    detail: 'One or two blows of the chisel remove a knot on the chest, 9 September 1501 (technique.md, Stage 0; the Operai record).',
    tool: 'point',
    region: NODO,
    margin: 0.05,
    blowsPerShown: 1,
    weight: 0.5,
    calendar: { from: '1501-09-09', to: '1501-09-09' },
    plan: (ctx) => furrows(ctx, { faces: ['front'], pitch: 0.2, size: 0.06, angle: 85, maxPasses: 1 }),
  },
  {
    id: 'layout-drawing',
    stage: 'layout',
    title: 'The principal view in charcoal',
    detail: 'The silhouette drawn on the front face before the first cut, as Cellini prescribes (technique.md, Stage 1).',
    tool: 'charcoal',
    region: WHOLE_BLOCK,
    margin: 0.05,
    blowsPerShown: 1,
    weight: 0.25,
    calendar: { from: '1501-09-13', to: '1501-09-13' },
    plan: (ctx) => drawing(ctx, { stride: 0.05, angle: 35 }),
  },
  {
    id: 'roughing-front',
    stage: 'roughing',
    title: 'Roughing the front',
    detail: 'The heavy point driven steeply, layer by layer, the front worked as a half relief (technique.md, Stage 2). One shown blow stands for many; the bite is larger than a real one.',
    tool: 'point',
    region: FRONT_RELIEF,
    margin: 0.05,
    blowsPerShown: 1100,
    weight: 1.2,
    calendar: { from: '1501-09-13', to: '1501-11-05' },
    plan: (ctx) => furrows(ctx, { faces: ['front'], ...BULK }),
  },
  {
    id: 'roughing-back',
    stage: 'roughing',
    title: 'Roughing the back',
    detail: 'The point brought round to the back once the front stands as a relief, the back worked to the centre plane the same way (technique.md, Stage 2).',
    tool: 'point',
    region: BACK_RELIEF,
    margin: 0.05,
    blowsPerShown: 1100,
    weight: 0.6,
    calendar: { from: '1501-11-05', to: '1501-11-25' },
    plan: (ctx) => furrows(ctx, { faces: ['back'], ...BULK }),
  },
  {
    id: 'roughing-sides',
    stage: 'roughing',
    title: 'Roughing the sides and top',
    detail: 'The point takes what the front and back passes left beside the figure, from the sides and the top (technique.md, Stage 2). The crust at the crown is not kept in this provisional plan.',
    tool: 'point',
    region: WHOLE_BLOCK,
    margin: 0.05,
    blowsPerShown: 1100,
    weight: 0.5,
    calendar: { from: '1501-11-25', to: '1501-12-10' },
    plan: (ctx) => furrows(ctx, { faces: ['left', 'right', 'top'], ...BULK }),
  },
  {
    id: 'roughing-furrows',
    stage: 'roughing',
    title: "The sculptor's stroke on the front",
    detail: 'The point at 45 degrees, not lifted between blows, cuts parallel furrows that outline the form, to within a finger of the last skin (technique.md, Stage 2; tools.md, Subbia).',
    tool: 'point',
    region: WHOLE_BLOCK,
    margin: 0.025,
    blowsPerShown: 1100,
    weight: 0.5,
    calendar: { from: '1501-12-10', to: '1501-12-20' },
    plan: (ctx) => furrows(ctx, { faces: ['front'], pitch: 0.04, rowPitch: 0.12, size: 0.035, angle: 45, maxPasses: 1 }),
  },
  {
    id: 'roughing-furrows-sides',
    stage: 'roughing',
    title: "The sculptor's stroke on the sides",
    detail: 'The same furrows carried round the sides, each band at one angle and the next crossing it (technique.md, Stage 2; tools.md, Subbia, The mark).',
    tool: 'point',
    region: WHOLE_BLOCK,
    margin: 0.025,
    blowsPerShown: 1100,
    weight: 0.4,
    calendar: { from: '1501-12-20', to: '1501-12-26' },
    plan: (ctx) => furrows(ctx, { faces: ['left', 'right'], pitch: 0.04, rowPitch: 0.14, size: 0.035, angle: 45, maxPasses: 1 }),
  },
  {
    id: 'two-tooth-front',
    stage: 'coarse-claw',
    title: 'The calcagnuolo over the front',
    detail: 'The two-tooth chisel after the point, in bands around the form, combing the furrows down (technique.md, Stage 3; tools.md, Calcagnuolo). Coverage is sparse: a shown blow stands for many.',
    tool: 'two-tooth',
    region: FRONT_RELIEF,
    margin: 0.012,
    blowsPerShown: 1600,
    weight: 0.9,
    calendar: { from: '1501-12-26', to: '1502-01-28' },
    plan: (ctx) => combing(ctx, { tool: 'two-tooth', pitch: 0.1, stride: 0.08, size: 0.012, angle: 45, passes: ['horizontal'] }),
  },
  {
    id: 'coarse-claw-front',
    stage: 'coarse-claw',
    title: 'The coarse gradina',
    detail: 'The three-tooth gradina worked over the figure to keep the masses in proportion, crossing the calcagnuolo bands, to the half-done report of 28 February 1502 (technique.md, Stage 3).',
    tool: 'claw',
    region: FRONT_RELIEF,
    margin: 0.006,
    blowsPerShown: 1800,
    weight: 0.85,
    calendar: { from: '1502-01-28', to: '1502-02-28' },
    plan: (ctx) => combing(ctx, { tool: 'claw', pitch: 0.1, stride: 0.08, size: 0.008, angle: 45, passes: ['diagonal'] }),
  },
  {
    id: 'fine-claw-figure',
    stage: 'fine-claw',
    title: 'The fine gradina over the figure',
    detail: 'The dente di cane in crossing bands over the whole figure, sides and back brought level with the front, under a millimetre proud (technique.md, Stage 4).',
    tool: 'fine-claw',
    region: WHOLE_BLOCK,
    margin: 0.003,
    blowsPerShown: 2000,
    weight: 7,
    calendar: { from: '1502-02-28', to: '1502-12-20' },
    plan: (ctx) => combing(ctx, { tool: 'fine-claw', pitch: 0.14, stride: 0.08, size: 0.005, angle: 45, passes: ['diagonal'] }),
  },
  {
    id: 'roundel-hollows',
    stage: 'fine-claw',
    title: 'The roundel in the hollows',
    detail: 'The unghietto scoops the creases where the forms meet: the neck, the armpits, between the legs (technique.md, Stage 4; tools.md, Unghietto).',
    tool: 'roundel',
    region: WHOLE_BLOCK,
    margin: 0.002,
    blowsPerShown: 1500,
    weight: 2.25,
    calendar: { from: '1502-12-20', to: '1503-01-14' },
    plan: (ctx) => scoop(ctx, { stride: 0.07, size: 0.004, angle: 45 }),
  },
  {
    id: 'drilling-hairline',
    stage: 'drilling',
    title: 'The bow drill at the hairline',
    detail: 'Running holes along the hairline and single holes for the pupils (technique.md, Stage 5; tools.md, Trapano). At 8 mm cells the holes come out oversized (decisions.md).',
    tool: 'drill',
    region: HAIRLINE,
    margin: 0,
    blowsPerShown: 40,
    weight: 2,
    calendar: { from: '1503-01-14', to: '1503-03-24' },
    plan: (ctx) =>
      holes(ctx, {
        points: [
          [-0.08, 4.9, 0.2],
          [0.1, 4.9, 0.2],
        ],
        paths: [
          [
            [-0.2, 4.98, 0.05],
            [-0.05, 5.03, 0.17],
            [0.1, 5.03, 0.17],
            [0.24, 4.98, 0.05],
          ],
        ],
        pitch: 0.02,
        depth: 0.015,
        runningAngle: 40,
      }),
  },
  {
    id: 'rasping-figure',
    stage: 'rasping',
    title: 'Rasps straight and curved',
    detail: 'Iron rasps crossing over the surface remove the tooth marks and leave a dull, even skin (technique.md, Stage 6; tools.md, Raspe e lime).',
    tool: 'rasp',
    region: WHOLE_BLOCK,
    margin: 0.001,
    blowsPerShown: 1500,
    weight: 1.8,
    calendar: { from: '1503-03-24', to: '1503-06-01' },
    plan: (ctx) => rasping(ctx, { tool: 'rasp', pitch: 0.2, stride: 0.1, size: 0.003, angle: 10, passes: ['horizontal', 'diagonal'] }),
  },
  {
    id: 'filing-figure',
    stage: 'rasping',
    title: 'Files and rifflers',
    detail: 'Slender files and rifflers soften the rasped skin (technique.md, Stage 6; tools.md, Raspe e lime).',
    tool: 'file',
    region: WHOLE_BLOCK,
    margin: 0,
    blowsPerShown: 1500,
    weight: 1.2,
    calendar: { from: '1503-06-01', to: '1503-07-06' },
    plan: (ctx) => rasping(ctx, { tool: 'file', pitch: 0.2, stride: 0.1, size: 0.0015, angle: 10, passes: ['vertical'] }),
  },
  {
    id: 'pumice-figure',
    stage: 'polishing',
    title: 'Pumice worked wet',
    detail: 'Points of pumice stone rubbed wet over the flesh for the flesh-like skin Vasari describes (technique.md, Stage 7; tools.md, Abrasives and polish).',
    tool: 'pumice',
    region: WHOLE_BLOCK,
    margin: 0,
    blowsPerShown: 2000,
    weight: 2,
    calendar: { from: '1503-07-06', to: '1503-09-20' },
    plan: (ctx) => abrading(ctx, { tool: 'pumice', pitch: 0.2, stride: 0.1, size: 0.0005, angle: 5, passes: ['horizontal'] }),
  },
  {
    id: 'polish-figure',
    stage: 'polishing',
    title: 'Tripoli, straw and leather',
    detail: 'Tripoli earth on leather and bunches of straw raise a satin sheen, not a mirror gloss (technique.md, Stage 7).',
    tool: 'polish',
    region: WHOLE_BLOCK,
    margin: 0,
    blowsPerShown: 2000,
    weight: 1.75,
    calendar: { from: '1503-09-20', to: '1504-01-25' },
    plan: (ctx) => abrading(ctx, { tool: 'polish', pitch: 0.2, stride: 0.1, size: 0, angle: 8, passes: ['diagonal'] }),
  },
  {
    id: 'gilding-sling',
    stage: 'on-site',
    title: 'Gilding the sling',
    detail: 'The sling gilded with brush and leaf on site in the summer of 1504 (technique.md, Stage 8).',
    tool: 'gilding',
    region: SLING,
    margin: 0,
    blowsPerShown: 10,
    weight: 1.5,
    calendar: { from: '1504-06-08', to: '1504-09-08' },
    plan: (ctx) => gild(ctx, { pitch: 0.05, stride: 0.04, angle: 30 }),
  },
];
