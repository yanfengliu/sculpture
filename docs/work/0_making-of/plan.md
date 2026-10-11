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
- [ ] Model pipeline: fetch the recorded mesh, normalise, build the 8 mm grid (worker `model-pipeline`, running from `a52efe2`).
- [ ] Engine: grids, carving rule and tool volumes, chunked meshing in workers, undo log, Making, generators, dev page (worker `engine`, running from `8b72871`).
- [ ] Tools: catalog, procedural tool models at documented sizes, blow cycle, chips, gallery (worker `tools`, running from `8b72871`).
- [ ] Page: yard and shed, marble, player, timeline bar and menus, presets, capture, sweep and video scripts, e2e against a stub (worker `page`, running from `8b72871`).
- [ ] Integration of M2: wire the engine and tools into the page, run the pipeline's grid through the engine, gates, captures, merge (coordinator).
- [ ] Choreography of the David by stage from `technique.md` and `tools.md` (coordinator writes the step list; stage workers own generators that the generic ones do not cover).
- [ ] Visual audit against `references.md` (including the one visual pass over the uncategorised JBS/JBU detail series it flags), independent review, fixes (coordinator with reviewer).
- [ ] Docs, devlog, merge, push, worktree cleanup (coordinator).

## Outcome

Pending.
