/**
 * The volume each tool removes with one blow, as a closed-form signed distance in world metres (negative inside the removed volume), from docs/research/tools.md and docs/research/engine-options.md section 4.
 * A blow's frame (src/stock/tool-frame.ts): `n` the outward stock normal, `d` the tool axis from handle to tip, `u` the push direction (the part of `d` along the surface) and `w = n × u` across the blade. Local coordinates: `a` along the push, `b` across, `c` above the surface.
 * Every shape here is 1-Lipschitz (a true distance or a lower bound of one built from maxima of distances) or states its constant in `lipschitz` (the rubbing slab, the bulk crater), which the carving loop relies on to skip blocks of cells far from the volume.
 * Bounds are the tight axis-aligned box of each shape (a cylinder's box, not a cube of its reach), because the carving loop and the chunk jobs visit every cell of the box dilated by the band.
 */
import type { Blow, ToolId, Vec3 } from '../contracts/making';
import { blowFrame, blowSeed, cylinderBounds, extrude, type Frame, frameBounds, PIT_MEAN, PIT_SLOPE, pitDepth, polygonDistance, rotationRows, roundedBox2, seededUnit, turn } from './tool-frame';

/** The removed volume's dimensions per tool, metres and radians. `source` names the line of docs/research/tools.md (or technique.md) the numbers come from. */
export interface ToolVolumeSpec {
  /** Blade or footprint width across the push, metres. */
  readonly width: number;
  /** Push length along the stroke (or the footprint length), metres. */
  readonly push: number;
  /** Half-angle of the point's cone, radians; the tool angle to the surface for the blade tools, radians. */
  readonly angle: number;
  /** Removes stock; false for the tools that only paint finish. */
  readonly removes: boolean;
  readonly source: string;
}

const DEG = Math.PI / 180;

export const TOOL_VOLUMES: Readonly<Record<ToolId, ToolVolumeSpec>> = {
  charcoal: { width: 0.024, push: 0.024, angle: 90 * DEG, removes: false, source: 'technique.md, Stage 1: the front face carries the drawn principal view (chalk or charcoal, a single contour)' },
  point: { width: 0, push: 0, angle: 35 * DEG, removes: true, source: 'tools.md, Subbia, The mark: V-shaped furrows 10 to 25 mm wide and 5 to 15 mm deep; engine-options.md section 4: capped cone, half-angle 30 to 45 degrees, crush sphere at the apex' },
  'two-tooth': { width: 0.018, push: 0.035, angle: 45 * DEG, removes: true, source: 'tools.md, Calcagnuolo, Dimensions: edge 15 to 20 mm wide; The mark: each stroke 20 to 50 mm long; held at 35 to 60 degrees' },
  claw: { width: 0.016, push: 0.04, angle: 45 * DEG, removes: true, source: 'tools.md, Gradina, Dimensions: coarse gradina with three squared teeth on a 15 to 18 mm edge; The mark: strokes 20 to 60 mm long; 35 to 60 degrees' },
  'fine-claw': { width: 0.011, push: 0.03, angle: 45 * DEG, removes: true, source: 'tools.md, Gradina, Dimensions: fine gradina (dente di cane) with four or five small teeth on a 10 to 12 mm edge' },
  roundel: { width: 0.009, push: 0.02, angle: 45 * DEG, removes: true, source: 'tools.md, Unghietto, The mark: scooped channels of round section 6 to 12 mm wide, each stroke 10 to 30 mm long; a 9 mm size is sold today' },
  flat: { width: 0.03, push: 0.03, angle: 45 * DEG, removes: true, source: 'tools.md, Scalpello: edge 0.5 to 10 cm, held at 35 to 60 degrees, almost smooth sets of parallel straight lines' },
  drill: { width: 0.005, push: 0, angle: 45 * DEG, removes: true, source: 'tools.md, Trapano, The mark: cylindrical holes 4 to 6 mm across and 8 to 20 mm deep; the bit is a chisel-shaped spade point' },
  rasp: { width: 0.05, push: 0.12, angle: 0, removes: true, source: 'tools.md, Raspe e lime, The mark: strokes 5 to 15 cm long crossing at random angles, scratch fields under 0.5 mm deep; the shown stroke is a little wider than the 3 cm rasp since it stands for many' },
  file: { width: 0.03, push: 0.06, angle: 0, removes: true, source: 'tools.md, Raspe e lime: slender files and rifflers 12 to 40 cm refine after the rasps; the shown sweep is twice the 15 mm riffler since it stands for many strokes' },
  pumice: { width: 0.08, push: 0.12, angle: 0, removes: true, source: 'tools.md, Abrasives and polish: a grey hand-sized lump worked wet, removes the rasp scratches and leaves a matt skin' },
  polish: { width: 0.1, push: 0.15, angle: 0, removes: false, source: 'tools.md, Abrasives and polish: tripoli on a leather pad, straw bunches and leather burnish to a satin finish' },
  gilding: { width: 0.08, push: 0.08, angle: 0, removes: false, source: 'technique.md, Stage 8: the sling and stump were gilded that summer; the gilding arrives through a brush and leaf, one 80 mm leaf per blow (src/tools/catalog.ts, leafSize)' },
};

