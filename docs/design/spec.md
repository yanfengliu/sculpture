# sculpture — design spec

The contract every part of this repo builds against. Change it here first, in the same commit as the code that needs the change. Sections marked `research:` are filled from `docs/research/` and name the note they come from.

## Product

One page, `index.html`. It shows a block of Carrara marble in a Florentine workshop yard, and the period's real tools carve Michelangelo's David out of it, in the documented order, with no sculptor shown. The tools move as if held and struck; chips fly; the surface changes from quarry face to point-chisel furrows to claw marks to polished skin; the finished statue is only the last frame. The viewer plays the making forward or backward, one step at a time or continuously, scrubs it, jumps between stages, orbits and zooms freely at any point, and can follow the tool.

Time is compressed and the page says so: the label carries the simulated calendar from the first chisel blows on 9 September 1501 (Day 1; the formal start of 13 September is Day 5) to the unveiling on 8 September 1504 (`research: david-history.md` fixes the dates and the milestones between them). Playback is a time-lapse: about 20,000 shown blows over about five minutes at 1×; the mallet strikes about four times a second and each visible strike applies a short run of planned blows along the stroke's path; each shown blow stands for the number of real blows its step records (`blowsPerShown`), shown in the label's detail (`docs/research/decisions.md`).

Authenticity rules are in `docs/policies/local-rules.md`. What the record settles is followed; what it leaves open is decided once, in `docs/research/decisions.md`, with the reason.

## World frame

- 1 unit = 1 metre. +Y is up. The figure faces +Z. Right-handed.
- Origin: the centre of the block's footprint at the workshop floor. The block stands upright on its base as it stood in the Opera del Duomo yard.
- Block size, figure placement inside the block and the statue's dimensions live in `src/david/frame.ts`, one constant per fact, each with a comment naming its source in `docs/research/`. Builders read them from there and never restate a number another builder depends on. `research: david-history.md` supplies them.

## Stock and figure

The stock is a signed-distance grid: `stock[i][j][k]` is the signed distance (negative inside stone) from the centre of cell `(i, j, k)` to the stone's surface, in cells, clamped to a narrow band of 3 cells. The grid covers the block plus a margin; the cell size `h` is a constant of the grid, not of the engine, so tests run coarse synthetic grids and the page runs the David grid at 8 mm (`docs/research/decisions.md`; the measurements are in `docs/research/engine-options.md`).

The figure is a second grid on the same lattice: `figure[i][j][k]` is the signed distance to the statue's surface. It is built once by `scripts/build-grid.mjs` from the mesh that `scripts/fetch-model.mjs` fetched from the source recorded in `docs/research/mesh-sources.md`, into `public/model/` (ignored), and loaded by the page. A synthetic figure (a procedural mannequin of capsules and ellipsoids at David's height) is built in code for tests and for working without the download.

A third grid, `finish[i][j][k]` (one byte), records the last tool that touched each surface cell: quarry face, point, claw, flat, drill, rasp, abrasive, polish. Meshing samples it into a vertex attribute, and the marble shader turns it into the mark each tool leaves, at a finer scale than the grid can carry.

The carving rule, applied per blow: `stock' = max(stock, min(-tool, figure - margin))`, where `tool` is the signed distance to the volume this blow removes and `margin` is the stage's allowance above the final surface. The max removes stock inside the tool volume; the min stops the cut at the figure plus margin. The invariant `stock <= figure` holds after every blow, so no blow ever cuts into the statue, and a test asserts it on random blows. The removed volume's shape per tool is set in `research: tools.md` and `research: engine-options.md`: a cone for the point, a toothed wedge for the claw, a thin wedge for the flat chisel, a cylinder for the drill, and a thin surface-following slab for the rasp.

Meshing: the grid is split into chunks of 32³ cells, each meshed from a 33³ window by marching cubes; a blow marks the chunks its dilated box touches dirty; dirty chunks are remeshed in a pool of stateless Web Workers (`hardwareConcurrency - 2`, at most 8) fed by transferable buffers (no SharedArrayBuffer, so the page also works from static hosting), which return positions only; the material's `flatShading` derives the normals, and a per-vertex finish attribute is sampled from the finish grid. Each chunk is its own mesh under `Making.stockObject`, swapped when its geometry returns.

