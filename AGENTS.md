# AGENTS.md — sculpture

## What this is

An animated 3D making-of of one famous single-figure sculpture, in the browser: the real tools, in the real order, on the real material, with no sculptor shown. The tools work in mid air; everything else is as authentic as the research in `docs/research/` can make it. The making is the product: the finished statue is only the last frame.

Non-goals: no sculptor, hands or body parts; no imported photo textures at runtime; no physics beyond what the carving and its chips need; no deployment without the owner's authorization.

Stack: Vite + TypeScript (strict) + three.js + Vitest, Playwright for capture and control tests. Node 24 (`.nvmrc`).

Read `docs/design/spec.md` before substantial work: it is the contract for the world frame, the carving engine, the step API and the page. Repo-specific rules: `docs/policies/local-rules.md`. Research and reference images: `docs/research/`.

<!-- FLEET-CANON:BEGIN sha=7f2f32ea7a5c generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

Shared rules for every repo under `github/`, kept in `../fleet/FLEET.md`; `../fleet/` is fleet's checkout beside this repo's primary checkout. Where a rule gives its reason, use the reason to judge cases the rule does not name; each `[Rn]`'s history is in `../fleet/docs/canon-rationale.md`. This repo's `docs/policies/local-rules.md` may add rules but cannot change these permissions or limits. [R13]

The main agent owns delivery and may implement directly. Use subagents when bounded, independent work or independent judgment materially improves speed or quality; keep small or tightly coupled work with one agent (owner directive, 2026-11-07). [R2, R3]

The designated coordinator reads `../fleet/docs/skills/coordinator.md` before planning and after each compaction, and any agent reads that file's "Delegate" section before delegating. Before these kinds of work, read the matching section of `../fleet/docs/work-rules.md`: standing loops and unattended runs; editing skills, agent instructions or rules; handing off or stopping mid-task.

### Permissions

- Commit, merge to main and push without asking. Force-pushing and rewriting history (they destroy history), and deploying and publishing (they reach other people), need the owner's OK. [R14]
- Ask before a major architecture or product change, a new major dependency, a change to a persistent format or a security boundary, or any other consequential action outside this machine, such as posting or sending something. [R8]
- Change fleet rules (FLEET.md, fleet skills and runbooks, agent memory) or add a rule to a repo's `docs/policies/local-rules.md` only when the owner asks, because the owner sets policy. You may add a proposal with its evidence to `../fleet/canon-candidates.md`, but not edit its entries. [R8]

### Sharing the machine

- Other Claude and Codex sessions may be working in this checkout, and you cannot see them. Do anything beyond a quick read in your own worktree, because two sessions in one tree spoil each other's gates and commits. Never revert, overwrite or delete changes you did not make. When resuming, check which worktrees, branches and files already exist. [R7]
- Done means merged to main and pushed: the owner archives sessions, and work left on a branch is lost. Merge on your branch, get the gates passing there, then move main, because other worktrees build on local main. Judge the merged result itself, not a worker's summary. Then remove your worktree and branch, and report where any unmerged work is. [R14]

### Doing the work

- The repo's gates must pass before any commit that touches code. Docs-only changes need content checks and any gate the repo names for docs, not runtime tests or CI waits. [R14]
- Check the thing that should have changed (the file, the page, the number), not just the exit code or a tool's report: both can pass over a defect. Retest a blocker you inherit before repeating it. Never weaken a test or hide a failure to get green. [R9]
- Look at visual and interactive work rendered at full resolution, through the real controls, from fixed and random views, because passing tests say nothing about pixels. Run it headless unless a visible window is needed. [R16]
- Slowness on the critical path, such as a gate rendering on the CPU of a machine with a GPU, is a defect to fix. [R22]
- After pushing code, follow CI to the end; read a failed job's steps before blaming the code, since a billing limit fails jobs before any step runs. [R15]
- If a fix fails twice for one reason, rethink it. After five real repair attempts at one problem, whatever the approach and counting earlier sessions, stop and report, unless the owner set another limit; for a problem that keeps winning, run the search in `../fleet/docs/skills/hard-problem.md`. Stop when the task's criteria are met; do not invent follow-up work. [R11]
- For substantial or high-risk changes, use independent review when available. High-risk includes persistence and migrations, security and auth, concurrency, money, supply chain, and code changes in another repo. Review the exact revision against the task's criteria, and say so when review was unavailable. Fix the findings that matter and have those fixes checked; note minor ones instead of starting another round. `../fleet/docs/skills/multi-cli-review.md` provides the review mechanics. [R10]
- A defect the owner reports gets a test for its whole class and an entry in `docs/learning/defect-register.md`, because a fix without a check tends to come back. [R17]
- Sessions run long: take new requests in the same session, and never hand off to a new session to shed context. Split work expected to need more than about 200k tokens of context into milestones, each merged to main. [R6]

### Records, sized to the work

- Read `docs/learning/lessons.md` at session start; it lists this repo's known traps, and its header says how to add one. [R18]
- Every change that alters behaviour adds a dated line to `docs/devlog/summary.md` (`../fleet/docs/devlog-template.md`) when it lands, because later sessions orient from its newest entries. Work that spans sessions, has several agents writing, or gets an independent review also keeps its plan and review records in `docs/work/` (`../fleet/docs/work-docs.md`); other work needs none. [R24]
- Raw output (logs, captures, screenshots) stays in ignored folders. Never commit a binary over 512 KiB or any file over 1 MiB; LFS needs the owner's OK. [R23]

### Style and environment

