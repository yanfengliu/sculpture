# Gate proofs — sculpture

A gate counts only once it has gone red with its defect reintroduced (`../fleet/docs/lessons-template.md`). Each section records one gate: the claim, the mutation, the red it produced and where the retired evidence can be read back. Sections are kept; a gate that changes gets a new dated section.

## Yard sight lines: no shown span crosses the camera's view of the block (2026-10-14)

**Gate:** `src/viewer/yard-sightlines.test.ts`, the class gate for the defect register's first entry (the fences blocking the view). From every camera preset and some 400 seeded orbit positions (five preset targets, 11 shells from 0.5 m to 80 m, above the target's horizon), no yard span left shown has a piece whose world box crosses a sight line from the camera to the block's eight corners or its centre, up to where the line meets the block. The bench is exempt, as the spec keeps it.

**First run, before the fix:** 76 crossings with the rule as it stood (a span hid when the camera was past the plane through its centre): cameras on a deck, between the scaffold and the block, or just in front of the face above the head bridge looked through timbers and planks the rule kept shown. The rule now hides a span once the camera is past one of its inner faces, the planes that separate its pieces from the block (`src/viewer/yard-spans.ts`, `innerFaces`); the head bridge's plank ends, which stick out past the block's sides, gave the last crossing that a single plane per span could not remove.

**Mutation 1:** in `src/viewer/yard.ts`, the `scaffold-right` span set to `cameraHides: false` (a span that stays shown). Red: `201 crossings`, the first `preset three-quarter: scaffold-right scaffold-right-timbers[1] crosses the sight line to [1.11, 0, -0.77]`.

**Mutation 2:** `cameraOutside` in `src/viewer/yard-spans.ts` put back to the centre-plane test of `97f0b3a`. Red: `116 crossings`.

Both restored; the file passes 3 of 3.

## Pinned constants: no test asserts an imported constant's literal value (2026-10-14)

**Gate:** `src/repo-conventions.test.ts`, "asserts the literal value of no imported constant in a test file": a line `expect(NAME…).toBe|toEqual|toStrictEqual(<literal>)` in a `*.test.ts` or `*.spec.ts`, where NAME is an UPPER_SNAKE_CASE name the file imports (from `src/contracts/` or any module). It retires the lesson of 2026-10-11 (`scripts/lib/model/grid-writer.test.ts` pinned `DEFAULT_BAND_CELLS` at 32 and went red on the decision to make it 16, never on a defect).

**First run:** 12 hits in 10 files (`DEFAULT_PORT`, `BROWSER_CHANNEL`, `FIXED_POINT`, `SPEEDS`, `TOOL_CATALOG.point.angle` and three more catalog lines, `PROP_IDS`, `DECK_LEVELS`, `CALENDAR_START`, `DEFAULT_MODEL`), each rewritten to test what the code does with the constant.

**Mutation:** `expect(DEFAULT_BAND_CELLS).toBe(16);` added to `scripts/lib/model/grid-writer.test.ts`, a pin that passes on its own. Red: `scripts/lib/model/grid-writer.test.ts:29 asserts an imported constant's literal value (expect(DEFAULT_BAND_CELLS).toBe(16);)`, while the writer's own 17 tests stayed green. Restored.

**Retired evidence:** `git show 85149b1:docs/learning/lessons-evidence.md`, section `pinned-constant-2026-10-11`.

## Wall-clock bounds: no test bounds a wall-clock delta (2026-10-14)

**Gate:** `src/repo-conventions.test.ts`, "bounds no wall-clock time in a test file": an ordering matcher on `performance.now() -` or `Date.now() -`, or on a name the file assigned, pushed or derived from one. It retires the lesson of 2026-10-14 (the determinism case of `src/timeline/making.test.ts` failed one full-suite run at 3.35 s and passed the next).