/** Crush sphere at the point's apex as a fraction of the cut depth: the whitened furrow bottom of tools.md, Subbia, The mark. */
export const CRUSH_RATIO = 0.2;
/** A point blow of this size or more is a bulk cut (the tools' BULK_CUT_SIZE_M in src/tools/catalog.ts, which the tests check this equals). */
export const BULK_CUT_SIZE_M = 0.04;
/**
 * A fine-claw blow of this size or more is a combing patch: one shown blow of the finishing pass stands for about 1,300 real strokes (docs/design/choreography.md), so its removed volume is the surface-following patch those strokes comb, down to the step's margin, painted with the claw's texture, not one wedge. A departure from a single blow's wedge, stated in the handoff.
 */
export const PATCH_SIZE_M = 0.02;
/** The combing patch's footprint, metres: a hand's breadth along the stroke by half across. */
export const PATCH_SPEC: ToolVolumeSpec = { width: 0.08, push: 0.12, angle: 45 * DEG, removes: true, source: 'technique.md, Stage 4: the dente di cane over the whole figure, one shown blow standing for a combed patch' };
/**
 * A bulk cut's crater: one shown bulk blow stands for about a thousand real ones (docs/research/decisions.md, Time and scale), so its removed volume is the union of a field of 90-degree pits, which tools.md (Subbia, The mark) describes as a pitted, crater-like crust: a crater of radius about `BULK_RADIUS_RATIO × size`, its rim ragged and its floor pitted, not one pit. A departure from a single blow's cone, stated in the handoff.
 * The floor meets the wall sharply: a rounded bottom edge left a ring of stock between neighbouring craters that the planner could not predict (src/choreography/generators/furrows.ts predicts the floors it has made) and that read as slivers.
 */
export const BULK_RADIUS_RATIO = 1.2;
/** The rim's wobble around the axis as a fraction of the radius, for the harmonics of 2, 3 and 5 lobes in turn, each at a seeded phase (2026-10-14): a field of pits ends in a ragged edge, not a circle. The sum, RIM_WOBBLE (0.2), is the most the rim moves out; it moves in to the radius over 1 + RIM_WOBBLE. */
const RIM_AMPLITUDES = [0.1, 0.07, 0.03] as const;
const RIM_ORDERS = [2, 3, 5] as const;
export const RIM_WOBBLE = RIM_AMPLITUDES[0] + RIM_AMPLITUDES[1] + RIM_AMPLITUDES[2];
/** The largest rate of the wobble around the axis, per radian: the sum of order × amplitude. */
const RIM_SLOPE = RIM_ORDERS[0] * RIM_AMPLITUDES[0] + RIM_ORDERS[1] * RIM_AMPLITUDES[1] + RIM_ORDERS[2] * RIM_AMPLITUDES[2];
/**
 * The pits of a crater's floor and walls (tools.md, Subbia, The mark: a pitted, crater-like crust with 10 to 20 mm pits): one cone per PIT_PITCH cube of a lattice fixed in the stone and turned off the world's axes, its radius 0.25 to 0.42 of the pitch (pits 11 to 18 mm across) and the largest PIT_DEPTH deep (`pitDepth`, src/stock/tool-frame.ts), so a face or a floor cuts them at mixed sizes and depths.
 * Fixed in the stone, not drawn per blow: where two shown craters overlap at one depth they stand for the same real pits, so their floors agree cell for cell and the later blow leaves the earlier floor's band alone. Pits drawn per blow rewrote that band wherever the new pit was the deeper and cost 28 percent more undo per bulk blow (src/stock/undo-budget.test.ts, 40.6 to 52.2 KB, 2026-10-14).
 */
