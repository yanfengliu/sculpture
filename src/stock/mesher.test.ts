/**
 * Marching cubes (src/stock/mesher.ts). What a green run proves, and its bounds:
 *   1. An off-lattice sphere of radius 12 cells meshes to a closed surface: after welding by quantised position every edge belongs to exactly two triangles, V − E + F = 2, no triangle has zero area, and the signed volume by the divergence theorem is positive (outward winding) and within 1 percent of 4/3·π·r³ in world metres with a non-zero origin.
 *   2. A plane at z = 16.5 cells gives exactly two triangles per crossing cell (2048) with every vertex on the plane.
 *   3. A window all inside or all outside gives nothing.
 *   4. Each vertex carries the finish code of the nearer corner of its edge.
 *   5. The sphere chunk meshes in under 5 ms of this file's own CPU time on average over 200 runs (`process.cpuUsage()`, whose tick on Windows is about 16 ms, so the 200 runs are timed together; wall time grows with the suite's parallel files), a loose bound so CI never flakes; the median wall time is logged. The real figure is a few hundred such chunks.
 * Bounds: the output is unwelded and has no normals; a sphere and a plane do not exercise every one of the 256 cases (the closedness check does cover the cases the sphere meets); no real stock, no worker, no GPU.
 */
import { describe, expect, it } from 'vitest';

import { FIXED_POINT } from '../contracts/grid';
import { type ChunkMeshInput, meshChunk, WINDOW_CELLS } from './mesher';

const N = WINDOW_CELLS;
const CELL = 0.01;
const ORIGIN = [1.5, -0.25, 3] as const;
const LIMIT = 32 * FIXED_POINT;

function window(distanceInCells: (i: number, j: number, k: number) => number, finish: (i: number, j: number, k: number) => number = () => 0): ChunkMeshInput {
  const values = new Int16Array(N * N * N);
  const codes = new Uint8Array(N * N * N);
  for (let k = 0; k < N; k += 1) {
    for (let j = 0; j < N; j += 1) {
      for (let i = 0; i < N; i += 1) {
        const index = i + N * (j + N * k);
        const value = Math.round(distanceInCells(i, j, k) * FIXED_POINT);
        values[index] = value < -LIMIT ? -LIMIT : value > LIMIT ? LIMIT : value;
        codes[index] = finish(i, j, k);
      }
    }
  }
  return { values, finish: codes, cell: CELL, origin: ORIGIN };
}

const SPHERE_CENTRE = [16.3, 16.6, 15.9] as const;
const SPHERE_RADIUS = 12;
const sphere = window((i, j, k) => Math.hypot(i - SPHERE_CENTRE[0], j - SPHERE_CENTRE[1], k - SPHERE_CENTRE[2]) - SPHERE_RADIUS);

interface Welded {
  readonly vertices: number;
  readonly triangles: number;
  readonly edgeCounts: Map<string, number>;
  readonly volume: number;
  readonly degenerate: number;
}

function weld(positions: Float32Array): Welded {
  const ids = new Map<string, number>();
  const key = (x: number, y: number, z: number): string => [x, y, z].map((v) => Math.round((v / CELL) * 1e6)).join(',');
  const edgeCounts = new Map<string, number>();
  let volume = 0;
  let degenerate = 0;
  const triangles = positions.length / 9;
  const vertexOf = (p: number): number => {
    const k = key(positions[p] ?? 0, positions[p + 1] ?? 0, positions[p + 2] ?? 0);
    let id = ids.get(k);
    if (id === undefined) {
      id = ids.size;
      ids.set(k, id);
    }
    return id;
  };
  const at = (p: number): number => positions[p] ?? 0;
  for (let t = 0; t < triangles; t += 1) {
    const p = t * 9;
    const ax = at(p);
    const ay = at(p + 1);
    const az = at(p + 2);
    const bx = at(p + 3);
    const by = at(p + 4);
    const bz = at(p + 5);
    const cx = at(p + 6);
    const cy = at(p + 7);
    const cz = at(p + 8);
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.hypot(nx, ny, nz) < 1e-12) degenerate += 1;
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    const v = [vertexOf(p), vertexOf(p + 3), vertexOf(p + 6)];
    for (let e = 0; e < 3; e += 1) {
      const first = v[e] ?? 0;
      const second = v[(e + 1) % 3] ?? 0;
      const k = `${String(Math.min(first, second))}-${String(Math.max(first, second))}`;
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
    }
  }
  return { vertices: ids.size, triangles, edgeCounts, volume, degenerate };
}

describe('marching cubes', () => {
  it('meshes an off-lattice sphere to a closed, outward-wound surface with the right volume', () => {
    const out = meshChunk(sphere);
    const welded = weld(out.positions);
    expect(welded.triangles).toBeGreaterThan(1000);
    expect(welded.degenerate).toBe(0);
    const badEdges = [...welded.edgeCounts.values()].filter((count) => count !== 2).length;
    expect(badEdges, 'edges not shared by exactly two triangles').toBe(0);
    expect(welded.vertices - welded.edgeCounts.size + welded.triangles, 'Euler characteristic').toBe(2);
    const expected = (4 / 3) * Math.PI * (SPHERE_RADIUS * CELL) ** 3;
    expect(welded.volume).toBeGreaterThan(0);
    expect(Math.abs(welded.volume - expected) / expected).toBeLessThan(0.01);
    expect(out.finish.length).toBe(out.positions.length / 3);
  });

  it('meshes a plane to two triangles per crossing cell, every vertex on the plane', () => {
    const out = meshChunk(window((_i, _j, k) => k - 16.5));
    expect(out.positions.length / 9).toBe(2048);
    const z = ORIGIN[2] + 16.5 * CELL;
    for (let v = 0; v < out.positions.length; v += 3) expect(out.positions[v + 2]).toBeCloseTo(z, 6);
  });

  it('emits nothing for a window all inside or all outside', () => {
    expect(meshChunk(window(() => -5)).positions.length).toBe(0);
    expect(meshChunk(window(() => 5)).positions.length).toBe(0);
  });

  it('gives each vertex the finish of the nearer corner', () => {
    // Plane at k = 10.25: the vertices sit a quarter cell above corner k = 10 (inside, code 2), so they take code 2; at k = 10.75 they take the outside corner's code 0.
    const near = meshChunk(window((_i, _j, k) => k - 10.25, (_i, _j, k) => (k <= 10 ? 2 : 0)));
    expect(new Set(near.finish)).toEqual(new Set([2]));
    const far = meshChunk(window((_i, _j, k) => k - 10.75, (_i, _j, k) => (k <= 10 ? 2 : 0)));
    expect(new Set(far.finish)).toEqual(new Set([0]));
  });

  it('meshes the sphere chunk in under 5 ms', () => {
    for (let n = 0; n < 50; n += 1) meshChunk(sphere);
    const times: number[] = [];
    const before = process.cpuUsage();
    for (let n = 0; n < 200; n += 1) {
      const start = performance.now();
      meshChunk(sphere);
      times.push(performance.now() - start);
    }
    const used = process.cpuUsage(before);
    const meanCpuMs = (used.user + used.system) / 1000 / 200;
    times.sort((a, b) => a - b);
    console.log(`mesher: sphere chunk ${String(meshChunk(sphere).positions.length / 9)} triangles, wall median ${(times[100] ?? 0).toFixed(3)} ms, min ${(times[0] ?? 0).toFixed(3)} ms, CPU mean ${meanCpuMs.toFixed(3)} ms`);
    expect(meanCpuMs).toBeLessThan(5);
  });
});
