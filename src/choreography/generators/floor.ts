/**
 * The floor pass (docs/research/technique.md, Stage 2: the legs and the base taken down): at the end of a point step that finishes its part of the block, the stone still standing on the block's floor farther than the step's margin from the figure is chopped off, so no stub or sheet of waste stands on the floor beside the base when the claws begin (the floor stubs of the slow test, 2026-10-14).
 * The pass reads the floor band of the scratch (./scratch.ts, FloorBand), the stock's lowest FLOOR_ROWS rows at the stock's own resolution, carved with every blow the step plans: the 2 cm scratch the layers read averages a sheet one 8 mm cell thick away, and the craters of two neighbouring columns leave such sheets where their rims meet (measured: 10 to 30 cells, one cell thick, 3 to 9 rows tall, at the block's edges and behind the base).
 * Every leftover cell of the band inside the step's box, in scan order, gets a chop unless an earlier chop took it: a bulk cut struck down and in at 45 degrees from the side among the step's faces whose air is nearest, the point driven along the diagonal so the shaft rises clear of the floor, with the shaft's first SHAFT_CLEARANCE of air checked. A cell is skipped when no side opens to air within EXIT_REACH or every open side's shaft meets stone, and the pass stops after MAX_CHOPS; a later step's floor pass meets what is left (after sides-point at 8 mm on the mannequin, 5 cells under a 4 cm sheet that back-point then takes). A chop that takes nothing from either lattice (the margin holds the stone, or the cut misses it) is left out of the plan. The band holds the stone at the step's margin, which is what the engine applies, so a cell is never counted as left over when the engine has taken it.
 */
import { FIXED_POINT } from '../../contracts/grid';
import type { Blow, PlanContext, RegionDef, SdfSampler, Vec3 } from '../../contracts/making';
import { type Face, FACES } from './face-model';
import type { ScratchStock } from './scratch';
import { blowAt, firstEntry, firstExit, normalize } from './surface';

/** Rows of the stock's lattice the floor band holds, from its lowest stone row: 12.8 cm at 8 mm, above the tallest sheet measured (9 rows). */
export const FLOOR_ROWS = 16;
/** A band cell is left over when its stone lies farther than the step's margin plus this from the figure, metres: a cell of slack over the 8 mm lattice, so the margin's own skin is never chopped. */
const LEFTOVER_SLACK = 0.01;
/** How far back along the shaft the air must be clear, metres (the handle end of a 25 cm point). */
const SHAFT_CLEARANCE = 0.16;
/** How far from a leftover cell its open side is looked for, metres. */
const EXIT_REACH = 0.4;
/** Most chops a step's floor pass plans: a guard, far above the handful of sheets a step leaves. */
const MAX_CHOPS = 400;

export interface FloorOptions {
  /** Cut depth of a chop, metres: a bulk cut (at or above BULK_CUT_SIZE_M). */
  readonly size: number;
  /** Tool axis angle to the chop's surface, degrees. */
  readonly angle: number;
}

/** The band where it holds the point, the scratch above it: a sampler for the marches. */
function floorSampler(scratch: ScratchStock): SdfSampler | null {
  const band = scratch.floor;
  if (band === null) return null;
  const { spec, j0, rows, values } = band;
  const [nx, , nz] = spec.size;
  const { cell, origin } = spec;
  const scale = cell / FIXED_POINT;
  return {
    sample(x, y, z) {
      const j = Math.round((y - origin[1]) / cell) - j0;
      if (j < 0 || j >= rows) return scratch.sample(x, y, z);
      const i = Math.round((x - origin[0]) / cell);
      const k = Math.round((z - origin[2]) / cell);
      if (i < 0 || i >= nx || k < 0 || k >= nz) return band.limit * scale;
      return (values[i + nx * (j + rows * k)] ?? band.limit) * scale;
    },
    gradient: () => [0, 1, 0],
  };
}

/** Plans the floor pass over `box` with the step's `margin` from the sides `faces` (the top is never one); `onBlow` hears each chop kept. Returns the stroke count after. */
export function clearFloor(ctx: PlanContext, scratch: ScratchStock, box: RegionDef, faces: readonly Face[], options: FloorOptions, random: () => number, blows: Blow[], strokeBase: number, onBlow?: (blow: Blow) => void): number {
  const band = scratch.floor;
  const sampler = floorSampler(scratch);
  const sides = faces.filter((face) => face !== 'top');
  if (band === null || sampler === null || sides.length === 0) return strokeBase;
  const { spec, j0, rows, values, figure } = band;
  const [nx, , nz] = spec.size;
  const { cell, origin } = spec;
  if (box.min[1] > origin[1] + j0 * cell + cell) return strokeBase;
  const threshold = Math.round(((ctx.margin + LEFTOVER_SLACK) / cell) * FIXED_POINT);
  const i0 = Math.max(0, Math.ceil((box.min[0] - origin[0]) / cell));
  const i1 = Math.min(nx - 1, Math.floor((box.max[0] - origin[0]) / cell));
  const k0 = Math.max(0, Math.ceil((box.min[2] - origin[2]) / cell));
  const k1 = Math.min(nz - 1, Math.floor((box.max[2] - origin[2]) / cell));
  let stroke = strokeBase;
  let chops = 0;
  for (let k = k0; k <= k1; k += 1) {
    for (let j = 0; j < rows; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const index = i + nx * (j + rows * k);
        if ((values[index] ?? 0) >= 0 || (figure[index] ?? 0) <= threshold) continue;
        if (chops >= MAX_CHOPS) return stroke;
        const at: Vec3 = [origin[0] + i * cell, origin[1] + (j0 + j) * cell, origin[2] + k * cell];
        let best: { face: Face; out: Vec3; exit: number } | null = null;
        for (const face of sides) {
          const frame = FACES[face];
          const out = normalize([frame.outwardNormal[0], 1, frame.outwardNormal[2]]);
          const exit = firstExit(sampler, at, out, EXIT_REACH, cell * 0.5);
          if (exit === null || (best !== null && exit >= best.exit)) continue;
          const beyond: Vec3 = [at[0] + out[0] * (exit + cell), at[1] + out[1] * (exit + cell), at[2] + out[2] * (exit + cell)];
          if (firstEntry(sampler, beyond, out, SHAFT_CLEARANCE, cell * 0.5) !== null) continue;
          best = { face, out, exit };
        }
        if (best === null) continue;
        const frame = FACES[best.face];
        const point: Vec3 = [at[0] + best.out[0] * best.exit, at[1] + best.out[1] * best.exit, at[2] + best.out[2] * best.exit];
        const lean = random() < 0.5 ? frame.row : ([-frame.row[0], -frame.row[1], -frame.row[2]] as const);
        const blow = blowAt('point', point, best.out, lean, options.angle, options.size, stroke);
        if (!scratch.struckStone(scratch.carve(blow, ctx.margin))) continue;
        blows.push(blow);
        onBlow?.(blow);
        stroke += 1;
        chops += 1;
      }
    }
  }
  return stroke;
}