const PIT_PITCH = 0.022;
export const PIT_DEPTH = 0.005;
/** The pit lattice's axes in world space over the pitch: the turn of the quaternion (0.29, −0.29, −0.29, −0.86), which leaves every lattice axis 47 to 71 degrees off every world axis, so no face of the block is parallel to a lattice plane. */
const PIT_AXES = rotationRows(0.29, -0.29, -0.29, -0.86).map((axis) => axis.map((v) => v / PIT_PITCH));
/** The lattice's own seed for the pits' radii and centres: a constant, since the field belongs to the stone, not to a blow. */
const PIT_SEED = 0x2545f491;
/** Corner radius of the rasp, file and pumice footprints as a fraction of the width. */
export const FOOTPRINT_ROUNDING = 0.3;
/** Corner radius of the charcoal, polish and gilding footprints as a fraction of the lesser half extent. */
export const PAINT_ROUNDING = 0.5;
/** Width of the feathered edge of a rasped patch as a fraction of the footprint's half width: the depth tapers to nothing there, as a rubbed patch does. */
const FEATHER = 0.5;
/** Above and below the surface, the painting tools reach one blow size, so both sides of a crossing edge are painted. */
const PAINT_HALF_THICKNESS = 0.012;
/** The shank of the drill and the base of the cone extend this far above the surface, so the volume is open toward the air. */
export const AIR_EXTENSION = 0.05;

/** The signed distance of a blow's removed volume at a world point. `figure` is the figure's signed distance at the point, which the surface-following tools use as their depth axis. */
export interface ToolVolume {
  distance(x: number, y: number, z: number, figure: number): number;
  /** The distances of `count` cells along x at `originX + (first + i) × cell` (the same float the per-cell path forms, so the bytes do not depend on which path ran), written to `out`: the hot shapes (the bulk crater, the cone and the rubbing slab) give the carving loop a row at a time, with the row's constants hoisted and no call per cell. A surface-following shape reads the figure's distance of cell `i` as `figure[at + i] × figureScale`, metres. */
  distances?(originX: number, first: number, cell: number, count: number, y: number, z: number, out: Float64Array, figure: Int16Array, at: number, figureScale: number): void;
  /** Axis-aligned bounds of the volume in world metres (min then max). */
  readonly min: Vec3;
  readonly max: Vec3;
  readonly removes: boolean;
  /** How much faster than 1 per metre the distance may change: 1 for the true distances; more for the surface-following slab, whose depth axis is the sampled figure field and whose edge tapers, and for the bulk crater, whose rim wobbles and whose floor is pitted (the carving loop widens its skip and clamp margins by it). */
  readonly lipschitz: number;
}

