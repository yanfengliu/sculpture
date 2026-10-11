/**
 * Builds the David figure grid (docs/design/spec.md, Model pipeline) from the mesh scripts/fetch-model.mjs cached under `assets/cache/david/`.
 *
 * Phases, each timed and logged: parse the STL; drop degenerate triangles; normalise into the world frame (scripts/lib/model/normalise.mjs says how up and front are decided); weld and check the shell (edge counts, watertight, winding consistency; a tolerance weld only when the exact weld leaves it open); check the figure fits BLOCK_M; render shaded silhouettes of the five fixed views into `output/model/`; build a BVH; sample the signed distance on the lattice in worker threads; sign by the closest feature's pseudonormal when the shell is watertight and consistently wound, else by a flood fill from the lattice boundary that seals holes; check the grid's volume against the mesh's; write `public/model/david.json` and `david.bin.gz` (src/contracts/grid.ts).
 *
 * Usage: node scripts/build-grid.mjs [--cell=<metres>] [--block=auto] [--workers=<n>]
 *   --cell      cell size in metres, default DEFAULT_CELL_M from src/david/frame.ts
 *   --block     `auto` builds the lattice from the figure's own box plus 0.05 m per side instead of failing when the figure does not fit BLOCK_M
 *   --workers   sampling threads, default the machine's parallelism
 * Exit: 0 the grid is written and its volume is within 5 percent of the mesh's; 1 otherwise, with the reason.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { BLOCK_M, DEFAULT_CELL_M, FIGURE_OFFSET_M, GRID_MARGIN_CELLS, STATUE_HEIGHT_M } from '../src/david/frame.ts';
import { MESH_PATH, SOURCE_PATH } from './fetch-model.mjs';
import { buildBvh } from './lib/model/bvh.mjs';
import { DEFAULT_BAND_CELLS, gridSource, writeGrid } from './lib/model/grid-writer.mjs';
import { matrixRows, normalise } from './lib/model/normalise.mjs';
import { encodeGreyPng } from './lib/model/png.mjs';
import { VIEWS, renderView } from './lib/model/raster.mjs';
import { floodFromBoundary, gridVolume, latticeFor, resolveSign } from './lib/model/sample.mjs';
import { parseStl } from './lib/model/stl.mjs';
import { EdgeTable, boundingBox, dropDegenerate, flatten, pseudonormals, signedVolume, weld } from './lib/model/topology.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(REPO_ROOT, 'output', 'model');
const GRID_DIR = join(REPO_ROOT, 'public', 'model');
const GRID_NAME = 'david';
const EXPECTED_TRIANGLES = 1_199_948;
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 1200;
const AUTO_BLOCK_MARGIN_M = 0.05;
const VOLUME_TOLERANCE = 0.05;
/** Quanta, metres, tried in turn by the tolerance weld when the exact weld leaves boundary edges. */
const WELD_QUANTA = [1e-5, 1e-4];

const timings = [];
let phaseStart = performance.now();

function log(message) {
  console.log(`build-grid: ${message}`);
}

function endPhase(name) {
  const now = performance.now();
  timings.push({ name, seconds: (now - phaseStart) / 1000 });
  log(`  [${name}: ${((now - phaseStart) / 1000).toFixed(2)} s]`);
  phaseStart = now;
}

function fail(message) {
  console.error(`build-grid: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { cell: DEFAULT_CELL_M, blockAuto: false, workers: availableParallelism() };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--cell') {
      options.cell = Number(value);
      if (!(options.cell > 0)) fail(`--cell must be a positive size in metres, got "${String(value)}".`);
    } else if (key === '--block') {
      if (value !== 'auto') fail(`--block accepts only "auto" (lattice from the figure's box), got "${String(value)}".`);
      options.blockAuto = true;
    } else if (key === '--workers') {
      options.workers = Number(value);
      if (!Number.isInteger(options.workers) || options.workers < 1) fail(`--workers must be a whole number of threads, got "${String(value)}".`);
    } else fail(`unknown argument "${arg}"; accepted: --cell=<metres>, --block=auto, --workers=<n>.`);
  }
  return options;
}

const fmt = (value, digits = 4) => Number(value).toFixed(digits);
const fmtBox = (box) => `x ${fmt(box.min[0])}..${fmt(box.max[0])}, y ${fmt(box.min[1])}..${fmt(box.max[1])}, z ${fmt(box.min[2])}..${fmt(box.max[2])} (extent ${box.extent.map((e) => fmt(e)).join(' × ')})`;

/** Copies a typed array into one backed by a SharedArrayBuffer, so workers see it without a copy each. */
function toShared(array) {
  if (array.buffer instanceof SharedArrayBuffer) return array;
  const shared = new array.constructor(new SharedArrayBuffer(array.byteLength));
  shared.set(array);
  return shared;
}

