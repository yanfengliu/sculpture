/**
 * Bound: parseStl and encodeBinaryStl are checked on a 12-triangle cube built here, in binary (through the encoder) and in ASCII (text written here); a file that fits neither layout throws. Nothing here reads the real mesh.
 */
import { describe, expect, it } from 'vitest';

import { cubeTriangles } from './shapes.mjs';
import { BINARY_HEADER_BYTES, BINARY_TRIANGLE_BYTES, encodeBinaryStl, faceNormal, parseStl } from './stl.mjs';

const cube = cubeTriangles(1);

function asciiStl(positions: readonly number[]): string {
  const lines = ['solid cube'];
  for (let base = 0; base < positions.length; base += 9) {
    lines.push('  facet normal 0 0 0', '    outer loop');
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = base + corner * 3;
      lines.push(`      vertex ${String(positions[offset])} ${String(positions[offset + 1])} ${String(positions[offset + 2])}`);
    }
    lines.push('    endloop', '  endfacet');
  }
  lines.push('endsolid cube');
  return lines.join('\n');
}

describe('binary STL', () => {
  it('encodes 84 + 50 × n bytes and parses back the same 12 triangles', () => {
    const bytes = encodeBinaryStl(cube, 'test cube');
    expect(bytes.length).toBe(BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * 12);
    const parsed = parseStl(bytes);
    expect(parsed.kind).toBe('binary');
    expect(parsed.triangles).toBe(12);
    expect(Array.from(parsed.positions)).toEqual(cube);
  });

  it('stores little-endian floats after the 80-byte header and the count', () => {
    const bytes = encodeBinaryStl(cube);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(80, true)).toBe(12);
    expect(view.getFloat32(BINARY_HEADER_BYTES + 12, true)).toBe(cube[0]);
    const [nx, ny, nz] = faceNormal(cube, 0);
    expect([view.getFloat32(BINARY_HEADER_BYTES, true), view.getFloat32(BINARY_HEADER_BYTES + 4, true), view.getFloat32(BINARY_HEADER_BYTES + 8, true)]).toEqual([nx, ny, nz]);
  });

  it('rejects a file whose size does not match its count and is not ASCII', () => {
    const bytes = encodeBinaryStl(cube).subarray(0, BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * 12 - 7);
    expect(() => parseStl(bytes)).toThrow(/not an STL file/);
  });
});

describe('ASCII STL', () => {
  it('parses vertex lines in order into the same triangles', () => {
    const bytes = new TextEncoder().encode(asciiStl(cube));
    const parsed = parseStl(bytes);
    expect(parsed.kind).toBe('ascii');
    expect(parsed.triangles).toBe(12);
    expect(Array.from(parsed.positions)).toEqual(cube);
  });

  it('rejects a vertex count that is not a multiple of three', () => {
    const text = `${asciiStl(cube)}\nvertex 1 2 3\nendsolid`;
    expect(() => parseStl(new TextEncoder().encode(text))).toThrow(/37 vertex lines/);
  });
});

describe('faceNormal', () => {
  it('follows the right-hand rule and is zero for a degenerate triangle', () => {
    expect(faceNormal([0, 0, 0, 1, 0, 0, 0, 1, 0], 0)).toEqual([0, 0, 1]);
    expect(faceNormal([0, 0, 0, 0, 1, 0, 1, 0, 0], 0)).toEqual([0, 0, -1]);
    expect(faceNormal([0, 0, 0, 1, 1, 1, 2, 2, 2], 0)).toEqual([0, 0, 0]);
  });
});