/** The closed-form volume each shape removes from a flat face struck along the normal, metres cubed; the tests compare the carved volume with it. */
export function closedFormVolume(tool: ToolId, size: number): number {
  const spec = TOOL_VOLUMES[tool];
  switch (tool) {
    case 'point': {
      if (size >= BULK_CUT_SIZE_M) {
        // The cylinder, its section widened by the ragged rim's mean area (1 plus the sum of the squared amplitudes, to second order), plus the pits' mean depth over the floor and the wall below the face.
        const radius = BULK_RADIUS_RATIO * size;
        const rim = 1 + RIM_AMPLITUDES[0] ** 2 + RIM_AMPLITUDES[1] ** 2 + RIM_AMPLITUDES[2] ** 2;
        return Math.PI * radius * radius * size * rim + PIT_MEAN * PIT_DEPTH * (Math.PI * radius * radius + 2 * Math.PI * radius * size);
      }
      const radius = size * Math.tan(spec.angle);
      const crush = CRUSH_RATIO * size;
      return (Math.PI / 3) * radius * radius * size + ((1 + Math.cos(spec.angle)) / 2) * (4 / 3) * Math.PI * crush ** 3;
    }
    case 'two-tooth':
    case 'claw':
    case 'fine-claw':
      return 0.5 * spec.push * size * spec.width;
    case 'flat': {
      const descent = Math.min(size / Math.tan(spec.angle), spec.push / 2);
      return spec.width * size * (spec.push - 0.5 * (descent + size));
    }
    case 'roundel': {
      const radius = ((spec.width * spec.width) / 4 + size * size) / (2 * size);
      const segment = radius * radius * Math.acos((radius - size) / radius) - (radius - size) * Math.sqrt(2 * radius * size - size * size);
      return spec.push * segment + (Math.PI * size * size * (3 * radius - size)) / 3;
    }
    case 'drill': {
      const r = spec.width / 2;
      return Math.PI * r * r * (size - (2 * r) / 3);
    }
    case 'rasp':
    case 'file':
    case 'pumice': {
      const rounding = FOOTPRINT_ROUNDING * spec.width;
      const feather = Math.max(FEATHER * (spec.width / 2), size);
      const area = spec.push * spec.width - (4 - Math.PI) * rounding * rounding;
      const perimeter = 2 * (spec.push + spec.width) - 8 * rounding + 2 * Math.PI * rounding;
      return (area - 0.5 * perimeter * feather) * size;
    }
    default:
      return 0;
  }
}

/** Builds the removed volume of `blow`. `figureAtPoint` is the figure's distance at the blow point and `figureBand` the figure grid's clamp in metres; a surface-following tool uses the figure's level sets as its depth axis only while the figure is well inside its band. */
export function toolVolume(blow: Blow, figureAtPoint: number, figureBand: number): ToolVolume {
  const spec = TOOL_VOLUMES[blow.tool];
  const f = blowFrame(blow);
  const size = blow.size;
  switch (blow.tool) {
    case 'point':
      return size >= BULK_CUT_SIZE_M ? bulkCrater(f, size, blowSeed(blow)) : pointCone(f, size, spec);
    case 'fine-claw':
      return size >= PATCH_SIZE_M ? surfaceSlab(f, size, PATCH_SPEC, figureAtPoint, figureBand) : bladeWedge(f, size, spec, false);
    case 'two-tooth':
    case 'claw':
    case 'flat':
      return bladeWedge(f, size, spec, blow.tool === 'flat');
    case 'roundel':
      return roundelScoop(f, size, spec);
    case 'drill':
      return drillHole(f, size, spec);
    case 'rasp':
    case 'file':
    case 'pumice':
      return surfaceSlab(f, size, spec, figureAtPoint, figureBand);
    default:
      return paintFootprint(f, spec);
  }
}

/**
 * The bulk crater: a flat-floored cylinder along the tool axis, `size` deep from the blow point and reaching as far above it, so a fin or a cusp the neighbouring craters left standing inside its radius comes away with it (one shown blow stands for a field of pits, and the sculptor knocks such slivers off; src/stock/connectivity.test.ts), its floor meeting its wall sharply.
 * Its rim wobbles: the radius at angle θ around the axis is `radius × (1 + W(θ))`, W the harmonics of RIM_AMPLITUDES at phases drawn from the blow's own seed (`blowSeed`, so the main thread, the planner's scratch and the carve workers cut the same crater), taken in proportion to the distance from the axis inside the radius (`a = ρ − radius − min(ρ, radius) W`), so the wobble has no kink or blow-up at the axis. Its floor and walls are pitted: the distance less PIT_DEPTH times the stone's pit lattice (`pitDepth`, src/stock/tool-frame.ts), so a pit only deepens the cut.
 * Slope: the radial term changes at most `hypot(1 + RIM_WOBBLE, RIM_SLOPE)` per metre (1.32), the height term 1 and at right angles to it, so the cylinder keeps the larger, and the pits add `PIT_SLOPE × PIT_DEPTH / PIT_PITCH` (0.54): 1.87 in all.
 * `distance` runs the row form for one cell, so both give every cell the same float.
 */
