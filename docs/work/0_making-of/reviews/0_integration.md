# Review 0: integration

## Target

The integrated revision of M2: repository `sculpture`, commit `81acb40` on `main` (2026-10-11), the whole tree: the pipeline (`scripts/`), the engine (`src/stock/`, `src/timeline/making.ts`, `src/choreography/`), the tools (`src/tools/`) and the page (`src/main.ts`, `src/viewer/`, `src/ui/`, `src/timeline/player.ts`, `tests/e2e/`), against `docs/design/spec.md`, `docs/design/choreography.md`, `docs/policies/local-rules.md` and `docs/research/decisions.md`.

## Reviewers and coverage

- Codex (`gpt-6-astra`, `model_reasoning_effort=xhigh`, `codex exec --sandbox read-only --ephemeral`, codex-cli 0.158.0), full-codebase lens with in-memory probes on the David grid; read `tsc --noEmit` only, no Vitest, build, e2e or captures. Prompt: `tmp/review-runs/prompt-codex.md` (ignored path; the prompt text is the lens list and the four report sections named below). Sandbox health: no `STATUS_DLL_INIT_FAILED` in the full stdout; the report cites files and lines outside the diff throughout.
- Claude (`claude-opus-5-5[1m]`, `--effort max`, `claude -p` with `Read,Glob,Grep,Task` and read-only git tools, Claude Code 2.1.281), full-codebase lens with four `general-purpose` subagents (page, tools, choreography, pipeline) and throwaway probes on the David grid outside the repo; 97 turns, 56 minutes; the final `result` event's `modelUsage` holds exactly one key, `claude-opus-5-5[1m]`, so the lane counts. It ran the unit suite, typecheck and lint on the HEAD tree (ed27027), no e2e, build, audit or capture.

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

# Review of `sculpture` at 81acb40 (Claude lane, round 0)

**Verdict.** The tree does not yet meet its contract. The biggest problems:
- The last frame is not the David: the finished stone sits about 17 mm proud of the statue, and webs of stone are left between the limbs.
- One mallet cycle plays per planned blow, 42–135 a second, where the spec wants about four visible strikes a second.
- The tools pass through stone and the statue.
- The sling and stump regions paint gold on the shoulder and calf.
- Point blows strike air 17.6 % of the time.
- A forward jump freezes the page for 17–22 s.

**Method.** I reviewed the engine myself. Four `general-purpose` agents covered page, tools, choreography and pipeline, and I re-checked every finding of theirs rated medium or above in the source. Measurements come from throwaway probes run outside the repo:
- the real David grid (`public/model/david.*`) planned and replayed with `DAVID_STEPS`: 21,369 blows, digest e19fb434;
- the synthetic figure at 8 mm: 18,857 blows, digest 402c21d4.

No repo file was changed; `git status` is clean.

**Revision.** HEAD moved to `ed27027` during the review. The new commits changed docs, the last-touches detail text and the slow test's header, and added the Codex round-0 report and a local rule. No plan geometry, engine, tools or page code changed, so every measurement holds at both revisions. Findings the Codex lane also raised carry its number (Codex F#).

**Gates and limits.** On the HEAD tree, 244 unit tests pass and typecheck and lint are clean. I ran no e2e, build, audit or browser capture. So no pixel, frame-rate or browser-memory figure below is a browser measurement.

## 1. Correctness defects

**1.1 High: no finishing step reaches its margin, so the last frame is the David under a ~17 mm skin.**
- **Where:**
  - `src/choreography/generators/combing.ts:24` and `rasping.ts:23` make one pass per listed orientation, and every finishing step lists only one (`david-steps.ts:210, 224, 266, 280, 357, 372, 386`).
  - `bands.ts:74, 91` keep one blow per stride on bands `pitch` apart: 100 mm for the claws and 140 mm for fine-claw-all, against a 16 or 11 mm wedge.
  - `bands.ts:63-67` with `tool-volumes.ts:395`: each blow cuts at most `size` below the stock surface it finds.
- **Measured on the David:** distance from the stone surface to the statue, y 0.3–5.08 m, in mm:

  | After step (margin) | p10 | p50 | p90 |
  |---|---|---|---|
  | sides-point (20) | 16.4 | 20.3 | 26.8 |
  | sides-and-back-claw (4) | 14.2 | 19.9 | 25.0 |
  | fine-claw-all (1.5) | 12.2 | 19.7 | 24.5 |
  | rasp-flesh (0.5) | 8.4 | 17.8 | 23.2 |
  | pumice-flesh (0), unchanged to t = 21 | 5.4 | 16.7 | 22.3 |

  - At t = 21, 86 % of that surface is more than 8 mm proud and 56 % more than 16 mm.
  - About 143 l of stone lies more than 8 mm outside the statue, 110 l of it 10–20 mm out.