- Plain words; one line per paragraph, no hard wrapping. A report says what changed, how it was checked (including any check skipped or failed) and what is not done. [R25]
- Node 24 is the baseline. Products pin the model IDs they call in their own repo, and nowhere else. Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`. Runtime model calls are allowed and paid for; make per-item calls one-shot, not agent sessions. [R28, R29]
<!-- FLEET-CANON:END -->

## Gates

Node 24 (`.nvmrc`), npm, Vite 8, strict TypeScript 6, Vitest 5, ESLint 10 and Playwright 1.64 on the installed Chrome (no browser download; `scripts/harness.mjs` says why).

`npm run verify` is the pre-commit gate: the five commands below, in this order, all green before any commit that touches code.

- `npm test`: Vitest over `src/**/*.test.ts` and `scripts/**/*.test.ts`. `src/repo-conventions.test.ts` is the repo's rules as a gate; it fails on a file over 500 lines (inclusive bound) under `src/`, `scripts/` or `tests/`, on a page-URL read (`location`, `new URL(`, `URLSearchParams`) in any non-test file under `src/` other than `src/viewer/query.ts`, on a missing or URL-blind `query.ts`, and on an `import.meta.env` or `process.env` read anywhere under `src/`. Its header names its bounds. `src/viewer/query.test.ts` pins the query contract's parser.
- `npm run typecheck`: `tsc --noEmit`, strict plus `noUncheckedIndexedAccess`, DOM and WebWorker libs, over `src/`, `scripts/`, `tests/` and the root configs.
- `npm run lint`: ESLint with typescript-eslint strict type-checked rules, `--max-warnings 0`.
- `npm run build`: `tsc --noEmit && vite build` into `dist/`.
- `npm run test:e2e`: Playwright (`tests/e2e/`, Chromium only, headless, 1400×1000 at device scale 1) against a dev server it starts and never reuses, on the synthetic figure (`model=synthetic`, which the helper adds): 33 tests in six specs drive every control, the keyboard, the query contract and the capture contract through real input, with expectations read from the page's own facts; about 6 to 7.5 minutes, because a jump to a late step replays every blow before it. `smoke.spec.ts` checks the canvas, the facts and a clean console.

Not in `verify`, run on request: `npm run test:slow` (`*.slow.test.ts`: the whole David plan at 8 mm against the 60,000-blow budget, about three minutes (186 s on 2026-10-14 for the margins case and both figures), logging the per-step counts and timings); `npm run model` (fetch the recorded mesh, build the grid `public/model/david.json` and `david.bin.gz` (17 MB), then the plan file `david.plan.json` and `david.plan.bin` (2.6 MB) with its snapshots `david.snap.<i>.bin.gz` (66 files, 237 MB gzipped in all, for PLAN_VERSION 2); needed before `model=david` shows the David, and the page plans for itself, tens of seconds for a late position, until the plan file is built; about 15 s for the grid after the first download and about 135 s for the plan (PLAN_VERSION 2 on 2026-10-14; version 1 took 85 to 100 s, about 100 s in all from an empty `public/model/`); `npm run model:plan` rebuilds the plan alone, as a change to `PLAN_VERSION` asks); `npm run model:verify` (with `npm run dev` running and the plan built: replays the whole David plan in the page's worker pool and compares every snapshot's SHA-256, about a minute; red when the browser's carving stops writing Node's bytes).

Dependency audit gate, rerun on every dependency change: `npm run audit:full` (`npm audit --audit-level=high`) and `npm run audit:runtime` (`--omit=dev`) must both report `found 0 vulnerabilities`.

Visual check, not in `verify`: with `npm run dev` running, `npm run shots` (`scripts/capture-shots.mjs`) writes the spec's standard set into `.shots/` through the `?shot=1` contract, or the shots `SHOT_LIST` names (`view[:k=v…]`, so `three-quarter:model=david:t=21`), with `SHOT_BASE`, `SHOT_OUT`, `SHOT_W`, `SHOT_H`; `npm run sweep` adds random angles; `npm run video` dumps frames through `__shotSeek` and encodes `output/making-of.webm` with Playwright's bundled ffmpeg (`--quick` for a few seconds). `npm run jumps` (`scripts/measure-jumps.mjs`) times the spec's jump protocol on the David through `__shotSeek`, `npm run fps` the frame rate at 1×, and `npm run load` (`scripts/capture-load.mjs`, `LOAD_T`, `LOAD_RUNS`) a first visit with an empty shader cache, a new browser and profile per run: first frame, full marble, ready and the longest main-thread task; all three print records and assert nothing. Look at each PNG at native resolution before claiming a visual change works. A green test says nothing about the pixels.

Port: the dev server, the e2e suite and the capture script use `SCULPTURE_PORT` (default 5181, strict: a taken port fails rather than moving), so this repo never collides with met (5310) or 3d-maker (5199); two sculpture worktrees testing at once each set their own.

## Invariants & boundaries

- The statue's mesh and the reference photographs are never committed. `docs/research/` records each source's URL, licence and what it shows; the mesh and everything derived from it (distance grids, decimated copies) live only under ignored paths and are rebuilt by a script from the recorded source.
- Task-run evidence (captures, videos, review runs) lives only under ignored paths: `.shots/`, `output/`, `tmp/`, `test-results/`, `playwright-report/`, `assets/cache/`.

## Conventions

- One line per paragraph, no hard wrapping. Files under 500 lines, except a review record under `docs/work/` that embeds the reviewers' authored reports, which are kept whole.
