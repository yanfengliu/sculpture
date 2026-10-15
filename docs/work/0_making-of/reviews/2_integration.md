# Review 2: integration of round 2

## Target

The integrated result of round 2 on `main` at `a97150c` (2026-10-15), repository `sculpture`, in two lenses, each reviewed by both lanes:

- Engine: engine A's round-2 change, `git diff f4363da fce0dfb` (the floor stubs, the plan-order class gate, Agostino di Duccio's start and the hole between the legs, ragged pitted craters, paint and cut confined to each step's region, web clearing and drill rows between the legs, the real-blows ratio from the planned count, the merge with `PLAN_VERSION` 2), and engine B's repairs after its round-1 review, `git diff fc7a342 d97adfa` limited to `src/timeline`, `src/stock`, `scripts/build-plan.mjs`, `scripts/lib/plan`, `scripts/verify-plan.mjs` and `scripts/measure-jumps.mjs` (engine B's earlier change was reviewed in `1_implementation.md`). Patch: 5,489 lines.
- Page: the page's round-2 change, `git diff cb8a52b a4e25cd` limited to `src/viewer`, `src/ui`, `src/tools`, `src/main.ts`, `tests`, `scripts/capture-fps.mjs`, `src/repo-conventions.test.ts` and `docs/learning` (the marble, the fences class gate, bridges laid when needed, the convention detectors, dust, the years label, the keyboard after a scrub), and page-5, `git diff 42bfc46 a09a5f8` (the first-visit compile fix). Patch: 3,500 lines.

## Reviewers and coverage

- Codex (`gpt-6-astra`, `model_reasoning_effort=xhigh`, `codex exec --sandbox read-only --ephemeral`, codex-cli 0.158.0), one run per lens, chained (engine 23:26 to 23:48, page 23:48 to 00:04); the patch piped in with the lens prompt. Both runs read the tree and ran read-only Node probes; neither ran Vitest, a build, e2e or a browser. Each cited files outside its diff (engine: `holes.ts:27-34`, `carve-kernel.ts:216-221`; page: `jump.ts:120`, `remesh.ts:197`, three.js's `WebGLRenderer.js`); the coordinator checked `holes.ts:27-35` (the landing is checked, the shaft is not). The page run's log matched `STATUS_DLL_INIT_FAILED` once, in the text of `0_integration.md` the reviewer read, not in a sandbox failure.
- Claude (`claude-opus-5-5[1m]`, `--effort max`, `claude -p` with `Read,Glob,Grep,Task`, read-only git tools, `npx vitest` and `node`, Claude Code 2.1.281), one run per lens, in parallel; each final event's `modelUsage` held the one key `claude-opus-5-5[1m]` (engine 99 turns, page 12 turns, with sub-agents of the built-in types). Both ran probes against the David grid and the version-2 plan file under the ignored `tmp/review-runs/round2/scratch/`; the tree was clean after both.
- Prompt (both lanes, per lens): an independent read-only adversarial review against the spec, the choreography, the local rules and the decisions, most important first: the state at any t a pure function of t on every path; `stock <= figure`; the confinement's correctness and its cost in coverage; authenticity against the research; whether the new gates prove what their headers claim; budgets by mechanism; error messages and hygiene. The page lens asked about compiles that still block, the ready flag, the light-to-full marble switch, bridges and dust pure in t, the fences gate, the detectors, loosened e2e, and the marble's authenticity. Already-known items were listed so they would not be reported as new.

## Reports

The authored reports follow whole, as each lane wrote them; the IDs they use are prefixed below: X for Codex, C for Claude, then E or P for the lens.

### Codex, engine lens (IDs XE)

Reviewed clean `main` at `a97150c`. I found four issues. The read-only probes found no history-dependent stock or finish state within the tested Node execution paths.

1. **E1 — high — The new leg drilling puts the shaft through the opposite thigh.**  
   [david-steps.ts:321](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:321) uses the existing [holes.ts:34](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/holes.ts:34), which checks the landing but never checks shaft clearance.

   **Failure:** In the checksum-verified David plan, zero-based blow 5 of `between-the-legs` starts at `(-0.167339, 2.199750, 0.064615)`. Just **52 mm behind its tip**, along its shaft, the figure distance is **−30.03 mm**: the shaft penetrates protected marble. I checked against the preceding snapshot and applied earlier holes in order. The row-distance assertion at [david-steps.slow.test.ts:294](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.slow.test.ts:294) passes this placement because it checks only the tip.

   **Smallest fix:** Search alternative running-drill approaches within the documented angle range and reject holes without clearance along the actual spindle. Gate clearance against the stock immediately before each hole, rather than only distance from `LEG_GAPS`.

2. **E2 — medium — The snapshot download’s memory bound trusts the malformed input it should bound.**  
   [snapshot-loader.ts:125](C:/Users/38909/Documents/github/sculpture/src/stock/snapshot-loader.ts:125) limits downloading using `entry.bytes`. The grid-derived `maxBytes` is checked only later, inside the worker.

   **Failure:** A header retaining valid plan metadata but claiming a trillion-byte snapshot passes `planHeaderProblem`. In a loader probe configured with `maxBytes = 1000`, an entry claiming 100,000 bytes downloaded and handed **5,000 bytes** to the worker. A sufficiently large response can exhaust memory before the worker rejects it. X6 is therefore only partly repaired.

   **Smallest fix:** Before fetching, require `entry.bytes` to be a positive safe integer no greater than `maxBytes`; derive the compressed-response allowance from that validated size. Add the oversized-header case to the loader tests.

3. **E3 — medium — Timing out a snapshot does not cancel its work.**  
   [snapshot-loader.ts:95](C:/Users/38909/Documents/github/sculpture/src/stock/snapshot-loader.ts:95) races the operation against a timer but does not abort its fetch or remove its worker waiter.

   **Failure:** Two deliberately stalled fetches both timed out, yet both `AbortSignal.aborted` values remained `false`; disposal finally aborted them. During fallback, [snapshot-jump.ts:91](C:/Users/38909/Documents/github/sculpture/src/timeline/snapshot-jump.ts:91) selects earlier snapshots, accumulating abandoned requests and potentially dozens of 15-second stalls. A worker that stops answering similarly retains waiters.

   **Smallest fix:** Give each load one cancellation/cleanup path that runs on timeout as well as disposal. Abort its fetch, remove its waiter, and recover a nonresponsive worker. Consider falling back directly to replay after a loader-wide failure. C6 restores eventual progress but does not release timed-out work.

4. **E4 — medium — The synchronous plan build retains all snapshot inputs awaiting compression.**  
   [build-plan.mjs:61](C:/Users/38909/Documents/github/sculpture/scripts/build-plan.mjs:61) calls the synchronous builder; its callback copies every snapshot and queues asynchronous gzip at [line 68](C:/Users/38909/Documents/github/sculpture/scripts/build-plan.mjs:68). The first yield is after the entire build.

   **Failure:** The current 66 snapshots total **1,271,391,267 inflated bytes**. Their compression inputs remain outstanding together, alongside the grids, undo records and planning allocations. Completion callbacks cannot drain this queue during the synchronous build. A small in-memory reproduction confirmed zero compression completions before yielding.

   **Smallest fix:** Bound compression concurrency with an asynchronous producer, or compress/store each snapshot synchronously. This is a **builder memory risk**, not evidence that the page retains 1.27 GB of snapshots.

What I checked and found sound, with the relevant limits:

- **Planning history and rollback:** Eager `planAll()` and lazy planning produced identical stock and finish bytes at eight positions, including reversals through `12.4`, `18.7`, `24.5`, `9.9`, `13`, `25`, `0`, and `24.5`. Both produced 25,437 synthetic blows and digest `9bbd392c`. [confine.ts:167](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/confine.ts:167) restores stock and private marks; retained region answers depend on immutable figure geometry. A rejected cutting trial also restored the stock in a separate probe. The coarse-figure cache contains resampled figures, not mutable stock.
- **Sweeps and snapshots:** The boundary ordering and reverse undo order look correct. X1–X5 and X7 are implemented coherently: binary SHA binding, swept-list validation, intermediate fingerprints, malformed-snapshot rejection/reset, partition validation before decoding, and loader disposal. C2–C5, C7 and C8 have the stated repairs. C1 remains the explicitly partial repair: the manual verifier checks browser replay, not the actual snapshot-fetch/inflate path.
- **Figure protection:** I found no bypass of the per-cell clamp at [carve-kernel.ts:216](C:/Users/38909/Documents/github/sculpture/src/stock/carve-kernel.ts:216). Floor-band offsets and margins are consistent. The crater’s stated Lipschitz bound follows from the radial/angular gradient bound plus the pit slope; the pits vanish continuously at lattice-cell boundaries. The block skips use that bound. This supports the lattice invariant, not a claim of exact continuous geometry between cells.
- **Cross-runtime planning remains different:** Changed files still contain blow-affecting transcendental calls: [webs.ts:199](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/webs.ts:199), [face-model.ts:226](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/face-model.ts:226), and band ordering at [bands.ts:142](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/bands.ts:142). Thus the evidence supports determinism **within a fixed plan/runtime**, not universal identity between browser-generated and Node-generated plans. The research decisions already acknowledge that distinction. The crater’s seeded phases use the arithmetic `turn` helper instead.
- **Roughing gate:** Its independent figure march, contour check and negative controls meaningfully catch the recorded raster/axis mutation. Its bounds remain synthetic front faces and planner-labelled layers. Increasing mean distance from the first blow does not establish local outward growth throughout a pass.
- **Confinement gate:** Its stated exclusions matter. [outside-region.ts:36](C:/Users/38909/Documents/github/sculpture/src/choreography/outside-region.ts:36) excludes complete removal to air. A probe erased an outside-region cell from `−1` to the air clamp `768`, yet reported `{painted: 0, cut: 0}`; the confiner itself correctly rejected that blow. To gate every cut, inspect changes before the boundary sweep and distinguish sweep removals explicitly.
- **Web census:** [david-steps.slow.test.ts:73](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.slow.test.ts:73) includes the right-hand area spatially, but only counts stone more than **9.5 mm** from the figure. It cannot prove narrow finger gaps are open, or detect a bridge already represented in the figure grid. Lowering the ceiling to 5.0 m explicitly excludes the known crown edge.
- **Authenticity and ratios:** Agostino’s commission date, lower-body scope, coarse margin and separately attributed hole agree with the recorded reconstruction. The April 1466 endpoint remains an inference. The engine now calculates the five-hour ratio from the actual planned count. It does not repair the already-known nodo count or catalog discrepancy.
- **Timeouts and budgets:** The 120-second replay timeouts replace execution limits, not performance assertions. They accommodate a real documented slowdown; they do not verify a budget. The replay estimator still uses a single point-tool cost at [replay-cost.ts:24](C:/Users/38909/Documents/github/sculpture/src/timeline/replay-cost.ts:24), while displaced bulk craters are substantially more expensive. Snapshot loading and remeshing also remain outside the segment’s replay allowance. These are concrete reasons the known jump measurement has little margin.
- **Size checks:** No executable file under `src/`, `scripts/` or `tests/` reached 500 lines.

For the **already-known patchy gilding**, the probe adds a root cause: of 49,410 stump cells within one cell of the surface, the current plan gilds 24,824; unconfined band placement reaches 47,215. Most missed cells retain fine-claw texture, so finish eligibility is not the main loss. Whole-footprint rejection near boundaries is. The smallest targeted remedy is smaller boundary leaf footprints, shared by planner and kernel, while retaining confinement and filling the remaining eligible stump cells.

I read outside the diff hunks, including `holes.ts:27–34`, `carve-kernel.ts:216–221`, and the sweep/undo paths. No files were changed, no browser or server was launched, and no full gates or model builds were run. The browser equivalence and page-memory budgets were not remeasured.

### Codex, page lens (IDs XP)

I found eight issues at `a97150c`. The checkout remained unchanged. All probes were read-only Node executions; no browser, server, or test suite ran.

1. **P1 — high — Context loss invalidates neither readiness nor compilation state.**  
   [scene.ts:146](/C:/Users/38909/Documents/github/sculpture/src/viewer/scene.ts:146), [compile-gate.ts:27](/C:/Users/38909/Documents/github/sculpture/src/viewer/compile-gate.ts:27), [main.ts:399](/C:/Users/38909/Documents/github/sculpture/src/main.ts:399).  
   During context loss, three.js returns from `render()` without drawing, but `frames` still increases. A settled capture can therefore become ready after five **undrawn** frames. On restoration, three.js recreates its program cache, while the gate retains `seen` and marble retains its completed `preparing` promise. The next draw recompiles synchronously; the generated environment also needs rebuilding. Supporting implementation: installed `WebGLRenderer.js:1135` and `:1646`.  
   **Smallest fix:** handle context loss/restoration explicitly: invalidate readiness, suspend frame counting, reset compilation state, rebuild the environment, and require five successful draws afterward.

2. **P2 — medium — The gate misses a shader variant used by ordinary visible decks.**  
   [compile-gate.ts:37](/C:/Users/38909/Documents/github/sculpture/src/viewer/compile-gate.ts:37), [yard.ts:132](/C:/Users/38909/Documents/github/sculpture/src/viewer/yard.ts:132).  
   Deduplicating by material selects `wall-left-decks`, an empty instanced mesh with no `instanceColor`. Visible decks and bridges share that material but have instance colours. My scene probe confirmed both variants. Three.js includes `instancingColor` in its program parameters/cache key (`WebGLPrograms.js:210`, `:503`), so the visible variant first compiles during rendering, including its transmission-target variant.  
   **Smallest fix:** prepare every distinct object/material program variant, and await each variant’s program—not just one representative per material.

3. **P3 — medium — A laid head bridge still obstructs an allowed close-up.**  
   [yard-spans.ts:50](/C:/Users/38909/Documents/github/sculpture/src/viewer/yard-spans.ts:50), [yard-sightlines.test.ts:137](/C:/Users/38909/Documents/github/sculpture/src/viewer/yard-sightlines.test.ts:137).  
   Geometry inside the original block box is assumed hidden by stone. That stops being true after carving. With the head bridge laid, camera `(0, 3.4, 0.7)` looking toward `(0, 2.4, 0.2)` passes `poseProblem()` and leaves the bridge visible. A ray through its built geometry hits the plank at **0.224 m**; the loaded David grid is reached at approximately **0.977 m**. The gate excludes this camera because it lies inside the original block box.  
   **Smallest fix:** handle bridges’ portions inside that box explicitly, conservatively hiding obstructing bridges for these views. Add this camera and carved-stock sight lines to the gate.

4. **P4 — medium — Bridge occupancy sampling permits intersections and rejects harmless gaps.**  
   [bridges.ts:23](/C:/Users/38909/Documents/github/sculpture/src/viewer/bridges.ts:23).  
   Sampling every 2 cm cannot establish that the planks contain no stone at 8 mm grid resolution. An actual `Grid` probe containing a 6 mm-radius feature centred at `(-0.99, 3.18, 0.61)` returned approximately **−6 mm** at its centre, while `stoneDepth()` returned **0**. Conversely, a feature wholly within the 2 cm gap between planks was reported as an obstruction because the sampler checks the entire bridge footprint.  
   **Smallest fix:** conservatively inspect intersecting grid cells against each actual plank box, excluding the gap.

5. **P5 — medium — Bridge clearance caches can record partially applied jumps under the wrong blow count.**  
   [bridges.ts:79](/C:/Users/38909/Documents/github/sculpture/src/viewer/bridges.ts:79), [main.ts:385](/C:/Users/38909/Documents/github/sculpture/src/main.ts:385).  
   `layBridges()` runs during outstanding jumps. Outside the diff, [jump.ts:120](/C:/Users/38909/Documents/github/sculpture/src/timeline/jump.ts:120) writes individual completed chunks immediately, but [making.ts:479](/C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:479) advances the cursor only when the whole batch lands. Thus the sampled stock need not represent `blowsApplied`. A controlled tracker probe cached clearance at count 10, restored occupied stock at that same count, and still laid the bridge; a fresh tracker correctly hid it. This demonstrates the cache failure, not a reproduced settled David playback failure.  
   **Smallest fix:** populate clearance caches only from committed stock states; conservatively hide bridges while a jump is changing those states.

6. **P6 — medium — The FPS probe can measure the light shader or count frames that never render.**  
   [capture-fps.mjs:24](/C:/Users/38909/Documents/github/sculpture/scripts/capture-fps.mjs:24), [capture-fps.mjs:46](/C:/Users/38909/Documents/github/sculpture/scripts/capture-fps.mjs:46).  
   `settle()` waits a fixed 1.5 seconds rather than requiring `marble === 'full'`. On a slower cold compile, measurement starts with the cheaper shader. Its independent RAF counter also continues while the compile gate skips rendering, potentially reporting 60 fps while the displayed scene is frozen.  
   **Smallest fix:** require full marble and settled geometry together, then measure actual completed renders and report skipped-render intervals.

7. **P7 — low — The conventions detectors have additional false negatives and false positives.**  
   [repo-conventions.test.ts:145](/C:/Users/38909/Documents/github/sculpture/src/repo-conventions.test.ts:145), [repo-conventions.test.ts:188](/C:/Users/38909/Documents/github/sculpture/src/repo-conventions.test.ts:188).  
   Probes using the actual detector functions missed:
   - A default-imported `LIMIT` followed by `expect(LIMIT).toBe(3)`.
   - A pinned assertion after another assertion on the same line.
   - Separate `start`/`end` clock reads followed by subtraction.
   - A delta assignment whose expression begins on the next line.

   Reassigning a previously tainted variable to `3` still caused its subsequent numeric assertion to be rejected.  
   **Smallest fix:** add these fixtures, process all assertions/import forms, and make timing propagation statement- and scope-aware. Document any remaining exclusions.

8. **P8 — low — Removing literal pins weakened checks of documented tool facts.**  
   [catalog.test.ts:77](/C:/Users/38909/Documents/github/sculpture/src/tools/catalog.test.ts:77).  
   The replacement tests establish relative ordering, not the documented angles. Changing the drill maximum from **45° to 55°** satisfies every new relationship, despite contradicting `docs/research/tools.md:87`. The mallet handle’s numeric assertion was also removed, leaving only its provenance flag. These are research facts, not merely configurable decisions.  
   **Smallest fix:** retain independently sourced assertions for documented dimensions and angles, with an explicit distinction from configurable constants in the conventions rule.

Checks that held, within their bounds:

- The yard gate’s geometry functions produced **zero crossings across 407 cameras and 242 pieces**, with all bridges laid and with none. Forcing spans visible produced **1,486 crossings**. Its stated box/sight-line bound works; it does not establish unobstructed carved-stock views.
- Concurrent `prepare()` calls shared one promise and issued only two compile requests. `full` stayed false until completion, and a finish-toggle change survived. The stand-in attributes match actual chunks at [remesh.ts:197](/C:/Users/38909/Documents/github/sculpture/src/stock/remesh.ts:197), outside the diff.
- Dust is seeded per blow; the frame clears and rebuilds its strike log. The existing chip evaluation at [evaluate.ts:93](/C:/Users/38909/Documents/github/sculpture/src/timeline/evaluate.ts:93) supplies deterministic look-back. The pre-1501 year-label branch matches the recorded chronology.
- Page-5 removed no functional e2e assertions. Its waits and `test.slow()` enlarge waiting budgets; they do **not** verify startup responsiveness. The revised label regex also accepts either date format for every step, weakening its discrimination.
- All **194 inspected text files** under the gated roots met the 500-line bound; the largest had 488 lines.

Without `KHR_parallel_shader_compile`, installed three.js marks programs ready immediately (`WebGLProgram.js:992`), so that absence alone should not hang readiness, but first use can still block. Shadow programs remain explicitly outside the gate. Missing PMREM internals take synchronous or partially unprepared paths; their absence does not preserve the blanket off-thread-compilation claim.

I did not verify rendered appearance, tool/stock collisions, cold-load timing, 60 fps, or the 1.5 GB memory budget. The marble twin shares the compiled full program through the cache; it does not duplicate stock grids. Its retained resources are bounded per material instance, but that is insufficient evidence for the whole-page memory limit.

### Claude, engine lens (IDs CE)

I found no path where the state at a time t depends on how the page got there, and no way for a blow to cut into the figure or below its step's margin. The new confiner is exact, but it costs real coverage. The most serious finding is that the plan-order gate would stay green on a row-by-row order that starts at the high point, which is the shape of the owner's defect. The new drill step between the legs breaks the "never clips through stock" rule.

I ran two read-only lenses as subagents (engine B's repairs; the gates) and did the rest myself. Most evidence comes from probes against the David grid and the PLAN_VERSION 2 plan file. They live in `tmp/review-runs/round2/scratch/`; rerun one with `node tmp/review-runs/round2/scratch/run.mjs probe-gild.ts`. I did not run verify, e2e, `model*`, the slow suite, a dev server or a browser. The repo tree is clean.

##### Findings, most severe first

**E1 — high — the plan-order gate passes a row-by-row order that starts at the high point.** `src/choreography/roughing-order.test.ts:142-145`, `:24`; `src/choreography/generators/furrows.ts:5`, `:77`
- **What is wrong.** Claim 2 ranks only a layer's first blow. Claim 3 compares the mean distance from that blow over the layer's first and last quarter. Neither reads the order in between.
- **The mutants miss it.** The in-test mutant (`:144`) and the red run recorded in `gate-proofs.md` both moved the start to a corner. So the gate has never gone red on a raster that starts where the planner starts.
- **Coverage.** It judges 3 of the 8 steps this planner plans. `agostino`, the first step on screen, is not judged, nor are the hole and nodo steps on the same face.
- **The guarded order hops anyway.** On the David plan file, 76 of 291 Agostino moves and 166 of 604 high-points moves are longer than 40 cm; the longest inside one layer is 5.12 m. `furrows.ts:5` and `:77` say the work "never hops across the face".
- **Failure scenario.** The gates lens reordered every judged layer of the real plan into rows, working outward from each layer's first blow. All 11 judged front-face layers still pass.
- **Smallest fix.**
  - Add a per-layer claim on the share of consecutive moves within 10° of a face axis, bound about 0.4: the planner measures 11–20%, rasters 57–99%.
  - Add the mutant "rows outward from the first blow", which must fail that claim.
  - Add the three steps to `ROUGHING`.
  - Bound the hops, or correct the two comments and the defect-register entry.

**E2 — medium — every drill hole between the legs puts the drill's spindle through the other thigh.** `src/choreography/generators/holes.ts:27-35`, `landmarks.ts:31-43`, `david-steps.ts:309-322`
- **What is wrong.** `holes()` never checks the stone behind the tip, unlike the other generators. In the crease (8–56 mm wide), the facing thigh stands 1.6–5.0 cm behind the tip at all 18 holes. The bow drill is 22 cm tall (`catalog.ts:181`).
- **The chisel had already been there.** All 18 hole points sit 1.5 mm from the figure, which is the fine claw's margin. The step's detail says "where the chisel cannot reach".
  - Why the claw got in: `webs.ts:173-179` tests only the tool's axis line, not the 8 cm patch or the 10–12 mm blade, so the claw "reaches" creases narrower than itself.
- **Older steps have the same gap:** 38 of 124 hairline holes, 8 of 24 fingers-sling-stump holes and 1 of 4 pupil holes meet stone within 16 cm of the tip.
- **No gate sees it.** `shaft.test.ts` runs only the synthetic figure and allows 2% of shafts in stone.
- **Failure scenario.** On `model=david`, between t = 18 and 19, all 18 strikes draw the drill through the thigh.
- **Smallest fix.** Add a shaft check to `holes()`. Then either drill the crease before the fine claw clears it, as the record has it, or drop the claim from the detail.

**E3 — medium — the Agostino step's numbers, dates and region don't match the record.** `david-steps.ts:59-72`, `regions.ts:335`, `step-info.ts:38-43`
- **(a) The real-blows count.** The label at t = 0 says each shown blow stands for 38,219 real blows: 620 days × 5 h × 1 blow a second over 292 craters.
  - The same crater stands for 952 in high-points; back-point gets 8,859 and roundel-hollows 3,466.
  - The count follows the calendar span a step is given, not the work shown. Agostino ends up at 2.6 times all of Michelangelo's point work.
- **(b) The start date.** The step starts on 18 August 1464, the commission's date. The block was bought at Fantiscritti in 1465 (`david-history.md:44`).
- **(c) The region.** AGOSTINO stops at 2.6 m (the hips), but the cited record says he began "the trunk".
  - The chest stays raw block, so there is no knot for the nodo to strike.
  - That contradicts Lavin's reading (`david-history.md:82`) and the decision at `decisions.md:26`.
- **Smallest fix.** Give agostino a direct count. Start it in 1465. Extend AGOSTINO up the trunk and leave a knob at the nodo box.

**E4 — medium — confinement leaves unpolished strips at every edge of the flesh, and no gate bounds coverage.** `confine.ts`, `bands.ts:80-121`, `paint-confinement.test.ts:68-86`
- **Measured at t = N on the David.** 6.2% of the flesh's surface cells (11,281) are not polished:
  - 3,137 still show the fine claw;
  - 6,864 show only the pumice.
- **Where.** The largest patches are:
  - the right calf beside the stump (2,148 cells);
  - the feet along the flesh's lower edge at y 0.3;
  - the face along the hairline;
  - the neck under the sling.
- **What the confiner costs.** The polish step covers 93.9% as planned against 96.8% unconfined.
- **The gate can't tell.** "No cell outside the region" is also satisfied by dropping blows. On the synthetic figure, file-details lost 18.6% of its coded cells.
- **Smallest fix.** Add a per-step coverage floor to the gates. Where the full footprint is refused, fall back to a smaller one.

**E5 — medium — the web census has a blind band, and its window was narrowed to stay green.** `david-steps.slow.test.ts:41`, `:61`, `:238`
- **Blind band.** The census counts only stone more than 9.5 mm from the figure, so it cannot see a web in a gap narrower than about 19 mm.
  - The web planner targets stone 5.5 mm out.
  - So webs in gaps of 11–19 mm are cleared but never checked.
- **Narrowed window.** Commit 3a9c77b lowered `WEB_Y_MAX` from 5.05 to 5.0 in the same commit whose confinement left 21 cells there, one over the bound of 20.
  - The band from 5.0 to 5.08 is now only logged: 828 cells at t = N.
- **Smallest fix.** Count from 5.5 mm (0 cells today). Assert the crust-edge count against its own bound.

**E6 — medium — a timed-out snapshot load is never aborted, and it starts a cascade.** `snapshot-loader.ts:94-104`; `snapshot-jump.ts:80-84`, `:117-118` (the C6 repair)
- **What is wrong.** On the 15 s timeout the fetch keeps running and the snapshot is set aside for the whole session. The next move then tries the next earlier snapshot.
- **Evidence.** With every load failing, one jump from 0 to N tried 65 snapshots in turn.
- **Failure scenario.** Over a slow link (an average snapshot is 3.6 MB gzipped), one scrub freezes the stock for minutes and disables every snapshot until reload. This does not bite on this machine.
- **Smallest fix.** Abort the fetch on timeout, and replay from the cursor for that move instead of setting the snapshot aside.

**E7 — low — high-points and chest-and-face start on the rock and the feet, not where their titles say.**
- **What happens.** On the David the rock base stands nearest the front face: all 200 frontmost columns are in it. Each pass starts at that column (`furrows.ts:107-111`).
  - high-points' first ten craters fall at y 0.00–0.27.
  - chest-and-face's first ten fall at y 0.31–1.21.
- **What the titles say.** "The knee and the hand come out first" and "The chest and the face" (`technique.md:45`).
- **The gate.** It measures "highest" by the figure alone, so it passes.
- **Smallest fix.** Start each pass above the base, or use the steps' own regions.

**E8 — low — the paint gate misses cells cut all the way to air.** `outside-region.ts:36` counts a cut only when some stone stays. Fix: count every cut, minus the step's end-sweep list.

**E9 — low — `plan-build.test.ts` now takes about two minutes on the pre-commit gate.** `plan-build.test.ts:28-30`, `:116`
- The 120 s per-case timeout covers a real slowdown: the file now takes 119.9 s, and a bulk blow applies 2.5–3 times slower.
- `slice(0, 7)` silently dropped the blade tools from the snapshot and purity cases.
- `[nodo, layout]` now binds agostino and hole-between-legs.
- Fix: pick the tested steps by id and name the bound in the header.

**E10 — low — the page's fetch bound uses an unchecked size (X6 only partly repaired).** `plan-file.ts:233`, `snapshot-loader.ts:125`
- `entry.bytes` is checked only as a number, so `1e400` (Infinity) removes the bound. `gzipBytes` is never checked.
- Fix: require 0 < `bytes` ≤ `maxSnapshotBytes`, and bound the read by `gzipBytes`.

**E11 — low — a stale plan file can slip through the fingerprint check.** `plan-file.ts:28`, `:218`
- A version bump without its fingerprint line builds `'none'`, and the page accepts `'none' === 'none'`.
- No test passes a built header through the page's checks.
- Fix: throw in the build without an entry; refuse `'none'`; add a test that passes a built header through `planHeaderProblem`.

**E12 — low — the hole step roughs the legs far outside its box.** It moved 38,332 cells near the legs toward the 3 cm margin, up to 14 cm outside its box (x −0.18 to 0.35 m, y 1.07 to 1.69 m). The comment at `regions.ts:336-338` says the legs are left alone. Fix: a smaller crater, or correct the comment.

**E13 — low — the detail can say "0 real blows".** When the page plans for itself, a step not yet planned shows "each shown blow stands for 0 real blows" (`label.ts:75-82`), for example during a jump. Fix: print no count while it is 0.

**E14 — low — budget mechanisms.**
- **Snapshot write on the page's thread.** Writing a snapshot into the grids took 447 ms in Node (from blow 0, dirtying 1,320 of 1,323 chunks) and 425 ms between neighbouring snapshots.
  - That is more than `SNAPSHOT_LOAD_SECONDS` (0.35 s), which is meant to cover fetch, inflate and write together.
  - So playing backward after a jump drops frames once per segment; `spec.md:33` says only the stock stalls.
  - Along with the remesh of nearly every chunk, the inflate of up to 20.9 MB and up to 0.5 s of replay, this is the floor under the 3.03 s jump.
- **Build memory.** The build holds a copy of every snapshot until its gzip finishes: 1.27 GB for version 2.
- **Fix.** Re-measure the load cost including the write, write only the tiles that differ, and gzip synchronously in the build.

**E15 — low — docs and text out of date.**
- `spec.md:9` and `:70`, `decisions.md:18` and the footer statement (`label.ts:85`) still start the making on 9 September 1501.
- `decisions.md:39` has stale step numbers for the bridges.
- `furrows.ts:5` describes the old order.

**E16 — low — hygiene.**
- **Dead code:** `furrows()` and `ScratchStock.carved`; `inside` and `inRegion` are two identical copies, one used by the gate and one by the planner.
- **Error messages short of R26:** `plan-file.ts:226`, `:258` and `:269` (prints "undefined"); `snapshot-loader.ts:83`; `snapshot-jump.ts:120` (prescribes a rebuild after a timeout); `bands.ts:172`.
- **Test headers that claim more than they test:**
  - `paint-confinement.test.ts` claim 2 samples 2.5 mm above the face, not 0.5 mm.
  - `plan-build.test.ts` claims "a fresh untouched block" and "plans nothing", which nothing checks.
  - `webs.test.ts:102` accepts a shaft 2.5 mm inside stone.
- No file is over 500 lines.

##### On the items already known

- **Patchy gilding.** It is the confiner dropping leaves.
  - The gilding replanned from its start snapshot matches the plan file blow for blow.
  - Without confinement it places 602 leaves and gilds 95.5% of the gilt region, against 53.3% as planned with 386 leaves. But it also gilds 1,296 flesh cells: those are the cells beside the calf that kept the fine claw's code, which the leaf's paint mask accepts.
  - A third of the refusals come only from air cells two or three cells off the surface, which no mesh vertex shows (`mesher.ts:83`).
  - **Smallest fix:** in `confine.ts`, and the same way in `outside-region.ts`, treat air with no stone neighbour as harmless. The gilding then covers 79.2% with no gold on any visible flesh.
  - Honouring the paint mask alone gains nothing (52.8%). The rest needs the strip in E4.
- **Right-hand remnant.** At t = N no stone stands more than 2.5 mm off the figure near the hand (12 cells at 1–2.5 mm), and the figure grid has no sealed pocket there. So the flat face is the figure grid's own surface, where the gap is narrower than the 8 mm grid resolves. No census or planner can see it; it needs the 4 mm refinement boxes.
- **Crown crust.** No original crust is left.
  - After front-furrows, 884 head columns still carried the block's original finish. After sides-point, none did: `keep: CROWN` stops columns from being struck, not the 18 cm craters beside them.
  - At t = N, 66% of the head-top columns carry 24–40 mm of point- and claw-finished stone, up to 136 mm. The stepped edge is the edge of that margin.
- **Nodo's 11 blows.** It plans on the furrow raster: 5 cm columns over a 20 cm box, giving 16 columns, and `maxPasses: 1` limits passes, not blows. And there is no knot to strike (E3c).
- **The catalog's eight-hour figure.** Nothing outside its own test reads it, so it is dead data.
- **The 3.03 s jump.** The mechanism is in E14.

##### Checked and found sound

- **Purity.**
  - The confiner's trial runs the engine's own kernel on a full-resolution copy of the stock at the step's margin, and undoes exactly from the kernel's record.
  - Paint trials only read, and match the kernel's paint rule float for float.
  - Planning runs only when no jump or snapshot load is out (`making.ts:298`).
  - The orders and the one module-level cache are deterministic.
- **Engine differences.** The changed generators do call `Math.cos`/`sin` (`webs.ts:199`, `face-model.ts`, `surface.ts:196`) and `atan2` (`bands.ts`, `regions.ts:117`) on values that reach blows. They only change the page's own plan, which the page never mixes with the file's. The carving uses none of them.
- **Snapshots.** Replaying the plan file in Node reproduced 12 snapshots inside steps byte for byte, and a full forward play reproduced the last one.
- **stock ≤ figure.** Every cut is capped at the figure plus the step's margin, and every blow is applied at its own step's margin. So floor chops, web patches and moved footprint blows cannot cut below it.
- **The crater's constant.** The stated 1.866 is right by analysis. A probe over 900,000 points found a steepest slope of 1.743. Sixty craters cut at random block alignments wrote identical bytes. The crater's bounds hold.
- **Engine B.** X1–X5, X7, C2–C5 and C7–C10 are repaired as recorded; X6 and C6 only partly (E10, E6).
- **Memory.** A forward play from 0 to N builds a 173 MB undo log, which with the 183 MB of grids stays well under 1.5 GB. The plan is 28,986 blows, under the 60,000 budget.

Files read outside the diff's hunks include `carve-kernel.ts:144-149`, `mesher.ts:83`, `holes.ts:27-35`, `making.ts:343` and `catalog.ts:181`.

(One closing line offering to publish the report as a page was removed: transport, not review.)

### Claude, page lens (IDs CP)

#### Review of the round-2 page change and page-5, at a97150c (main)

**Verdict:** the compile, ready-flag and marble-switch work holds up, with one real gap in the compile gate. Five things are worth fixing before the next round:

- the tool marks are regular stripes;
- the compile gate has that gap;
- the head bridge is needed while stone still fills its box;
- the head bridge can block the view from overhead;
- the dust puffs where no tool is.

**How I worked:**
- I read the code myself for the compile, ready-flag, bridge, sight-line and e2e questions.
- Two sub-agents reviewed the conventions detectors and the authenticity questions. I checked their main claims against the code before using them.
- My probes are in `tmp/review-runs/round2/scratch/opus-page/`. They use three.js in Node, the built yard, and the David plan file and snapshots on disk.
- The repository is untouched. One sub-agent's scratch copy (`opus-detectors/prefix-tree/`) is still there because its delete was refused. It is under the ignored `tmp/`.

**Files read outside the diff's hunks:**
- `node_modules/three/src/renderers/WebGLRenderer.js:1358-1580`, `:2187-2300` and `:2370-2520`; `webgl/WebGLPrograms.js:209-213`; `webgl/WebGLProgram.js:995-1005`
- `src/viewer/yard.ts:64-77`
- `src/stock/remesh.ts:197-209`, `src/stock/grid.ts:185-189`
- `src/timeline/making.ts:193-259`, `src/timeline/evaluate.ts:12,99-109`, `src/timeline/carry.ts:34-37`

##### Findings, most severe first

**P1 · high · `src/viewer/marble-glsl.ts:189-230` (`marbleBands`, `marbleMark`)**
- **What is wrong:** every two-tooth, claw, fine-claw, roundel, flat, rasp and file mark is an endless cosine. Each has a fixed pitch and a fixed world angle (0.64 and −0.93 rad), blended by the normal. There are no stroke ends, no bands of teeth and no crossing passes. The record differs:
  - claw: bands of 3–4 scratches, strokes 20–60 mm, passes crossing at 30–90° (`docs/research/tools.md:59`);
  - roundel: scoops 10–30 mm per stroke (`tools.md:81`);
  - rasp: scratches 0.5–1 mm apart crossing at random angles (`tools.md:109`). The shader draws 2.0/2.4 mm at a fixed 90°.
- **Failure scenario:** the sub-agent rendered a JS port of `marbleBands` (I looked at the images). The two-tooth gives regular diagonal stripes over a whole 25 cm sphere at the follow camera's 1.8 mm pixel. The roundel gives a 20 mm square waffle. At t = N the roundel code covers about 9.5% of the head, so the head preset (about 1.9 mm per pixel, full strength) shows a regular grid in the hair. This is the "no regular stripes or lines" class. The stone itself is clean.
- **Smallest fix:** draw strokes from a jittered cell lattice fixed in the stone (about 3–5 cm cells). Give each cell its own direction (±20°), length, tooth count and phase. Record the choices in `docs/research/`. Add a check that fails on a dominant periodic peak along random surface lines.

**P2 · medium · `src/viewer/compile-gate.ts:33-43`, with `src/viewer/yard.ts:64-77`**
- **What is wrong:** `fresh()` compiles each new material for the first object `scene.traverse` meets. three.js gives instanced meshes with and without instance colours different programs (`instancingColor`, `WebGLPrograms.js:210`). `Timbers.build` makes an instanced mesh even when it has no items, and only items get a colour. So:
  - the deck material is first met on `wall-left-decks`, which is empty and has no colours, while every scaffold deck and bridge has colours;
  - the timber material has the reverse case: the empty `head-bridge-timbers` and `scaffold-back-timbers` have no colours.
- **Why the empty ones are drawn:** an empty instanced bounding sphere (centre at the origin, radius −1) passes three.js's frustum test whenever the origin is at least 1 m inside the view. three.js then calls `setProgram` before it skips a zero-instance draw.
- **Failure scenario:** my probe found drawn meshes with a program the gate did not compile from all 9 presets. Four programs therefore compile on the page's thread:
  - 2 on the first drawn frame (screen);
  - 2 more on the first frame that draws the stock (the transmission pass).
  
  This fits the measured "no compile over about 70 ms". It contradicts `docs/design/spec.md:121` ("every program compiles off the page's thread before anything draws it") and the gate's header.
- **Smallest fix:** key `fresh()` on material plus variant (`isInstancedMesh`, `instanceColor !== null`, skinning, batching, morph) and compile one object per variant. Also stop adding empty `Timbers` meshes.

**P3 · medium · `src/viewer/bridges.ts:5,23-33,92`; `docs/research/decisions.md:39`**
- **What is wrong:** under PLAN_VERSION 2 the head bridge is first needed by step 5 (`high-points`), not step 4 (`chest-and-face`, now step 6). Its box is not clear then. Measured on the David snapshots:
  - at the step's entry (blow 775), stone fills the planks' box across x −1.10..1.10, z 0.60..0.76;
  - it is clear only from about blow 1315;
  - blow 1175 is planned from the head bridge while 4 cm of stone still sits under its near plank.
- **Failure scenario:**
  - In ordinary play of the default page, the tracker hides the bridge and logs a `bridgeProblems` entry. The docs say each box is clear when first needed.
  - The plan strikes from a platform that cannot be laid.
  - The message says "up to 2.4 cm deep" because the stock grid is clamped at 3 cells × 8 mm (`src/stock/grid.ts:185-189`). The real overlap is 16–17 cm.
- **Smallest fix:** let the planner treat a bridge as a place to stand only when its box is clear at that blow (engine side). Correct the step numbers and the claim in `bridges.ts:5` and `decisions.md`. Report the overlap's extent, or "at least the band", instead of the clamped distance.

**P4 · medium · `src/viewer/yard-spans.ts:50-75`; `src/viewer/yard-sightlines.test.ts:5-6`**
- **What is wrong:** `innerFaces` sets no plane for a part inside the block's box ("behind the stone"). After carving, that part of the head bridge (z 0.60–0.77, the full width) is in open air.
- **Failure scenario:** with the bridges laid (from step 5), take an allowed orbit position overhead at (0, 8, 0.7). The head bridge stays shown, and the sight line to the base front (0, 0.5, 0.75) crosses its planks (probe). The class gate cannot see this, because its sight lines end at the block's box and it skips cameras inside the box. The orbit can reach both after carving (minimum distance 0.2 m).
- **Smallest fix:** give the leftover in-box part a top-face plane at its own top (y 3.2), so any camera above the planks hides the span. Add gate cameras inside the box and sight lines to the figure's surface.

**P5 · medium · `src/tools/dust.ts:108` with `src/timeline/evaluate.ts:12,99-109`**
- **What is wrong:** `recordStrikes` puffs at every blow the Making asks chips for. That is up to 4 blows per visible cycle, spread over the cycle's group, but only the cycle's first blow is at the tool.
- **Failure scenario:** on the David plan, the puffs that are not at the tip lie a median 0.28–0.80 m from it, and up to 2.7–5.2 m away (`high-points`, `sides-point`). The spec says the puff leaves the tip.
- **Smallest fix:** puff only for the first blow of each struck cycle.

**P6 · medium · `src/repo-conventions.test.ts:58,194` (rule 5)**
- **What is wrong:** a name is marked as a wall-clock value only on a line matching `now() -`.
- **Failure scenario:**
  - `const end = performance.now(); expect(end - start).toBeLessThan(3000)` passes. I checked this against the regex.
  - A live miss: `tests/e2e/controls.spec.ts:109-115` computes `performance.now() - start` inside `page.evaluate` and then asserts `rate > 2/(12·weight)`. The page clamps each frame to 0.1 s, so under heavy load this goes red because of the machine, not the code.
  - The lesson was retired on this gate.
- **Smallest fix:** mark a name from any clock read (`/\b(?:performance\.now|Date\.now)\(\)/`). The sub-agent ran this variant: 0 hits today, and the synthetic cases are unchanged. Measure the e2e rate against the page's own frame clock.

**P7 · medium · `src/viewer/yard.ts` (time-independent) vs the new years label (`src/ui/label.ts`)**
- **What is wrong:** the 1501 enclosure, scaffold, bench and wax model stand from t = 0. The label now says "1464–1466", and t = 2 is 9 September 1501. The record differs (`david-history.md:64-66,82,88`):
  - the wall was paid on 14 October 1501 and the roof on 20 December;
  - the knob came off before the wall went up;
  - the block lay on its back until July 1501.
- **Smallest fix:** show the enclosure, scaffold and model from the step that reaches 14 October 1501, and record the choice in `decisions.md`.

**P8 · low · rewrites that weakened tests (the "fixing their hits" question): yes, four of them**
- `src/tools/props.test.ts:10-11` is vacuous, because `PROP_IDS` is `Object.keys(PROPS)` (`src/tools/props.ts:134`). Fix: `expect(PROPS[id].id).toBe(id)` for each id.
- `scripts/harness.test.ts:41` now also accepts `msedge` and `chrome-beta`.
- `src/timeline/player.test.ts:16-17` no longer checks the spec's speed set.
- `src/tools/catalog.test.ts:72-88` no longer checks the values from the research.
- Separately, `docs/learning/gate-proofs.md` miscounts: "12 hits in 10 files" is 8 files for the pins, and "the writer's own 17 tests" is 6.

**P9 · low · `src/repo-conventions.test.ts:54` (rule 4)**
- **What is wrong:** the regex misses `?.` or `!` after an index, and the literals `true`, `false` and `null`.
- **Failure scenario:** two live misses: `src/choreography/david-steps.test.ts:98` pins `DAVID_STEPS[0]?.calendar.from` to `'1464-08-18'`, and `catalog.test.ts:88` pins a value to `false`.
- **Smallest fix:** allow `[?!]?\.` in the member chain, and `true|false|null` as literals.

**P10 · low · `src/main.ts:236-242`**
- **What is wrong:** the tracker takes the jump's target `making.t`, but `blowsApplied` and the stock lag behind it while a snapshot loads or a replay runs (`src/timeline/making.ts:255-259,298-304`).
- **Failure scenario:** a David load at `t=N` reports "head-bridge … (0 blows applied)" from the uncarved block. The entry is permanent, and it differs from the one a play-through reports.
- **Smallest fix:** run the tracker at the position of the applied cursor, or skip it while `dirtyChunks > 0`.

**P11 · low · context loss (`src/viewer/marble.ts:169-178`, `compile-gate.ts:27`, `scene.ts:146-149`)**
- **What is wrong and when it shows:**
  - `compile()` has no lost-context guard. A loss before `prepare` makes it throw, and the rejection is memoized, so `full` never turns true and `__shotReady` never does either: captures hang.
  - After a restore, three.js rebuilds its program cache, but the gate's seen-set and `full = true` stay. Every program then compiles on the page's thread, the full marble included (2–3 s).
  - Frames are counted while `render` returns early on a lost context.
- **Smallest fix:** on `webglcontextrestored`, reset the seen-set and re-run `prepare`. Clear `preparing` when it rejects. Count no frames while the context is lost.

**P12 · low · `tests/e2e/helpers.ts:30-33` (latent)**
- **What is wrong:** the gate now delays the first tick while the block meshes in workers. The first facts can therefore show `dirtyChunks: 0` at t = 0, and `setTime(target)` only runs from the second frame (`main.ts:380`).
- **Failure scenario:** `openPage(…&t=1.5)` can return before the replay starts. Today's tests at a position either wait for `__shotReady` or read facts that don't depend on meshing, so nothing fails yet.
- **Smallest fix:** wait two frames before the `dirtyChunks` wait.

**P13 · low · e2e that got looser or leave things unchecked**
- `helpers.ts:106` `labelAt` accepts any year 1400–1599 for every step.
- `yard.spec.ts:20-23` no longer drives the hide of a laid bridge's span.
- The 60 s wait for the full marble plus `test.slow()` means no test would notice a return to the 12–17 s ready time. That is by design, but no header says so.
- `smoke.spec.ts:2` claims ready comes "only once the full marble draws", but it reads `marble` after ready, so it cannot tell the order.
- `keyboard.spec.ts:74` focuses the scrubber with `locator.focus()`, not Tab.

**P14 · low · `scripts/capture-fps.mjs:47-53`**
- **What is wrong:** `settle` doesn't wait for `marble === 'full'`, so in a new browser the window can open on the cheaper light marble.
- **Smallest fix:** add that wait.

**P15 · low · `src/timeline/making.test.ts:131-135`**
- **What is wrong:** CPU time is still load-dependent.
- **Evidence (sub-agent, on a hybrid i9-13900KF):**
  - alone, the case takes about 1.7–1.9 s;
  - with six copies at once, 1.9–2.25 s;
  - the bound is 3 s, a 1.33× margin.
- **Further problems:** the Vitest pool is not pinned (forks is only the default), and the header's claim that other files don't inflate this file's CPU is contradicted.
- **Smallest fix:** use `process.threadCpuUsage()` and pin the pool.

**P16 · low · dust (`dust-pool.ts:26-35`, `dust.ts:66`)**
- It is drawn pure white with no lighting or tone mapping, so it glows in shade.
- Up to 0.5% of point grains and 5.6% of drill grains launch into the stone, and some sink below the floor.
- During a carry, the previous step's puffs hang almost still.

**P17 · low · `src/viewer/marble.test.ts:61-81`**
- **What is wrong:** the stand-in is checked against `FINISH_ATTRIBUTE`, not against a chunk mesh made by `src/stock/remesh.ts`. The check proves only that the code agrees with itself.
- **Failure scenario:** if remesh changed the chunks' program inputs (instancing, colours), the switch would compile the full marble on the page's thread and the test would stay green.
- **Smallest fix:** compare the stand-in with a mesh built through the Remesher.

**P18 · low · docs, messages, dead code**
- `spec.md:9,70` and the footer (`label.ts:85`) still start the making on 9 September 1501.
- The marble's choices (vein density and colour, taroli, grain, band pitches) are not recorded in `docs/research/`. `marble.ts:2` cites engine-options §6, which recommends sine veins.
- Rule 5 also flags `*.slow.test.ts`, the very place its message says to move a bound.
- The gate's error message doesn't name the materials, and the `prepare` error doesn't say captures will never become ready.
- `SpanGeometry.centre` and `ViewerOptions.pose` are no longer read.
- `props.test.ts:1-3` states no bound.

**Outside the reviewed range, seen in passing and verified in the code**
- `src/timeline/carry.ts:34-37` sizes the bench carry by `blowCount`, but the approach belongs to a cycle of `group` blows. Only 1/group of the route is stretched, so the tool crosses the rest in about 70 ms (the teleport class). `carry.test.ts` uses one blow per cycle, so it can't see this.
- The knot step plans 11 shown blows, against the record's "one or two" (`david-history.md:82`).

##### Checked and found sound

- **`__shotReady`:**
  - it is never true while the light marble draws: `full` flips between frames, and the same callback draws with the full program;
  - 4 frames are drawn before it is set and the 5th in the same callback;
  - `__shotSeek` re-arms it, and it waits for every chunk to be meshed;
  - it cannot hang without `KHR_parallel_shader_compile` (`isReady` is true at once), or without the PMREM fields (`lit` falls back to the built environment).
- **The marble switch:**
  - the twin's program key equals the chunks' (same parameters, `'marble'` key, the chunks' attributes and shadow flags), so three.js reuses the compiled program;
  - `prepare` is memoized and the twin is never disposed.
- **Environment:** the stand-in matches the final texture's mapping and height (CubeUV, 1024), so swapping it in reuses every program.
- **Transmission pass:** the gate's 1×1 target gives the same tone mapping and colour space as three.js's transmission pass.
- **GLSL and the switch's look:** every derivative runs in uniform control flow. `MEAN_STONE` is within 0.12% luminance of the full stone's mean, so the switch does not flash. The stone itself shows no periodic structure.
- **Span rule:** it is sound against the uncarved box. The sight-line gate's mutation case keeps it live, and every preset is fine with every bridge laid.
- **Bridges:** at a settled state they follow from t alone. The upper back bridge's box is clear when step 10 first needs it, and the lower one is never needed.
- **Dust and chips:** the dust follows from the blow and the time since its strike alone. The clear/read order in `main.ts:388-390` holds. The dust is not a veil at the steps' follow distances (1.6–2.2 m).
- **Label and keyboard:**
  - the label reads "1464–1466" at t = 0, "1466" at t = 1, and "Day 1 · 9 September 1501" at t = 2;
  - the status line takes the step from the label;
  - the keyboard and scrubber changes work as described.
- **Detectors:**
  - today's tree gives 0 hits for both rules;
  - on 75667d8 they reproduce the recorded 12 + 2 hits;
  - the recorded mutations are real reds.
- **File sizes:** no file is over 500 lines (largest: `yard.ts` 444, `main.ts` 407).

##### Budgets

- **First frame:** it waits for the gate's batch and the room's PMREM (measured 1.35–1.59 s). Adding to it:
  - the four compiles in P2;
  - without the parallel-compile extension, every link happens on the page's thread, and the first full-marble draw brings back the 2–3 s freeze.
- **Ready:** the full marble's compile takes 2–3 s on Direct3D 11 with `marbleLoop`. No gate asserts it.
- **60 fps:** risk is low on this machine (238 fps median on the RTX 4090 in the devlog). The cost per pixel is about 20 noise calls plus up to three 27-cell searches, on a physical material with a transmission pass, so close-ups on weaker GPUs are where it would show. Per frame on the CPU:
  - the gate walks the whole scene twice;
  - during backward play, `stoneDepth` resamples about 12,000 points per laid bridge.
- **Memory:** the twin material and the light program are negligible. The 6 MB PMREM stand-in is freed once the environment is built. There is no risk to the 1.5 GB budget.

## Findings and disposition

Owner (coordinator, 2026-10-15). Round 3 repairs them in five workers with disjoint files: `engine-c` (the plan's authenticity and the order gate), `engine-e` (coverage, the gilding, the crown, where the planner may stand), `engine-d` (the snapshot loader, the plan file and the build), `page-6` (the look: tool marks, dust, the carry, the label, the catalog), `page-7` (the page's robustness and its gates: context loss, the compile gate, the bridges, the yard's dates, the detectors, the tests). Each repair lands with a check that fails without it. CE17 to CE21 are the Claude engine report's notes on the items already known, and CP19 its page report's note from outside the reviewed range.

| ID | Finding | Disposition and reason | Repair |
|---|---|---|---|
| XE1 | The drill between the legs puts its shaft through the opposite thigh | Accepted, high: the local rules forbid a tool clipping stock or figure; same as CE2 | engine-c |
| XE2 | The snapshot download's memory bound trusts the header's size | Accepted; same as CE10 (X6 only partly repaired) | engine-d |
| XE3 | A timed-out snapshot load is not cancelled | Accepted; with CE6 (C6 only partly repaired) | engine-d |
| XE4 | The build holds every snapshot's input until its gzip finishes, 1.27 GB | Accepted: a builder memory risk; with CE14 | engine-d |
| XP1 | Context loss leaves the ready flag and the compile state stale | Accepted, high; with CP11 | page-7 |
| XP2 | The compile gate misses the instanced-colour variant of the decks and timbers | Accepted; same as CP2 | page-7 |
| XP3 | A laid head bridge blocks an allowed close-up from inside the block's box | Accepted; same as CP4 | page-7 |
| XP4 | Bridge occupancy is sampled every 2 cm: it misses stone and flags the gaps between planks | Accepted | page-7 |
| XP5 | The bridge clearance cache can record a partly applied jump | Accepted; with CP10 | page-7 |
| XP6 | The frame-rate probe can measure the light marble and count frames never drawn | Accepted; same as CP14 | page-7 |
| XP7 | The convention detectors miss some forms and flag a reassigned name | Accepted; with CP6 and CP9 | page-7 |
| XP8 | Removing pinned literals weakened the checks of documented tool facts | Accepted: research facts are checked against `docs/research/tools.md` read as an independent source, not as a pinned literal; with CP8 | page-7 |
| CE1 | The plan-order gate passes a row-by-row order that starts at the high point | Accepted, high: it is the class gate for the owner's "row by row" defect; the register entry is corrected when the gate is | engine-c |
| CE2 | Every hole between the legs drives the spindle through the other thigh; older drill steps and the claw's reach into narrow creases share the gap | Accepted; with XE1 | engine-c |
| CE3 | Agostino's step: 38,219 real blows per shown blow, the start before the block was bought, a region that stops at the hips and leaves no knot for the nodo | Accepted; the dates and the region are decided from `david-history.md` and recorded in `decisions.md` | engine-c |
| CE4 | Confinement leaves 6.2 percent of the flesh unpolished at its edges, and no gate bounds coverage | Accepted: a coverage floor per footprint step, and a smaller footprint where the full one is refused | engine-e |
| CE5 | The web census cannot see gaps under 19 mm, and its window was narrowed to stay green | Accepted | engine-e |
| CE6 | A timed-out load sets its snapshot aside and cascades through the earlier ones | Accepted; with XE3 | engine-d |
| CE7 | high-points and chest-and-face start on the rock and the feet | Accepted: the titles and the research say the knee, the hand, the chest | engine-c |
| CE8 | The paint gate misses cells cut all the way to air | Accepted; same as Codex's note on `outside-region.ts:36` | engine-e |
| CE9 | `plan-build.test.ts` takes about two minutes and silently dropped the blade tools | Accepted | engine-d |
| CE10 | An infinite or unchecked snapshot size removes the fetch bound | Accepted; with XE2 | engine-d |
| CE11 | A version bump without its fingerprint line builds `none`, which the page accepts | Accepted | engine-d |
| CE12 | The hole step roughs the legs up to 14 cm outside its box | Accepted: a smaller crater or a corrected comment, the worker's call with the record | engine-c |
| CE13 | The detail can say "0 real blows" while a step is not planned | Accepted | page-6 |
| CE14 | Writing a snapshot on the page's thread takes about 0.45 s, more than the load estimate; the build's memory | Accepted: measure the write, write only the tiles that differ, gzip in bounded order | engine-d |
| CE15 | Docs that still start the making in 1501; stale step numbers for the bridges; `furrows.ts:5` | Accepted: the spec and `decisions.md:18` repaired by the coordinator with this record; the bridges' step numbers page-7; `furrows.ts` engine-c; the footer page-6 | split |
| CE16 | Dead code, two copies of the region test, error messages short of R26, test headers that claim more | Accepted | engine-c (choreography), engine-d (plan file and snapshots) |
| CE17 | No original crust is left on the crown, while 24 to 40 mm of finished stone (up to 136 mm) stays on the head's top at t = N | Accepted: the head must reach its figure except where the record keeps the block's surface; checked against the audit's captures of the crown | engine-e |
| CE18 | The gilding's patches: the confiner refuses leaves for air cells off the surface, and a whole leaf where it does not fit | Accepted: air with no stone beside it is harmless, and a cut leaf fills the rest | engine-e |
| CE19 | The flat-faced remnant between the right hand's fingers is the figure grid's own surface, a gap narrower than the 8 mm grid resolves | Accepted as a limit of the 8 mm grid, deferred: it needs the 4 mm refinement boxes the choreography names; recorded under Known compromises | none this round |
| CE20 | The nodo plans 11 shown blows where the record has one or two | Accepted; with CE3 (the knot left by Agostino) | engine-c |
| CE21 | The catalog's eight-hour real-blows figure is dead data | Accepted: removed with its decision marked | page-6 |
| CP1 | Every toothed, roundel, flat, rasp and file mark is an endless cosine at a fixed pitch and angle | Accepted, high: the "no regular stripes" class; strokes in jittered cells fixed in the stone, the choices recorded in `docs/research/`, and a check against a dominant periodic peak | page-6 |
| CP2 | The compile gate misses program variants | Same as XP2 | page-7 |
| CP3 | The head bridge is first needed while stone still fills its box, the plan strikes from it, and the message reports the clamped depth | Accepted: the planner stands on a bridge only when its box is clear at that blow (engine-e); the message and the step numbers (page-7) | engine-e, page-7 |
| CP4 | The head bridge's part inside the block's box blocks an overhead view after carving | Same as XP3 | page-7 |
| CP5 | Dust puffs at blows where no tool is, a median 0.28 to 0.80 m from the tip | Accepted | page-6 |
| CP6 | The wall-clock detector marks a name only on a `now() -` line; a live miss in `controls.spec.ts` | Accepted; with XP7 | page-7 |
| CP7 | The 1501 enclosure, scaffold, bench and model stand stand from 1464 | Accepted: the yard's structures follow the record's dates; the scaffold stays wherever a planned blow needs it, so the reach check and the yard agree | page-7 |
| CP8 | Four rewrites weakened their tests; `gate-proofs.md` miscounts | Accepted; with XP8 | page-7 |
| CP9 | The pinned-literal detector misses `?.`, `!`, `true`, `false`, `null`; two live misses | Accepted; the miss in `david-steps.test.ts` is fixed by engine-c, which rewrites that test | page-7, engine-c |
| CP10 | The bridge tracker reads the target t while the stock lags | Accepted; with XP5 | page-7 |
| CP11 | Context loss: a memoized rejection hangs the ready flag; restored contexts recompile on the page's thread | Same as XP1 | page-7 |
| CP12 | `openPage` can return before a replay starts | Accepted | page-7 |
| CP13 | E2e checks that got looser or left things unchecked | Accepted | page-7 |
| CP14 | The frame-rate probe does not wait for the full marble | Same as XP6 | page-7 |
| CP15 | The determinism case's CPU-time bound still depends on load | Accepted: thread CPU time and a pinned pool | engine-d |
| CP16 | The dust glows unlit, some grains launch into the stone, puffs hang during a carry | Accepted | page-6 |
| CP17 | The stand-in check agrees with itself, not with a chunk the Remesher builds | Accepted | page-7 |
| CP18 | Docs, messages and dead code: the start date, the marble's choices unrecorded, rule 5 against the slow suite, two messages, two unread fields | Accepted: the spec's start date by the coordinator with this record; the marble's choices page-6; the rest page-7 | split |
| CP19 | The bench carry is sized by the blow count, not the cycle, so the tool crosses most of its route in about 70 ms | Accepted: the teleport class | page-6 |

## Verification

The coordinator read all four reports whole, checked the shared citation `holes.ts:27-35`, and confirmed that the tree was clean after the Claude runs and that each Codex run read code outside its diff. No finding was rejected. Repairs, their checks and a focused re-review of the repairs follow in round 3.

## Round outcome

Open: every finding above is accepted and assigned except CE19, deferred to the refinement boxes. The integrated revision is not yet clear of material findings.
