# AGENTS.md — sculpture

## What this is

An animated 3D making-of of one famous single-figure sculpture, in the browser: the real tools, in the real order, on the real material, with no sculptor shown. The tools work in mid air; everything else is as authentic as the research in `docs/research/` can make it. The making is the product: the finished statue is only the last frame.

Non-goals: no sculptor, hands or body parts; no imported photo textures at runtime; no physics beyond what the carving and its chips need; no deployment without the owner's authorization.

Stack: Vite + TypeScript (strict) + three.js + Vitest, Playwright for capture and control tests. Node 24 (`.nvmrc`).

Read `docs/design/spec.md` before substantial work: it is the contract for the world frame, the carving engine, the step API and the page. Repo-specific rules: `docs/policies/local-rules.md`. Research and reference images: `docs/research/`.

<!-- FLEET-CANON:BEGIN sha=e54f2a9ae007 generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

Reasons and evidence per `[Rn]`: `../fleet/docs/canon-rationale.md`. `../fleet/` is fleet's checkout beside the repo's primary checkout, also from a worktree. The designated coordinator reads `../fleet/docs/skills/coordinator.md` before planning and after each compaction, and any agent reads that file's "Delegate" section before delegating. Before these kinds of work, read the matching section of `../fleet/docs/work-rules.md`: visual and interactive work; games, simulations and research; measuring, debugging and slow steps; writing error messages; toolchains, dependencies and model calls; standing loops and unattended runs; pushing executable changes; a user-reported defect; editing skills, agent instructions or rules; run output and files over 256 KiB; handing off or stopping mid-task.

### Fleet Orchestration Policy

Deliver the requested outcome with verified correctness, coherent architecture and minimal necessary complexity. Optimize useful progress, not agent count, code volume or maximum reasoning. Adapt rigor to risk. This policy grants no new permissions or capabilities. [R1]

**Roles.** Only an explicitly designated agent coordinates; each scope has one accountable integration owner. [R2]

Workers own bounded outcomes and local implementation decisions. [R3]

Inspect instructions, code, docs, tree state and active tasks; set outcome, non-goals, acceptance criteria, dependencies and verification; settle ambiguity with evidence and reversible defaults. [R4]

**Session size** (owner directives, 2026-09-23 and 2026-10-22). Sessions run long: take new requests as separate assignments in the same session, and never hand off to a successor session to shed context; auto-compaction carries the session. Split tasks expected to exceed about 200k context tokens into milestones within that budget, each committed and merged to main once green. Milestones are task boundaries; a compaction never justifies wrapping up or handing off. [R6]

**Coordinate safely.** Beyond a trivial read, each session or agent defaults to its own worktree; serialize overlapping writes only when none is available, and say why. Finish each bounded increment in its session: merge to main, push, then `git worktree remove`, remove completed task-owned branches and unneeded temporary files, and explicitly transfer the ownership and location of still-needed resources. Report any merged worktree left and its location as a defect. Never overwrite or discard another participant's work. On resumption, first inspect surviving worktrees, artifacts and task status, assuming nothing survived until checked; recover what exists and preserve unfinished work. [R7]

