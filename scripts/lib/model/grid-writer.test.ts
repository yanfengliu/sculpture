/**
 * Bound: the writer is checked against src/contracts/grid.ts on a small lattice written to a temporary directory: the Int16 encoding (round, clamp to ±band × FIXED_POINT, little-endian bytes), the x-fastest index order through cellIndex, the header fields and the source block, the SHA-256 of the raw bytes against a fresh digest of the gunzipped data file, and a full round trip. It does not run the engine's reader.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_BAND_CELLS, FIXED_POINT, cellIndex, gridFiles } from '../../../src/contracts/grid';
import { decodeRawBytes, encodeValues, gridHeader, gridSource, rawBytes, writeGrid } from './grid-writer.mjs';

const directory = mkdtempSync(join(tmpdir(), 'sculpture-grid-'));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('encodeValues and rawBytes', () => {
  it('rounds to 1/256 cell and clamps to the band', () => {
    const { values, min, max } = encodeValues([0, 0.5, -0.5, 1 / 256, -1 / 256, 0.3 / 256, -0.7 / 256, 40, -40, 31.9999], 32);
    expect(Array.from(values)).toEqual([0, 128, -128, 1, -1, 0, -1, 8192, -8192, 8192]);
    expect(min).toBe(-8192);
    expect(max).toBe(8192);
    // The contract's default band, whatever its value, is what a far cell clamps to; pinning the number here would only test the constant against itself.
    const wide = encodeValues([1000, -1000], DEFAULT_BAND_CELLS);
    expect(Array.from(wide.values)).toEqual([DEFAULT_BAND_CELLS * FIXED_POINT, -DEFAULT_BAND_CELLS * FIXED_POINT]);
  });

  it('writes little-endian bytes and reads them back', () => {
    const bytes = rawBytes(Int16Array.from([1, -1, 256, -32768]));
    expect(Array.from(bytes)).toEqual([1, 0, 0xff, 0xff, 0, 1, 0, 0x80]);
    expect(Array.from(decodeRawBytes(bytes))).toEqual([1, -1, 256, -32768]);
  });
});

describe('writeGrid', () => {
  const lattice = { cell: 0.25, size: [3, 4, 5], origin: [-0.1, 0.2, -0.3], band: 32 };
  const cells = new Float32Array(60);
  for (let k = 0; k < 5; k += 1) for (let j = 0; j < 4; j += 1) for (let i = 0; i < 3; i += 1) cells[cellIndex([3, 4, 5], i, j, k)] = i - 1 + 0.25 * j - 10 * k;
  const record = { title: 'T', author: 'A', url: 'https://example.test/mesh.stl', pageUrl: 'ignored', size: 1, sha1: 'abc', fetchedAt: '2026-10-11T00:00:00.000Z', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'S' };
  const written = writeGrid(directory, 'cube', lattice, cells, gridSource(record));
  const files = gridFiles('cube');

  it('names the files by the contract and reports the byte counts', () => {
    expect(written.files).toEqual({ header: 'cube.json', data: 'cube.bin.gz' });
    expect(files).toEqual(written.files);
    expect(written.rawBytes).toBe(120);
    expect(written.gzippedBytes).toBeGreaterThan(0);
    expect(written.min).toBe(-8192);
    expect(written.max).toBe(1 * 256 + 0.75 * 256);
  });

  it('writes the header with every GridHeader field, the lattice and the source block', () => {
    const header = JSON.parse(readFileSync(join(directory, files.header), 'utf8')) as Record<string, unknown>;
    expect(header).toEqual({
      format: 'sculpture-grid/1',
      encoding: 'int16x256',
      order: 'x-fastest',
      cell: 0.25,
      size: [3, 4, 5],
      origin: [-0.1, 0.2, -0.3],
      band: 32,
      sha256: written.header.sha256,
      source: { title: 'T', author: 'A', url: 'https://example.test/mesh.stl', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', sha1: 'abc', attribution: 'S', fetchedAt: '2026-10-11T00:00:00.000Z' },
    });
    expect(gridHeader(lattice, 'x', undefined)).not.toHaveProperty('source');
  });

  it('gzips the raw bytes whose SHA-256 the header carries, in x-fastest order', () => {
    const raw = gunzipSync(readFileSync(join(directory, files.data)));
    expect(raw.length).toBe(120);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(written.header.sha256);
    const values = decodeRawBytes(new Uint8Array(raw));
    for (let k = 0; k < 5; k += 1) {
      for (let j = 0; j < 4; j += 1) {
        for (let i = 0; i < 3; i += 1) {
          const expected = Math.max(-8192, Math.min(8192, Math.round((i - 1 + 0.25 * j - 10 * k) * 256)));
          expect(values[i + 3 * (j + 4 * k)]).toBe(expected);
        }
      }
    }
    expect(values[cellIndex([3, 4, 5], 2, 3, 0)]).toBe(448);
  });

  it('refuses a value count that does not match the lattice', () => {
    expect(() => writeGrid(directory, 'bad', lattice, new Float32Array(59), undefined)).toThrow(/59 values for a 3×4×5 lattice; expected 60/);
  });
});
