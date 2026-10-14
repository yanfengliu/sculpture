# Animated making of a famous sculpture

Status: active
Owner: Coordinator (Claude Code desktop session, 2026-10-11)
Created: 2026-10-11
Updated: 2026-10-11

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
- [ ] Engine repairs on branch `engine-2` (worker `engine-3` continuing after two session limits cut `engine-2` off: chunk-parallel jumps, grouped strikes and the gilding mask are committed; the furrows rework, the masks, the webs, the finishing coverage, the crown and hair, chips, the undo log are in flight). Owner steering folded in: the furrows follow the form (highest points first, along the surface direction, irregular bites), not raster rows.
- [ ] Page repairs on branch `page-2` (worker `page-3` continuing: the spans between the camera and the block hide (owner steering: "the fences are blocking the view"), the licence link, query problems for unknown keys, the yard from the scaffold model and the hands preset are committed; autoplay with `t=`, the carry from rest, explicit `cam=`, the capture set from `t = N`, discrete finish codes, the sweep cleanup are in flight).
- [ ] Round 1: re-review the repairs on the integrated revision (focused, both lanes), the ratio contract change (`blowsPerShown` computed by the engine from the planned count), Agostino's 1464 roughing as the first setup step, the lattice function shared by the pipeline and the engine, a browser budget benchmark, the dust puffs, a new video.
- [ ] Visual audit against `references.md` (including the one visual pass over the uncategorised JBS/JBU detail series it flags).
- [ ] Docs, devlog, merge, push, worktree cleanup (coordinator).

## Outcome

Pending.
