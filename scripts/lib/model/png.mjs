/**
 * A minimal PNG encoder for the pipeline's check images: 8-bit greyscale, no filtering (filter byte 0 on every row), one IDAT, deflated with Node's zlib. No dependency.
 */
import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {string} type four ASCII letters
 * @param {Uint8Array} data
 */
function chunk(type, data) {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  const body = bytes.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(body) >>> 0);
  return bytes;
}

/**
 * Encodes `pixels` (row-major, `width × height` bytes, 0 black to 255 white) as a greyscale PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} pixels
 */
export function encodeGreyPng(width, height, pixels) {
  if (pixels.length !== width * height) throw new Error(`encodeGreyPng: ${String(pixels.length)} pixels for ${String(width)}×${String(height)}; expected ${String(width * height)}.`);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: greyscale
  header[10] = 0; // compression
  header[11] = 0; // filter method
  header[12] = 0; // no interlace
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const idat = new Uint8Array(deflateSync(raw, { level: 6 }));
  const parts = [SIGNATURE, chunk('IHDR', header), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
