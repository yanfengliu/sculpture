# Review 0: integration

## Target

The integrated revision of M2: repository `sculpture`, commit `81acb40` on `main` (2026-10-11), the whole tree: the pipeline (`scripts/`), the engine (`src/stock/`, `src/timeline/making.ts`, `src/choreography/`), the tools (`src/tools/`) and the page (`src/main.ts`, `src/viewer/`, `src/ui/`, `src/timeline/player.ts`, `tests/e2e/`), against `docs/design/spec.md`, `docs/design/choreography.md`, `docs/policies/local-rules.md` and `docs/research/decisions.md`.

## Reviewers and coverage

- Codex (`gpt-6-astra`, `model_reasoning_effort=xhigh`, `codex exec --sandbox read-only --ephemeral`, codex-cli 0.158.0), full-codebase lens with in-memory probes on the David grid; read `tsc --noEmit` only, no Vitest, build, e2e or captures. Prompt: `tmp/review-runs/prompt-codex.md` (ignored path; the prompt text is the lens list and the four report sections named below). Sandbox health: no `STATUS_DLL_INIT_FAILED` in the full stdout; the report cites files and lines outside the diff throughout.
- Claude (`claude-opus-5-5[1m]`, `--effort max`, `claude -p` with `Read,Glob,Grep,Task` and read-only git tools, Claude Code 2.1.281), full-codebase lens; its report is appended below when its run completes, with its `modelUsage` check.

## Reports

### Codex

Reviewed revision `81acb4087998ba7fd4d23c949dca20fa73852553`. **The tree does not yet satisfy the contract.** No files were changed. TypeScript passed; the findings below come from code inspection and read-only, in-memory probes using the existing 8 mm David grid.

**1. Correctness defects**

1. **High — Every planned blow becomes a visible mallet cycle.** [making.ts:175](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:175) derives phase directly from the planned blow count, and [making.ts:199](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:199) poses one complete cycle per blow. The David’s `sides-point` step therefore runs at **131.9 cycles/second**, against the approximately four visible strikes/second with grouped cuts required by [spec.md:9](C:/Users/38909/Documents/github/sculpture/docs/design/spec.md:9). Most impact phases cannot be displayed at 60 fps. **Smallest fix:** introduce deterministic groups of planned blows per visible strike and apply each group at its strike phase; reconcile the per-blow timing wording with that grouping.

2. **Medium — The bench carry can be skipped completely.** [main.ts:249](C:/Users/38909/Documents/github/sculpture/src/main.ts:249) returns normal speed at integer rest positions because `current` is null; [main.ts:259](C:/Users/38909/Documents/github/sculpture/src/main.ts:259) then advances before reconsidering the carry. Starting at `t=1`, one 1/60-second update reaches phase **0.86574** of the first charcoal blow, beyond the entire approach window. **Smallest fix:** determine the incoming blow at rest and split updates at step and approach boundaries.

3. **Medium — The drill penetrates before its material change.** [blow-cycle.ts:142](C:/Users/38909/Documents/github/sculpture/src/tools/blow-cycle.ts:142) gives maximum insertion at phase **0.475**, then returns the bit to the surface at **0.65**, when [making.ts:182](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:182) finally applies the hole. The drill enters uncut stock and withdraws as the hole appears. **Smallest fix:** align the feed curve with the material-change phase and test the pre-strike interval.

4. **Medium — Position queries still autoplay.** [query.ts:72](C:/Users/38909/Documents/github/sculpture/src/viewer/query.ts:72) suppresses autoplay only for `shot`; [main.ts:227](C:/Users/38909/Documents/github/sculpture/src/main.ts:227) starts playback even when `t` or `step` selected a position. This contradicts [spec.md:72](C:/Users/38909/Documents/github/sculpture/docs/design/spec.md:72). **Smallest fix:** suppress initial playback when a valid position was supplied, with tests for bare `?t=…` and `?step=…`.

5. **Medium — Valid camera queries are silently changed.** [scene.ts:70](C:/Users/38909/Documents/github/sculpture/src/viewer/scene.ts:70) imposes orbit limits, then [scene.ts:78](C:/Users/38909/Documents/github/sculpture/src/viewer/scene.ts:78) applies them to explicit poses. A probe of `cam=0,1,10,0,3,0` moved the camera to approximately **`[0,3.204,10.196]`**, without a query problem. Capture manifests can therefore describe a different camera from the rendered one. **Smallest fix:** preserve explicit capture poses, or reject unsupported poses and report the restriction.

