# Lessons evidence — sculpture

The war story and the anchor behind each line of [lessons.md](lessons.md). Entries are corrected in place, dated, and deleted only when their gate has landed and been proved red.

## A test that asserts a contract constant's literal value compares the constant with itself {#pinned-constant-2026-10-11}

**Anchor:** 2026-10-11, commit `27e9008` (red: `scripts/lib/model/grid-writer.test.ts:27` asserted `DEFAULT_BAND_CELLS` was 32 after the coordinator set it to 16) and `136a8b5` (the fix: the test now checks that a far cell clamps to `DEFAULT_BAND_CELLS × FIXED_POINT` whatever the value).

**Gate:** a detector in `src/repo-conventions.test.ts` for `expect(<NAME>).toBe(<number literal>)` in any `*.test.ts` where `<NAME>` is imported from `src/contracts/`; not landed because the conventions test is page-owned work in flight on the `page` branch and the coordinator does not edit another owner's file mid-task.

The band of the figure grid moved from 32 to 16 cells to halve a 31 MB file. The pipeline worker's writer test had a line pinning the constant's value beside real checks of the clamp. The pin went red while the clamp checks stayed green, so the red said nothing about the writer; it said the decision had changed. The commit landed red because the gate was run through `grep`, which hid the exit status (a coordinator process fault, kept in the coordinator's own notes, not a repo lesson).

What transfers: a contract constant is a decision; tests check what the code does with it (`encodeValues([1000], DEFAULT_BAND_CELLS)` clamps to `DEFAULT_BAND_CELLS × 256`), never what number it holds.
