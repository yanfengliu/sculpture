# Engine options for carving David in the browser

Status: research note, 2026-10-11, worker `research-engine`, base a3f5055. Read-only investigation plus one micro-benchmark run outside the repo.

Every claim is tagged: **states** (a source says it, URL given), **measured** (run on this machine in this session, bound given) or **inferred** (my arithmetic or judgement from the two).

Machine for every measurement: Windows 11 Home 10.0.26100, Node v24.18.1, Intel i9-13900KF (32 logical CPUs), 68 GB RAM, NVIDIA RTX 4090 (driver 616.64), Chrome 154.0.8037.99, Playwright browsers under `%LOCALAPPDATA%\ms-playwright` (chromium-1243, chromium_headless_shell-1243, ffmpeg-1011), no ffmpeg on PATH. Scratch code lives in the session scratchpad, not in the repo.

## Summary

- Stock: one dense Int8 narrow-band distance grid at 8 mm cells, indexed as 32^3 chunks, remeshed per dirty chunk by marching cubes with flat normals, in a worker pool fed by transferable buffers. Measured: 0.21 ms per 32^3 chunk for positions, 0.33 ms with flat normals, single thread.
- Carving rule: `s' = max(s, min(-T, d - r))` where `s` is the stock distance, `T` the tool's swept volume, `d` the statue's distance and `r` the stage's margin. It is monotone, never cuts below the statue, and is order-independent, so replay is bit-exact.
- Playback: undo boxes per stroke for backward play and step-back, forward replay in index order for jumps, no full-grid checkpoints unless a measured jump exceeds 300 ms.
- Rendering: three.js 0.186.1 WebGLRenderer with `preserveDrawingBuffer`, marble as MeshPhysicalMaterial plus a GLSL vein function injected with `onBeforeCompile`, chips as one InstancedMesh, tools as Lathe and Extrude geometry at documented sizes.
- Video: frame dump through `?shot=1&t=` and the ffmpeg binary Playwright already installed, which writes WebM (VP8).
- Tests: Vitest for the engine as pure functions, Playwright for controls and captures; both bounded, neither proves the look.

## 1. Stock representation and meshing

### Dense versus chunked grids

