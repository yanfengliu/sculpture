/**
 * Bound: weld, EdgeTable, pseudonormals, signedVolume, boundingBox and dropDegenerate are checked on a closed cube built here, on the same cube with a face removed (open), with one triangle flipped (inconsistent) and with coordinates jittered below a weld tolerance. Exact counts only; no real mesh.
 */
import { describe, expect, it } from 'vitest';

import { cubeTriangles } from './shapes.mjs';
import { EdgeTable, boundingBox, dropDegenerate, flatten, pseudonormals, signedVolume, weld } from './topology.mjs';

const CENTRE = [0.5, -0.25, 2];
const cube = Float32Array.from(cubeTriangles(1, CENTRE));

describe('weld', () => {
  it('merges the cube soup to 8 vertices and 36 indices that rebuild the same triangles', () => {
    const welded = weld(cube);
    expect(welded.unique).toBe(8);
    expect(welded.vertices.length).toBe(24);
    expect(welded.indices.length).toBe(36);
    expect(Array.from(flatten(welded.vertices, welded.indices))).toEqual(Array.from(cube));
  });

  it('keeps jittered corners apart exactly and merges them at a tolerance', () => {
    const jittered = Float32Array.from(cube);
    jittered[0] = (cube[0] ?? 0) + 1e-6;
    jittered[13] = (cube[13] ?? 0) - 1e-6;
    expect(weld(jittered).unique).toBe(10);
    expect(weld(jittered, 1e-4).unique).toBe(8);
    expect(new EdgeTable(weld(jittered, 1e-4).indices).stats().watertight).toBe(true);
  });
});

describe('EdgeTable', () => {
  it('finds 18 two-face edges on the closed cube, watertight and consistent', () => {
    const stats = new EdgeTable(weld(cube).indices).stats();
    expect(stats).toEqual({ edges: 18, boundary: 0, manifold: 18, nonManifold: 0, inconsistent: 0, watertight: true, consistent: true });
  });

  it('reports 4 boundary edges when one face is missing', () => {
    const open = cube.subarray(18);
    const stats = new EdgeTable(weld(open).indices).stats();
    expect(stats.edges).toBe(17);
    expect(stats.boundary).toBe(4);
    expect(stats.manifold).toBe(13);
    expect(stats.watertight).toBe(false);
    expect(stats.consistent).toBe(true);
  });

  it('reports 3 inconsistent edges when one triangle is wound the other way', () => {
    const flipped = Float32Array.from(cube);
    flipped.set(cube.subarray(3, 6), 6);
    flipped.set(cube.subarray(6, 9), 3);
    const stats = new EdgeTable(weld(flipped).indices).stats();
    expect(stats.inconsistent).toBe(3);
    expect(stats.watertight).toBe(true);
    expect(stats.consistent).toBe(false);
  });

  it('counts an edge on more than two faces as non-manifold', () => {
    const fin = Float32Array.from([...cube, ...cube.subarray(0, 6), 5, 5, 5]);
    const stats = new EdgeTable(weld(fin).indices).stats();
    expect(stats.nonManifold).toBe(1);
    expect(stats.boundary).toBe(2);
    expect(stats.watertight).toBe(false);
  });
});

describe('pseudonormals', () => {
  const welded = weld(cube);
  const normals = pseudonormals(welded.vertices, welded.indices, new EdgeTable(welded.indices));

  it('gives unit face normals that point outward from the centre', () => {
    for (let t = 0; t < 12; t += 1) {
      const n = [normals.face[t * 3] ?? 0, normals.face[t * 3 + 1] ?? 0, normals.face[t * 3 + 2] ?? 0];
      expect(Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0)).toBeCloseTo(1, 6);
      const centroid = [0, 1, 2].map((axis) => ((cube[t * 9 + axis] ?? 0) + (cube[t * 9 + 3 + axis] ?? 0) + (cube[t * 9 + 6 + axis] ?? 0)) / 3 - (CENTRE[axis] ?? 0));
      expect((n[0] ?? 0) * (centroid[0] ?? 0) + (n[1] ?? 0) * (centroid[1] ?? 0) + (n[2] ?? 0) * (centroid[2] ?? 0)).toBeGreaterThan(0.9);
    }
  });

  it('gives each cube corner a vertex normal along its diagonal', () => {
    for (let v = 0; v < 8; v += 1) {
      const corner = [0, 1, 2].map((axis) => (welded.vertices[v * 3 + axis] ?? 0) - (CENTRE[axis] ?? 0));
      const n = [normals.vertex[v * 3] ?? 0, normals.vertex[v * 3 + 1] ?? 0, normals.vertex[v * 3 + 2] ?? 0];
      for (let axis = 0; axis < 3; axis += 1) expect(Math.sign(n[axis] ?? 0)).toBe(Math.sign(corner[axis] ?? 0));
      expect(Math.abs(n[0] ?? 0)).toBeCloseTo(Math.abs(n[1] ?? 0), 6);
      expect(Math.abs(n[1] ?? 0)).toBeCloseTo(Math.abs(n[2] ?? 0), 6);
    }
  });

  it('sums the two face normals on every edge, so a cube edge normal has two equal components', () => {
    let diagonalEdges = 0;
    let cubeEdges = 0;
    for (let t = 0; t < 12; t += 1) {
      for (let e = 0; e < 3; e += 1) {
        const n = [0, 1, 2].map((axis) => normals.edge[t * 9 + e * 3 + axis] ?? 0);
        const magnitudes = n.map((value) => Math.abs(value)).sort((a, b) => b - a);
        if (magnitudes[0] === 2) diagonalEdges += 1;
        else {
          cubeEdges += 1;
          expect(magnitudes).toEqual([1, 1, 0]);
        }
      }
    }
    expect(diagonalEdges).toBe(12);
    expect(cubeEdges).toBe(24);
  });
});

describe('signedVolume, boundingBox and dropDegenerate', () => {
  it('measures the cube at 8 and negative when every triangle is reversed', () => {
    expect(signedVolume(cube)).toBeCloseTo(8, 9);
    const reversed = Float32Array.from(cube);
    for (let t = 0; t < 12; t += 1) {
      reversed.set(cube.subarray(t * 9 + 3, t * 9 + 6), t * 9 + 6);
      reversed.set(cube.subarray(t * 9 + 6, t * 9 + 9), t * 9 + 3);
    }
    expect(signedVolume(reversed)).toBeCloseTo(-8, 9);
  });

  it('bounds the cube around its centre', () => {
    expect(boundingBox(cube)).toEqual({ min: [-0.5, -1.25, 1], max: [1.5, 0.75, 3], extent: [2, 2, 2] });
  });

  it('drops a zero-area triangle and keeps the rest in order', () => {
    const withSliver = Float32Array.from([...cube.subarray(0, 9), 0, 0, 0, 1, 1, 1, 2, 2, 2, ...cube.subarray(9)]);
    const { positions, dropped } = dropDegenerate(withSliver);
    expect(dropped).toBe(1);
    expect(Array.from(positions)).toEqual(Array.from(cube));
    expect(dropDegenerate(cube).dropped).toBe(0);
  });
});
