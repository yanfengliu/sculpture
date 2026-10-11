/**
 * The grid writer: the pipeline's side of src/contracts/grid.ts. Encodes signed distances in cells as little-endian Int16 at FIXED_POINT per cell, clamped to ±band × FIXED_POINT, x fastest, and writes `<name>.json` (the GridHeader with the SHA-256 of the raw bytes) and `<name>.bin.gz` (gzip of the raw bytes).
 * The engine's reader under src/stock/ decodes these; a fixture this module writes is its test input.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { DEFAULT_BAND_CELLS, FIXED_POINT, gridFiles } from '../../../src/contracts/grid.ts';

export { DEFAULT_BAND_CELLS, FIXED_POINT };

/**
 * Int16 values for signed distances in cells: round(d × FIXED_POINT) clamped to ±band × FIXED_POINT. The input order is the output order.
 * @param {ArrayLike<number>} cells
 * @param {number} band
 */
export function encodeValues(cells, band) {
  const limit = band * FIXED_POINT;
  const out = new Int16Array(cells.length);
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < cells.length; index += 1) {
    const value = Math.max(-limit, Math.min(limit, Math.round(cells[index] * FIXED_POINT)));
    out[index] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { values: out, min, max };
}

/** The raw little-endian bytes of `values`, regardless of the host's byte order. */
export function rawBytes(values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setInt16(index * 2, values[index], true);
  return bytes;
}

/** Decodes raw little-endian bytes back to Int16 values, the inverse of rawBytes, for round-trip tests. */
export function decodeRawBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Int16Array(bytes.byteLength / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getInt16(index * 2, true);
  return values;
}

/**
 * The header (src/contracts/grid.ts, GridHeader) for a lattice, the raw bytes' digest and an optional source block.
 * @param {{ cell: number, size: number[], origin: number[], band: number }} lattice
 * @param {string} sha256
 * @param {object | undefined} source
 */
export function gridHeader(lattice, sha256, source) {
  const header = {
    format: 'sculpture-grid/1',
    encoding: 'int16x256',
    order: 'x-fastest',
    cell: lattice.cell,
    size: [lattice.size[0], lattice.size[1], lattice.size[2]],
    origin: [lattice.origin[0], lattice.origin[1], lattice.origin[2]],
    band: lattice.band,
    sha256,
  };
  return source ? { ...header, source } : header;
}

/** The `source` block of the header from the fetch script's SOURCE.json record (src/contracts/grid.ts, GridSource). */
export function gridSource(record) {
  return {
    title: String(record.title),
    author: String(record.author),
    url: String(record.url),
    licence: String(record.licence),
    licenceUrl: String(record.licenceUrl),
    sha1: String(record.sha1),
    attribution: String(record.attribution),
    fetchedAt: String(record.fetchedAt),
  };
}

/**
 * Encodes and writes the grid named `name` into `directory`; returns the header and the byte counts.
 * @param {string} directory
 * @param {string} name
 * @param {{ cell: number, size: number[], origin: number[], band: number }} lattice
 * @param {ArrayLike<number>} cells signed distances in cells
 * @param {object | undefined} source
 */
export function writeGrid(directory, name, lattice, cells, source) {
  const expected = lattice.size[0] * lattice.size[1] * lattice.size[2];
  if (cells.length !== expected) throw new Error(`writeGrid: ${String(cells.length)} values for a ${lattice.size.join('×')} lattice; expected ${String(expected)}.`);
  const { values, min, max } = encodeValues(cells, lattice.band);
  const raw = rawBytes(values);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const gzipped = gzipSync(raw, { level: 6 });
  const header = gridHeader(lattice, sha256, source);
  const files = gridFiles(name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, files.header), `${JSON.stringify(header, null, 2)}\n`);
  writeFileSync(join(directory, files.data), gzipped);
  return { header, files, rawBytes: raw.length, gzippedBytes: gzipped.length, min, max };
}
