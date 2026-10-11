/**
 * World-frame constants from research (docs/design/spec.md, World frame): one constant per fact, each with its source in docs/research/.
 * Code reads them from here and never restates them. A value marked PROVISIONAL is the coordinator's placeholder until the named research note lands; the model pipeline fails loudly when the fetched figure does not fit the block, which is how a stale value is caught.
 */

/** Height of the statue including its carved rock base and without the museum pedestal, metres. Source: docs/research/david-history.md, "Key numbers" (Galleria dell'Accademia 517 cm; the Stanford scan confirms it against the old 434 cm). */
export const STATUE_HEIGHT_M = 5.17;

/** Width of the statue across the front, metres. Source: docs/research/david-history.md, "Key numbers" (199 cm). */
export const STATUE_WIDTH_M = 1.99;

/** Weight of the statue, kg, the museum's figure. Source: docs/research/david-history.md, "Key numbers" (5,560 kg; 5,572 kg in the 2014 CNR study). */
export const STATUE_MASS_KG = 5560;

/**
 * The marble block as it stood in the Opera del Duomo yard, metres: width across the front (x), height (y), depth front to back (z).
 * Height: "nine braccia" in the 1464 commission and the 1501 contract, 5.25 m at the Florentine braccio of 58.36 cm (david-history.md, "The block and what it forced"); the statue fills it to within 8 cm, which fits the old crust Condivi saw at the crown.
 * Width: not recorded; the statue is 1.99 m wide, so the block was at least that, "almost 2 m" by inference (same section); 2.04 m leaves a hand's width, the coordinator's choice (docs/research/decisions.md).
 * Depth: not recorded, "rather shallow", with 1.1 m and 1.4 m both unsourced inferences (same section); PROVISIONAL 1.40 m until scripts/build-grid.mjs reports the figure's measured depth, which bounds it from below.
 */
export const BLOCK_M = { width: 2.04, height: 5.25, depth: 1.4 } as const;

/** Where the figure stands in the block: its lowest point (the bottom of the carved rock base) sits on the block's bottom face, and its footprint centre is the block's footprint centre. Source: docs/research/david-history.md (the base is carved from the same block; the figure runs the block's full height). Offsets in metres applied to the figure after normalisation. */
export const FIGURE_OFFSET_M = { x: 0, y: 0, z: 0 } as const;

/** Cells of margin between the block and the grid's edge on every side, so the block's own faces mesh cleanly. */
export const GRID_MARGIN_CELLS = 2;

/** Default cell size of the David grid, metres. Decision in docs/research/decisions.md from the measurements in docs/research/engine-options.md; the grid header carries the value actually built. */
export const DEFAULT_CELL_M = 0.008;

/** Clamp band of the stock grid, cells: narrow, so a blow updates only its box dilated by this much (docs/research/decisions.md). */
export const STOCK_BAND_CELLS = 3;
