/**
 * World-frame constants from research (docs/design/spec.md, World frame): one constant per fact, each with its source in docs/research/.
 * Code reads them from here and never restates them. A value marked PROVISIONAL is the coordinator's placeholder until the named research note lands; the model pipeline fails loudly when the fetched figure does not fit the block, which is how a stale value is caught.
 */

/** Height of the statue including its carved rock base, metres. Source: docs/research/david-history.md (the Galleria dell'Accademia gives 5.17 m). */
export const STATUE_HEIGHT_M = 5.17;

/** The marble block as it stood in the Opera del Duomo yard, metres: width across the front (x), height (y), depth front to back (z). PROVISIONAL until docs/research/david-history.md lands; the figure's measured box is logged by scripts/build-grid.mjs. */
export const BLOCK_M = { width: 2.1, height: 5.5, depth: 1.4 } as const;

/** Where the figure stands in the block: its lowest point (the bottom of the rock base) sits on the block's bottom face, and its footprint centre is the block's footprint centre. Source: docs/research/david-history.md (the base is carved from the same block). PROVISIONAL offsets, metres, applied to the figure after normalisation. */
export const FIGURE_OFFSET_M = { x: 0, y: 0, z: 0 } as const;

/** Cells of margin between the block and the grid's edge on every side, so the block's own faces mesh cleanly. */
export const GRID_MARGIN_CELLS = 2;

/** Default cell size of the David grid, metres. Decision in docs/research/decisions.md from the measurements in docs/research/engine-options.md; the grid header carries the value actually built. */
export const DEFAULT_CELL_M = 0.008;

/** Clamp band of the stock grid, cells: narrow, so a blow updates only its box dilated by this much (docs/research/decisions.md). */
export const STOCK_BAND_CELLS = 3;