- **Why it matters:**
  - choreography.md:45 defines a margin as "the stone left above the final surface at the end of the step".
  - technique.md:67 says the figure is within 1–2 mm after stage 4.
  - spec.md:7 says the finished statue is the last frame.
  - Eyes, lips, fingers and curls are 1–2 cm features, so they are blurred under a skin that is painted with polish codes.
- **Fix:** drive the finishing passes by the allowance left. Repeat crossing passes until `stockAbove(...).depth ≤ margin + cell/4` at every band point, with band pitch no wider than the blade.
- **Gate:** a slow test asserting, per step, p90 ≤ margin + one cell inside the step's region.
- **Overlap:** this adds per-step evidence to plan.md:49 and Codex F15.

**1.2 High: one full tool cycle runs per planned blow, 42–135 a second at 1×, instead of about four visible strikes a second.**
- **Where:** `src/timeline/making.ts:175-177` derives the phase from the planned count; `:199` poses one cycle per blow.
- **What is wrong:**
  - 16 of 21 steps cycle at 38–135 a second (sides-point 132 on the David).
  - At 60 fps every frame shows an unrelated phase: the mallet strobes, the chisel hops a blow per frame, and the strike is never seen.
  - The single nodo blow, by contrast, takes 0.78 s to fall.
- **Why it matters:** spec.md:9 and decisions.md:16 ask for "about four times a second … each visible strike applies a short run of planned blows". spec.md:54 (one window per blow) contradicts spec.md:9, and the code follows :54.
- **Fix:** settle :54 against :9. Then group each stroke's blows into visible cycles of k = max(1, round(blows per second ÷ 4)), applying the run at STRIKE_PHASE. (Codex F1.)

