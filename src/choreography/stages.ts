/**
 * The stages of the making, in order, from docs/research/technique.md (coordinator-owned; the step lists per stage live beside this file).
 * Each stage names its tools and the research section behind it; the shares of time are the note's inferences anchored on the two documents (half done on 28 February 1502, nearly finished on 25 January 1504).
 */
import type { StageDef } from '../contracts/making';

export const STAGES: readonly StageDef[] = [
  {
    id: 'setup',
    title: 'The Giant in the yard',
    detail: 'The block stands upright in its plank enclosure; on 9 September 1501 one or two chisel blows remove the knot on its chest (technique.md, stage 0).',
  },
  {
    id: 'layout',
    title: 'Laying the figure out',
    detail: 'The principal view is drawn on the front face from the small wax model, checked with the square and the plumb line (technique.md, stage 1).',
  },
  {
    id: 'roughing',
    title: 'Roughing out with the point',
    detail: 'The heavy subbia and iron mallet open the front in parallel furrows, highest points first, leaving 10 to 30 mm of stone (technique.md, stage 2).',
  },
  {
    id: 'coarse-claw',
    title: 'The two-tooth and the coarse claw',
    detail: 'The calcagnuolo and the three-tooth gradina comb the furrows down to 2 to 5 mm, to the half-done report of 28 February 1502 (technique.md, stage 3).',
  },
  {
    id: 'fine-claw',
    title: 'The fine claw and the roundel',
    detail: 'The dente di cane and the unghietto work around the form over the sides and back, to within 1 to 2 mm; no flat chisel was found on the David (technique.md, stage 4).',
  },
  {
    id: 'drilling',
    title: 'Drilling',
    detail: 'The bow drill opens the hairline, the curls, the pupils, the sling and the gaps between the fingers; some webbing is left (technique.md, stage 5).',
  },
  {
    id: 'rasping',
    title: 'Rasps and files',
    detail: 'Crossing scratches of the rasps and files erase the claw bands on the flesh; the hair, sling and stump keep their texture (technique.md, stage 6).',
  },
  {
    id: 'polishing',
    title: 'Pumice, tripoli, straw and leather',
    detail: 'Wet pumice, then tripoli on leather and bunches of straw, bring the flesh to a satin sheen by 25 January 1504 (technique.md, stage 7).',
  },
  {
    id: 'on-site',
    title: 'On site in the Piazza',
    detail: 'After the four-day move in May 1504, last touches on the nose and hair, and the gilding of the sling and the stump before the unveiling of 8 September (technique.md, stage 8).',
  },
];