Workers act autonomously in scope; escalate cross-task interfaces, persistent formats, security boundaries, major dependencies and scope changes to the coordinator for resolution within the approved mandate. Unapproved major architecture or product changes and consequential external actions need human authorization. Fleet rules (FLEET.md, the fleet's skills and runbooks, canon candidates, and agent memory) change only when the owner asks (owner directive, 2026-10-28). Agents propose changes instead of making them. The one exception: they may add a proposal to `../fleet/canon-candidates.md`, with the lesson, its evidence and the rule it would change (owner directive, 2026-10-29). They never change, promote or delete an entry: the owner decides each one, and the session the owner asks makes the change. Never reset consumed allowances. [R8]

**Implement and verify.** Inspect, implement a coherent increment, check, diagnose, fix, recheck. Preserve architecture; no unrelated rewrites, speculative abstractions or unnecessary dependencies. Implement when requested. Use task-appropriate evidence and baselines; prototype uncertain ideas before generalizing. Never weaken tests or conceal failures to claim success. Docs-only work uses content and version checks; skip runtime tests and CI waits. [R9]

During authorized work and within scope and budget, proactively improve products and the task's orchestration, learn from recorded outcomes and propose improvements to fleet rules. Read `../fleet/docs/skills/self-improvement/SKILL.md` when proposing a fleet-rule change or turning a mistake into a gate (owner directive, 2026-10-29). [R33]

Obtain independent, preferably read-only review for substantial or high-risk changes when available. Review the exact revision against acceptance criteria. Report unavailable review; fix justified findings, rerun affected checks, and obtain focused re-review when fixes invalidate earlier review. [R10]

**Integrate, report, and stop.** Reassess after two failures for one reason. Unless another budget is set or the user authorizes more, cap automatic repair at five substantive attempts, then report; explicit overrides hold for their stated scope without asking again. Keep updates brief and decision-relevant. Stop when acceptance criteria and material findings are resolved; invent no follow-up work. [R11]

**Final acceptance gate.** The integration owner integrates in dependency order and on the final integrated revision's actual changes and evidence, not worker summaries, checks every acceptance criterion, runs relevant automated checks and exercises affected end-to-end behavior and cross-task interactions. Substantial or high-risk work gets independent read-only review of the integrated changes, integration fixes included. Confirm the merge to main; report that revision, review status and every failed, skipped or unavailable check and unmet criterion. Nothing is fully verified with an open material finding or required check. [R12]

### Fleet conventions

- Repository rules add local constraints consistent with this policy; they cannot override its permissions, adaptive workflow or stopping limits. [R13]
- Gates pass before any commit touching code, a merge included: merge on a detached HEAD or its own branch and move main to it once its gate passes. The user's standing grant covers committing, merging to main and pushing in their repos; force-pushing, rewriting history, deploying and publishing still need authorization. Work is done only once merged to main, regardless of green branch or worktree gates; report unmerged work's location. [R14]
- For substantial or high-risk changes, use independent review when available. High-risk includes persistence and migrations, security and auth, concurrency, money, supply chain, and executable changes in sibling repos; `../fleet/docs/skills/multi-cli-review.md` provides the review mechanics. [R10]
- Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`; every model a product calls is pinned in its calling repo. No model IDs are hardcoded elsewhere. [R29]
- Read `docs/learning/lessons.md` at session start. Record the session's lessons there; each names its retiring gate and is deleted in the commit landing it. A gate counts only after going red with the defect reintroduced, following `../fleet/docs/lessons-template.md`. [R18]
- Gates prove nothing beyond their bounds: name the bound in the header and pin every reproducing input. Distinguish passed from did-not-run; a check built from its checked symbol proves only self-agreement. [R19]
- Verify outcomes beyond exit status, red or green, and return values: read the artifact that should have changed. Retest inherited blockers before repeating them. [R20]
- Keep plans and every authored review round in permanent `docs/work/<id>_<theme>/` folders (`../fleet/docs/work-docs.md`). Record history, not status: a dated devlog line per behaviour-changing session in `docs/devlog/summary.md` (`../fleet/docs/devlog-template.md`). [R24]
- Use common words with the same meaning in chat, docs, commits, PRs, comments and errors. One idea per sentence unless a rule needs more. Cut length, not facts: keep exact terms, numbers and evidence. Quotes and pastes are exempt; do not copy this canon's style. One line per paragraph, no hard wrapping. [R25]
- When blocked, immediately hand over the redacted artifact with the named blocker, before analysis; continue safe independent work. [R27]
- The owner's directions that outlive a task land that session in `../fleet/FLEET.md` if fleet-wide, otherwise the repo's `docs/policies/local-rules.md`; report where. [R31]
- When a hard problem blocks progress, run the search in `../fleet/docs/skills/hard-problem.md`. [R32]
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
