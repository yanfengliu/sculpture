# Review 1: engine-b implementation (the jump budget)

## Target

The engine-b worker's change for the jump budget (the plan file and the snapshots), repository `sculpture`: the diff `main...fc7a342` on branch `engine-b`, where `main` is `bcbe540` (2026-10-14). Its parts: `scripts/build-plan.mjs` and `scripts/lib/plan/david-plan.ts` (the build), `src/timeline/plan-build.ts`, `plan-file.ts`, `replay-cost.ts`, `snapshot-jump.ts`, `evaluate.ts` and `making.ts` (the Making from a plan file), `src/stock/snapshot.ts`, `snapshot-loader.ts`, `snapshot.worker.ts` and `swept-cells.ts` (the snapshot format and the page's loader), `src/main.ts` and `src/viewer/facts.ts` (the page's loading path and `planSource`), their tests, and the spec, decisions, AGENTS.md and README text. The repairs below landed in `bada4b6` (the Codex findings) and the commit after it (the Claude findings).

## Reviewers and coverage

- Codex (`gpt-6-astra`, `model_reasoning_effort=xhigh`, `codex exec --sandbox read-only --ephemeral`, codex-cli 0.158.0), the diff piped in with the prompt below; it read the tree and ran read-only Node probes (39 adversarial histories, malformed-input probes); no Vitest, build, e2e or browser. It reported reading `fc7a342` after the author committed it.
- Claude (`claude-opus-5-5[1m]`, `--effort max`, `claude -p` with `Read,Glob,Grep,Task` and read-only git tools, Claude Code 2.1.281), the same diff and prompt; the final event's `modelUsage` held the one key `claude-opus-5-5[1m]`; 62 turns. It copied `fc7a342` with `git archive` into its scratchpad, ran the unit suite there (404 tests, 2 skipped without the David grid), typecheck and lint on the changed files, and probes against the real Making on a 7-step synthetic plan; no e2e.
- Prompt (both lanes): an independent read-only adversarial review of the diff against the spec's Stock and figure, Undo and replay, Budgets and Query contract and the decisions' Engine entry; the invariant that everything observable is a pure function of `t` through snapshots, undo, failed and asynchronous loads; the decoders against malformed input; the version and digest checks; error messages; the tests' claims against what they assert; files over 500 lines; the docs against the code.

## Reports

### Codex

Found seven material issues in the supplied diff, now committed as `fc7a342`.

1. **[P1] The plan digest does not bind blows to their steps.** [plan-file.ts:164](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/timeline/plan-file.ts:164) hashes the flattened blows without step lengths. Changing two step ranges from `[1,1]` to `[0,2]` preserves both digests and passes both validators, but changes which margin applies. In a reproduced case, snapshot and replay paths at identical `t` and blow count differed in **11,875 stock cells and 9,310 finish cells**. Bind step partitions to the digest, preferably by hashing the entire binary, and validate snapshot positions against those partitions.

2. **[P2] Unchecked swept-cell lists break undo.** [swept-cells.ts:39](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/stock/swept-cells.ts:39) accepts duplicates and indices outside the grid; the plan decoder does not reject them either. Reproduced: sweeping `[0,0]` then undoing leaves an originally deep cell at `+768` instead of `−768`. An index equal to the grid length produces `RangeError: offset is out of bounds` during undo. Before adopting the plan, require strictly increasing indices below the grid length, with contextual rejection messages.

3. **[P2] The version fingerprint misses changes to intermediate snapshot states.** [plan-file.test.ts:102](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/timeline/plan-file.test.ts:102) hashes only the final grids. An in-memory change from roundel finish code `6` to `8` changed **1,133 finish cells at `t = 12`**, while the fingerprint remained exactly `02f19b94-2266b800-b89a561d`. Old snapshots would retain the old finish while replay uses the new one, without requiring a version bump. Fingerprint intermediate snapshot states and add this mutation as a negative control. The spec’s “a stale plan file is never used” claim exceeds this gate’s protection.

4. **[P2] Invalid snapshot tile codes silently become air.** [snapshot.ts:240](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/stock/snapshot.ts:240) treats any kind other than `TILE_DEEP` or `TILE_RUNS` as uniform air. Replacing a deep tile’s kind with `255` passed decoding without error. A malformed snapshot with a matching advertised SHA therefore bypasses fallback and installs incorrect state. Reject unknown tile kinds, invalid run/finish codes, and reconstructed values outside the stock’s clamp.

5. **[P2] Overlapping plan ranges amplify allocations before validation.** [plan-file.ts:146](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/timeline/plan-file.ts:146) checks each range independently but permits every step to reference the same blows. A **10,124-byte** probe declaring 100 blows decoded into **10,000 blow objects**. This scales quadratically; the page checks the decoded step count and total only afterward. Validate a contiguous, complete partition and expected counts before constructing blow objects.

6. **[P2] Snapshot inflation is unbounded until completion.** [snapshot.worker.ts:18](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/stock/snapshot.worker.ts:18) materializes the entire inflated payload before checking its declared size. A 4,098-byte gzip advertising 49 bytes inflated fully to 4 MiB before rejection. A larger hostile payload can exhaust memory before fallback. Validate the declared size against lattice-derived limits, then stop streaming inflation as soon as that size is exceeded; also bound fetched bodies.

7. **[P2] Disposing the Making does not dispose its snapshot loader.** [snapshot-loader.ts:26](/C:/Users/38909/Documents/github/sculpture-worktrees/engine-b/src/stock/snapshot-loader.ts:26) exposes no cancellation or disposal hook. With transport stubbed, disposing during fetch still created a worker after disposal, with no termination call. The landing guard protects grid state but leaves the resource alive. Give the loader an explicit lifecycle that aborts fetches, prevents subsequent worker creation, clears pending requests, and terminates the worker.

No material state-transition defect was found with valid inputs: 39 adversarial histories passed byte comparisons, covering retargeting during loads/jobs, reverse chunk completion, empty steps, failures, and undo. Recovery after a partially written snapshot also matched replay; completion after disposal did not mutate grids.

Duplicate/out-of-order snapshot entries are rejected. I found no material alignment, endianness, or checked-length arithmetic issue, and no file exceeded 500 lines. Verification used read-only Node probes; the full suite, browser transport, and performance measurements were not rerun. I modified no files.

### Claude

I found no path in `fc7a342` that makes the stock or finish grids depend on anything but t. The replay, undo, sweep and snapshot logic is correct as far as I can test it. The risks are in what nothing checks: mainly the page's plan-file path, and two ways a stale plan file can pass the `PLAN_VERSION` check.

**What I reviewed.** `fc7a342` is the diff you gave me (`main...fc7a342`, 22 files). The author committed it, and then `bada4b6`, while I worked. I only read `bada4b6`'s diff to mark which findings it addresses; I did not review it.

**How I checked.** I copied `fc7a342` into the scratchpad with `git archive`, because the worktree was being edited. On that copy the unit suite passes (48 files, 404 tests, 2 skipped because the David grid is absent), and typecheck and lint pass on the changed files. I did not run `npm run test:e2e`: it only uses `model=synthetic`, so it never reaches the plan-file path (finding 1).

I also ran probes against the real Making on a 7-step synthetic plan (3,960 blows, 34 snapshots):
- asynchronous chunk jobs and asynchronous loads with random delays: 6 seeds × 60 moves, many issued while a job or load was out, compared with a Making that plans for itself at 72 settle points and at each end;
- a snapshot that fails partway through being written;
- every snapshot refused, then a move below the undo log's start;
- snapshot bytes at an odd byte offset;
- dispose while a load is out;
- a swept cell index past the grid.

None diverged except the last, which is finding 5.

#### Findings, most severe first

**1. Medium: nothing automated checks the page's plan-file path, or that Chrome's replay matches Node's snapshots.**
- **Where:** `main.ts:73-98`, `snapshot-loader.ts`, `snapshot.worker.ts`. `planFor` returns at once for the synthetic figure, and the unit tests load snapshots from memory, so the fetch, worker inflate and SHA-256 check run in no gate.
- **Risk:** the design needs Chrome's carving to match Node's bit for bit. `decisions.md` says the two engines' `tan` and `cos` agree only for today's tool angles, and the spec cites a single run on 2026-10-14.
- **Scenario:** a new tool angle or a V8 update changes one cell's last bit. The page then holds different bytes at a given t depending on whether it got there by snapshot or by replay, and nothing goes red. The 3 s jump budget also rests only on that one measurement.
- **Fix:**
  - Record a cheap sampled digest per snapshot entry. Compare it whenever playback reaches that blow without loading, and on a mismatch log it and stop using snapshots.
  - Add an e2e with a synthetic plan file built at test time.
- **At `bada4b6`:** open.

**2. Medium: `PLAN_VERSION` can stay the same while the David's plan or block changes, so a stale plan file passes.**
- **(a) Edit in place:** the test compares the fingerprint only with the entry for the current version (`plan-file.test.ts:22-24,100-111`). Editing that entry turns it green and leaves old plan files accepted (`plan-file.ts:181`). `bada4b6` did exactly that. It was legitimate there, because only the fingerprint's definition changed, but the table can't tell that from a planner change.
- **(b) The David's block:** only the David uses `latticeBlockBox` (`grid.ts:159`, via `making.ts:145`). The fingerprint never builds with a header, and `grid.test.ts` only checks the box "to within a cell". Moving its inset by a quarter cell keeps every test green, the old plan file is still accepted, and snapshot 0 no longer matches the page's own block at t = 0.
- **(c) Final state only:** at `fc7a342` the fingerprint read only t = N.
- **Fix:** make the fingerprint the version: write it into the header and compare it in the page, so changing it retires old files. Also record the block box and stock band in the header.
- **At `bada4b6`:** (c) fixed; (a) and (b) open.

**3. Low–Medium: no golden pins the snapshot format.**
- **Where:** `snapshot.test.ts` only round-trips encode and decode (`SNAPSHOT_VERSION` at `snapshot.ts:15`).
- **Scenario:** someone changes both encoder and decoder and doesn't bump the version. Every test passes, the plan fingerprint never touches snapshots, and the SHA-256 still matches because it covers stored bytes, not their meaning. The page then writes a wrong state from old files.
- **Fix:** pin the SHA-256 of `encodeSnapshot` on a fixed seeded lattice, and record the snapshot version in the plan header.
- **At `bada4b6`:** open.

**4. Low–Medium: the tests claim more than they exercise.**
- **Claim 3** (`plan-build.test.ts:5`) says "the same holds with a loader that answers later". The async test (`:185`) waits for each load to land before the next move, and has no carver, so it makes no jumps. No test moves while a load is out or interleaves asynchronous chunk jobs with loads.
- **Claim 4** (`:200`) misses the reset when every snapshot is refused (`making.ts:399-403`).
- The code is right on all of these per my probes; this is a coverage gap.
- **Fix:** make the history test asynchronous, with delayed carver and loader, and add the every-snapshot-refused case.
- **At `bada4b6`:** the partial-write reset is now covered; the rest is open.

**5. Low: the decoders check structure but not meaning.**
- **Gaps:**
  - `decodePlan` (`plan-file.ts:125`) doesn't check that steps partition the blows, that swept indices are inside the grid, ascending and distinct, or that blow numbers are finite.
  - `applySnapshot` reads unknown tile kinds as air.
- **Probe:** one swept index past the grid passes. Undoing that step's last blow then throws `offset is out of bounds` from `values.set` (`carve.ts:151`) after the box is popped but before the cursor moves, so the undo log falls out of step with the cursor.
- **Fine:** alignment, endianness and integer overflow.
- **Fix:** what `bada4b6` does, plus rejecting non-finite blow numbers.
- **At `bada4b6`:** mostly fixed. Its snapshot checks fire partway through the write and rely on the reset to the block, which works. Non-finite numbers are still accepted.

**6. Low: a load that never settles freezes the Making for the session.**
- **Where:** `snapshot-jump.ts:72-73`, `making.ts:295`.
- **Scenario:** while a load is out, nothing moves and there is no timeout. A stalled fetch, or a worker message that fails to deserialize (no `onmessageerror` handler), freezes the stock while t moves, and `__shotReady` never fires. Any failure, even a brief one, also marks a snapshot broken until reload.
- **Fix:** a timeout of about 15 s that counts as a failure, plus an `onmessageerror` handler.
- **At `bada4b6`:** dispose now aborts fetches and ends the worker; the timeout is open.

**7. Low: an interrupted `npm run model:plan` leaves a header whose snapshots are gone.**
- **Where:** `build-plan.mjs:6` claims the table and files always match. But it deletes snapshots (`:53`) before planning and writes `david.plan.json` last (`:81`).
- **Scenario:** a failed build leaves the old header passing every check, with `planSource` saying `file`. Then all 33 loads fail; Vite's dev server answers a missing file with `index.html` and status 200, which shows up as a size mismatch. All are logged as errors, and jumps fall back to replay.
- **Fix:** delete the header first, or write to a temp directory and rename at the end.
- **At `bada4b6`:** open.

**8. Low: some error messages don't say what's wrong or how to fix it.**
- `plan-file.ts:195`: "snapshot table is malformed at {…}" covers ten different rules without naming the one that failed.
- `snapshot.ts:176`: can print "N bytes … which need N" when only the tile count is wrong.
- `main.ts:96`: blames `david.plan.json` when the `.bin` is at fault.
- The "set aside" messages never name the fix, `npm run model:plan`.

At `bada4b6`, the `.bin` check now names the right file; the rest is open.

**9. Low: some docs and test headers don't match the code.**
- `plan-build.test.ts:2-3` says 3,968 blows, five steps sweeping and a "2 ms" budget. I measured 3,960 blows, four steps sweeping (122, 134, 19, 3) and 0.05 s.
- `plan-file.ts:10` names functions that don't exist (fixed in `bada4b6`).
- `snapshot.ts:5` lists 11 header words; there are 12.
- `making.ts:77` says `sweptCells` holds "once the cursor has reached that end", but in file mode a load past a step's end skips it.
- `plan-file.test.ts:4` says the test "fails here until PLAN_VERSION is bumped" (see 2a).
- There's no devlog line yet for this change.

**10. Low: after a jump, playing backward stalls about a second once per segment.**
- **Where:** `snapshot-jump.ts:58`. The undo log now starts at the loaded snapshot.
- **Scenario:** playing back past that snapshot loads the previous one and replays almost a whole segment while t keeps moving. On `main`, playing backward never waited.
- **Fix:** worth stating in the spec.

#### Nothing material in these areas
- The undo log's start after a load, and backward moves below it.
- A load landing after the state moved.
- Sweeps: filed exactly once per arrival at a step end. A snapshot at a step end already holds the swept state.
- Loads against chunk jobs: they never overlap, because `advance()` returns while either is out.
- Partial writes, dispose during a load, and empty steps.
- Duplicate or out-of-order snapshot table entries: the page rejects them.
- Pose and chip evaluation: moved verbatim (I diffed it against `main`).
- File length: every file is under 500 lines.

The probe scripts are in the scratchpad (`probe-async.ts`, `probe-fail.ts`); the asynchronous one could become the test finding 4 asks for. I can also publish this review as a private page if you want to pass it along.

## Findings and disposition

Finding ids: X1 to X7 are the Codex report's items, C1 to C10 the Claude report's. Dispositions are the engine-b worker's.

| ID | Finding | Disposition and reason | Repair |
|---|---|---|---|
| X1 | The plan digest does not bind blows to their steps | Accepted: a repartitioned file passed both digests | `bada4b6`: the header records the SHA-256 of `david.plan.bin`, checked before decoding; `decodedPlanProblem` refuses a snapshot outside the step it names |
| X2 | Swept lists with repeats or cells outside the grid break undo | Accepted | `bada4b6`: `sweptProblem` refuses them before the plan is used |
| X3 | The version fingerprint reads the final state only | Accepted | `bada4b6`: `planFingerprint` hashes every step's halfway and end states, with a negative control (a finish painted on the way and polished over by the end) |
| X4 | Unknown tile kinds decode as air | Accepted | `bada4b6`: unknown kinds, run classes past the last finish code and values outside the clamp throw while writing; the Making goes back to the block |
| X5 | Overlapping step ranges build blows quadratically before validation | Accepted | `bada4b6`: the steps must partition the blows and swept cells before a blow is built |
| X6 | Inflation is unbounded until it completes | Accepted | `bada4b6`: the worker inflates into a buffer of the table's size and stops past it; the fetch reads at most the table's size; `maxSnapshotBytes` bounds what a table may claim |
| X7 | Disposing the Making leaves the loader alive | Accepted | `bada4b6`: `PlanSource.dispose`, called by `Making.dispose`, aborts fetches, fails waiting loads and ends the worker |
| C1 | Nothing automated checks the page's plan-file path or that Chrome's replay matches Node's snapshots | Accepted in part: the e2e runs the synthetic figure at 8 mm, whose plan takes about 90 s to build, so a test-time plan file does not fit that suite; a sampled digest during playback would cost frame time or miss a one-cell difference | next commit: `npm run model:verify` (`scripts/verify-plan.mjs`) replays the whole plan in the page's pool and compares every snapshot's SHA-256, the check run by hand before; not in `verify` (it needs the David build), named in AGENTS.md beside `npm run model` |
| C2a | Editing the fingerprint table in place keeps old plan files accepted | Accepted | next commit: the table moved into `src/timeline/plan-file.ts` (PLAN_FINGERPRINTS); the build writes PLAN_FINGERPRINT into the header and the page refuses another, so any change to the entry retires the files built before |
| C2b | The David's block (`latticeBlockBox`) is outside the fingerprint | Accepted | next commit: the header records the block and the stock band; the page compares them with the block it starts from |
| C2c | The fingerprint read t = N only | Same as X3 | `bada4b6` |
| C3 | No golden pins the snapshot format | Accepted | next commit: a fixed state built cell by cell encodes to a pinned SHA-256; the header records SNAPSHOT_VERSION and the page refuses another |
| C4 | The tests claim more than they exercise | Accepted | next commit: a test where a carver and a loader answer after random delays while later moves arrive; a test that refuses every snapshot below the undo log and checks the start-over from the block |
| C5 | Decoders check structure but not meaning | Mostly X2, X4 and X5 | `bada4b6`; next commit: non-finite blow numbers are refused |
| C6 | A load that never settles freezes the Making | Accepted | next commit: a load still out after 15 s fails; an unreadable worker reply fails the loads waiting |
| C7 | An interrupted build leaves a header naming deleted snapshots | Accepted | next commit: the build deletes the header and data first and writes the header last |
| C8 | Error messages that do not name the failing rule or the fix | Accepted | next commit: the table check names the rule an entry fails; a wrong tile count has its own message; the set-aside message names `npm run model:plan` |
| C9 | Docs and test headers that do not match the code | Accepted | next commit: the build test's header (3,960 blows, four sweeping steps, a 0.05 s budget), the snapshot header's twelve words, `sweptCells` in file mode, the devlog line |
| C10 | Playing backward after a jump stalls about a second per segment | Accepted as a stated cost: it follows from the undo log starting at the loaded snapshot, which keeps backward play after forward play free of loads | next commit: the spec's Undo and replay paragraph states it |

## Verification

After the repairs: `npm test` (412 tests), typecheck, lint and `npm run build` green; `npm run test:e2e` 30 passed; the David plan rebuilt with the new header and `npm run model:verify` reproduced every snapshot in the page. No re-review ran on the repairs; each answers its finding and adds a test for its class.

## Round outcome

Neither lane found the state depending on anything but `t` with valid inputs: their adversarial histories (Codex 39, Claude 6 seeds of 60 asynchronous moves) matched a Making that plans for itself. The findings were inputs the page should refuse, checks a stale file could pass, coverage and docs; all are repaired or stated.
