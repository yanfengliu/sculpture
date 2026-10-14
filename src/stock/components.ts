/**
 * The stock's 6-connected components by a whole-grid flood fill: the reference the incremental sweep of src/stock/sweep.ts is checked against (src/stock/sweep.test.ts) and the instrument of the slow tests. Linear in the grid with two Int32 words per cell of scratch, so seconds and 300 MB on the David grid; the page never runs it.
 */
import type { Grid } from './grid';

export interface Components {
  /** Component per cell, 1-based; 0 is air. */
  readonly label: Int32Array;
  readonly count: number;
  /** Per component (index is the label less one): its cells, whether it holds a figure cell (figure value below zero) or a cell of `baseRow`, and its cell box as six numbers (min i, j, k, then max i, j, k). */
  readonly cells: Int32Array;
  readonly holdsFigure: Uint8Array;
  readonly holdsBase: Uint8Array;
  readonly boxes: Int32Array;
}

/** Labels the stock cells (value below zero) into 6-connected components, in order of their lowest cell index. */
export function floodComponents(stock: Grid, figure: Grid, baseRow: number): Components {
  const { nx, ny, nz, values } = stock;
  const figureValues = figure.values;
  const slice = nx * ny;
  const label = new Int32Array(values.length);
  const queue = new Int32Array(values.length);
  const cells: number[] = [];
  const holdsFigure: number[] = [];
  const holdsBase: number[] = [];
  const boxes: number[] = [];
  let count = 0;
  for (let start = 0; start < values.length; start += 1) {
    if (label[start] !== 0 || (values[start] ?? 0) >= 0) continue;
    count += 1;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    label[start] = count;
    let size = 0;
    let figureCell = 0;
    let baseCell = 0;
    let i0 = nx;
    let j0 = ny;
    let k0 = nz;
    let i1 = -1;
    let j1 = -1;
    let k1 = -1;
    const visit = (n: number): void => {
      if (label[n] === 0 && (values[n] ?? 0) < 0) {
        label[n] = count;
        queue[tail] = n;
        tail += 1;
      }
    };
    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      size += 1;
      if ((figureValues[index] ?? 0) < 0) figureCell = 1;
      const k = Math.floor(index / slice);
      const j = Math.floor((index - k * slice) / nx);
      const i = index - k * slice - j * nx;
      if (j === baseRow) baseCell = 1;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (k < k0) k0 = k;
      if (k > k1) k1 = k;
      if (i > 0) visit(index - 1);
      if (i + 1 < nx) visit(index + 1);
      if (j > 0) visit(index - nx);
      if (j + 1 < ny) visit(index + nx);
      if (k > 0) visit(index - slice);
      if (k + 1 < nz) visit(index + slice);
    }
    cells.push(size);
    holdsFigure.push(figureCell);
    holdsBase.push(baseCell);
    boxes.push(i0, j0, k0, i1, j1, k1);
  }
  return { label, count, cells: Int32Array.from(cells), holdsFigure: Uint8Array.from(holdsFigure), holdsBase: Uint8Array.from(holdsBase), boxes: Int32Array.from(boxes) };
}