function bulkCrater(f: Frame, size: number, seed: number): ToolVolume {
  const radius = BULK_RADIUS_RATIO * size;
  const halfHeight = size;
  const { px, py, pz, w } = f;
  const [dx, dy, dz] = f.d;
  // Two axes across the tool axis: w is at right angles to it.
  const [exx, exy, exz] = w;
  const [eyx, eyy, eyz] = [dy * exz - dz * exy, dz * exx - dx * exz, dx * exy - dy * exx];
  // The harmonics' cosine and sine weights at seeded phases, by `turn`, not Math.cos and Math.sin: Chrome and Node round those differently in the last bit (engine-b, 2026-10-14), and a crater the page carves after a snapshot Node built must be the crater Node carved.
  const [w2c = 0, w2s = 0, w3c = 0, w3s = 0, w5c = 0, w5s = 0] = RIM_AMPLITUDES.flatMap((amplitude, n) => {
    const [c, s] = turn(seededUnit(seed, n));
    return [amplitude * c, amplitude * s];
  });
  const [[l1x = 0, l1y = 0, l1z = 0] = [], [l2x = 0, l2y = 0, l2z = 0] = [], [l3x = 0, l3y = 0, l3z = 0] = []] = PIT_AXES;
  const bounds = cylinderBounds([px, py, pz], f.d, radius * (1 + RIM_WOBBLE) + PIT_DEPTH, halfHeight + PIT_DEPTH);
  const row = (originX: number, first: number, cell: number, count: number, y: number, z: number, out: Float64Array): void => {
    const qy = y - py;
    const qz = z - pz;
    const h0 = qy * dy + qz * dz;
    const u0 = qy * exy + qz * exz;
    const v0 = qy * eyy + qz * eyz;
    const g10 = y * l1y + z * l1z;
    const g20 = y * l2y + z * l2z;
    const g30 = y * l3y + z * l3z;
    for (let i = 0; i < count; i += 1) {
      const x = originX + (first + i) * cell;
      const qx = x - px;
      const h = qx * dx + h0;
      const u = qx * exx + u0;
      const v = qx * eyx + v0;
      const rho = Math.sqrt(u * u + v * v);
      const taper = rho < radius ? rho : radius;
      const b = (h < 0 ? -h : h) - halfHeight;
      const inv = rho > 0 ? 1 / rho : 0;
      // cos and sin of θ, 2θ, 3θ and 5θ by complex powers of (u + iv) / ρ.
      const c1 = u * inv;
      const s1 = v * inv;
      const c2 = c1 * c1 - s1 * s1;
      const s2 = 2 * c1 * s1;
      const c3 = c2 * c1 - s2 * s1;
      const s3 = c2 * s1 + s2 * c1;
      const c5 = c3 * c2 - s3 * s2;
      const s5 = c3 * s2 + s3 * c2;
      const a = rho - radius - taper * (w2c * c2 + w2s * s2 + w3c * c3 + w3s * s3 + w5c * c5 + w5s * s5);
      const inside = a > b ? a : b;
      const oa = a > 0 ? a : 0;
      const ob = b > 0 ? b : 0;
      const cylinder = (inside < 0 ? inside : 0) + Math.sqrt(oa * oa + ob * ob);
      out[i] = cylinder - PIT_DEPTH * pitDepth(x * l1x + g10, x * l2x + g20, x * l3x + g30, PIT_SEED);
    }
  };
  const one = new Float64Array(1);
  return {
    removes: true,
    lipschitz: Math.hypot(1 + RIM_WOBBLE, RIM_SLOPE) + (PIT_SLOPE * PIT_DEPTH) / PIT_PITCH,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z) {
      row(x, 0, 0, 1, y, z, one);
      return one[0] ?? 0;
    },
    distances(originX, first, cell, count, y, z, out) {
      row(originX, first, cell, count, y, z, out);
    },
  };
}

/**
 * The sculptor's stroke: a cone with its apex `size` deep along the tool axis and its base at the blow point, open above the surface, plus the crush sphere at the apex.
 * The distance is the larger of the distances to the lateral surface and to the base plane: exact inside and on the surface, a lower bound outside near the rim, which keeps the zero set right and the loop's skips safe.
 */