6. **Medium — The default capture set generates `t=Infinity`.** [capture-shots.mjs:79](C:/Users/38909/Documents/github/sculpture/scripts/capture-shots.mjs:79) reads facts at `t=0`, when later steps still have zero blow counts ([making.ts:111](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:111)). [capture-shots.mjs:57](C:/Users/38909/Documents/github/sculpture/scripts/capture-shots.mjs:57) accepts zero through `??`, then divides by it. Follow shots for subsequent tools become invalid URLs. **Smallest fix:** obtain fully planned counts before constructing the set, and reject or skip genuinely empty steps.

7. **Medium — A failed mesher job leaves readiness permanently pending.** [pool.ts:56](C:/Users/38909/Documents/github/sculpture/src/stock/pool.ts:56) drops the failed job without completing or rejecting it. Its entry remains in the remesher’s `inFlight` map, created at [remesh.ts:151](C:/Users/38909/Documents/github/sculpture/src/stock/remesh.ts:151). Consequently, capture readiness can never become true. **Smallest fix:** propagate job failure, replace the worker, and regenerate/retry the transferred window or use the synchronous fallback.

8. **Medium — Finish interpolation invents tools that never touched a fragment.** [marble.ts:67](C:/Users/38909/Documents/github/sculpture/src/viewer/marble.ts:67) interpolates categorical finish codes as floats; [marble.ts:113](C:/Users/38909/Documents/github/sculpture/src/viewer/marble.ts:113) rounds the interpolated value. A triangle joining codes `0` and `12` can display intermediate claw, drill, rasp and other finishes. The diagnostic finish view is affected too. **Smallest fix:** use discrete finish selection, such as a consistent per-triangle code or nearest-cell sampling.

9. **Medium — The literal `stock <= figure` invariant is false, and its required test is absent.** [grid.ts:186](C:/Users/38909/Documents/github/sculpture/src/stock/grid.ts:186) clamps stock to three cells while the figure uses sixteen ([grid.ts:40](C:/Users/38909/Documents/github/sculpture/src/contracts/grid.ts:40)). At initialization, the David probe found **3,609,003 cells** with raw stock values greater than figure values. [carve.test.ts:82](C:/Users/38909/Documents/github/sculpture/src/stock/carve.test.ts:82) tests a weaker, initial-state-relative inequality instead. This is a representation/contract mismatch, **not evidence that those interior cells were cut away**. **Smallest fix:** define the invariant using a common clamp and test it explicitly, or use compatible bands if the literal inequality must remain.

10. **Medium — The plan test overclaims stock-angle and scaffold verification.** Its header at [david-steps.test.ts:3](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.test.ts:3) claims both, but [line 109](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.test.ts:109) compares the direction with the blow’s own stored normal. The reach assertion calls the broad bounding-box predicate at [blow-cycle.ts:242](C:/Users/38909/Documents/github/sculpture/src/tools/blow-cycle.ts:242), without checking actual decks or obstructions. **Smallest fix:** replay sequentially and check contact, stock gradient, and reachable support geometry independently; narrow the header until those checks exist.

**2. Authenticity defects**

11. **High — Point-chisel plans repeatedly strike air.** [furrows.ts:81](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/furrows.ts:81) computes entry depths once, then [line 108](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/furrows.ts:108) advances them arithmetically. Even its air check samples the step’s starting stock, not the stock after preceding blows. On the David, **4,408 of 4,749 `sides-point` targets** were more than one cell outside the stock immediately before their blow; **2,911 removed no material**. **Smallest fix:** plan against an evolving scratch stock, place each target on its current surface, and omit empty cuts.

12. **High — Tool bodies and approach paths enter stock.** [blow-cycle.ts:112](C:/Users/38909/Documents/github/sculpture/src/tools/blow-cycle.ts:112) interpolates poses with a fixed lift, without collision checks; [bands.ts:61](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/bands.ts:61) uses the figure normal even when locating the tool on a different stock surface. In the David replay, `claw-front` blow index 40 at phase **0.475** put a shaft-axis point 60 mm above the tip **10.9 mm inside stock**, before that blow’s cut. **Smallest fix:** validate the settled tool body and swept approach against stock, adjusting the normal or adding clearance waypoints.