Undo and replay: applying a blow records the old values of its dilated box (stock and finish); step back and play backward restore those bytes and dirty the chunks; a forward jump re-applies blows in index order; the state is never snapshotted. Planning is step by step: a step's generator runs once, when the making first needs it, from the stock as the earlier steps left it, and the result is cached, so the blows at any `t` are the same whatever the history; `planAll()` forces the whole plan.

### Grid file format

`src/contracts/grid.ts` is the one description; the pipeline's writer under `scripts/lib/` and the engine's reader under `src/stock/` each implement it and are tested against a fixture the other produced.

- Values: signed distance in cells × 256, little-endian Int16, negative inside, clamped to ±band × 256 (band 32 cells by default, so the far field is constant and compresses well). Index of cell `(i, j, k)` is `i + nx * (j + ny * k)`.
- Lattice: `origin` is the world position of the centre of cell `(0, 0, 0)`; the lattice covers the block plus `GRID_MARGIN_CELLS` on every side, so the block's own faces mesh cleanly. The block and the figure's placement come from `src/david/frame.ts`.
- Files for a figure grid named `david`: `public/model/david.json` (the `GridHeader`: format, encoding, order, cell, size, origin, band, SHA-256 of the raw bytes, and the source attribution) and `public/model/david.bin.gz` (gzip of the raw bytes). The page decodes with `DecompressionStream` and checks the digest.
- The stock grid is never stored: it is the block's box distance at `t = 0` and the replay of the plan after that. The finish grid is one byte per cell with the codes in `FINISH`.

### Model pipeline

`npm run model` runs `scripts/fetch-model.mjs` then `scripts/build-grid.mjs`. The fetch follows the steps in `docs/research/mesh-sources.md`: check the Commons API record (size, SHA-1, licence) and stop if any differ from the recorded values, GET the STL with a descriptive `User-Agent` naming this repo (never an email), verify the SHA-1, write `assets/cache/david/SOURCE.json` with the attribution. The build parses the binary STL, rotates the longest axis to +Y, centres the footprint, scales the height to `STATUE_HEIGHT_M`, applies `FIGURE_OFFSET_M`, logs the measured box and the transform, fails if the figure does not fit `BLOCK_M`, renders silhouettes from the fixed angles (front, back, left, right, top) into `output/model/` for a visual check and records which of base, sling, stump, back and head top are present, closes holes by a logged method, samples the signed distance on the lattice with a BVH (sign by flood fill from outside, so small holes seal), and writes the header and data files. The mesh is never committed; the attribution appears in the page footer.

## Blows, strokes and steps

The making is a sequence of blows. A blow is `{ tool, point, normal, direction, size, strokeIndex }` in world units; it removes stock at an instant. A stroke is a run of blows along a short path with one tool set-up. A step is a named unit of work: one tool, one region of the figure, one margin, one stroke generator and its seed, a duration weight, a calendar span and a source citation. A stage groups steps by tool phase (roughing, claw work, flat work, drilling, rasping, abrading, polishing). Stages and steps are data in `src/choreography/`, never engine code.

The stroke generator is deterministic: given the figure grid, the step's region and margin and the state the previous steps leave, it plans the step's blows in the sculptor's order (front face first, high points first, from the top down; `research: technique.md` fixes the order). The plan for the whole making is computed once at load and cached; its length and digest are exposed for tests.

The interfaces are code: `src/contracts/making.ts` holds `Blow`, `StepDef`, `PlanContext`, `RegionDef`, `BlowCycle`, `ToolPose`, `ChipState`, `Making` and `Player`, with the field meanings in their comments. In short, a `StepDef` has a stable kebab-case id, a stage, a title of at most 48 characters, a detail of at most 200 that names its source, a tool, a region, a margin in metres, the real blows one shown blow stands for, a duration weight, a calendar span, an optional camera focus, and a `plan(ctx)` that is deterministic in the context and the step's seed.

