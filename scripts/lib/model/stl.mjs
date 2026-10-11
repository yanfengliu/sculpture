/**
 * STL reading and writing for the model pipeline. Binary STL is an 80-byte header, a uint32 triangle count, then 50 bytes per triangle (normal, three vertices as float32 little-endian, a uint16 attribute); ASCII STL is `facet` / `vertex x y z` text.
 * The parser returns the triangles as one flat Float32Array of 9 numbers per triangle (ax ay az bx by bz cx cy cz) and never trusts the stored normals, which the pipeline recomputes from the winding.
 */

export const BINARY_HEADER_BYTES = 84;
export const BINARY_TRIANGLE_BYTES = 50;

/**
 * Parses an STL file held in `bytes`. Binary when the size is exactly 84 + 50·n for the count in the header, otherwise ASCII; a file that fits neither throws naming both checks.
 * @param {Uint8Array} bytes
 * @returns {{ positions: Float32Array, triangles: number, kind: 'binary' | 'ascii' }}
 */
export function parseStl(bytes) {
  if (bytes.byteLength >= BINARY_HEADER_BYTES) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    if (BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * count === bytes.byteLength) {
      return { positions: readBinaryTriangles(view, count), triangles: count, kind: 'binary' };
    }
  }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)));
  if (/^\s*solid\b/.test(head)) {
    const positions = readAsciiTriangles(new TextDecoder('latin1').decode(bytes));
    return { positions, triangles: positions.length / 9, kind: 'ascii' };
  }
  throw new Error(`not an STL file: ${String(bytes.byteLength)} bytes is not 84 + 50 × the binary header's triangle count, and the text does not start with "solid".`);
}

/**
 * @param {DataView} view
 * @param {number} count
 */
function readBinaryTriangles(view, count) {
  const positions = new Float32Array(count * 9);
  let offset = BINARY_HEADER_BYTES + 12;
  for (let t = 0; t < count; t += 1) {
    const base = t * 9;
    for (let c = 0; c < 9; c += 1) positions[base + c] = view.getFloat32(offset + c * 4, true);
    offset += BINARY_TRIANGLE_BYTES;
  }
  return positions;
}

const VERTEX_LINE = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;

/**
 * Reads every `vertex x y z` line in order, three per triangle; a count not divisible by three throws.
 * @param {string} text
 */
function readAsciiTriangles(text) {
  const values = [];
  for (const match of text.matchAll(VERTEX_LINE)) values.push(Number(match[1]), Number(match[2]), Number(match[3]));
  if (values.length % 9 !== 0) throw new Error(`ASCII STL has ${String(values.length / 3)} vertex lines, not a multiple of three; the file is truncated or not STL.`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error('ASCII STL has a vertex coordinate that is not a finite number.');
  return Float32Array.from(values);
}

/**
 * Encodes triangles (9 numbers each) as a binary STL with recomputed normals, the inverse of parseStl for tests and fixtures.
 * @param {ArrayLike<number>} positions
 * @param {string} [comment] up to 80 bytes of header text
 */
export function encodeBinaryStl(positions, comment = 'sculpture model pipeline') {
  const count = positions.length / 9;
  const bytes = new Uint8Array(BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * count);
  bytes.set(new TextEncoder().encode(comment).subarray(0, 80), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  let offset = BINARY_HEADER_BYTES;
  for (let t = 0; t < count; t += 1) {
    const base = t * 9;
    const normal = faceNormal(positions, base);
    for (let c = 0; c < 3; c += 1) view.setFloat32(offset + c * 4, normal[c], true);
    for (let c = 0; c < 9; c += 1) view.setFloat32(offset + 12 + c * 4, positions[base + c], true);
    view.setUint16(offset + 48, 0, true);
    offset += BINARY_TRIANGLE_BYTES;
  }
  return bytes;
}

/**
 * Unit normal of the triangle at `base` in `positions` by the right-hand rule on its winding; a zero vector for a degenerate triangle.
 * @param {ArrayLike<number>} positions
 * @param {number} base
 * @returns {[number, number, number]}
 */
export function faceNormal(positions, base) {
  const ux = positions[base + 3] - positions[base];
  const uy = positions[base + 4] - positions[base + 1];
  const uz = positions[base + 5] - positions[base + 2];
  const vx = positions[base + 6] - positions[base];
  const vy = positions[base + 7] - positions[base + 1];
  const vz = positions[base + 8] - positions[base + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 0];
}