13. **Medium — Actual targets exceed the rendered scaffold’s reach.** The scaffold starts at `z=1.27` in front and `|x|=1.61` at the sides ([yard.ts:150](C:/Users/38909/Documents/github/sculpture/src/viewer/yard.ts:150)). The surviving pupil/nostril blow lies near `[-0.103,4.707,0.199]`: its nearest front deck is **1.07 m horizontally away**, beyond the declared 0.9 m reach ([blow-cycle.ts:38](C:/Users/38909/Documents/github/sculpture/src/tools/blow-cycle.ts:38)). The current predicate accepts it. **Smallest fix:** share scaffold geometry with reach validation and provide a documented reachable platform arrangement for these targets.

14. **Medium — The point chisel’s modeled tip is reversed.** [parts.ts:31](C:/Users/38909/Documents/github/sculpture/src/tools/geometry/parts.ts:31) translates a Three.js cone upward without reversing it. The vertex probe confirmed a **7.56 mm radius at the declared tip**, with the actual apex 35 mm up the shaft. [chisels.ts:22](C:/Users/38909/Documents/github/sculpture/src/tools/geometry/chisels.ts:22) uses that geometry; charcoal repeats the mistake at [abrasives.ts:56](C:/Users/38909/Documents/github/sculpture/src/tools/geometry/abrasives.ts:56). **Smallest fix:** reverse the cone before translation and assert an apex at the origin.

15. **High — The finishing passes do not achieve their documented margins or coverage.** [david-steps.ts:280](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:280) spaces fine-claw bands 140 mm apart for an 11 mm blade; subsequent sparse passes have no residual-coverage check. After the complete David plan, **6,634 near-surface flesh samples** remained over 32 mm from the figure field, and **14,653** still carried finishes preceding rasping. For example, `[-0.162,3.028,-0.326]` has stock distance 3.97 mm and figure distance 33.75 mm despite a polish code. This contradicts the 1–2 mm endpoint in [technique.md:67](C:/Users/38909/Documents/github/sculpture/docs/research/technique.md:67). **Smallest fix:** add overlapping passes driven by remaining allowance and unfinished coverage, preserving the documented rough regions.

16. **Medium — The pupil/nostril step loses three of its four targets.** The coordinates at [david-steps.ts:103](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:103), passed through the projection and rejection at [holes.ts:24](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/holes.ts:24), produce **one blow** on the actual David. The detail promises both pupils and nostrils. **Smallest fix:** validate landmarks against the normalized David and require each named anatomical target to produce its intended hole.

17. **Medium — Gilding lacks its promised finish restriction.** [gild.ts:15](C:/Users/38909/Documents/github/sculpture/src/choreography/generators/gild.ts:15) generates unrestricted brush footprints, and [carve.ts:175](C:/Users/38909/Documents/github/sculpture/src/stock/carve.ts:175) overwrites their finish unconditionally. This contradicts the claw/roundel restriction in [choreography.md:81](C:/Users/38909/Documents/github/sculpture/docs/design/choreography.md:81). The David probe recorded gilding over **20,576 previously polished cells**, and found gilt on the flesh region. **Smallest fix:** enforce anatomical and eligible-finish masks when painting the footprint.

18. **Low — Detail text contradicts the displayed real-blows ratio.** [david-steps.ts:406](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:406) says approximately 200 real blows, while [line 414](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:414) supplies 50. Both statements appear together. More generally, [line 67](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.ts:67) derives ratios from stale expected counts rather than planned counts. **Smallest fix:** generate ratio text from one value, calculated using the agreed working-day assumption and actual count.

**3. Performance and budget risks**

19. **High — Whole-making scrubs synchronously replay far beyond the three-second budget.** [making.ts:276](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:276) applies every intervening blow on the calling thread. On the cached David, calls to `applyBlow` alone totaled **19.4 seconds**, excluding planning, remeshing and rendering. The existing E2E test also acknowledges an approximately 18-second synthetic jump at [controls.spec.ts:17](C:/Users/38909/Documents/github/sculpture/tests/e2e/controls.spec.ts:17). **Smallest fix:** implement the measured-over-budget checkpoint fallback already allowed by the decisions, then gate full jump-to-ready latency. Moving work to a worker alone would improve responsiveness but would not establish the latency target.

