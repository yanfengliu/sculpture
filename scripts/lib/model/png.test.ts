/**
 * Bound: encodeGreyPng's output is decoded here by hand: the signature, the IHDR fields, every chunk's CRC-32 against a bitwise implementation written in this file (not the encoder's), the IDAT inflated to one filter byte per row plus the pixels. No image viewer is involved.
 */
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { encodeGreyPng } from './png.mjs';

/** CRC-32 (IEEE 802.3, reflected, as PNG uses it), bit by bit. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
  readonly crcOk: boolean;
}

function chunks(png: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crcOk = view.getUint32(offset + 8 + length) === crc32(png.subarray(offset + 4, offset + 8 + length));
    out.push({ type, data, crcOk });
    offset += 12 + length;
  }
  return out;
}

describe('encodeGreyPng', () => {
  const width = 5;
  const height = 3;
  const pixels = Uint8Array.from({ length: width * height }, (_, i) => (i * 37) % 256);
  const png = encodeGreyPng(width, height, pixels);

  it('starts with the PNG signature and holds IHDR, IDAT and IEND with valid CRCs', () => {
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parsed = chunks(png);
    expect(parsed.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(parsed.every((c) => c.crcOk)).toBe(true);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('declares an 8-bit greyscale image of the given size', () => {
    const ihdr = chunks(png)[0]?.data ?? new Uint8Array();
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(view.getUint32(0)).toBe(width);
    expect(view.getUint32(4)).toBe(height);
    expect(Array.from(ihdr.subarray(8))).toEqual([8, 0, 0, 0, 0]);
  });

  it('inflates to unfiltered rows carrying the pixels', () => {
    const idat = chunks(png)[1]?.data ?? new Uint8Array();
    const raw = new Uint8Array(inflateSync(idat));
    expect(raw.length).toBe((width + 1) * height);
    for (let y = 0; y < height; y += 1) {
      expect(raw[y * (width + 1)]).toBe(0);
      expect(Array.from(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)))).toEqual(Array.from(pixels.subarray(y * width, (y + 1) * width)));
    }
  });

  it('refuses a pixel count that does not match the size', () => {
    expect(() => encodeGreyPng(4, 4, new Uint8Array(15))).toThrow(/15 pixels for 4×4; expected 16/);
  });
});