A dense grid for the block is small enough at 8 mm (24.6 MiB as Int8, measured arithmetic below), so the recommendation is one dense array indexed as 32^3 chunks, not a sparse chunk map. Inferred: a sparse map saves little here because most chunks hold stock surface at `t = 0` (the block's whole skin), and dense indexing keeps every cell read a single multiply-add.

Chunk bookkeeping still matters for remeshing: a stroke dirties the chunks its swept volume touches, and only those are remeshed. Each chunk's mesh is its own `BufferGeometry` and `Mesh`, so an untouched chunk costs nothing on the CPU and gets frustum-culled on the GPU.

### Marching cubes versus dual contouring versus surface nets

Marching cubes places vertices on cell edges from a 256-case table and is the known quantity; three.js ships Bourke's table in `examples/jsm/objects/MarchingCubes.js` (states: https://unpkg.com/three@0.186.1/examples/jsm/objects/MarchingCubes.js, lines 246-253 show the corner-bit convention). Its output on a smooth field is smooth, and the chisel-facet look comes from flat shading, not from the mesher.

Naive surface nets place one vertex per cell and were fastest in the only JavaScript comparison I found: 124 ms versus 275 ms for marching cubes on a 65^3 field at the highest tested frequency, with about half the primitives, but the author warns the mesh "can create non-manifold vertices" and the result is bevelled, so sharp edges are lost (states: https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/, numbers from its table, which the author says to treat with skepticism).

Dual contouring keeps sharp edges and corners by placing each cell's vertex at the minimum of a quadratic error function built from Hermite data (values and gradients), at the cost of needing gradients, a least-squares solve per cell, vertices that can leave their cell without clamping, and non-manifold output where two surfaces share a cell (states: https://www.boristhebrave.com/2018/04/15/dual-contouring-tutorial/; the original paper is Ju, Losasso, Schaefer, Warren 2002, PDF reachable at https://www.cs.rice.edu/~jwarren/papers/dualcontour.pdf, 8 pages, not read in this session).

Inferred recommendation: marching cubes with flat normals. A chisel facet is a planar cut several cells wide; marching cubes reproduces a plane exactly (measured: a plane through a 32^3 chunk meshes to exactly 2 triangles per crossing cell), so facets look crisp wherever they are larger than a cell. Sharp creases between two facets are rounded over one cell (8 mm), which reads as a worn edge; if the owner wants knife-sharp creases, dual contouring is the upgrade path and the chunk and worker design below does not change.

### Chunk size

32^3 cells with a 33^3 sample window is the recommendation. Measured cost per chunk is below; 16^3 chunks would quadruple the apron overhead ((17^3 - 16^3) / 16^3 = 20 % extra samples against 10 % at 32) and raise draw calls eightfold, 64^3 chunks would make a small stroke remesh 262k cells for a 3 cm bite.

### Measured: marching cubes throughput on this machine

Script: a straightforward single-threaded marching cubes in plain JavaScript (Bourke's table, linear edge interpolation, no vertex welding, triangles written to a preallocated Float32Array), run with Node v24.18.1 on a 32^3 chunk, 33^3 Float32 samples, median and minimum over 400 runs after 100 warm-up runs, repeated in four processes.

| Field in the chunk | Active cells | Triangles | Median ms | Min ms | Cells per ms (median) |
|---|---|---|---|---|---|
| Sphere r = 12 cells, positions only | 2,716 | 5,424 | 0.21 | 0.20 | 155,000 |
| Same, plus flat normals | 2,716 | 5,424 | 0.33 | 0.32 | 99,000 |
| Plane z = 16.5 | 1,024 | 2,048 | 0.16 | 0.16 | 203,000 |
| Slanted plane | 2,302 | 4,606 | 0.20 | 0.19 | 164,000 |
| All inside (early-out only) | 0 | 0 | 0.14 | 0.14 | 228,000 |
| Sphere, Int8 samples read directly | 2,712 | 5,416 | 0.30 | 0.29 | 108,000 |

Headline: about 155,000 cells per millisecond, 12,900 active cells per millisecond, for a chunk whose surface crosses 8 % of its cells; the floor is 0.14 ms per chunk for scanning 32^3 cells with nothing to emit.

Bound of the measurement: one core of a desktop i9 under V8's optimising JIT, Float32 input, no vertex welding, no gradient normals, no copy into a worker, no GPU upload, no allocation (the output buffer is reused), one process at a time. Medians varied between 0.20 and 0.34 ms across the four runs while minima stayed at 0.20 ms, so the figure to plan with is 0.2 to 0.35 ms per surface chunk. The Int8 row ran slower only because the same function had already been optimised for Float32Array and turned polymorphic; a mesher that always reads one typed-array type will not pay that.

Self-check that makes the numbers trustworthy: the sphere mesh closes (V - E + F = 2, every edge shared by exactly two triangles, winding outward) and its volume is within 0.41 % of 4/3 pi r^3. A first run with the sphere centred on a lattice point failed that check (96 unshared edges) because samples that are exactly zero produce degenerate triangles; the fix was an off-lattice centre, and the lesson for the engine's own test is to avoid exact zeros or weld before counting.

### Incremental remeshing and workers without SharedArrayBuffer

SharedArrayBuffer needs the page to be cross-origin isolated, which requires the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response headers; without them "the various postMessage() APIs will throw for SharedArrayBuffer objects" and the constructor is hidden (states: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer). GitHub Pages serves static files with no custom headers; the known workaround is a service worker that injects the headers after a first-load reload, MIT licensed, "e.g. GH pages" being its own example (states: https://github.com/gzuidhof/coi-serviceworker). Inferred: do not take that dependency; transferables are enough here.

Design without shared memory: the main thread owns the grid and the undo log. For each dirty chunk it copies the 33^3 Int8 window (35,937 bytes, about 10 microseconds) into a fresh ArrayBuffer and posts it with the transfer list; the worker converts to Float32, meshes, and posts back positions and normals as transferable ArrayBuffers. A chunk with 5,400 triangles is 5,400 x 9 x 4 = 194 KB of positions and the same of normals, so a full remesh of 600 chunks moves about 230 MB through postMessage; welding vertices and using `flatShading: true` on the material (three.js computes face normals from derivatives) cuts that to roughly a quarter and is the first optimisation to make if the measured transfer time matters.

Pool size: `navigator.hardwareConcurrency - 2` workers, capped at 8. Inferred from the measurement: 8 workers remesh the block's whole skin (about 600 surface chunks at 8 mm) in 15 to 30 ms, and one worker does a typical stroke (1 to 8 dirty chunks) in under 3 ms.

## 2. Resolution for a 5.5 m x 2 m x 1.2 m block

Measured arithmetic (the grid-size script allocated each grid and gzipped it):

| Cell | Grid | Cells | Int8 | Float16 | Float32 | 32^3 chunks | Skin chunks at t = 0 (inferred) | Full remesh, 1 thread | Triangles at t = 0 (inferred) |
|---|---|---|---|---|---|---|---|---|---|
| 10 mm | 550 x 200 x 120 | 13.2 M | 12.6 MiB | 25.2 MiB | 50.4 MiB | 504 | about 400 | 0.1 to 0.17 s | 0.8 M |
| 8 mm | 688 x 250 x 150 | 25.8 M | 24.6 MiB | 49.2 MiB | 98.4 MiB | 880 | about 610 | 0.18 to 0.29 s | 1.25 M |
| 5 mm | 1100 x 400 x 240 | 105.6 M | 100.7 MiB | 201.4 MiB | 402.8 MiB | 3,640 | about 1,560 | 0.76 to 1.2 s | 3.2 M |

Skin chunks: the block's surface is 2 x (5.5 x 2 + 5.5 x 1.2 + 2 x 1.2) = 40 m^2, divided by a chunk face (0.256 m)^2 at 8 mm. Triangles: 40 m^2 / cell^2 crossing cells times 2 triangles each (measured for a plane); carved surfaces run rougher, so 1.5 to 2 times these counts late in the roughing stage.

Per-stroke remeshing: a chisel bite of 3 to 10 cm plus a 2-cell apron fits in 1 to 8 chunks at every resolution listed, so a stroke costs 0.2 to 2.8 ms of meshing single-threaded at 8 mm and the same per chunk at 5 mm; the resolutions differ in the cost of the full remesh after a long jump and in memory, not in the cost of a stroke.

What each resolution shows (inferred from marching cubes needing 2 to 3 cells across a feature to shape it):

- 10 mm: fingers (2 cm) are 2-cell rods, the nose and brow read, lips and eyelids do not; good for a fallback preset.
- 8 mm: fingers are 2.5 cells and separate cleanly, eyes and nose read, lips are weak, knuckles are hints; the finished frame is visibly a carving, not a scan.
- 5 mm: fingers are 4 cells with knuckles, lips read, eyelids still do not; memory is 100 MiB Int8 and the full remesh is a second single-threaded.
- Chisel furrows of 2 to 5 mm are below every resolution here; they must come from shading (flat facets for the point and flat chisel, a stroke-aligned normal pattern for the claw and rasp), not from the grid.

Recommendation: 8 mm Int8 as the base grid, with a per-chunk refinement flag that stores a 64^3 window (2x, 4 mm) for marked boxes (head about 3 x 3 x 3 chunks, each hand about 8 chunks, together about 45 chunks, 12 MB extra). The build step samples the statue at 4 mm inside those boxes; the mesher runs per chunk at the chunk's own resolution; the seam between resolutions needs a skirt or an overlap of one coarse cell, which is the known cost of this path. If the owner later wants furrows as geometry, only a 1 to 2 mm band near the final surface could show them, which this refinement flag can carry at 4x for small boxes.

Quantisation: Int8 with a band of plus or minus 2 cells saturates at 16 mm and has a step of 0.126 mm at 8 mm cells, far below what a pixel shows; marching cubes needs correct values only at the 8 corners of a crossing cell, so a 2-cell band is enough. Float16Array exists in Node v24.18.1 (measured: `typeof Float16Array === 'function'`) and is "Baseline 2025, newly available since April 2025" in browsers (states: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Float16Array), but it buys nothing once values saturate beyond the band, so Float32 stays a build-step type and Int8 is the runtime type.

## 3. Distance grid from the statue mesh

three-mesh-bvh is at 0.9.16 with `peerDependencies.three: ">= 0.159.0"` and was developed against three 0.185, so it runs with three 0.186.1 (states: https://registry.npmjs.org/three-mesh-bvh/latest). Measured in the installed copy: `MeshBVH.closestPointToPoint(point, target = {}, minThreshold = 0, maxThreshold = Infinity)`, `raycast(ray, materialOrSide, near, far)` returning every hit, `raycastFirst(...)`, and `src/webgl` and `src/webgpu` folders with the shader helpers behind the project's GPU "SDF generation" example (states: README at https://github.com/gkjohnson/three-mesh-bvh, example https://gkjohnson.github.io/three-mesh-bvh/example/bundle/sdfGeneration.html).

Measured query cost in Node v24.18.1 on a 393,216-triangle torus knot (a stand-in for a decimated scan), random points in a box 0.2 m larger than the mesh:

| Query | Cost |
|---|---|
| BVH build | 227 ms |
| `closestPointToPoint`, exact, unbounded | 49.2 microseconds |
| `closestPointToPoint` with `maxThreshold = 0.04 m` (narrow band) | 2.38 microseconds |
| `raycast`, all hits along +z | 3.63 microseconds |
| `raycastFirst` along +z | 2.65 microseconds |

Bound: one thread, a torus knot is not David (its surface is smoother and its band fraction was 13 % of the box; a figure in a block is 2 to 4 %, which makes banded queries end sooner), and no worker overhead is included.

Inferred build time: banded queries over every cell cost 31 s at 10 mm, 61 s at 8 mm and 251 s at 5 mm on one thread; with 16 `worker_threads` (Node has SharedArrayBuffer without headers, and `MeshBVH.serialize` lets each worker reuse one tree) that is 2, 4 and 16 s. Unbounded exact distance everywhere would be 21 minutes at 8 mm and is never needed: cells beyond the band store the saturated value.

Sign: cast one ray per column through the block and assign parity between hits; 688 x 250 = 172,000 rays at 3.6 microseconds is 0.6 s at 8 mm. Cross-check with the closest-face normal (dot of the face normal with the offset to the point) for every band cell, and fail the build if more than 0.1 % disagree, which catches a scan that is not watertight before it reaches the page.

GPU alternative: the three-mesh-bvh example evaluates the distance per slice in a fragment shader with the BVH packed in textures; it would run in a Playwright-driven headless Chrome (which gets the RTX 4090, measured in section 6) in seconds. Inferred: not worth a browser in the build pipeline while the Node path takes under 10 s; keep it as the fallback for a multi-million-triangle source or the 5 mm grid.

Storage and loading: one file per resolution, `david-8mm.sdf.gz`, a one-line JSON header (dims, origin, cell, band, quantisation, source digest) followed by the Int8 cells, gzipped. Measured on a synthetic capsule figure in the block: the 25.8 M-cell Int8 grid gzips to 0.45 MiB at level 9 (0.62 MiB at level 1, 31 ms) and the 105.6 M-cell grid to 1.23 MiB; inferred for the real statue, whose band holds detail, 2 to 8 MiB. The page inflates it with `response.body.pipeThrough(new DecompressionStream('gzip'))`, available since Chrome 80 and across browsers since May 2023 ("Widely available"; gzip, deflate and deflate-raw only, no brotli) (states: https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream). The file is a build artifact under an ignored path, regenerated by the model script from the recorded source, as AGENTS.md requires.

## 4. The carving rule as a distance-field operation

Let `s` be the stock distance (negative inside stock), `d` the statue distance (negative inside the statue), `T_i` the distance to stroke i's swept volume (negative inside it), and `r_i >= 0` the margin the stage leaves above the final surface. Stroke i removes `T_i` intersected with `{ d > r_i }`, which in distance-field terms is:

`s' = max(s, min(-T_i, d - r_i))`

Properties (inferred, each one line of algebra): `s' >= s`, so stock only ever shrinks; inside the statue `d - r_i <= d < 0` and `s <= d`, so no statue cell ever turns positive; `max` and `min` are exact on floats and on Int8, so applying the strokes of a stage in any order gives the same bytes. Cells just outside the cut correctly become near-surface cells (that is what `max(s, -T)` means), so the band stays valid without a separate redistancing pass. The margin encodes the documented practice of stopping short of the final surface: the point chisel with `r` around 10 to 20 mm, the claw 3 to 5 mm, the flat 1 mm, rasp and abrasives 0, which is stage data for the technique research to fill in.

Removed volume per stroke, for the chips, is the count of cells whose sign flipped times the cell volume, computed while applying the stroke.

Shaping the removed volume per tool, each as a closed-form distance function evaluated only over the stroke's bounding box plus the band:

- Point chisel: a capped cone with apex at the point's deepest position, axis along the strike, half-angle 30 to 45 degrees, united with a small sphere at the apex for the crushed zone; a row of such pits is the pitted roughing surface. Gives the broad facets at 8 mm.
- Claw chisel: a wedge (triangular prism, blade width by bite depth by push length) minus a comb of boxes repeated across the blade width with the tooth pitch; at 8 mm cells the 3 to 4 mm teeth do not resolve, so the furrows come from a stroke-aligned normal pattern written into a per-vertex "last tool and direction" attribute, and the wedge alone shapes the volume.
- Flat chisel: a box with a bevelled front face and rounded edges, shallow depth; leaves planar facets.
- Drill: a capsule along the drill axis with a conical tip, radius 3 to 8 mm; at 8 mm a 6 mm hole is under one cell, so drill holes in the hair need the 4 mm refinement boxes or they will come out oversized, which the local rules count as a defect.
- Rasps and abrasives: a thin patch volume with `r_i` stepping down to 0 over the stage, so the surface settles onto the statue in thin layers.

## 5. Exact backward playback

The grid changes only at stroke impacts, so the stock at time `t` is the stock after the last stroke with impact time at or below `t`; tool poses, chips and dust interpolate between impacts and are seeded by the stroke index, so every visible thing at `t` is a function of `t` alone.

Forward: apply strokes in index order; each application records an undo box, the old Int8 values of the stroke's bounding box dilated by the band. Inferred sizes at 8 mm with a 2-cell band: a 4 x 3 x 2 cm bite is 9 x 8 x 7 = 504 bytes, a 10 x 6 x 4 cm roughing wedge 17 x 12 x 9 = 1.8 KB, so 20,000 strokes keep 10 to 36 MB of undo; at 5 mm the same strokes need 2.7 to 9 KB each, 54 to 180 MB, which is a second reason for 8 mm.

Backward play and step back: restore the undo box of the current stroke, mark its chunks dirty, remesh; about 1 to 3 ms per stroke, no distance evaluation at all. A jump from the end to `t = 0` restores every box (20 to 40 MB of byte copies, tens of ms) then remeshes the skin (15 to 30 ms on 8 workers).

Forward jumps: re-apply strokes from the current position; evaluating a tool over its dilated box costs 500 to 4,400 cell evaluations at 20 to 40 ns, so 10 to 180 microseconds per stroke and 0.2 to 3.6 s for all 20,000 strokes on one thread. Inferred mitigation in order: tight bounding boxes, then applying strokes chunk-parallel in the workers (every cell's updates stay in index order within its chunk, so bytes stay identical), then, only if a measured jump still exceeds 300 ms, gzipped Int8 snapshots at stage boundaries (about 10 stages, each 24.6 MiB raw, inferred 2 to 8 MiB gzipped, inflated in a worker in about 50 to 100 ms).

Why not checkpoints every N strokes: a full Int8 checkpoint is 24.6 MiB at 8 mm, ten of them 246 MiB; chunk-level copy-on-write checkpoints every 256 strokes come to 50 to 150 MB for the whole carving (inferred from 20 to 60 changed chunks per interval at 32 KB each), which is no better than the undo log and slower to use.

Stroke count: Wikipedia gives the statue as 5.17 m tall and "approximately 8.5 tons" (states: https://en.wikipedia.org/wiki/David_(Michelangelo)); at 2.7 t/m^3 that is about 3 m^3 of marble left from a 13.2 m^3 block, so about 10 m^3 removed if the block really measures 5.5 x 2 x 1.2 m. With roughing bites of 500 cm^3 that is 20,000 strokes; the real work was millions of blows, so every animated stroke stands for many, which the coordinator must decide (decision 3).

Adapting met's determinism test: met asserts byte-identical instance matrices after any history of plays, reversals, steps and scrubs (states: `C:\Users\38909\Documents\github\met\docs\design\spec.md`, Determinism). Here the assertion compares, after a seeded random history, the FNV-1a hash of the Int8 grid, of each dirty chunk's positions, of the tool poses and of the chip states at several fractional `t`, against a fresh evaluation at the same `t`. Vitest runs it on a small block (64 x 32 x 32 cells, a capsule statue, 300 strokes) in under 2 s, and an opt-in slow test runs the real stroke list once.

## 6. Rendering

### Renderer

three is at 0.186.1 (states: https://registry.npmjs.org/three/latest), met pins `^0.186.1` with `@types/three ^0.186.0` (states: `C:\Users\38909\Documents\github\met\package.json`). r186 adds SunLight with cascaded shadows to both renderers, retroreflective MeshPhysicalMaterial, many WebGPURenderer fixes, and deprecates the CommonJS build (states: https://github.com/mrdoob/three.js/releases/tag/r186). WebGPURenderer "tries to use a WebGPU backend if the browser supports WebGPU. If not, WebGPURenderer falls backs to a WebGL 2 backend", with `forceWebGL` to pin the fallback (states: https://threejs.org/docs/pages/WebGPURenderer.html); TSL has `triplanarTexture(textureX, textureY, textureZ, scale, position, normal)` (states: https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language; measured in the installed package at `src/nodes/utils/TriplanarTextures.js`).

Measured headless availability on this machine, page served from `http://localhost` (a secure context) through Playwright 1.64.0 (states: met's `node_modules/playwright/package.json`):

| Launch | WebGL2 renderer string | WebGPU |
|---|---|---|
| Playwright headless shell 1243, default args | SwiftShader (Subzero), software | adapter null |
| Headless shell, `--use-angle=d3d11 --enable-unsafe-webgpu --ignore-gpu-blocklist` | RTX 4090 via Direct3D11 | `requestDevice` fails, dxil.dll missing from the shell |
| Full Chromium 1243, new headless, default args | RTX 4090 via Direct3D11 | adapter nvidia / lovelace, clear colour captured by screenshot |
| `channel: 'chrome'` (Chrome 154), headless, default args, met's config | RTX 4090 via Direct3D11 | same, captured |
| `channel: 'chrome'`, `--use-angle=swiftshader --enable-unsafe-swiftshader` | SwiftShader (Subzero) | not tested |

Two facts worth a rule: a page opened with `setContent` on `about:blank` had no `navigator.gpu` at all (not a secure context), so capture pages must be served from localhost; and Playwright 1.64.0 expects browser revision 1248 while 1243 is installed, so the scaffold either runs `npx playwright install chromium` or uses `channel: 'chrome'` as met does. Playwright adds `--enable-unsafe-swiftshader` to its Chromium arguments by itself (measured: `chromeArguments.push("--enable-unsafe-swiftshader")` in met's `node_modules/playwright-core/lib/coreBundle.js`), which is why the headless shell's software WebGL worked with no flag from me.

What the fleet does: met runs Playwright on the installed Chrome (`channel: 'chrome'`, headless, no extra args) and waits for `window.__shotReady`; 3d-maker spawns Chrome itself with `--headless=new --enable-unsafe-swiftshader --force-device-scale-factor=1 --hide-scrollbars` over CDP, creates the renderer with `preserveDrawingBuffer: true` because "without it headless Chrome captures a blank canvas", and honours `?shot=1`, `?view=`, `?noui=1` (states: met `playwright.config.ts`, 3d-maker `scripts/capture-shots.mjs` and `AGENTS.md` Invariants). Chromium's own docs give `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` for software WebGL and call it "unsafe" because of JIT-ed code in the GPU process (states: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md); Chrome's headless-GPU post lists `--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu` for Linux only (states: https://developer.chrome.com/blog/supercharge-web-ai-testing).

Recommendation: WebGLRenderer. WebGPU works headless here, but CI runners have no GPU and WebGPU has no SwiftShader path I could verify, WebGLRenderer is what met and 3d-maker capture with, and the marble shader is GLSL the fleet already knows how to inject. Keep the material and renderer behind one small module so a WebGPURenderer port (TSL, `three/webgpu`, async `init()`) is a contained task later.

### Marble

MeshPhysicalMaterial settings, from its documented properties (states: https://threejs.org/docs/pages/MeshPhysicalMaterial.html; values inferred): colour a warm white, `roughness` 0.55 on freshly cut stock and 0.25 after abrasives, driven by a per-vertex finish attribute written by the last tool; `sheen` 0.3 with `sheenRoughness` 0.6 for the soft grazing highlight; `ior` 1.55 (calcite is 1.49 to 1.66); `specularIntensity` 1; `transmission` 0.08 with `thickness` 0.1 and `attenuationColor` a warm cream at `attenuationDistance` 0.25 as the cheap subsurface approximation, which the docs say requires `opacity` 1 and which adds a render pass. The alternative is `examples/jsm/shaders/SubsurfaceScatteringShader.js`, present in r186 (measured: HTTP 200 at https://unpkg.com/three@0.186.1/examples/jsm/shaders/SubsurfaceScatteringShader.js), whose thickness input can be fed per vertex from the stock distance grid, which we have for free.

Veining is a 3D function of position, not a texture: `vein = 1 - smoothstep(0, w, abs(sin(k * dot(p, dir) + warp * fbm(p))))` mixed into the base colour, the classic sine-plus-turbulence marble (Perlin 1985, not fetched). Because it is evaluated at the fragment's world position, every cut reveals the interior veins consistently, which is exactly what carving should show. Inject it into MeshPhysicalMaterial with `onBeforeCompile`, replacing `#include <color_fragment>`, and set `customProgramCacheKey` so the patched program is not confused with the stock one. Triplanar blending (weights `pow(abs(n), 4)` normalised) is needed only for 2D detail textures such as a tool-mark normal; the WebGPU path would use TSL's `triplanarTexture` for that.

### Chips and dust

One `InstancedMesh` of 4,096 chip instances (a flattened irregular tetrahedron, 5 to 30 mm) and one of 8,192 dust quads. A stroke spawns `clamp(removedVolume / 20 cm^3, 2, 12)` chips at its impact point with velocities from the strike direction plus a seeded cone, life 1.5 s, ballistic `p = p0 + v0 tau + 0.5 g tau^2` with `g = 9.81 m/s^2` in world time, landing on the base plane and fading. Everything is seeded by the stroke index, so chip state is a function of `t`. Inferred cost: composing 4,000 matrices per frame is 0.3 to 0.5 ms; with at most 50 strokes per second only about 1,000 chips are alive at once (states: https://threejs.org/docs/#api/en/objects/InstancedMesh).

### Tools

Procedural geometry at the sizes the technique note documents: `LatheGeometry` for the point chisel's round, tapering shank and the mallet's barrel head; `ExtrudeGeometry` for the flat and claw blades from a 2D profile with a bevel, the claw's teeth as a sawtooth in the profile; `CylinderGeometry` for drill bits and shanks; `BoxGeometry` with a procedural bump for rasps (states: https://threejs.org/docs/#api/en/geometries/LatheGeometry, https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry). Tool poses are stroke data: rest pose, approach, strike, recoil, so a tool never floats idle and never clips stock, which a Vitest on the stroke list checks by sampling the tool's volume against the stock before each strike.

## 7. Video export

Playwright's bundled ffmpeg (measured: `%LOCALAPPDATA%\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe`, "ffmpeg version n7.0.1-playwright-build-1011") has the `png` and `libvpx` (VP8) encoders and the `webm` and `image2` muxers, and no VP9, H.264 or AV1.

Options:

- Playwright `recordVideo` on a context: real-time screen recording, saved when the context closes, size defaulting to the viewport scaled into 800 x 800 (states: https://playwright.dev/docs/api/class-browser and https://playwright.dev/docs/videos). Inferred: drops frames under load and records wall-clock time, so it is a quick look, not an export.
- `MediaRecorder` on `canvas.captureStream()`: real-time too, timestamps follow the canvas read, WebM lacks duration metadata, and I found no confirmation it works in headless Chromium (states: the search results around https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/captureStream). Rejected.
- Frame dump: a script opens `?shot=1&view=<preset>&t=<t>` per frame (or calls the page's documented seek on the test facade), waits for `window.__shotReady`, screenshots at 1920 x 1080, then runs `ffmpeg -framerate 30 -i frames/%05d.png -c:v libvpx -b:v 6M -pix_fmt yuv420p output/making-of.webm`. Frame-exact and deterministic, any resolution, uses the real GPU. Inferred cost: 0.1 to 0.2 s per frame, so a 5-minute film at 30 fps takes 15 to 30 minutes, run as a script under `output/`, never as a gate.

Recommendation: the frame dump with the bundled ffmpeg, `recordVideo` kept as the one-command preview.

## 8. Test strategy

Vitest, engine as pure functions, no DOM, no WebGL: the stroke rule's three properties (monotone, never below the statue, order-independent) on random strokes; each tool volume's removed volume against its closed form; marching cubes on an off-lattice sphere (closed, two triangles per edge, volume within 1 %); undo exactness (apply then undo equals the bytes before); the determinism test of section 5; stroke-list integrity (every stroke removes stock, approaches from outside, stays within the stage's margin, cites a stage with a source); budgets (triangles and chunks at the finished state); the grid loader against a tiny fixture file. Fast, deterministic, runs in CI without a GPU.

Playwright, through real input only: every button, the scrubber, the keyboard shortcuts; the label and the canvas changing; `?shot=1` fixed angles and a few randomised ones captured into `.shots/` with `window.__shotReady` after at least 5 frames (the 3d-maker contract); a pixel-level determinism check that a frame reached by scrubbing hashes equal to the same `t` loaded directly, valid only within one machine and renderer; console clean. Serve from localhost through Vite's dev server as met does, never `setContent`.

What each cannot prove: Vitest cannot see a wrong normal, z-fighting, a black canvas or a marble that looks like plastic; Playwright cannot prove the look is right, only that pixels were drawn and match an earlier self, and under SwiftShader it proves the code path, not the GPU's output. Neither proves authenticity; that is the owner's and reviewer's comparison of captures with the reference photographs at native resolution, per R16.

## 9. Risks and fallbacks

- Real-time meshing too slow: not expected (0.2 to 2.8 ms per stroke measured basis), but if it is, drop flat normals for gradient normals from the band, lower to 10 mm (504 chunks), or move to a build step that precomputes the Int8 grid at stroke keyframes every 256 strokes, gzipped, which the page inflates and then applies the remaining strokes to.
- No GPU in CI: Vitest runs fully; Playwright runs on SwiftShader with `--use-angle=swiftshader --enable-unsafe-swiftshader` (measured renderer string "SwiftShader Device (Subzero)", drawn pixels captured), slower by an order of magnitude, so control tests and smoke captures still run while pixel comparisons stay local; WebGPU would not run, which the WebGLRenderer choice makes moot.
- Browser revision drift: Playwright 1.64.0 wants chromium 1248, this machine has 1243; pick `channel: 'chrome'` or add the install step to the scaffold.
- Big meshes: 1.25 M triangles at `t = 0` and 90 MB of unwelded vertex data; weld plus `flatShading` if memory or transfer time shows in the profile.
- Order-independence relies on every stroke being state-independent data; a tool whose pose is computed from the current stock at runtime would break parallel replay, so choreography computes poses offline and ships them as data.
- Oversized drill holes and missing claw furrows at 8 mm are authenticity defects under the local rules unless the refinement boxes and the shading pattern land with the stages that need them.

## Recommended architecture

Modules: `src/engine/grid.ts` (Int8 chunked stock grid, apron windows), `src/engine/sdf.ts` (tool volumes and the stroke rule), `src/engine/strokes.ts` (stroke type, apply, undo boxes), `src/engine/timeline.ts` (`seek(t)`, dirty chunks, pure evaluation), `src/engine/mesher.ts` and `mesher.worker.ts` (marching cubes, flat normals, pool, transferables), `src/engine/chips.ts` (seeded ballistic chips), `src/model/` (grid loader, frame constants), `src/stages/` (stage and stroke data citing research), `src/viewer/` (WebGLRenderer, marble material, tool meshes, chips, presets, the only query reader), `src/ui/` (timeline bar, keyboard), `scripts/model/build-grid.mjs` (Node: recorded mesh to `.sdf.gz` under an ignored path), `scripts/shots.mjs` and `scripts/export-video.mjs`, `tests/e2e/`.

Data flow: build step writes `public/model/david-8mm.sdf.gz` and the stroke files; the page inflates the grid, keeps the block's Int8 stock grid on the main thread, and on `seek(t)` applies or undoes strokes in index order, collects dirty chunks, posts 33^3 windows to workers, receives positions and normals, and swaps each chunk's geometry; tool poses and chips evaluate from the stroke list at `t`.

Worker boundary: main thread owns the grid, the undo log and all state; workers are stateless meshers (and, if replay time demands it, chunk-parallel stroke appliers), fed and answered by transferable ArrayBuffers; no SharedArrayBuffer anywhere.

File formats: `.sdf.gz` (one JSON header line plus gzipped Int8 cells); strokes as JSON `{ id, stage, tool, pose, depth, margin, time }` (about 150 bytes each, 3 MB for 20,000, under 1 MB gzipped on Pages) or a Float32 binary if JSON parsing shows in the profile; stage data JSON naming its sources; captures and video under `.shots/` and `output/`.

Query contract to copy from met: `shot=1`, `t=`, `view=`, `cam=`, `noui=1`, `autoplay=0`, plus `stage=<id>` in place of `step=`; `window.__shotReady` after 5 frames; `preserveDrawingBuffer: true`; a read-only `window.__sculpture` facade with stage ids, stroke count, and the current `t` for tests.

The three decisions for the coordinator:

1. Resolution: 8 mm base grid with 4 mm refinement boxes for head and hands (recommended, 25 MiB plus 12 MB) or 5 mm uniform (100 MiB, four times the remesh and undo cost, fingers and lips clearly better).
2. Renderer: WebGLRenderer with GLSL injection now (recommended, matches the fleet's capture tooling and CI software rendering) or WebGPURenderer with TSL and `forceWebGL` in CI.
3. Stroke budget: how many strokes the carving is (about 20,000 at 500 cm^3 roughing bites gives a 5 to 6 minute film at one stroke per frame) and how much each stroke compresses the real work, which fixes the undo memory, the replay time, the film length, and what "authentic" means for the stage data.

## Scratch artifacts

Scripts and raw outputs are in the session scratchpad (`mc-bench/mc-bench.mjs`, `run4.txt`, `grid-size.mjs`, `grid-size.txt`, `bvh-bench/bvh-bench.mjs`, `bvh-bench.txt`, `gpu-probe/probe2.mjs`, `probe2.txt`), outside the repo and not committed, per R23.