**First run:** 2 hits, `src/david/synthetic.test.ts` (the 1.6 cm build under 2 s) and `src/stock/mesher.test.ts` (the sphere chunk's median under 5 ms), both moved to the file's own CPU time with `process.cpuUsage()`; the mesher times its 200 runs together, since the process CPU clock ticks at about 16 ms on Windows.

**Mutation:** the determinism case put back to `const start = performance.now()` and `expect(performance.now() - start).toBeLessThan(3000)`. Red: `src/timeline/making.test.ts:131 bounds a wall-clock time (expect(performance.now() - start).toBeLessThan(3000);)`. Restored.

**Retired evidence:** `git show 85149b1:docs/learning/lessons-evidence.md`, section `wall-clock-bound-2026-10-14`.

## The roughing order: each layer starts at the highest points, the furrows follow the form (2026-10-14)

**Gate:** `src/choreography/roughing-order.test.ts`, for the owner's report "chipping away row by row?" (`docs/learning/defect-register.md`, second entry). It replans the three roughing steps of the front on the synthetic figure at 2 cm with the planner's marks and holds each layer's first blow to the figure's highest points, the layer's spread to growing, and the sculptor's-stroke runs to the contour and off the world axes.

**Mutation:** in `src/choreography/generators/furrows.ts`, on the gate's commit, the pass order was put back to a raster (the frontier's key and the pass's start replaced by `row × 10000 + column`, rows from the top, then left to right) and the furrows turned to the face's row axis (`model.turn(model.frame.row, 0)`), the two halves of the defect the owner saw; the file was restored from a copy afterwards and the gate run green again.

**Red run:** `npx vitest run src/choreography/roughing-order.test.ts` failed at its first assertion with 3 layer failures and 376 run failures:

```
AssertionError: high-points front phase 0 pass 0: 41% of the layer's 344 blows stand higher than its first (at most 10%)
high-points front phase 0 pass 1: 37% of the layer's 345 blows stand higher than its first (at most 10%)
chest-and-face front phase 0 pass 0: 23% of the layer's 269 blows stand higher than its first (at most 10%)
front-furrows: the run at (-0.08, 5.11, 0.10) turns 38 degrees off the contour (at most 35)
front-furrows: the run at (0.16, 5.11, 0.05) turns 48 degrees off the contour (at most 35)
...
```

and its log showed all 729 runs within 10 degrees of a world axis (the bound is under half). The spread claim stayed green under the raster, as expected: a raster that starts at a corner also moves away from its first blow, so the highest-points claim is what catches it. The gate also carries the two mutants in its own body (each layer sorted into raster order must fail the highest-points claim somewhere, each run turned to x must fail the contour claim somewhere), so a check that stops seeing either goes red on the clean plan.

**Commit:** the gate and the pass order it holds landed together in `7354268` on the `engine-a` branch.

## The paint and the cut of a step stay inside its region (2026-10-14)

**Gate:** `src/choreography/paint-confinement.test.ts`, for review finding C2.7 (the crown lost its crust and only 37 percent of the hair kept its tooth texture, because a step's tools cut and painted wherever their 3 to 15 cm footprints reached; a rasp blow beside the hairline painted about 6 cm into the hair). On the synthetic figure at 2 cm, after rasp-flesh and file-details (t = the index of file-details + 1), no HAIR cell of the stock's band carries the rasp's or the file's finish code, and the scan must examine at least 1,000 HAIR cells; `src/choreography/david-steps.slow.test.ts` makes the same claim on the David at 8 mm. A second case holds the footprints the planner sizes its moves by (`src/stock/footprint.ts`) to the volumes the kernel carves.

**Mutation:** in `src/choreography/generators/bands.ts`, `bandConfiner` made to return null for every tool, so the footprint tools are placed as they were before the confinement.

**Red run:** `npx vitest run src/choreography/paint-confinement.test.ts` failed with `709 HAIR cells carry the rasp's code and 206 the file's after file-details: expected 915 to be +0`; its log read `67322 examined; by finish: block 856, point 58330, twoTooth 105, claw 1156, fineClaw 5629, drill 331, rasp 709, file 206; rasp 709 (one at 0.000, 4.765, -0.360), file 206 (one at -0.180, 4.945, 0.000)`. Restored, the run examined 67,253 HAIR cells with none carrying either code, and the file passes 2 of 2.

**Commit:** the gate and the confinement it holds landed together on the `engine-a-paint` branch and were brought into `engine-a` (round 2, item 5).

## Every footprint step keeps its paint and cut inside its region, the web-clearing step too (2026-10-14)

**Gate:** `src/choreography/paint-confinement.test.ts`, its first case extended: walked step by step on the synthetic figure at 2 cm, every step whose tool strikes a footprint (`src/choreography/outside-region.ts`: fine-claw-all and fine-claw-gaps with the fine claw's patch, rasp-flesh, file-details, pumice-flesh, tripoli-straw-leather, last-touches and gilding) paints and cuts no cell outside its region, besides the HAIR claim of the section above; `src/choreography/david-steps.slow.test.ts` walks both figures at 8 mm the same way. Found by a probe of the David after the section above: fine-claw-gaps, the web-clearing step of the same round (`src/choreography/generators/webs.ts`), strikes the same patch without `bands.ts` and had cut 17,648 cells and painted 21,173 outside its region, 22,761 of them on the crown, whose crust stays untouched after the point; its candidates are now tried on the scratch like the band blows.

**Mutation 1:** `bandConfiner` in `src/choreography/generators/bands.ts` returning null for every tool, as in the section above. Red: `fine-claw-all painted 484 and cut 327 cells outside whole-but-crown (one at 0.000, 5.165, -0.220); rasp-flesh painted 4508 and cut 3283 cells outside flesh (one at -0.500, 0.245, -0.600); file-details painted 2504 and cut 1131 cells outside details; pumice-flesh painted 3241 and cut 3742; tripoli-straw-leather painted 3748; last-touches painted 75 and cut 19; gilding painted 33`, with fine-claw-gaps at 0 and 0.

**Mutation 2:** the confiner of `webs` in `src/choreography/generators/webs.ts` set to null. Red: `fine-claw-gaps painted 480 and cut 302 cells outside gaps (one at 0.000, 5.185, -0.240)`.

Both restored, the file passes 2 of 2: every one of the eight steps 0 and 0, and 65,858 HAIR cells examined with neither code.

**On the David at 8 mm**, a probe with the same reading (not kept): main at `42bfc46` painted between 982 and 64,680 cells outside the region in every footprint step (rasp-flesh 64,680, of them 29,498 on the sling, 18,972 on the stump and 13,361 in the hair; fine-claw-all 21,314, on the crown; gilding 16,961), and after the confinement none in any step.
