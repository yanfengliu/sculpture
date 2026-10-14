# Gate proofs — sculpture

Every gate that retires a lesson or closes a defect class is proved red before it counts (fleet R18): the defect is put back, the gate is run, and the failure is recorded here with the mutation, the failure text and the commit the gate landed in. A gate with no entry here has not been shown to catch anything.

## The roughing order gate (2026-10-14)

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

**Commit:** the gate and the pass order it holds landed together on the `engine-a` branch, in the commit after `219f993` (the floor pass), subject "Plan-order gate".