function pointCone(f: Frame, size: number, spec: ToolVolumeSpec): ToolVolume {
  const angle = spec.angle;
  const top = size + AIR_EXTENSION;
  const tan = Math.tan(angle);
  const cos = Math.cos(angle);
  const radius = top * tan;
  const crush = CRUSH_RATIO * size;
  const ax = f.px + f.d[0] * size;
  const ay = f.py + f.d[1] * size;
  const az = f.pz + f.d[2] * size;
  const dx = f.d[0];
  const dy = f.d[1];
  const dz = f.d[2];
  // The cone lies between its apex and its base disc `top` back along the axis; the crush sphere sits at the apex.
  const bounds = cylinderBounds([ax - dx * (top / 2), ay - dy * (top / 2), az - dz * (top / 2)], f.d, radius, top / 2);
  return {
    removes: true,
    lipschitz: 1,
    min: [Math.min(bounds.min[0], ax - crush), Math.min(bounds.min[1], ay - crush), Math.min(bounds.min[2], az - crush)],
    max: [Math.max(bounds.max[0], ax + crush), Math.max(bounds.max[1], ay + crush), Math.max(bounds.max[2], az + crush)],
    distance(x, y, z) {
      const qx = x - ax;
      const qy = y - ay;
      const qz = z - az;
      const h = -(qx * dx + qy * dy + qz * dz);
      const qq = qx * qx + qy * qy + qz * qz;
      const rr = qq - h * h;
      const rho = rr > 0 ? Math.sqrt(rr) : 0;
      const lateral = (rho - h * tan) * cos;
      const cone = lateral > h - top ? lateral : h - top;
      const sphere = Math.sqrt(qq) - crush;
      return cone < sphere ? cone : sphere;
    },
    distances(originX, first, cell, count, y, z, out) {
      const qy = y - ay;
      const qz = z - az;
      const h0 = -(qy * dy + qz * dz);
      const q0 = qy * qy + qz * qz;
      for (let i = 0; i < count; i += 1) {
        const qx = originX + (first + i) * cell - ax;
        const h = h0 - qx * dx;
        const qq = qx * qx + q0;
        const rr = qq - h * h;
        const rho = rr > 0 ? Math.sqrt(rr) : 0;
        const lateral = (rho - h * tan) * cos;
        const cone = lateral > h - top ? lateral : h - top;
        const sphere = Math.sqrt(qq) - crush;
        out[i] = cone < sphere ? cone : sphere;
      }
    },
  };
}

/** The toothed and flat chisels: a wedge the blade wide, entering at the blow point, `size` deep and `push` long, its entry and chip faces continued above the surface; the flat chisel runs level between its descent and its chip face. */
function bladeWedge(f: Frame, size: number, spec: ToolVolumeSpec, flat: boolean): ToolVolume {
  const descent = Math.min(size / Math.tan(spec.angle), spec.push / 2);
  const ext = AIR_EXTENSION;
  const entryTop = -ext * (descent / size);
  const xs = flat ? [entryTop, descent, spec.push - size, spec.push + ext] : [entryTop, descent, spec.push + ext * ((spec.push - descent) / size)];
  const ys = flat ? [ext, -size, -size, ext] : [ext, -size, ext];
  const half = spec.width / 2;
  const bounds = frameBounds(f, Math.min(entryTop, 0), Math.max(...xs), -half, half, -size, ext, 0);
  return {
    removes: true,
    lipschitz: 1,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z) {
      const rx = x - f.px;
      const ry = y - f.py;
      const rz = z - f.pz;
      const a = rx * f.u[0] + ry * f.u[1] + rz * f.u[2];
      const b = rx * f.w[0] + ry * f.w[1] + rz * f.w[2];
      const c = rx * f.n[0] + ry * f.n[1] + rz * f.n[2];
      return extrude(polygonDistance(xs, ys, a, c), Math.abs(b) - half);
    },
  };
}