**1.3 Medium: what is shown is not what is cut.**
- **Where:** `src/tools/blow-cycle.ts:141` (`bite(phase) * blow.size`, which is 0.15 m for bulk cuts) and `:143-144` (the drill's plunge).
- **What is wrong:**
  - The engine stops the cut at figure + margin, but the shown tip still goes the full size: more than 4 mm into the statue in 36–201 blows per point step (back-point 119/251).
  - The drill is 15 mm into solid stone at phase 0.475 and is back at the surface at 0.65, when the hole appears.
- **Why it matters:** spec.md:54, "so what is seen and what is cut agree".
- **Fix:** bite only as deep as the actual cut (cap `size` in the planner, or have the engine report the cut depth), and start the drill's plunge at STRIKE. (Codex F3 for the drill.)

**1.4 Medium: the page reports a partial plan, and the default `npm run shots` asks for `t=Infinity`.**
- **Where:** `src/viewer/facts.ts:25, 92`; `src/timeline/making.ts:111-114`; `scripts/capture-shots.mjs:57-59`.
- **What is wrong:**
  - At load only step 0 is planned, so `stepBlowCounts` is [1, 0, …].
  - `0 ?? 1` stays 0, so 11 of 12 follow shots get `t=Infinity`, which `query.ts:109` rejects; they end IGNORED and the run exits 1.
  - `planLength` and `planDigest` depend on where the viewer has been, yet facts.ts:25 calls them the whole plan.
- **Why it matters:** spec.md:121 requires a follow shot per tool. spec.md:50 (plan computed at load) also contradicts spec.md:31 (plan built lazily).
- **Fix:** build the shot set from a `t=N` load, publish `null` for steps not yet planned, and reconcile the two spec lines. (Codex F6.)

**1.5 Medium: a worker error leaves readiness pending forever.**
- **Where:** `src/stock/pool.ts:56-61` drops the failed job without calling `done`; `remesh.ts:151` never clears its `inFlight` entry.
- **What is wrong:** `dirtyChunks` never reaches 0, so `__shotReady` never becomes true, and that chunk is never remeshed again.
- **Fix:** on error, re-queue the job on a fresh worker or mesh it on the main thread. (Codex F7.)

**1.6 Medium: finish codes are blended across each triangle and show tools that never touched it.**
- **Where:** `src/viewer/marble.ts:67` (`varying float vFinish`) and `:113` (`int(finish + 0.5)`).
- **What is wrong:** a triangle whose vertices carry codes 0 and 12 shows bands of codes 1–11 across it, including in the `?finish=1` check view.
- **Fix:** a `flat` varying, or one code per triangle. (Codex F8; verified by reading.)

**1.7 Medium: the figure grid marks as statue some cells the flood fill proved are outside.**
- **Where:** `scripts/lib/model/sample.mjs:145`, `authority === 'flood' ? outside : normalOutside`. `build-grid.mjs:214` picks the pseudonormal sign because the David mesh is watertight, and `sample.test.ts:110-113` pins this rule.
- **Measured:**
  - 38 cells the flood reached are stored negative (inside).
  - 11 of them lie inside the block, e.g. behind the right shoulder at (−0.49, 4.508, −0.33), with winding number 0. The carving can never remove them, so they stay as flecks of marble off the statue.
  - My replay found the other 27 below the block's floor, up to 6.65 cells "inside".
- **Why it matters:** spec.md:44 says the sign comes from a flood fill from outside.
- **Fix:** `finalOutside = outside || (authority === 'flood' ? false : normalOutside)`, fail the build when a flood-reached cell ends negative, and fix the test. Do not switch to flood only: 114 cells the flood cannot reach are real pockets between the right hand and the thigh.

**1.8 Medium: query problems miss unknown keys and an out-of-range `t`.**
- **Where:** `src/viewer/query.ts:6` claims "a typo in a capture URL is reported". `src/main.ts:95` clamps `t > N` silently. `scripts/capture-shots.mjs:86-88` never compares the rendered `t` with the one asked for.
- **What is wrong:** `setp=5`, `veiw=head` and duplicate keys are dropped silently, and the shot is reported ready.
- **Why it matters:** spec.md:90 says `queryProblems` lets a harness tell a wrong shot from the one asked for.
- **Fix:** report keys outside the known set and `t > N`, and compare `result.facts.t` with the requested value.

**1.9 Medium: chips vanish in mid-air and at every step boundary.**
- **Where:** `src/timeline/making.ts:52` (`CHIP_LOOKBACK = 64` blows), `:206` (reads only the current step's plan), `:212`; `src/tools/chip-burst.ts:14` (`FADE_START = 1.0` whatever the height).
- **What is wrong:**
  - 64 blows cover only 0.47–0.98 s in the dense steps, against FADE_END 1.5 s. At mid sides-point, 486 chips are dropped, 317 of them still in the air.
  - Every chip disappears when `t` crosses an integer.
  - Chips from blows 4–5 m up are still falling when their fade starts.
- **Why it matters:** spec.md:64 says chips are "ballistic with a floor bounce, fading on the ground".
- **Fix:** look back by time across the previous step, and start each chip's fade at its own settle time.

**1.10 Medium: several tests prove less than their headers claim.**
- **david-steps.test.ts:**
  - `:3` claims the blows are within scaffold reach and the tool axis points into the stock.
  - `isReachable` (`blow-cycle.ts:239-243`) is true at all 147,870 lattice points inside the block, so `:108` can only fail for −0.02 ≤ y < 0.
  - `:109` measures the angle against the blow's own stored normal, not the stock.
  - `:96` passes a cutting step that only paints.
  - Margins, regions, spans, the detail text's numbers and the end state are never checked. (Codex F10.)
- **chips.test.ts:56** claims every chip lands before it fades, but it tests blows at 0.05–1.5 m and looks at 1.49 s, not at FADE_START.
- **Grid format:** `contracts/grid.ts:3` and spec.md:35 claim the writer and reader are each tested against the other's fixture; neither is (`grid-writer.test.ts:2`, `src/stock/grid.test.ts:7`). (Codex F23.)
- **e2e budgets:** spec.md:116 says the e2e suite measures the timings; no spec does. (Codex F20.)
- **e2e capture:** `__shotSeek` and its re-arm are never driven by e2e, and `tests/e2e/helpers.ts:106` accepts any day, date and stage in the label.
- **Pinned constants** (the pattern docs/learning/lessons.md warns about): `grid-writer.test.ts:26`, `harness.test.ts:10, 40`, `catalog.test.ts:77-82`.
- **Bulk-cut size:** the two copies of `BULK_CUT_SIZE_M` are compared only in `david-steps.slow.test.ts:38`, which `verify` skips, though `tool-volumes.ts:41` says "the tests check this".
- **budgets.test.ts:6** cites `src/choreography/dev-steps.test.ts`, which does not exist.
- **sample.test.ts:12-16** uses a symmetric cube, so a swapped axis would still pass.
- **Fix:** narrow each header or add the check, and delete the pinned lines.

**1.11 Low: contract wording and player logic.**
- spec.md:27 at 81acb40 stated the literal `stock <= figure` (Codex F9). 8613a83 restated the bound, but no test of the restated bound exists yet.
- `src/timeline/player.ts:101, 106`: pressing step in the opposite direction while the target is two or more integers away stops at a non-integer `t`.
- `src/main.ts:160-165`: the facts are published after `player.seek` but before `making.setTime`, so they briefly mix the new `t` with the old blow count.
- `src/main.ts:227`: `?t=` or `?step=` without `autoplay=0` still autoplays, against spec.md:72. (Codex F4.)

## 2. Authenticity defects

**2.1 High: tool shafts, the mallet and the carries pass through stone and the statue.**
- **Where:**
  - `src/contracts/making.ts:117`: `posesAt` never sees the stock.
  - `src/tools/blow-cycle.ts:128`: a carry is a straight move lifted at most 0.35 m.
  - `:194`: the swing side is chosen as the normal plus 0.5 up.
  - `:6` claims handle and head "never pass through stock".
- **Measured on the David (tools lens):**
  - The mallet is inside stone in 155/1,098 claw-front, 263/1,862 sides-and-back-claw and 240/1,706 fine-claw-all blows.
  - On downward-facing blows it hangs 49–55 mm inside the statue's head.
  - back-point's 4.94 m carry runs at least 128 mm inside the statue.
- **Why it matters:** spec.md:62; local-rules.md:5.
- **Fix:** pass a stock sampler to `posesAt`, choose the swing side and carry route by sampling it, and add a test that no shaft or mallet sample lies deeper than 1.5 cells. (Codex F12.)

**2.2 High: the sling and stump regions are boxes that swallow flesh, so gold lands on the shoulder and calf.**
- **Where:** `src/choreography/regions.ts:41, 43` (the boxes), `:47-53` (FLESH excludes them); `generators/gild.ts:15` has no finish mask, against choreography.md:81.
- **Measured on the David:**
  - SLING holds about 1.1 m² of surface and STUMP about 1.6 m², covering the left shoulder, upper arm, upper back, and the right lower leg.
  - Gilding covers 58 % of both. That flesh is never rasped or polished.
  - At t = 21 the sling box carries 8,677 gilt cells and the stump box 13,730.
- **Why it matters:** david-history.md:148, :194 say only the strap and the trunk were gilded.
- **Fix:** masks taken from the figure, used for both the regions and the gilt paint. (Codex F17 covers only the missing finish mask.)

**2.3 High: stone webs between parts of the figure are never cut away.**
- **Where:** `generators/furrows.ts:93` stops a column at the first figure contact; `surface.ts:96` searches for stone along the figure normal through other body parts.
- **Measured on the David:** about 0.49 m² of the statue faces another body part across unbroken stone, with gaps of 16–188 mm:
  - between the feet, 188 mm;
  - behind the right lower leg, a 0.2 l web up to 86 mm from the statue;
  - the inner right thigh, 74 mm;
  - the right hand at the thigh, 58 mm;
  - the right arm, 64 mm.

  No drill target lies between the legs.
- **Why it matters:** local-rules.md:6, :8; technique.md:77.
- **Fix:** a web-clearing pass planned from each gap's open side, drill rows between the legs, and an end-state test.

**2.4 High: 17.6 % of shown blows strike air.**
- **Where:** `furrows.ts:65`: passes advance 0.75 × size while the crater takes the full size. `:81, :113`: column entries and the air check use the step's starting stock.
- **Measured on the David:** 3,754 of 21,369 blows remove nothing, about 36 s of playback.
  - sides-point's right face: 1,300/1,656.
  - sides-point's top face: 1,191/1,274, whose columns run the whole block height, so tips are struck down near the floor.
  - back-point: 202/251.
- **Why it matters:** contracts/making.ts:20 puts a blow's point on the current stock surface.
- **Fix:** plan against an evolving stock, step by the full size, and limit the top face to the crown. (Codex F11.)

**2.5 Medium: the carry from the bench is skipped, and tools jump metres between frames.**
- **Where:**
  - `src/main.ts:249-259`: the slow-down uses the previous frame's `current`, which is null at an integer `t`.
  - `making.ts:174, 199`: `previous` is null at a step's first blow.
  - `src/viewer/rig.ts:44`: tools not posed snap to the bench.
  - `blow-cycle.ts:229-232`: the between-stroke carry time is never used by the page.
- **Measured:**
  - Starting from rest at 1×, the carry never engages on 15 of 21 steps.
  - At t = 3 the point and mallet move 3.8 m in one frame.
  - Between strokes, carries of up to 5.47 m take 2–7 ms.
- **Why it matters:** spec.md:54, :62; decisions.md:35.
- **Fix:** apply the slow-down inside the player as a rate depending on `t`, carry an unchanged tool on from the previous step, and test continuity across `t = k`. (Codex F2.)

**2.6 Medium: roughing ignores the region filters, so one band is cut 0.87 m deep while the band above is still block face.**
- **Where:** `furrows.ts:50-60, 78-79` read only the region's box; its `contains` filter is never called.
- **Measured:** high-points removes 3.13 m³ before chest-and-face starts.
- **Why it matters:** technique.md:33 (Vasari: the figure comes out "evenly and in a horizontal position").
- **Fix:** one layered pass over all the front bands, with passes as the outer loop.

**2.7 Medium: the crown loses its crust, and the hair ends rasped and polished.**
- **Where:**
  - Crown: sides-point's top face (`david-steps.ts:238`); HOLLOWS includes HEAD (`regions.ts:88`); last-touches includes HAIR (`:408`).
  - Hair: `regions.ts:33` hands down-facing curls to FLESH, and `src/stock/carve.ts:175` paints every cell a tool reaches, whatever its region.
- **Measured on the David:**
  - No crown cell keeps the crust code, and 85 % of the crown ends 20–40 mm proud.
  - Only 37 % of the hair keeps tooth, roundel or drill texture.
- **Why it matters:** technique.md:109, :131.
- **Fix:** keep these steps off the crown, define HAIR by a mask, and clip each step's paint to its region.

**2.8 Medium: the pupil and nostril targets miss the face.**
- **Where:** `david-steps.ts:103-110` (the landmarks were not measured on this mesh); `surface.ts:81-89` with `src/stock/grid.ts:105` (beyond the figure's band the gradient falls back to +Y, so each round of projection slides a target 128 mm down).
- **Measured:** one pupil target drops 0.384 m, off the face. One blow survives, 0.14 m from its target.
- **Why it matters:** technique.md:75 says the pupils were drilled.
- **Fix:** measure the landmarks on the David, have `projectToFigure` return null beyond the band, and test each named target. (Codex F16.)

**2.9 Medium: the point's pyramid, the drill bit and the charcoal tip are modelled upside down.**
- **Where:** `src/tools/geometry/parts.ts:30-34`, used by `chisels.ts:22` and `drill.ts:29`; `abrasives.ts:56-57` for the charcoal.
- **What is wrong:** three.js's `ConeGeometry` has its apex at +y. Shifting it up by half its height puts the 7.5 mm square base at the working tip and the apex 35 mm up the shank. I verified this by building the geometry.
- **Why it matters:** spec.md:60 puts the working tip at the origin.
- **Fix:** `rotateX(Math.PI)` before the shift, and assert the apex is at the origin. (Codex F14.)

**2.10 Medium: the rubbing tools sit half inside the stone.**
- **Where:** `blow-cycle.ts:88-92` puts the tool's axis on the surface point.
- **Measured:** the straw bunch's underside is 17 mm below the face (800 of 806 polish blows), and the rasp's teeth start 5.5 mm under it.
- **Fix:** offset each tool along the normal by its working face's distance.

**2.11 Medium: the reach check can never fail, and it does not match the drawn scaffold.**
- **Where:** `blow-cycle.ts:38, 239-243` assumes decks on four sides; `src/viewer/yard.ts:16` draws decks on the front and sides only, half a metre clear of the block.
- **What is wrong:** blows facing the back above 2.35 m are likely out of reach: 102 of 251 in back-point. That count depends on the reach model, so it is plausible rather than proven.
- **Why it matters:** spec.md:62; technique.md:23.
- **Fix:** share the deck geometry between the page and the tools, and add a negative test inside the block. (Codex F13.)

**2.12 Medium: the real-blows figure follows no single rule and contradicts itself on screen.**
- **Where:** `david-steps.ts:22-24, 67` divide by hand-set `shown` guesses, not by the planned count that choreography.md:45 names.
- **What is wrong:**
  - Five detail texts state a number next to the label's real figure: `:158` and `:173` say "about 200" against 384; `:202` 330 against 608; `:216` 350 against 630; `:286` 1,260 against 2,565.
  - choreography.md:45 calls the rate "documented", but tools.md:25 and :101 say no source gives one.
  - decisions.md:27 sets another rule, which only `catalog.ts:83-85` follows, and nothing on the page reads that value.
  - `tool-volumes.ts:44` cites "about a thousand", which decisions.md does not say.
- **Fix:** one rule in decisions.md, computed from the planned count, and no number in the detail text.

**2.13 Medium: last-touches strikes the polished face with a toothed chisel.**
- **Where:** `david-steps.ts:408-416`.
- **What is wrong:** 7 % of the face ends with claw marks over the polish.
- **Why it matters:** tools.md:107.
- **Fix:** use a file or an abrasive on the face, and leave out the crown.

**2.14 Medium: the dust puff is missing.**
- **Where:** spec.md:64 requires it; nothing in `src/` implements it and no decision defers it.
- **Fix:** implement it or record the deferral in decisions.md.

**2.15 Medium, plausible: the detail line is cut off before the tool names and the real-blows figure.**
- **Where:** `src/ui/style.css:105-107` (`nowrap`, `ellipsis`) with `label.ts:73`.
- **What is wrong:** the lines run 221–299 characters, and about 214–240 fit at the 1,400 px capture width.
- **Why it matters:** spec.md:68 requires both in the detail.
- **Fix:** let the line wrap, or put the tool and the figure first. One screenshot would settle this.

**2.16 Low: calendar and doc drift.**
- technique.md:15 says 697 days; 28 Feb 1502 to 25 Jan 1504 is 696.
- The coarse claw gets 55 days, not 62 (7/19 of 168).
- choreography.md:7 and decisions.md:17 start the day count on 13 September; the code (`label.ts:9`) and spec.md:9 start it on 9 September.
- The first on-site step starts 8 June, though choreography.md:19 puts the start of on-site at 14 May.
- principal-view's margin is 30 mm in the code (`david-steps.ts:146`) against 0 in the table.
- The Regions table and the 18,848 blow count are stale.
- `:363` puts the 23 June 1503 showing in file-details, whose span starts 19 July; it falls in rasp-flesh.
- spec.md:120 says every step removes stock, which is false by design for charcoal, polish and gilding.

**2.17 Low: departures not written down.**
- 70 % of the point's blows are 85° bulk cuts, against technique.md:123. The 0.36 m crater is recorded only in a code comment.
- The block starts as a clean box, ignoring Agostino's roughing (david-history.md:56).
- Some detail texts describe marks that are never made, such as "crossing bands" at `:258`.
- Tool sizes against their source lines: the two-tooth notch is 3.85 mm against 4–6 mm, the file is built flat although its source says half-round, and the thickest chip is about 19 mm against 6–8 cm.
- The drill's angle range (`blow-cycle.ts:58`) allows 46–89°.
- The "Hands" preset (`presets.ts:37`) leaves the left hand out of frame (computed, not rendered).

## 3. Performance and budget risks

**3.1 High: a forward jump replays every blow in one frame, taking 17–22 s.**
- **Where:** `src/timeline/making.ts:160-165` → `:276-286`, called from `main.ts:260`.
- **Mechanism:** a 0.15 m bulk blow (`david-steps.ts:17`) makes a 0.36 m crater, about 132,000 cells per blow, against the 500–4,400 that engine-options.md:142 assumed.
- **Measured (Node):**
  - Replay from 0 to N takes 16.6 s on the David and 22.2 s on the synthetic figure.
  - Each bulk blow costs 3.4–3.8 ms.
  - Undo from N back to 0 takes 1.4 s.
- **New triggers:**
  - Loading at `t=N` runs the whole replay before the first frame (`main.ts:128`), so every late capture breaks the 5 s first-frame budget.
  - Play backward at `t = 0` jumps to N (`main.ts:195`).
- **Why it matters:** spec.md:56 ("progressively") and :116 (under 3 s).
- **Fix:** spread the replay across frames, add the snapshots decisions.md:10 allows, and make Play backward at `t = 0` do nothing. (Codex F19.)

**3.2 Medium: the undo log is 5–15× its estimate, and nothing measures memory.**
- **Where:** `src/stock/carve.ts:118-122, 177-191`.
- **Measured:**
  - At t = 21 the undo log holds 351.5 MB on the David and 343.7 MB on the synthetic figure, about 94 KB per bulk blow.
  - decisions.md:10 estimated 20–72 MB.
  - Unchanged runs of stone are recorded at most 4 cells long, so they cost 2 bytes a cell, not "near 1" as `carve.ts:6` says.
- **Estimate, not measured:** with the grids (184 MB) and the 120–143 MB of chunk copies made at each full remesh, the page uses roughly 0.7–0.8 GB. At the 60,000-blow budget the undo log alone would reach about 1 GB.
- **Fix:** a budget test on `undoBytes` and the heap, and record unchanged stone in row-long runs.

**3.3 Medium: little frame-time headroom at 1×, and none of it is measured.**
- **CPU:** applying blows costs 4.3 ms per frame at 1× during roughing, and 13–17 ms at 4×. Planning the next step runs inside a frame at each step boundary, up to 0.13 s.
- **GPU (by reading three.js r186):** `transmission: 0.08` (`marble.ts:235`) adds a full extra render pass every frame, and the shadow map re-renders every frame.
- **Fix:** an e2e budget spec on the David grid, and plan the next step one step ahead.

**3.4 Low: the 60,000-blow budget is checked only on the synthetic figure.**
- **Where:** `david-steps.slow.test.ts:49`.
- **What is wrong:** the page runs the David plan, which no test checks. It is 21,369 blows (under budget), but some steps plan up to 5.6× the synthetic count (roundel-hollows 431 against 77).
- **Fix:** add the David case to the slow test, run when `public/model/` exists.

## 4. Smaller issues

- **Two lattice conventions:** the pipeline anchors the lattice at the block's corner (`sample.mjs:21-22`); the engine centres it (`grid.ts:139-145`). The David's block comes out 4–6 mm too large, and nothing compares a header with BLOCK_M. Fix: one shared lattice function in `src/contracts/grid.ts`.
- **Bulk-crater bounds (latent):** `tool-volumes.ts:242` is not a bound for a slanted tool axis. A probe shows the crater up to 36 mm outside its box, beyond the loop's 24 mm padding, at a 45° axis. Today's blows are at most 5° off a face normal, so nothing is cut short yet. Fix: `hypot(max(size, AIR), radius)`.
- **Rasp volume:** the rasp, file and pumice volume (`tool-volumes.ts:381, 395`) is open up to about 7 cm above the surface, so in a hollow it can cut and paint the facing surface.
- **Follow camera:** it ignores `StepDef.focus` and the blow normal (`main.ts:264`, `follow.ts:69`). This matters more under ed27027's new local rule.
- **Controls:**
  - After a scrub, Space does nothing and the arrows nudge `t` by 0.001 (`keyboard.ts:15-19`).
  - A click or a wheel zoom turns follow off (`follow.ts:52-57`).
  - Choosing the stage that is already shown does nothing (`menus.ts:41-43`).
  - The label is `aria-live` while it changes about 4 times a second (`timeline-bar.ts:62`).
- **Licence:** the footer never shows the licence link (`footer.ts:19-30`), which CC BY-SA 4.0 asks for. `build-grid.mjs:228-229` writes no source block when SOURCE.json is missing.
- **Restated constants:**
  - `STRIKE` (`blow-cycle.ts:21`) repeats `STRIKE_PHASE` with no test tying them.
  - `DECK_LEVELS` (`yard.ts:16`) repeats the tools' scaffold decks.
  - The three-quarter pose appears three times.
  - `sweep.mjs:37-40` keeps the old block size (Codex F22).
  - `src/stock/dev/main.ts:22-23` repeats the model path and the ready-frame count.
- **Dead code:** the catalog's `blowsPerShown` (`catalog.ts:84`); `REGIONS` (`regions.ts:102`); `marble.ts:271`; `scene.ts:15, 42`; `follow.ts:26-27`.
- **Stale comments:**
  - `contracts/grid.ts:39` and decisions.md:22 justify the 16-cell band with a cut depth of about 80–110 mm; cuts are now 150 mm. The real need is 54 mm (largest margin 30 mm plus the stock's 24 mm band), so 16 cells still suffices.
  - spec.md:37 and decisions.md:8 still say 32 cells.
- **Robustness:**
  - `scene.ts:105-109`: one exception in a frame stops the render loop for good.
  - `main.ts:121-124`: a failed load leaves a blank page.
  - `capture.mjs:87`: a failed shot is saved under the requested file name.
  - `build-grid.mjs:91-93`: the mesh is never hashed.
  - `stl.mjs:23-25`: a truncated binary STL can be read as an empty text file.
  - `bvh.mjs:217`: the traversal stack has no overflow guard.
  - `raster.mjs:12`: the silhouettes' "left" and "right" show the opposite flanks from the page's presets of the same name.

## Checked and found sound

- **Carving rule:** `src/stock/carve.ts:169-171` implements `max(stock, min(-tool, figure - margin))`; no cell ever drops, and the restated invariant holds step by step.
- **Skipping work safely:** the block skip (`carve.ts:133-149`) is safe. Every tool volume is 1-Lipschitz except the rasp slab, about 1.24, and the 1.5-cell slack covers that.
- **Undo:** it is exact (`carve.ts:224-240`; `making.ts:267-287`), and the 50-move history test compares hashes (`making.test.ts:99-125`).
- **Strike phase:** a blow's cut applies exactly when its window passes STRIKE_PHASE (`making.ts:181-183`, `:229-236`). The mallet first reaches the chisel head at exactly 0.65, and the bite is 0 before that (`blow-cycle.ts:151-156`).
- **Determinism:** each step is planned from the stock left by exactly the earlier steps (`making.ts:239-246`), seeds come from `seedOf(id)`, and no generator uses `Math.random` or `Date`. Both digests were stable across runs.
- **Meshing and capture readiness:** `chunks.ts:41-60` marks every chunk that shares a changed plane. Stale meshes are resubmitted (`remesh.ts:157-167`). `__shotReady` waits five frames with nothing pending (`main.ts:267-274`), and `preserveDrawingBuffer` is on (`scene.ts:50`).
- **Grid loading:** `src/stock/grid.ts:233` cannot mistake a valid grid for gzip, and `:219-223` reject a truncated or altered file.
- **Model fetch:** `scripts/fetch-model.mjs:73-91, 98-125` checks size, SHA-1 and licence, hashes the downloaded bytes, and uses a User-Agent with no email address.
- **Query parsing:** `src/viewer/query.ts:106-114` and `:72` are correct, and `step` wins over `t` (`main.ts:84-96`).
- **Label:** `label.ts:9, 44-53` gives Day 1 = 9 Sep 1501 and Day 1096 = 8 Sep 1504, with 1504 a leap year.
- **Order and sizes:** stage order, margins and catalog dimensions (`catalog.ts:87-258`) match technique.md and tools.md.
- **Ownership:** `src/tools` and the engine do not import each other.
- **Repo-rule detectors:** each detector in `src/repo-conventions.test.ts:173-217` goes red on bad input.

## Findings and disposition

Finding ids follow the Codex report's numbering (F1 = its item 1) and the Claude report's section numbers (C1.1 = its section 1.1); a finding both lanes raised keeps the F id and the Claude row adds only what is new. Dispositions are the coordinator's; the owner column names who repairs.

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
| C1.1 | The finished stone sits about 17 mm proud of the statue (p50 16.7 mm at t = 21; 86 percent of the flesh over 8 mm) | Accepted, high: the same defect as F15 with the measurement that sizes it | engine-2 (coverage-driven finishing passes; a slow test asserting p90 within margin plus one cell per step) |
| C1.3 | The shown bite goes the full size into the statue, and the drill plunges before the hole | Accepted | tools-2 (drill feed; bite capped to the cut) |
| C1.7 | 38 cells the flood fill proved outside are stored inside the figure (11 inside the block) | Accepted | pipeline follow-up: a flood-reached cell never ends negative; the sign test's cube made symmetric |
| C1.8 | Unknown query keys and `t > N` go unreported; the capture script never compares the rendered t | Accepted | page-2 |
| C1.9 | Chips vanish mid-air and at every step boundary | Accepted | engine-2 |
| C1.10 | Several tests prove less than their headers (reach that cannot fail, angles against the stored normal, pinned constants, a missing file cited) | Accepted | engine-2, tools-2, page-2 per file; the pinned-constant lines fall under the lesson in docs/learning/lessons.md |
| C1.11 | Player step-retarget stops at a non-integer; facts published between seek and setTime | Accepted | page-2 |
| C2.1 | Tool shafts, the mallet and the carries pass through stone and the statue (the mallet inside stone in 155 of 1,098 claw-front blows) | Accepted, high | engine-2 (stock normal) and tools-2 (clearance, swing side from the stock) |
| C2.2 | The sling and stump boxes cover the shoulder, upper back and calf, so gold lands on flesh and that flesh is never finished | Accepted, high | engine-2 (masks from the grid); coordinator (choreography.md notes it) |
| C2.3 | Stone webs between the feet, behind the right leg, at the inner thigh, the hand and the arm are never cut | Accepted, high | engine-2 (web-clearing pass, drill rows between the legs, end-state test) |
| C2.5 | The carry never engages from rest on 15 of 21 steps; tools jump metres between frames | Accepted | page-2 |
| C2.6 | Furrows ignore the region predicate; high-points cuts a band 0.87 m deep under block face | Accepted | engine-2 (layered passes over the whole front) |
| C2.7 | The crown loses its crust; only 37 percent of the hair keeps tooth texture | Accepted | engine-2 (clip paint and cut to the region; HAIR as a mask) |
| C2.8 | `projectToFigure` slides targets 128 mm down beyond the band | Accepted | engine-2 |
| C2.10 | The rubbing tools sit half inside the stone | Accepted | tools-2 |
| C2.12 | The real-blows figure follows no single rule and the detail texts contradict the label | Accepted: the numbers are out of the details (commit after `8dc46ab`), the rule is in decisions.md, the engine-computed ratio follows | coordinator now; contract change next round |
| C2.13 | Last touches strike the polished face with a toothed chisel | Accepted: the step now uses the file | coordinator (same commit) |
| C2.14 | No dust puff | Accepted as a recorded deferral | decisions.md |
| C2.15 | The detail line is cut off before the tool names | Accepted | page-2 |
| C2.16 | Calendar and doc drift (696 days, the coarse claw's days, the day origin, the on-site start, the charcoal margin, the showing's step) | Accepted | coordinator (same commit) |
| C2.17 | Departures not written down (bulk cuts, the clean box against Agostino's roughing, tool size nits, the hands preset) | Accepted: recorded in decisions.md; Agostino's roughing becomes a setup step next round; the nits go to tools-2 and page-2 | coordinator, tools-2, page-2 |
| C3.2 | The undo log is 351 MB, five to fifteen times the estimate | Accepted | engine-2 (row-long runs; a budget test) |
| C3.3 | Frame-time headroom unmeasured; transmission adds a render pass | Accepted as open work | plan |
| C3.4 | The blow budget is checked only on the synthetic figure | Accepted | engine-2 |
| C4 | The two lattice conventions, the latent crater bound, the open rasp volume, the follow camera ignoring focus, the missing licence link, restated constants, dead code, stale comments, robustness | Accepted item by item: the licence link, the follow camera and the controls to page-2; the crater bound and the rasp volume to engine-2; the lattice function, the stale comments and the dead code to the next round | page-2, engine-2, next round |

## Verification

- The reviewed revision `81acb40` passed `npm run verify` (244 unit, typecheck, lint, build, 23 e2e) before the review; both audits clean.
- Repairs land in later commits and are listed in the next round with the rerun checks. The coordinator's three repairs (F9 wording, F18, F20 header) are in the commit after `81acb40` on `main`, gated by lint, typecheck and the unit suite.

## Round outcome

Both lanes read the code and agree on the high findings: the finishing margins, the tools through stone, the furrows striking air, the gilding on flesh, the replay time. Open at the close of this round: F1 to F8, F10 to F17, F19, F21 to F23 and C1.1, C1.3, C1.7 to C1.11, C2.1 to C2.3, C2.5 to C2.8, C2.10, C2.15, C3.2, C3.4 and C4's assigned parts (assigned to engine-2, tools-2 and page-2, in flight); F20's benchmark, C3.3, the ratio contract change, Agostino's roughing step and C4's deferred parts are open work in the plan. Repairs are reviewed in round 1 against their commits.
