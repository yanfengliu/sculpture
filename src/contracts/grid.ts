/**
 * The grid contract (docs/design/spec.md, Stock and figure): the one description of a signed-distance grid that the model pipeline writes in Node and the engine reads in the browser.
 * Types only, plus the constants both sides need. The pipeline's writer lives under scripts/, the engine's reader under src/stock/; each is tested against a fixture the other produced.
 */

/** Lattice of a grid: `size` cells per axis, `origin` the world position of the centre of cell (0, 0, 0) in metres, `cell` the spacing in metres, `band` the clamp distance in cells. */
export interface GridSpec {
  readonly cell: number;
  readonly size: readonly [number, number, number];
  readonly origin: readonly [number, number, number];
  readonly band: number;
}

/** Where a figure grid came from, for attribution on the page (docs/research/mesh-sources.md). */
export interface GridSource {
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly sha1: string;
  readonly attribution: string;
  readonly fetchedAt: string;
}

/** The JSON header written beside the data file. */
export interface GridHeader extends GridSpec {
  readonly format: 'sculpture-grid/1';
  readonly encoding: 'int16x256';
  readonly order: 'x-fastest';
  /** SHA-256 of the raw little-endian Int16 bytes before gzip. */
  readonly sha256: string;
  readonly source?: GridSource;
}

/** Values are signed distances in cells times FIXED_POINT, stored as little-endian Int16, negative inside stone or statue, clamped to ±band × FIXED_POINT. */
export const FIXED_POINT = 256;

/** Clamp distance of the figure grid, in cells: 128 mm at 8 mm cells, wider than the largest stage margin (30 mm) plus the deepest tool cut (about 80 mm), so the carving rule never clamps a cut short; narrow enough that most of the block is constant and the gzipped file stays small (docs/research/decisions.md). The stock grid's band is STOCK_BAND_CELLS in src/david/frame.ts. */
export const DEFAULT_BAND_CELLS = 16;

/** Cell (i, j, k) of a grid of `size` is value index `i + nx * (j + ny * k)`: x fastest, then y, then z. */
export function cellIndex(size: readonly [number, number, number], i: number, j: number, k: number): number {
  return i + size[0] * (j + size[1] * k);
}

/** File names under `public/model/` for a figure grid named `name`. The data file is the gzip of the raw Int16 bytes. */
export function gridFiles(name: string): { readonly header: string; readonly data: string } {
  return { header: `${name}.json`, data: `${name}.bin.gz` };
}

/** Finish codes, one byte per cell in the finish grid: the last tool that touched the surface there, in the order of the tools in src/contracts/making.ts. 0 is the untouched block face, which keeps the quarry crust Condivi saw at the crown and the base. */
export const FINISH = {
  block: 0,
  drawn: 1,
  point: 2,
  twoTooth: 3,
  claw: 4,
  fineClaw: 5,
  roundel: 6,
  flat: 7,
  drill: 8,
  rasp: 9,
  file: 10,
  pumice: 11,
  polish: 12,
  gilt: 13,
} as const;

export type FinishCode = (typeof FINISH)[keyof typeof FINISH];