Timeline position `t` runs over `[0, N]` for N steps. Step `i` (0-based) has local progress `f = clamp(t - i, 0, 1)`; blow `k` of the step occupies the window `[k / count, (k + 1) / count)` of `f` and its material change applies at `STRIKE_PHASE` (0.65) of that window, where the tools' cycle strikes, so what is seen and what is cut agree; at an integer `t` every blow of the completed steps is applied. A step's first blow gets a carry from the bench: while that blow is in its approach window and playback runs forward, wall time advances slower so the window lasts the tools' `approachSeconds` (divided by the speed); captures at integer `t`, backward playback and shot mode get no carry. The material state at `t` is a pure function of `t`: it is obtained by replaying the plan from the untouched block, and a test asserts byte-identical grids after any history of plays, reversals, steps and scrubs. The tool's pose and the chips are continuous functions of `t` within a blow cycle, also pure in `t`. An integer `t = k` is a rest position: the first k steps are complete, the tool is down, nothing moves.

Playback runs `t` continuously at `weight × BASE_SECONDS / speed` seconds per step and stops at 0 or N. Step forward animates to the next integer, step back to the previous one; a second press while moving retargets. Scrubbing sets `t` directly; a jump replays from the block and remeshes everything, progressively. Speed is 0.5×, 1×, 2× or 4×. The player is pure logic with no DOM and is unit-tested on its own.

## Tools

`src/tools/catalog.ts` lists every tool with its Italian and English names, its documented dimensions in metres and its source line in `docs/research/tools.md`. `src/tools/geometry/` builds each tool procedurally at those dimensions: origin at the working tip, the shaft along +Y, the striking face at +Y. The mallet is its own tool and strikes the chisel's head in the blow cycle.

A blow cycle, pure in its phase `p ∈ [0, 1)`: approach (the chisel moves from its last pose to the new point and settles at the documented angle to the surface), raise (the mallet rises along its arc), strike (the mallet meets the chisel head, the blow applies, chips eject), recoil. Between steps the tools move to the next region at a plausible speed and are set down at rest positions when the step changes tool. A tool never intersects stock except at the working tip, never floats idle in frame while a step is running, and never reaches a point a sculptor on the documented scaffold could not. `research: technique.md` fixes the angles, the rhythm and the reach.

Chips: an instanced pool of small marble fragments, launched from the tip at the blow, ballistic with a floor bounce, fading on the ground; the count and size per tool come from `research: technique.md`. Dust is a sprite puff at the tip for the point and the drill only.

## Page

- **Timeline bar** (bottom): buttons for start, step back, play backward, play/pause, step forward, end; a speed control; a scrubber over `[0, N]` with stage boundaries marked; a label `Day d · <date> · <stage> — <title>` with the step's detail beneath, including the tool's names and the blows each shown blow stands for. Every control has an accessible name and a `data-testid`.
- **Stage menu**: the stages in order; choosing one moves to the start of its first step.
- **View menu**: camera presets (front, back, left, right, three-quarter, head, hands, sling and stump, free orbit), a follow-tool toggle that frames the working tip during playback and switches off when the user drags, and a finish toggle that shows the finish grid as flat colours for checking.
- **Keyboard**: Space play/pause, → step forward, ← step back, Shift+Space play backward, Home start, End end.
- **First load**: the page starts at `t = 0` and plays forward, unless the query sets a position or `autoplay=0`.

## Query contract

`src/viewer/query.ts` is the only reader of the page URL.

| Parameter | Effect |
|---|---|
| `shot=1` | Capture mode: no autoplay, no follow camera, no chip motion; `window.__shotReady = true` once at least 5 frames have rendered at the requested state with every dirty chunk meshed |
| `t=<number>` | Timeline position in `[0, N]` |
| `step=<id or 1-based index>` | Position at the end of that step; wins over `t` |
| `view=<preset id>` | Camera preset; `view=follow` (query only, not in the menu) frames the current blow from its normal, for the follow captures |
| `cam=px,py,pz,tx,ty,tz` | Explicit camera position and target, for sweeps |
| `model=david|synthetic` | Which figure grid to load; the page defaults to `david`, tests to `synthetic` |
| `finish=1` | Show the finish grid as flat colours |
| `autoplay=0` | Do not start playing on load |
| `noui=1` | Hide the page chrome |