20. **Medium — The remaining browser budgets have no enforcing measurement.** [david-steps.slow.test.ts:3](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.slow.test.ts:3) says its times prove the budget, but [line 49](C:/Users/38909/Documents/github/sculpture/src/choreography/david-steps.slow.test.ts:49) only limits blow count. [budgets.test.ts:21](C:/Users/38909/Documents/github/sculpture/src/stock/budgets.test.ts:21) counts the grids alone: approximately **183.6 MB**, excluding the probe’s **351.5 MB undo log**, queued windows and CPU/GPU meshes. The E2E suite does not enforce David first-frame, 60 fps, jump latency or total memory limits. **Smallest fix:** add a bounded David browser benchmark with explicit assertions and correct the test headers. I did not establish a 1.5 GB memory breach or measure browser frame rate.

**4. Smaller issues worth fixing**

21. **Medium — Sweep failures bypass explicit browser cleanup.** [sweep.mjs:48](C:/Users/38909/Documents/github/sculpture/scripts/sweep.mjs:48) calls `process.exit`, including from the acquired-browser path at [line 172](C:/Users/38909/Documents/github/sculpture/scripts/sweep.mjs:172), bypassing its `finally`. Browser acquisition also lacks cleanup if `newPage` fails at [capture.mjs:32](C:/Users/38909/Documents/github/sculpture/scripts/lib/capture.mjs:32). **Smallest fix:** throw through the cleanup path, set the exit code afterward, and close the browser on partial acquisition failure.

22. **Low — Sweep duplicates obsolete block dimensions.** [sweep.mjs:38](C:/Users/38909/Documents/github/sculpture/scripts/sweep.mjs:38) uses 2.1 × 5.5 × 1.4 m instead of the canonical 2.22 × 5.25 × 1.54 m. Its framing and inside-block rejection therefore use the wrong box. **Smallest fix:** obtain dimensions from the shared frame contract or published facts.

23. **Low — Cross-component fixture verification is claimed but not implemented.** [contracts/grid.ts:3](C:/Users/38909/Documents/github/sculpture/src/contracts/grid.ts:3) claims writer and reader tests consume one another’s fixtures. The reader builds its own fixture ([grid.test.ts:7](C:/Users/38909/Documents/github/sculpture/src/stock/grid.test.ts:7)); the writer explicitly does not run the reader ([grid-writer.test.ts:2](C:/Users/38909/Documents/github/sculpture/scripts/lib/model/grid-writer.test.ts:2)). Matching mistakes could pass both suites. **Smallest fix:** add one writer-to-real-reader round trip and align the claims.

**Checked and found sound, within these bounds**

- The carve update implements the intended `max/min` operation, preserves monotonic removal, and protects occupied figure cells; the raw-band invariant qualification is described above ([carve.ts:169](C:/Users/38909/Documents/github/sculpture/src/stock/carve.ts:169)).
- Undo records old stock and finish values, including compressed deep-stock runs, and restores them directly ([carve.ts:177](C:/Users/38909/Documents/github/sculpture/src/stock/carve.ts:177), [carve.ts:224](C:/Users/38909/Documents/github/sculpture/src/stock/carve.ts:224)).
- Lazy planning restores the preceding state before generating each step; forward replay, reverse undo and integer rest handling are coherent ([making.ts:239](C:/Users/38909/Documents/github/sculpture/src/timeline/making.ts:239)).
- Successful stale mesh results trigger a fresh mesh before being displayed ([remesh.ts:159](C:/Users/38909/Documents/github/sculpture/src/stock/remesh.ts:159)).
- The reviewed stage order, flat-chisel omission, single-hole drill angle exception and documented tool compromises follow the research decisions.
- The complete David probe produced **21,369 blows**, below 60,000. Its decompressed grid matched the header SHA-256.
- Query parsing is centralized; invalid-value reporting, step precedence and model-fallback reporting are present. UI tests generally drive real controls and clearly bound their synthetic-model claims.
- Pipeline code checks source metadata/checksums, uses ignored asset paths, preserves attribution, and checks mesh topology and sampled volume.

`tsc --noEmit` passed. I did not run Vitest, build, E2E, browser captures or visual acceptance checks; no browser or server was launched. The working tree remains unchanged.
### Claude

