# Lessons evidence — sculpture

The war story and the anchor behind each line of [lessons.md](lessons.md). Entries are corrected in place, dated, and deleted only when their gate has landed and been proved red.

## A test that asserts a contract constant's literal value compares the constant with itself {#pinned-constant-2026-10-11}

**Anchor:** 2026-10-11, commit `27e9008` (red: `scripts/lib/model/grid-writer.test.ts:27` asserted `DEFAULT_BAND_CELLS` was 32 after the coordinator set it to 16) and `136a8b5` (the fix: the test now checks that a far cell clamps to `DEFAULT_BAND_CELLS × FIXED_POINT` whatever the value).

**Gate:** a detector in `src/repo-conventions.test.ts` for `expect(<NAME>).toBe(<number literal>)` in any `*.test.ts` where `<NAME>` is imported from `src/contracts/`; not landed because the conventions test is page-owned work in flight on the `page` branch and the coordinator does not edit another owner's file mid-task.

The band of the figure grid moved from 32 to 16 cells to halve a 31 MB file. The pipeline worker's writer test had a line pinning the constant's value beside real checks of the clamp. The pin went red while the clamp checks stayed green, so the red said nothing about the writer; it said the decision had changed. The commit landed red because the gate was run through `grep`, which hid the exit status (a coordinator process fault, kept in the coordinator's own notes, not a repo lesson).

What transfers: a contract constant is a decision; tests check what the code does with it (`encodeValues([1000], DEFAULT_BAND_CELLS)` clamps to `DEFAULT_BAND_CELLS × 256`), never what number it holds.

## A wall-clock bound in a unit test measures the machine's load as much as the code {#wall-clock-bound-2026-10-14}

**Anchor:** 2026-10-14, the determinism case of `src/timeline/making.test.ts` asserted `performance.now() - start < 3000`. With the same code on the merged engine branch it took 1.5 to 2.6 s alone, passed one full-suite run and failed the next at 3.35 s under the suite's parallel test files; three workers had reported it as load-sensitive. Commit `0cb9a17` (merged in `3ab8355`) switched it to `process.cpuUsage()`: 1.9 to 2.2 s of the file's own CPU in three full-suite runs, all green.

**Gate:** a detector in `src/repo-conventions.test.ts` for a wall-clock delta used as an assertion bound in a `*.test.ts`; not landed in the same commit because the conventions test was being edited on the `page-4` branch for the pinned-constant gate, and the two land together there.

Vitest runs test files in parallel forks, so a file's wall time grows with whatever else the machine and the suite are doing (here also three worker sessions running their own suites). A forked file's CPU time is not inflated by the other files, so a budget stated in CPU time keeps its meaning under load. What transfers: when a test states a time budget, measure the work's own CPU time, or move the budget to a benchmark that runs alone.
