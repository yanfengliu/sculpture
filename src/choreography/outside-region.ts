/**
 * The cells a step changed outside its region, read from the grids alone: the claim ./generators/confine.ts makes for the tools that strike a footprint, which keep their cut and paint inside their step's region. From the stock and finish grids before the step and the grids after it, a cell counts when its finish became the step's tool's code (painted) or its stone was cut and some stays (a cell taken to air is passed over, so the stone the step's end sweep takes off does not count), and its centre lies outside the step's region with the figure's gradient there; a cell under the block's bottom face is under the yard's floor and does not count, as the planner's own reading passes it.
 * Bound: a cell that already carried the tool's code before the step (the file of last-touches over the file of file-details) is not seen if painted again. For src/choreography/paint-confinement.test.ts and src/choreography/david-steps.slow.test.ts; the planner never imports it.
 */
import type { StepDef, ToolId } from '../contracts/making';
import { TOOL_FINISH } from '../stock/carve';
import type { Grid } from '../stock/grid';
import { inside } from './regions';

/** The tools whose blows strike a footprint (src/stock/footprint.ts; the fine claw strikes its combing patch in fine-claw-all and fine-claw-gaps): the steps of these tools keep their cut and paint inside their regions. */
export const FOOTPRINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['fine-claw', 'rasp', 'file', 'pumice', 'polish', 'gilding']);

/** The stock and finish grids as a step found them. */
export interface GridsBefore {
  readonly stock: Int16Array;
  readonly finish: Uint8Array;
}

/** Cells a step painted and cut outside its region, with the first one's position. */
export interface OutsideCount {
  readonly painted: number;
  readonly cut: number;
  readonly example: string;
}

/** The cells `step` changed outside its region, from the grids `before` it to `stock` and `finish` after it, on `figure`'s lattice. */
export function outsideRegion(step: Pick<StepDef, 'tool' | 'region'>, before: GridsBefore, stock: Grid, finish: Uint8Array, figure: Grid): OutsideCount {
  const code = TOOL_FINISH[step.tool];
  const { nx, ny, limit, values } = stock;
  let painted = 0;
  let cut = 0;
  let example = '';
  for (let g = 0; g < values.length; g += 1) {
    const now = values[g] ?? limit;
    const paint = finish[g] === code && before.finish[g] !== code;
    const cutKeeping = now > (before.stock[g] ?? limit) && now < limit;
    if (!paint && !cutKeeping) continue;
    const p = stock.worldOf(g % nx, Math.floor(g / nx) % ny, Math.floor(g / (nx * ny)));
    if (p[1] < 0 || inside(step.region, p, figure.gradient(p[0], p[1], p[2]))) continue;
    if (paint) painted += 1;
    if (cutKeeping) cut += 1;
    if (example === '') example = p.map((v) => v.toFixed(3)).join(', ');
  }
  return { painted, cut, example };
}