function loadMesh() {
  if (!existsSync(MESH_PATH)) fail(`no mesh at ${MESH_PATH}; run \`npm run model:fetch\` first.`);
  const bytes = readFileSync(MESH_PATH);
  const parsed = parseStl(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  log(`parsed ${parsed.kind} STL: ${parsed.triangles.toLocaleString('en-US')} triangles (expected ${EXPECTED_TRIANGLES.toLocaleString('en-US')})${parsed.triangles === EXPECTED_TRIANGLES ? '' : ' — NOT the expected count, the file differs from the research note'}`);
  const { positions, dropped } = dropDegenerate(parsed.positions);
  log(`dropped ${String(dropped)} degenerate triangles, ${String(positions.length / 9)} remain`);
  endPhase('parse');
  return positions;
}

function normaliseMesh(positions) {
  const result = normalise(positions, STATUE_HEIGHT_M, FIGURE_OFFSET_M);
  const { up, front } = result;
  log(`raw bounding box: ${fmtBox(result.rawBox)}`);
  log(`up: longest axis ${up.axis}; end-slab footprints low ${fmt(up.lowSlabArea)} vs high ${fmt(up.highSlabArea)} (raw units²), so the base is at the ${up.baseAtMin ? 'minimum' : 'maximum'} end`);
  log(`left-right axis: ${front.swappedHorizontalAxes ? 'the horizontal axis with the larger extent was z, swapped to x by +90° about Y' : 'x already has the larger horizontal extent'}`);
  log(`front: thigh band ${front.thighBand.join('–')} of the height, reach from the footprint centre on +X ${fmt(front.thighReachLeft)} vs −X ${fmt(front.thighReachRight)} (raw units); the hanging right hand and the jutting right hip reach further, so −X must be the figure's right: ${front.turnedAround ? 'the +X side reached further, turned 180° about Y' : 'it already is, kept'}`);
  log(`chirality check: lower-leg band ${front.legBand.join('–')}, mean z of the +X half ${fmt(front.leftHalfMeanZ)} vs the −X half ${fmt(front.rightHalfMeanZ)} (raw units); the left leg and foot are forward and the stump is behind the right leg, so the +X half must lead in z: ${front.chiralityOk ? 'it does, the model is not mirrored' : 'IT DOES NOT: the model is a mirror image'}`);
  if (!front.chiralityOk) fail('the figure fails the chirality check (see above): no proper rotation makes a mirrored model face +Z with the sling over its left shoulder. Check the silhouettes in output/model/ and the source in docs/research/mesh-sources.md before deciding on a reflection.');
  log(`scale ${fmt(result.scale, 6)} (height ${fmt(result.rawBox.extent['xyz'.indexOf(up.axis)])} raw units → ${fmt(STATUE_HEIGHT_M)} m); translation [${result.translation.map((t) => fmt(t)).join(', ')}] m; figure offset [${fmt(FIGURE_OFFSET_M.x)}, ${fmt(FIGURE_OFFSET_M.y)}, ${fmt(FIGURE_OFFSET_M.z)}]`);
  log(`transform (row-major 4×4):\n${matrixRows(result.rotation, result.scale, result.translation).map((row) => `    [${row.map((v) => fmt(v, 6)).join(', ')}]`).join('\n')}`);
  log(`normalised bounding box: ${fmtBox(result.box)} m`);
  endPhase('normalise');
  return result;
}

function checkMesh(positions) {
  let welded = weld(positions, 0);
  let edges = new EdgeTable(welded.indices);
  let stats = edges.stats();
  const describe = (label, w, s) => log(`${label}: ${String(positions.length / 3)} corners → ${String(w.unique)} vertices; ${String(s.edges)} edges: ${String(s.manifold)} on two faces, ${String(s.boundary)} boundary, ${String(s.nonManifold)} on more than two; ${String(s.inconsistent)} two-face edges wound the same way; watertight ${s.watertight ? 'yes' : 'no'}, windings consistent ${s.consistent ? 'yes' : 'no'}`);
  describe('exact weld', welded, stats);
  if (!stats.watertight) {
    for (const quantum of WELD_QUANTA) {
      const candidate = weld(positions, quantum);
      const candidateEdges = new EdgeTable(candidate.indices);
      const candidateStats = candidateEdges.stats();
      describe(`tolerance weld at ${String(quantum)} m`, candidate, candidateStats);
      if (candidateStats.boundary + candidateStats.nonManifold < stats.boundary + stats.nonManifold) {
        welded = candidate;
        edges = candidateEdges;
        stats = candidateStats;
      }
      if (stats.watertight) break;
    }
  }
  const flat = welded.quantum === 0 ? positions : flatten(welded.vertices, welded.indices);
  const normals = pseudonormals(welded.vertices, welded.indices, edges);
  log(`using the ${welded.quantum === 0 ? 'exact' : `${String(welded.quantum)} m`} weld; sign method: ${stats.watertight && stats.consistent ? 'pseudonormal of the closest feature (shell closed and consistently wound), flood fill as the cross-check' : 'flood fill from the lattice boundary (shell open or inconsistently wound), pseudonormal for the cells within half a cell of the surface'}`);
  endPhase('check');
  return { positions: flat, indices: welded.indices, normals, stats };
}

function blockFor(box, blockAuto) {
  const block = { min: [-BLOCK_M.width / 2, 0, -BLOCK_M.depth / 2], max: [BLOCK_M.width / 2, BLOCK_M.height, BLOCK_M.depth / 2] };
  const fits = [0, 1, 2].every((axis) => box.min[axis] >= block.min[axis] - 1e-9 && box.max[axis] <= block.max[axis] + 1e-9);
  log(`BLOCK_M ${fmt(BLOCK_M.width, 2)} × ${fmt(BLOCK_M.height, 2)} × ${fmt(BLOCK_M.depth, 2)} m (width × height × depth) spans x ${fmt(block.min[0])}..${fmt(block.max[0])}, y ${fmt(block.min[1])}..${fmt(block.max[1])}, z ${fmt(block.min[2])}..${fmt(block.max[2])}; the figure ${fits ? 'fits' : 'does NOT fit'}`);
  if (fits) return block;
  if (!blockAuto) {
    fail(`the normalised figure (${fmtBox(box)} m, after STATUE_HEIGHT_M ${fmt(STATUE_HEIGHT_M)} and FIGURE_OFFSET_M) does not fit BLOCK_M ${fmt(BLOCK_M.width, 2)} × ${fmt(BLOCK_M.height, 2)} × ${fmt(BLOCK_M.depth, 2)} m in src/david/frame.ts; update the block or the offset, or pass --block=auto to lattice the figure's own box plus ${fmt(AUTO_BLOCK_MARGIN_M, 2)} m per side.`);
  }
  const auto = { min: box.min.map((v) => v - AUTO_BLOCK_MARGIN_M), max: box.max.map((v) => v + AUTO_BLOCK_MARGIN_M) };
  log(`--block=auto: lattice over the figure's box plus ${fmt(AUTO_BLOCK_MARGIN_M, 2)} m per side: x ${fmt(auto.min[0])}..${fmt(auto.max[0])}, y ${fmt(auto.min[1])}..${fmt(auto.max[1])}, z ${fmt(auto.min[2])}..${fmt(auto.max[2])}`);
  return auto;
}

function renderViews(positions) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [name, view] of Object.entries(VIEWS)) {
    const image = renderView(positions, view, VIEW_WIDTH, VIEW_HEIGHT);
    const path = join(OUTPUT_DIR, `${name}.png`);
    writeFileSync(path, encodeGreyPng(VIEW_WIDTH, VIEW_HEIGHT, image.pixels));
    log(`rendered ${name} → ${path} (${String(image.covered)} covered pixels, ${fmt(image.metresPerPixel * 1000, 2)} mm per pixel)`);
  }
  endPhase('render');
}

