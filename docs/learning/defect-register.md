# Defect register — sculpture

Every defect the owner reports, kept after its gate lands (fleet R17): the symptom as they saw it, the investigation, the root cause, and how the whole class is now checked.

## The fences are blocking the view (2026-10-11)

**Symptom, as reported:** "The fences are blocking the view." In the first video and the captures, the plank enclosure and the scaffold's posts, decks and rails stood between the camera and the block from the three-quarter preset and most others, hiding the carving.

**Investigation:** The yard was built as fixed meshes around the block. The enclosure's planks were already single-sided, facing inward, so they vanished from outside, but the scaffold's front and side spans and their posts still crossed the figure from every preset, and the near walls' posts and rails remained. Nothing in the page decided what to draw from where.

**Root cause:** The yard was designed for the workshop's authenticity without the rule that the making must stay visible, and no check covered what stands between the camera and the stock.

**Fix:** The owner's direction became a local rule (`docs/policies/local-rules.md`: nothing stands between the camera and the stock). The page builds the yard as spans and hides every frame the spans whose outward normal faces the camera, with a Yard toggle and `yard=0` (`src/viewer/yard-spans.ts`; merged in `97f0b3a`).

**How it is checked:** `src/viewer/yard-sightlines.test.ts` is the class gate (2026-10-14, page-4): from every preset and some 400 seeded orbit positions on shells from 0.5 m to the orbit's 80 m, no span the yard leaves shown has a piece whose box crosses a sight line from the camera to the block's eight corners or its centre, up to where the line meets the block; the bench is exempt, as the spec keeps it. Its first run found 76 crossings under the old rule (a span hid only once the camera passed its centre's plane, so a camera on a deck or between the scaffold and the block looked through timbers); the rule now hides a span once the camera passes one of its inner faces, the planes separating its pieces from the block. Proved red twice (`docs/learning/gate-proofs.md`). Its bound is nine sight lines to the block's box, not every pixel of the carved stock. `tests/e2e/yard.spec.ts` still drives the presets and the toggle through real controls and reads the hidden span ids from the facts.

## Is this how a sculpture is actually made? Chipping away row by row? (2026-10-11)

**Symptom, as reported:** "Is this how a sculpture is actually made? chipping away row by row?" The roughing read as rows of identical craters swept across each face from the top down, a raster, in the captures and the video.

**Investigation:** `src/choreography/generators/furrows.ts` scanned each face in passes, then rows top to bottom, then columns back and forth, in world axes, with identical bites at a fixed pitch. The research says otherwise (`docs/research/technique.md`, stage 2: the highest points of the front come out first, as Vasari's water rule and St Matthew's knee show; the sculptor's stroke cuts parallel furrows that outline the form).

**Root cause:** The generator's order and directions came from a scan of the face, not from the record, and no test held the plan to the record's order.

**Fix:** `e864798` on the engine branch: the point takes layers off the whole front, each pass spreading from the column whose figure lies highest outward over its neighbours; bulk craters are jittered in size and place; the sculptor's-stroke furrows run along the figure's contour, turned 30 degrees one way and then the other between runs. The capture at `t = 5` shows a half relief emerging, with no row pattern.

**How it is checked:** `src/choreography/roughing-order.test.ts` (2026-10-14, engine round 2) replans the three roughing steps of the front on the synthetic figure at 2 cm with the planner's own marks (`planFurrows` in `src/choreography/generators/furrows.ts`, checked blow for blow against the Making's plan) and holds every layer of bulk craters (a pass over a face, 12 blows or more) to three claims: its first blow lies where the figure stands highest under the face (at most a tenth of the layer's blows stand higher, by the test's own march), the mean distance from that first blow grows from the layer's first quarter to its last, and every furrow run of the 45-degree point with a defined contour runs within 35 degrees of it, with under half the runs within 10 degrees of a world axis. Two mutants inside the test keep the checks live (the layers sorted into raster order, the runs turned to x), and the red run with a raster order put back into the planner is recorded in `docs/learning/gate-proofs.md`. Writing the gate found the planner's own order broken past the first layer: every pillar of the face was struck before each pass and the frontier's highest column came next wherever it lay, so later layers began wherever a pillar stood and the strikes hopped over the face; the pass now grows as a patch from its highest column, taking a pillar only when it lies in the next crater's footprint. Bounds: the synthetic mannequin, the front's three roughing steps (the sides and the back run the same code unchecked), layers as the planner labels them. The video and the captures stay the owner's check of the look.