/**
 * The roundel: a round channel, a capsule lying along the push whose chord at the surface is the tool's width; on a flat face only the part below the surface is stone (closedFormVolume counts that part), and the box holds the whole capsule, whose top rises `radius - size` above the blow point, because a concave face can still hold stone there (until 2026-10-13 the box stopped at the tangent plane and the capsule reached 4 mm outside it; src/stock/carve.test.ts, tool volume bounds).
 * The capsule is not cut off at the tangent plane: at the test's 0.5 mm cells a cut-off scoop loses the half-filled surface cells, 18 percent of a 2 mm channel, which the closed form counts.
 */
function roundelScoop(f: Frame, size: number, spec: ToolVolumeSpec): ToolVolume {
  const radius = ((spec.width * spec.width) / 4 + size * size) / (2 * size);
  const height = radius - size;
  const bounds = frameBounds(f, -radius, spec.push + radius, -radius, radius, -size, height + radius, 0);
  return {
    removes: true,
    lipschitz: 1,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z) {
      const rx = x - f.px;
      const ry = y - f.py;
      const rz = z - f.pz;
      const a = rx * f.u[0] + ry * f.u[1] + rz * f.u[2];
      const b = rx * f.w[0] + ry * f.w[1] + rz * f.w[2];
      const c = rx * f.n[0] + ry * f.n[1] + rz * f.n[2];
      const t = a < 0 ? 0 : a > spec.push ? spec.push : a;
      return Math.hypot(a - t, b, c - height) - radius;
    },
  };
}

/** The drill: a shank of the bit's diameter along the tool axis ending in a spade tip of 90 degrees, the tip `size` deep. */
function drillHole(f: Frame, size: number, spec: ToolVolumeSpec): ToolVolume {
  const r = spec.width / 2;
  const top = size + AIR_EXTENSION;
  const xs = [-r, -r, 0, r, r];
  const ys = [top, r, 0, r, top];
  const ax = f.px + f.d[0] * size;
  const ay = f.py + f.d[1] * size;
  const az = f.pz + f.d[2] * size;
  const bounds = cylinderBounds([ax - f.d[0] * (top / 2), ay - f.d[1] * (top / 2), az - f.d[2] * (top / 2)], f.d, r, top / 2);
  return {
    removes: true,
    lipschitz: 1,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z) {
      const qx = x - ax;
      const qy = y - ay;
      const qz = z - az;
      const h = -(qx * f.d[0] + qy * f.d[1] + qz * f.d[2]);
      const rho = Math.sqrt(Math.max(qx * qx + qy * qy + qz * qz - h * h, 0));
      return polygonDistance(xs, ys, rho, h);
    },
  };
}

/** The least the slab reaches above the blow point's level, metres: a cell, so the stock just above the point still updates. A slab reaches the larger of this and its own cut depth, so a ridge standing a cut higher inside its footprint comes away rather than being cut under and left adrift (src/stock/connectivity.test.ts); a hollow's facing surface is cut only when it lies within that reach, which its margin makes harmless. */
const SLAB_TOP = 0.01;
/** Slack for the sampled figure field, whose trilinear gradient can pass 1 near the statue's creases. */
const FIGURE_SLACK = 0.25;

/**
 * Rasps, files and pumice: a patch `size` deep under the surface over a rounded footprint, its depth feathering out at the edge (over a width no narrower than the cut, which keeps the distance's slope bounded), following the figure's level sets where the figure is near and the tangent plane elsewhere.
 * Closed `top` (the larger of SLAB_TOP and the cut, so a ridge a cut higher inside the footprint comes away rather than being cut under) above the blow point's tangent plane on both paths: the figure-following band alone is open wherever the figure comes back within SLAB_TOP of the point's level, which in a hollow is the facing surface, and until 2026-10-13 it cut that surface 7 cm away (src/stock/carve.test.ts, a rubbing tool in a hollow). The price is that on a surface more concave than about 18 cm of radius along the push the far ends of the patch, risen past SLAB_TOP, are left to the neighbouring blows.
 */