async function sampleGrid(bvh, normals, indices, lattice, workers) {
  const total = lattice.size[0] * lattice.size[1] * lattice.size[2];
  const out = new Float32Array(new SharedArrayBuffer(total * 4));
  const sharedNormals = { order: bvh.order, indices: toShared(indices), face: toShared(normals.face), vertex: toShared(normals.vertex), edge: toShared(normals.edge) };
  const sharedBvh = { positions: bvh.positions, bounds: bvh.bounds, meta: bvh.meta };
  const threads = Math.min(workers, lattice.size[2]);
  log(`sampling ${total.toLocaleString('en-US')} cells on ${String(threads)} threads, band ${String(lattice.band)} cells`);
  const runs = [];
  for (let w = 0; w < threads; w += 1) {
    const slabs = [];
    for (let k = w; k < lattice.size[2]; k += threads) slabs.push(k);
    runs.push(
      new Promise((resolveRun, rejectRun) => {
        const worker = new Worker(new URL('./lib/model/sample-worker.mjs', import.meta.url), { workerData: { bvh: sharedBvh, normals: sharedNormals, lattice, slabs: Int32Array.from(slabs), out } });
        worker.once('message', (message) => resolveRun(message.sampled));
        worker.once('error', rejectRun);
        worker.once('exit', (code) => {
          if (code !== 0) rejectRun(new Error(`sampling thread ${String(w)} exited with code ${String(code)}`));
        });
      }),
    );
  }
  const sampled = (await Promise.all(runs)).reduce((sum, count) => sum + count, 0);
  if (sampled !== total) fail(`sampled ${String(sampled)} cells of ${String(total)}; a thread skipped slabs.`);
  endPhase('sample');
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  log(`cell ${String(options.cell)} m${options.cell === DEFAULT_CELL_M ? ' (DEFAULT_CELL_M)' : ' (--cell override; DEFAULT_CELL_M is ' + String(DEFAULT_CELL_M) + ')'}; band ${String(DEFAULT_BAND_CELLS)} cells; margin ${String(GRID_MARGIN_CELLS)} cells`);
  const raw = loadMesh();
  const normalised = normaliseMesh(raw);
  const mesh = checkMesh(normalised.positions);
  const block = blockFor(boundingBox(mesh.positions), options.blockAuto);
  renderViews(mesh.positions);

  const bvh = buildBvh(mesh.positions);
  log(`BVH: ${String(bvh.nodeCount)} nodes over ${String(bvh.triangles)} triangles`);
  endPhase('bvh');

  const lattice = latticeFor(block, options.cell, GRID_MARGIN_CELLS, DEFAULT_BAND_CELLS);
  const cells = lattice.size[0] * lattice.size[1] * lattice.size[2];
  log(`lattice ${lattice.size.join(' × ')} = ${cells.toLocaleString('en-US')} cells, origin [${lattice.origin.map((v) => fmt(v)).join(', ')}] m`);
  const values = await sampleGrid(bvh, mesh.normals, mesh.indices, lattice, options.workers);

  const flood = floodFromBoundary(values, lattice.size);
  const authority = mesh.stats.watertight && mesh.stats.consistent ? 'pseudonormal' : 'flood';
  const sign = resolveSign(values, flood.reached, lattice.band, authority);
  log(`flood fill reached ${flood.reachedCount.toLocaleString('en-US')} cells from the boundary; ${sign.surface.toLocaleString('en-US')} cells within half a cell of the surface keep the pseudonormal sign; ${sign.far.toLocaleString('en-US')} cells at the band take the flood fill`);
  log(`sign authority: ${authority}; disagreements beyond half a cell: flood inside but pseudonormal outside ${sign.floodInsideNormalOutside.toLocaleString('en-US')} (${authority === 'flood' ? 'sealed cells' : 'would be sealed'}), flood outside but pseudonormal inside ${sign.floodOutsideNormalInside.toLocaleString('en-US')}; inside cells ${sign.inside.toLocaleString('en-US')}`);
  endPhase('sign');

  const meshVolume = signedVolume(mesh.positions);
  const volume = gridVolume(values, lattice.cell);
  const reference = Math.abs(meshVolume);
  const difference = (volume.corrected - reference) / reference;
  log(`volume: mesh ${fmt(meshVolume)} m³ by the divergence theorem (${meshVolume < 0 ? 'negative: windings point inward' : 'windings point outward'}); grid ${fmt(volume.counted)} m³ from ${volume.negativeCells.toLocaleString('en-US')} negative cells, ${fmt(volume.corrected)} m³ with the half-cell correction; difference ${(difference * 100).toFixed(2)} percent`);
  endPhase('volume');
  if (Math.abs(difference) > VOLUME_TOLERANCE) fail(`the grid's volume differs from the mesh's by ${(Math.abs(difference) * 100).toFixed(2)} percent, over ${String(VOLUME_TOLERANCE * 100)}: the sign or the sampling is wrong; see the counts above.`);

  const source = existsSync(SOURCE_PATH) ? gridSource(JSON.parse(readFileSync(SOURCE_PATH, 'utf8'))) : undefined;
  if (!source) log(`no ${SOURCE_PATH}; the header carries no source block`);
  const written = writeGrid(GRID_DIR, GRID_NAME, lattice, values, source);
  log(`wrote ${join(GRID_DIR, written.files.header)} and ${join(GRID_DIR, written.files.data)}: ${cells.toLocaleString('en-US')} cells, ${written.rawBytes.toLocaleString('en-US')} raw bytes, ${written.gzippedBytes.toLocaleString('en-US')} gzipped bytes, values ${String(written.min)}..${String(written.max)}, sha256 ${written.header.sha256}`);
  endPhase('write');
  log(`timings: ${timings.map((t) => `${t.name} ${t.seconds.toFixed(2)} s`).join(', ')}; total ${timings.reduce((sum, t) => sum + t.seconds, 0).toFixed(2)} s`);
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