The renderer keeps `preserveDrawingBuffer: true`, or headless capture reads a blank canvas. `window.__sculpture` exposes read-only facts for tests (`stepIds`, `stepTitles`, `stepStages`, `stepTools`, `stepWeights`, `stepBlowCounts`, `stages`, `N`, `t`, `baseSeconds`, `playing`, `speed`, `moving`, `view`, `follow`, `finish`, `planLength`, `planDigest`, `blowsApplied`, `dirtyChunks`, and `queryProblems`, the URL parameters the page ignored with why, so a capture harness can tell a wrong shot from the asked one); tests drive the page through its real controls, never by writing state. Under `shot=1` the page also exposes `window.__shotSeek(t)`, which seeks through the player and re-arms `__shotReady`, so the video exporter can step frames without reloading the grid; `--reload` keeps the pure one-load-per-frame path. The label at an integer `t = k` names the step about to start, and the last step complete at `t = N`.

## Modules and ownership

| Path | Contents | Owner |
|---|---|---|
| `src/contracts/` | the shared interfaces and constants, types only | coordinator |
| `src/main.ts` | boot: query, viewer, making, player, UI | page |
| `src/stock/` | grid reader, synthetic figure, carving rule and tool volumes, chunking, meshing, workers, undo log | engine |
| `src/timeline/making.ts` | the Making: plan, replay, evaluation at `t` | engine |
| `src/timeline/player.ts` | the player, pure playback logic | page |
| `src/choreography/` | stages, steps, regions, calendar; `generators/` holds the stroke generators | coordinator owns the lists; engine lands the first generic generators; stage workers own theirs |
| `src/tools/` | catalog, procedural tool geometry, blow cycle, chips | tools |
| `src/david/frame.ts` | world-frame constants from research | coordinator |
| `src/david/synthetic.ts` | the procedural test figure | engine |
| `engine.html`, `src/stock/dev/` | the engine's own development page for looking at a carving before the page exists | engine |
| `src/viewer/` | renderer, scene, yard, lights, camera and controls, presets, marble shader, query | page |
| `src/ui/` | timeline bar, stage and view menus, footer with attribution | page |
| `scripts/fetch-model.mjs`, `scripts/build-grid.mjs`, `scripts/lib/model/` | the model pipeline and its grid writer | model pipeline |
| `scripts/capture-shots.mjs`, `scripts/harness.mjs`, sweeps and video | capture tooling | page |
| `tests/e2e/` | Playwright control and capture tests | page |

A worker edits only paths it owns. A change another owner's path needs is requested in the handoff, not made. The engine receives a `BlowCycle` from the tools and the page wires the two together, so neither imports the other's implementation.

## Budgets

With the David grid at its target resolution: first frame under 5 seconds after load on this machine; playback at 1× holds 60 frames per second with meshing in workers; a scrub jump across the whole making remeshes in under 3 seconds; the page uses under 1.5 GB of memory. The plan for the whole making has at most 60,000 blows. A unit test computes the plan length and the grid memory without WebGL; the e2e suite measures the timings.

## Verification

- Automated: unit tests for the carving rule (the `stock <= figure` invariant on random blows), the grids and their formats, chunk dirtying and remeshing, the timeline (determinism after random histories, forward and backward symmetry, rest positions), the player, the plan (unique step ids, every step removes stock, blows inside the block, deterministic digest), the tool catalog (every tool has dimensions and a source line), and the budgets. Playwright tests drive every control and the keyboard and check the label, the scrubber and the canvas.
- Visual: `npm run shots` captures the standard set (every preset at the finished state, the front and three-quarter presets at each stage boundary, the follow view at a blow mid-cycle for each tool) into `.shots/`; authors inspect each image at native resolution and compare it with the reference photographs named in `docs/research/references.md`. Sweeps add random camera angles for exploration. A video of the whole making is recorded with Playwright into `output/` for the owner to watch.
