/**
 * Synthetic closed shapes for the pipeline's tests: axis-aligned boxes as outward-wound triangle soups (9 numbers per triangle), the same layout parseStl returns.
 */

/**
 * The twelve triangles of the box [min, max], wound outward by the right-hand rule.
 * @param {number[]} min
 * @param {number[]} max
 * @returns {number[]}
 */
export function boxTriangles(min, max) {
  const out = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const positive of [true, false]) {
      const a = positive ? max[axis] : min[axis];
      const corner = (su, sv) => {
        const p = [0, 0, 0];
        p[axis] = a;
        p[u] = su ? max[u] : min[u];
        p[v] = sv ? max[v] : min[v];
        return p;
      };
      // (−,−), (+,−), (+,+), (−,+) in the (u, v) plane faces +axis because u × v = axis for each cyclic triple; the opposite face reverses it.
      const quad = positive ? [corner(false, false), corner(true, false), corner(true, true), corner(false, true)] : [corner(false, false), corner(false, true), corner(true, true), corner(true, false)];
      out.push(...quad[0], ...quad[1], ...quad[2], ...quad[0], ...quad[2], ...quad[3]);
    }
  }
  return out;
}

/**
 * A cube of half-size `half` centred at `centre`.
 * @param {number} half
 * @param {number[]} [centre]
 */
export function cubeTriangles(half, centre = [0, 0, 0]) {
  return boxTriangles(centre.map((c) => c - half), centre.map((c) => c + half));
}