Pending: the run is in progress at the time of this round's first write.

## Findings and disposition

Finding ids follow the Codex report's numbering (F1 = its item 1). Dispositions are the coordinator's; the owner column names who repairs.

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F1 | One visible mallet cycle per planned blow, 132 cycles a second in `sides-point` | Accepted: the time-lapse decision wants about four visible strikes a second each applying a run of blows | engine-2: group consecutive blows of a stroke per visible cycle |
| F2 | The bench carry is skipped at integer rest positions | Accepted | page-2 |
| F3 | The drill inserts before the strike phase and withdraws as the hole appears | Accepted | tools-2 |
| F4 | `t=` and `step=` loads still autoplay | Accepted: the spec's first-load rule | page-2 |
| F5 | Explicit `cam=` poses silently clamped by the orbit limits | Accepted | page-2 |
| F6 | The standard capture set divides by zero blow counts before planning | Accepted | page-2: build the set from a load at `t = N` |
| F7 | A failed mesher job leaves readiness pending forever | Accepted | engine-2 |
| F8 | Finish codes interpolated across a triangle invent intermediate tools | Accepted | page-2: discrete per fragment |
| F9 | The literal `stock <= figure` is false where the bands differ | Accepted as a wording defect: the spec now states the bound (within the narrower band); an explicit test within that bound follows | coordinator (spec, `8613a83`); engine-2 (test) |
| F10 | The plan test's angle and reach checks prove less than its header | Accepted | engine-2 (stock gradient in the check); tools-2 (reach from the scaffold geometry) |
| F11 | Point furrows planned against the starting stock strike air (4,408 of 4,749 `sides-point` targets, 2,911 empty) | Accepted, high | engine-2: plan against an evolving stock |
| F12 | Tool shafts enter stock on approach; blows carry the figure's normal | Accepted, high | engine-2 (stock gradient as the blow normal); tools-2 (clearance in the cycle) |
| F13 | Targets beyond the rendered scaffold's reach pass the box predicate | Accepted | tools-2 (`src/tools/scaffold.ts`, reach from the decks and a plank bridge); page-2 (yard from those constants) |
| F14 | The point chisel's and the charcoal's cone tips are reversed | Accepted | tools-2 |
| F15 | Finishing passes leave flesh 32 mm proud with polish painted on it | Accepted, high: the margins of technique.md stage 4 to 7 are the authenticity rule | engine-2 (coverage-driven passes) |
| F16 | Three of four pupil and nostril targets are rejected on the David | Accepted | engine-2 (projection radius); coordinator checks the landmarks after |
| F17 | Gilding paints unrestricted footprints, over polish and onto flesh | Accepted | engine-2 (mask by region and eligible finish) |
| F18 | The last-touches detail says 200 real blows, the data 50 | Accepted | coordinator, fixed in the commit after `81acb40` |
| F19 | A whole-making scrub replays about 19 s on the main thread | Accepted, high: the spec's 3 s budget | engine-2 (chunk-parallel apply; snapshots if still over) |
| F20 | The browser budgets have no enforcing measurement and the slow test's header overclaimed | Accepted in part: the header is corrected; a bounded browser benchmark is recorded as open work in the plan | coordinator (header); open |
| F21 | `sweep.mjs` exits past its cleanup; `capture.mjs` leaks a browser on `newPage` failure | Accepted | page-2 |
| F22 | `sweep.mjs` duplicates obsolete block dimensions | Accepted | page-2 |
| F23 | No writer-to-reader round trip despite the contract's claim | Accepted | engine-2 |

## Verification

- The reviewed revision `81acb40` passed `npm run verify` (244 unit, typecheck, lint, build, 23 e2e) before the review; both audits clean.
- Repairs land in later commits and are listed in the next round with the rerun checks. The coordinator's three repairs (F9 wording, F18, F20 header) are in the commit after `81acb40` on `main`, gated by lint, typecheck and the unit suite.

## Round outcome

Open at the close of this round: F1, F2, F3, F4, F5, F6, F7, F8, F10, F11, F12, F13, F14, F15, F16, F17, F19, F21, F22, F23 (assigned); F20's benchmark is open work. The Claude lane's report and any findings it adds are appended to this round when its run completes; repairs are reviewed in round 1.