function surfaceSlab(f: Frame, size: number, spec: ToolVolumeSpec, figureAtPoint: number, figureBand: number): ToolVolume {
  const hx = spec.push / 2;
  const hy = spec.width / 2;
  const rounding = FOOTPRINT_ROUNDING * spec.width;
  const feather = Math.max(FEATHER * hy, size);
  const followFigure = figureAtPoint < 0.4 * figureBand;
  // The slab reaches `top` above the point's level, along the normal and along the figure's level sets alike, so it is closed that far above on both paths.
  const top = Math.max(SLAB_TOP, size);
  const bounds = frameBounds(f, -hx, hx, -hy, hy, -size - (followFigure ? spec.push * 0.5 : 0), top, 0);
  return {
    removes: true,
    lipschitz: (followFigure ? 1 + FIGURE_SLACK : 1) + size / feather,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z, figure) {
      const rx = x - f.px;
      const ry = y - f.py;
      const rz = z - f.pz;
      const a = rx * f.u[0] + ry * f.u[1] + rz * f.u[2];
      const b = rx * f.w[0] + ry * f.w[1] + rz * f.w[2];
      const c = rx * f.n[0] + ry * f.n[1] + rz * f.n[2];
      const foot = roundedBox2(a, b, hx, hy, rounding);
      const local = foot >= 0 ? 0 : size * Math.min(1, -foot / feather);
      const below = followFigure ? figureAtPoint - local - figure : -local - c;
      const cap = c - top;
      const level = figure - figureAtPoint - top;
      const above = followFigure && level > cap ? level : cap;
      return extrude(foot, below > above ? below : above);
    },
    // The per-cell rule above, a row at a time: the y and z products are formed once and the sums keep the per-cell order, so each cell gets the float `distance` would give it (the finishing passes carve about 17,000 slabs into the planner's scratch, where the three calls per cell were the plan's cost; 2026-10-13).
    distances(originX, first, cell, count, y, z, out, figureValues, at, figureScale) {
      const ry = y - f.py;
      const rz = z - f.pz;
      const ay = ry * f.u[1];
      const az = rz * f.u[2];
      const by = ry * f.w[1];
      const bz = rz * f.w[2];
      const cy = ry * f.n[1];
      const cz = rz * f.n[2];
      const ux = f.u[0];
      const wx = f.w[0];
      const nx = f.n[0];
      const innerX = hx - rounding;
      const innerY = hy - rounding;
      for (let i = 0; i < count; i += 1) {
        const rx = originX + (first + i) * cell - f.px;
        const a = rx * ux + ay + az;
        const b = rx * wx + by + bz;
        const c = rx * nx + cy + cz;
        const figure = (figureValues[at + i] ?? 0) * figureScale;
        const qx = Math.abs(a) - innerX;
        const qy = Math.abs(b) - innerY;
        const foot = Math.hypot(qx > 0 ? qx : 0, qy > 0 ? qy : 0) + Math.min(Math.max(qx, qy), 0) - rounding;
        const local = foot >= 0 ? 0 : size * Math.min(1, -foot / feather);
        const below = followFigure ? figureAtPoint - local - figure : -local - c;
        const cap = c - top;
        const level = figure - figureAtPoint - top;
        const above = followFigure && level > cap ? level : cap;
        const db = below > above ? below : above;
        const inside = Math.min(Math.max(foot, db), 0);
        out[i] = inside + Math.hypot(foot > 0 ? foot : 0, db > 0 ? db : 0);
      }
    },
  };
}

/** Charcoal, polish and gilding remove nothing: a footprint one blow thick around the surface, painted with the tool's finish. */
function paintFootprint(f: Frame, spec: ToolVolumeSpec): ToolVolume {
  const hx = spec.push / 2;
  const hy = spec.width / 2;
  const bounds = frameBounds(f, -hx, hx, -hy, hy, -PAINT_HALF_THICKNESS, PAINT_HALF_THICKNESS, 0);
  return {
    removes: false,
    lipschitz: 1,
    min: bounds.min,
    max: bounds.max,
    distance(x, y, z) {
      const rx = x - f.px;
      const ry = y - f.py;
      const rz = z - f.pz;
      const a = rx * f.u[0] + ry * f.u[1] + rz * f.u[2];
      const b = rx * f.w[0] + ry * f.w[1] + rz * f.w[2];
      const c = rx * f.n[0] + ry * f.n[1] + rz * f.n[2];
      return extrude(roundedBox2(a, b, hx, hy, Math.min(hx, hy) * PAINT_ROUNDING), Math.abs(c) - PAINT_HALF_THICKNESS);
    },
  };
}
