# Animated making of a famous sculpture

Status: active
Owner: Coordinator (Claude Code desktop session, 2026-10-11)
Created: 2026-10-11
Updated: 2026-10-15

## Problem and outcome

The owner asked for a 3D animation of a sculpture being made with the actual physical tools, the tools working in mid air with no person shown and everything else authentic, as a new fleet repo with its own rules, built step by step after thorough research. Outcome: a browser page that carves one famous single-figure statue from its stock with the period's real tools in the documented order, playable forward and backward and scrubbable, checked against photographs of the real statue. The contract is `docs/design/spec.md`.

## Scope

Included: research (candidates and the pick, the statue's history and dimensions, the carving technique and tool kit, the mesh source, the engine options); fleet onboarding; toolchain and gates; the carving engine; the tool models and their motion; the model pipeline from the recorded mesh source; the stage choreography; the page and timeline; capture tooling; repo docs.

Excluded: a sculptor or hands; photo textures; deployment (needs the owner's authorization); any other statue.

Dependencies: research runs first and settles the pick, the tool kit and the stage order; the scaffold precedes the engine, tools and page; the choreography needs the engine, the tools and the model pipeline. The fleet census entry for `sculpture` is in fleet's `scripts/lib/fleet-repos.mjs`.

## Approach

The coordinator plans, owns the contract and the stage list, and delegates every non-trivial change. Workers run in their own worktrees under `../sculpture-worktrees/`, commit on their own branch and hand off; the coordinator reviews each handoff, runs the gates and merges to main.

The stock is a signed-distance grid; a tool stroke removes material inside the tool's swept volume but never below the statue's own surface, so the figure emerges exactly where the record puts it. Stages follow the documented sequence of tools and are data, not engine code.

Milestones (R6): M1 fleet onboarding, research and contract; M2 scaffold, engine, tools, model pipeline, page; M3 choreography of every stage, visual audit against the references, review and fixes. Each is merged to main once green.

## Acceptance criteria

- `docs/research/` records the pick with the comparison it won, the statue's history and dimensions with sources, the tool kit and stage order with sources, the mesh source with its licence, and the reference images by URL.
- The page loads at `t = 0` and carves the whole statue; every control and keyboard shortcut works through real input, checked by Playwright.
- Backward playback is exact: the state at any `t` is a pure function of `t`, asserted by a determinism test.
- Only tools, stock and chips appear; each tool is the real kind at a documented size and moves as held and struck; each stage names its source. Checked by the stage data tests and by looking at captures.
- The finished statue matches the reference photographs from the fixed capture angles; each modelling handoff names the images compared with.
- Gates green on the merged revision; independent review of the integrated change with findings resolved; merged to main and pushed; worktrees removed; devlog line written.

## Implementation steps

- [x] Repo docs base, fleet census (fleet `3570860`), work folder (coordinator).
- [x] Research, merged to main: `choice.md` and `david-history.md` and `references.md` (worker `research-candidates`, `8b9a5ab`); `tools.md` and `technique.md` (worker `research-technique`, `8dab0ba`); `mesh-sources.md` (worker `research-model`, `508a498`); `engine-options.md` (worker `research-engine`, `de69be2`). The pick is Michelangelo's David; it won every criterion.
- [x] Contract: `docs/design/spec.md`, `src/contracts/`, `src/david/frame.ts`, `docs/research/decisions.md`, `src/choreography/stages.ts` (coordinator). The block's depth stays provisional until the pipeline measures the figure.
- [x] Scaffold: toolchain, gates, query reader, placeholder yard (worker `scaffold`, `5777593`, merged).
- [x] Model pipeline: fetch the recorded mesh, normalise, build the 8 mm grid (worker `model-pipeline`, `eb7ca0c`, merged `1530547`; the grid is rebuilt on main at band 16: 36.7 M cells, 17 MB gzipped, volume within 0.01 percent of the mesh).
- [x] Engine: grids, carving rule and tool volumes, chunked meshing in workers, undo log, Making, generators, dev page (worker `engine`, `a8b1d27`, merged `fd526d9`; 46 engine tests; captures looked at by the worker and the coordinator).
- [x] Tools: catalog, procedural tool models at documented sizes, blow cycle, chips, gallery (worker `tools`, `e3d953a`, merged `c77bb65`; 111 unit tests; 42 captures looked at by the worker, three by the coordinator).
- [x] Page: yard and shed, marble, player, timeline bar and menus, presets, capture, sweep and video scripts, e2e against a stub (worker `page`, `868ad4e`, merged `cfc1f77`; 198 unit and 23 e2e tests; captures looked at by the worker and the coordinator).
- [x] Integration of M2: the engine and tools wired into the page (`1261072`), e2e data-driven on the synthetic figure (worker `page`, `245423f`), the loader's double-inflate blocker fixed, the David grid carved and captured at the stage boundaries (coordinator, 2026-10-11).
- [x] Choreography of the David: the 21 steps of `docs/design/choreography.md` in `src/choreography/david-steps.ts` over `regions.ts` (`24525de`; 18,848 blows at 8 mm; the region cap at the statue's height, which left a slab floating over the head, raised to the block's top).
- [x] Independent review of the integrated revision `81acb40`, both lanes (Codex Astra at xhigh, Claude Opus 5.5 at max): `reviews/0_integration.md`, 23 and 17 findings, all accepted and assigned; the coordinator's data and doc repairs landed in `5e60346`; the tools' repairs (cone tips, drill feed, approach clearance, the scaffold model behind the reach check, rubbing-tool offsets, sizes) landed in `781c8e0`.
- [x] Page repairs merged (`97f0b3a`, worker `page-3` on `page-2`): the spans between the camera and the stock hide with a Yard toggle (owner steering), the licence link, no autoplay with a position, the carry from rest and across steps (the current blow carries its predecessor), explicit `cam=` kept or reported, the capture set from `t = N`, discrete finish codes, the sweep cleanup, play guards, the follow camera from focus and normal; 304 unit and 30 e2e green.
- [x] Engine repairs merged (`3ab8355`; workers `engine-2`, `engine-3`, `engine-4` and their helpers, each cut off once or twice by session limits and continued on the same branch): the planner carves a scratch stock so blows hit stone; the point layers the front from the high points outward with furrows along the form (owner steering; the t = 5 capture shows a half relief, no rows); the finishing passes reach their margins (p50 0.1 mm against 16.7 mm); jumps carve chunk by chunk in workers; strikes group into visible cycles; sling, stump and hair masks probed on the grid; drill landmarks from the probed head; a sweep of loose stock at every step boundary (the floating flakes are gone at t = 21); the segment undo record (174 MB on the David). Verify green (379 unit, 30 e2e).
- [x] Round 2, engine A (generators and kernel): the slow test's floor stubs (stone standing on the block's floor without figure cells, 47 and 63 cells on the David, left by the coarse 2 cm planning scratch); the class gate for the row-by-row defect (`docs/learning/defect-register.md`); bulk cuts that read as a pitted field, not smooth spherical bowls; the web-clearing pass and drill rows between the legs; paint clipped to each step's region; the real-blows ratio computed from the planned count; Agostino di Duccio's 1464 to 1466 roughing of the legs, feet and lower trunk with the hole between the legs as the first step. State on 2026-10-14, after the session limit cut the worker off: items 1 to 4, 6 and 7 committed on `engine-a` (`3922ceb`, with a review of items 1 to 3 and 7 repaired in `2d6b64b`); item 5 uncommitted in `engine-a-paint` with its test green; main (engine B) not yet merged in, `PLAN_VERSION` not yet bumped. Resumed by the coordinator of 2026-10-15 and merged `fce0dfb`: 434 unit and 33 e2e green, the slow suite green on both figures, `PLAN_VERSION` 2 (28,986 blows, 66 snapshots, all matched by `npm run model:verify`).
- [x] Round 2, engine B (timeline and build): a plan file and step-boundary snapshots built by `npm run model`, so a jump loads the nearest snapshot and replays at most a bounded segment (merged `b1c7f16`; a jump from 0 to N 1.65 to 2.3 s from 53.5 s; review `reviews/1_implementation.md`).
- [x] Round 2, page: realistic marble veins, the point finish as irregular pits, the geometric class gate for the fences defect, the pinned-constant and wall-clock detectors, dust puffs for the point and the drill, the label for dates before 9 September 1501 (merged `bcbe540`); follow-ups: bridges laid only when the work needs them, `npm run fps`, the keyboard after a scrub (merged `a4e25cd`).
- [x] Round 2, page-5: a first visit with an empty shader cache is ready in under 5 s (9 to 12 s of the marble's compile on first use, found by engine B). The baseline was measured before the session limit (ready 9.3 to 12.1 s, longest main-thread task 6.7 to 9.7 s); resumed by the coordinator of 2026-10-15 and merged `a09a5f8`: ready 2.4 to 3.0 s, no compile over about 70 ms, captures pixel-identical.
- [ ] Open from the round-2 integration (coordinator, 2026-10-15): the gilding covers the stump only in patches beside the calf (the leaf cannot lie where the region is narrower than its footprint); a flat-faced remnant between the right hand's fingers at the thigh; a stepped crust edge on the crown; the nodo plans 11 shown blows on the David where the record has one or two; `src/tools/catalog.ts` still carries the eight-hour real-blows figure; one random jump at 3.03 s on a busy machine, to measure again quiet.
- [ ] Review round 2 (both lanes, `reviews/2_integration.md`) on the integrated result of round 2 at `fce0dfb`; a new video.
- [ ] Visual audit against `references.md` (including the one visual pass over the uncategorised JBS/JBU detail series it flags).
- [ ] Docs, devlog, merge, push, worktree cleanup (coordinator).

## Outcome

Pending.
