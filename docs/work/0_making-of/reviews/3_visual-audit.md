# Review 3: visual audit of round 2

## Target

The integrated round 2 of the making-of, repository `sculpture`, commit `a97150c` on `main` (2026-10-14), as the page plays it: `index.html` on the David (`model=david`, the default) with the plan file of PLAN_VERSION 2 (25 steps, 28,986 shown blows, 66 snapshots; `planSource` was `file` on every capture). Compared: the finished statue at t = 25 against the open reference photographs of `docs/research/references.md`; the making at each stage boundary and inside steps against the stage surfaces of `docs/research/technique.md` and the record of `docs/research/david-history.md`; and the uncategorised Bittner Unna detail series that `references.md` asks a worker to page through once. This record changes no code and no other doc.

## Reviewers and coverage

- One lane: worker `audit` (Claude Opus 5.5, `claude-opus-5-5`), read-only on the code, in the worktree `../sculpture-worktrees/audit` on branch `audit` at `a97150c`, with the main checkout's `public/model/` copied in (70 files, 245 MB: the grid, the version-2 plan file and its 66 snapshots). No second reviewer ran.
- Captures: `npm run dev` on `SCULPTURE_PORT=5193`, then `npm run shots` with `SHOT_BASE=http://127.0.0.1:5193` and `SHOT_OUT` under the worktree's ignored `.shots/` (folders `standard`, `close` and `b2` to `b8`), headless Chrome at 1400 × 1000 and device scale 1, each run under the heavy-gate lock `../sculpture-worktrees/.gate-lock`. 153 captures came back ready. Six more were refused by the page's orbit limits (a `cam=` level with or below its target, past the orbit's limit of 88.9° from straight above), reported in `queryProblems` and counted as failures by the script, and were shot again from an allowed pose. Every capture was looked at whole at native resolution, and details as crops of the same PNG enlarged with Pillow; the two tiled sheets made (the torso series and the strike-phase follow shots) served as an index only, and each tile was also looked at alone.
- References: each opened in the built-in browser by its Commons address (`https://commons.wikimedia.org/wiki/Special:FilePath/<file>?width=1280`, which serves the 1280-px rendition of the file page's image), view only; nothing was downloaded, saved or committed. Opened at 1280 px: references 1, 11, 16, 20, 22, 27, 29, 30, 31, 32, 33, 34, 35 and 42, and from the detail series JBS 047, JBS 070, JBU 124, JBU 126 and JBU 127. Seen as 330-px thumbnails in the one pass over the detail series: all 111 files from JBS 020 to JBS 110, JBU 014, JBU 015 and JBU 111 to JBU 128, which include references 19, 24, 25, 26, 37, 39 and 40.
- Probes, read-only, kept in the session's scratchpad: a Node probe of the page's facts (`window.__sculpture` through `scripts/lib/capture.mjs`) at t = 4, 5, 6, 10 and 25, under the lock; Python probes of the figure grid `public/model/david.bin.gz`: the figure's own surface shaded from its signed distance with sub-cell interpolation, over the face, over the crown from above, over the right hand from behind and over the crease between the thighs, and the gap between the right hand and the thigh counted per height.
- Not covered: references 2 to 10, 12 to 15, 17, 18, 21, 23, 28, 36, 38, 41 and 43 to 48 were not opened (those opened cover every view the brief names); the restricted sources (the Stanford head page, the Google Arts & Culture view of the top of the head) were not opened; no video and no live playback were watched, so the motion between captured positions (the approach, the raise, the recoil, chips in flight) is not judged; the stock grid was not compared with the figure grid, so the owner of V3 stays open.

## Report

### The finished statue against the photographs

Front (reference 1; `view=front&t=25`, `view=free&t=25`, `view=three-quarter&t=25`): the silhouette, the pose and the proportions match, since the figure is the Scan the World mesh at 5.17 m: the weight on the right leg, the left knee forward, the head turned to its left, the left hand at the shoulder, the right hand hanging by the thigh, the stump behind the right leg, the rock base. The marble is a cooler and more even white than the photographs' ivory with grey veining, patina and the streaks the 2004 cleaning left; for stone carved in 1504 that is expected, not a finding.

Right and left (references 11, 16 and 20; `view=right&t=25`, `view=left&t=25`, `cam=1.6,3.2,0.0,0,3.0,0`, `cam=-1.6,3.2,0.0,0,3.0,0`): the profiles match, with the strap over the left shoulder and the stump at the right calf.

Back (references 22, 27, 29 and 30; `view=back&t=25`, `cam=0,3.5,-2.8,0,3.4,-0.1`, `cam=-0.2,3.7,-2.4,-0.25,3.5,-0.3`, `cam=-1.5,3.0,-1.6,-0.5,2.9,-0.15`): the back, the buttocks and the strap's diagonal from the left shoulder to the right hip match; the strap is gilded (V8).

Head (references 31 and 32; `view=head&t=25`, `cam=0,4.88,1.3,0,4.8,0.05`, `cam=1.0,4.78,1.0,0.05,4.75,0.05`, `cam=-1.3,4.85,0.25,0,4.82,0.05`, `cam=0,4.88,0.75,0,4.86,0.1`): the head's mass, its turn and the profile match; the eyes, lids, brows and lips read as stacked horizontal ledges and the curls as blocky ledges, where the figure grid's own surface is smooth (V1); the drilled pupils cannot be told apart at 8 mm.

Crown (no open image exists; `cam=0.35,5.9,0.7,0,5.0,0.0` and `cam=-0.9,5.15,0.6,0,5.02,0`, each also with `finish=1`, and `cam=-0.3,5.9,-0.8,0,5.0,0.0`): horizontal terraces of point- and claw-cut stone with a stepped edge (V9).

Hands (references 30, 34 and 35, JBS 044 to 050, JBS 070 and JBS 071; `view=hands&t=25`, `cam=-0.75,2.35,1.15,-0.72,2.3,0.05`, `cam=-1.9,2.4,0.4,-0.72,2.3,0.0`, `cam=-1.3,2.4,-1.0,-0.72,2.3,0.0`, `cam=-0.95,2.2,0.75,-0.72,2.15,0.05`, `cam=-0.55,2.35,-0.75,-0.68,2.28,0.0`, `cam=0.45,4.22,1.3,0.3,4.15,0.1`, `cam=0.75,4.0,1.0,0.3,3.95,0.1`, `cam=1.5,4.2,0.4,0.3,4.15,0.05`): the size and gesture of both hands match, the enlarged right hand included. The right hand holds a flat-faced stub between its fingers (V3), and a stair-stepped web of stone joins its edge to the thigh where the photographs show a dark gap (V1); the left hand's finger edges are saw-toothed (V1).

Torso (references 39 and 40; `cam=0,3.4,2.2,0,3.3,0.1` at t = 25): the musculature matches; single-cell nubs of stone stand on the polished skin (V7).

Knees and thighs (JBU 115, 116 and 122; `cam=0,1.7,2.2,0,1.6,0.1`, `cam=0,2.0,1.6,0,1.9,0.1`): the knees match; a saw-toothed ridge fills the crease between the thighs (V1); nubs (V7).

Feet and base (JBU 125 to 128 and JBS 020, which replace the tiny reference 43; `cam=0,0.7,2.2,0,0.3,0.1` with and without `finish=1`, `cam=0.05,0.8,1.6,0.05,0.4,0.15`, `cam=0,0.8,-2.2,0,0.3,-0.1`): the feet match; the base reads as soft rounded mounds with thin fins scattered over it, where the photographs show flat chisel-cut facets with claw hatching (V6, V7).

Stump (JBU 124, 127, 120 and 121, JBS 020; `cam=-1.5,1.1,-1.4,-0.3,0.95,-0.35` at t = 23 and at t = 25 with and without `finish=1`, `cam=-1.9,1.0,-0.35,-0.3,0.9,-0.3`, `cam=-1.3,1.0,1.3,-0.3,0.9,-0.1`): the form, a trunk with branch stubs behind the right calf, matches; its surface reads smooth where the photographs show deep horizontal claw rows (V6); the gilding covers it in patches (V8).

Sling (references 30 and 33, JBS 053, 097, 098, 107 and 108; `cam=0.9,5.0,-1.1,0.0,4.2,-0.2`, `view=sling-and-stump&t=25`): the strap's course from the left hand over the shoulder and down the back matches.

Contrapposto (reference 42): matches.

### The making against the research

The stage boundaries (the integer t that starts each stage, from the facts' `stepStages`): 0 setup, 3 layout, 4 roughing, 7 coarse claw, 9 fine claw, 15 drilling, 19 rasping, 21 polishing, 23 on site, each from the front and three-quarter presets; plus the torso from 2.1 m at t = 3, 7, 9, 15, 19, 21 and 23, the back at t = 1.5, 9, 9.25, 9.5, 9.75, 10, 10.5, 11 and 12, and the sides at t = 9.5, 10, 11.5 and 12.

- t = 0 to 2: the block in the yard; Agostino's two layers of craters take the front of the lower half down to a lump of legs, feet and lower trunk while the upper half stays block (`view=three-quarter&t=0.75`, `view=front&t=1`, `view=front&t=2`); then the hole goes through between the legs (`cam=0.05,1.45,2.0,0.05,1.4,0` and `cam=0.05,1.45,-2.0,0.05,1.4,0` at t = 2). This matches technique.md stage 0 and Vasari's hole.
- t = 2 to 3: no knot stands on the chest; the nodo step digs a pit into the flat face (V10).
- t = 3 to 4: the principal view drawn in charcoal dots on the upper front (`view=front&t=4`), as stage 1 has it.
- t = 4 to 7: the knee and the right hand come out first, then the chest and the face (`view=front&t=5.5`), then the 45-degree stroke over the front (`view=front&t=6.5`); at t = 7 a half relief stands on the block's ground with the back still block. The order matches stage 2 (Vasari's water rule, Cellini's half relief); the surface does not (V5).
- t = 7 to 9: the two-tooth and the claw (V5).
- t = 9 to 15: the sides opened at 9 to 10, with stone hanging in the air and the back opened before its own step (V2); the claw round the sides and back (`view=right&t=11.5`); the fine claw; at t = 15 a smooth skin (V4).
- t = 15 to 19: the drilling steps (the curls, the pupils, the fingers, the sling and the stump, the crease between the thighs); the bow drill is in frame across the face at `view=follow&t=16.5`.
- t = 19 to 23: from 2.1 m the flesh does not change from t = 15 to t = 21; tripoli and straw at t = 22 to 23 turn it to a wet-looking gloss (V4, V12).
- t = 23 to 25: the last touches with the file on the face and hair, then the gilding of the strap and the stump (V8).

Tools at the strike phase of a visible cycle (`view=follow` at the cycle's 0.65, from `src/timeline/cycles.ts`): the point (t = 0.25357, 0.51548, 0.73), the two-tooth (7.2266, 7.7585), the claw (8.2088, 8.7971), the fine claw (12.5072) and the gilding brush (24.19018, 24.5116) sit at the stone with the mallet at the chisel's head, at the documented sizes, with dust at the point. Between strikes the follow view sometimes shows no tool or a wall of stone (V11).

The yard: in no capture did a fence, a scaffold timber or a plank bridge cross the stock; the head bridge is laid from step 5 and the back bridge by t = 10; a false warning about the head bridge fills the console (V13).

### The detail series (JBS 020 to 110, JBU 111 to 128)

What each uncategorised file shows, from the category gallery's thumbnails (https://commons.wikimedia.org/wiki/Category:Details_of_David_by_Michelangelo_Buonarroti), confirmed at 1280 px where marked. Directions are the statue's own (its left is +x).

| Files | Shows |
|---|---|
| JBS 020 | The back's lower half: the legs, the buttocks, the stump and the base from behind (reference 22) |
| JBS 021 | The front from the knees up, from below |
| JBS 022, 023 | The head and the left hand at the shoulder from the front left, below; 023 the head in profile from the left, close |
| JBS 024 | The whole figure from the left front (reference 19) |
| JBS 025 to 027 | The upper body, the head and the left shoulder and arm from the left, below (025 landscape) |
| JBS 028, 029 | The head, the chest and the left hand from the front, below, landscape (seen at 1280 px; references 32 and 33 describe them otherwise) |
| JBS 030 to 039 | The hips, the groin and the right hand from the front and the front right; 033 to 039 the groin close (039 landscape) |
| JBS 040 to 050 | The right hand at the thigh, from the right, the front right and the front, close: the thumb, the veins and the dark gap between the fingers and the thigh (047 seen at 1280 px) |
| JBS 051 to 056 | The left hand at the shoulder with the chin and the chest; 053 from below with the sling's end between the fingers; 056 the raised left arm from below |
| JBS 057 to 065 | The torso from the front and the front right, chest to thighs (062 and 065 landscape) |
| JBS 066, 067 | The head and the upper back from behind, below; the back from the left rear |
| JBS 068 | The right flank and ribs from the right rear |
| JBS 069 to 072 | The buttocks with the right hand from behind; 070 the right hand from behind with the thumb over the stone (seen at 1280 px); 071 the right hand from the right rear, close |
| JBS 073 to 078 | The head, the left shoulder and the raised arm from the left and the left rear, below; 075 and 076 the curls and the eye from the left, close; 077 and 078 the back of the head and its curls |
| JBS 079 to 093 | The head and the face from the front and the front left with the left hand; 087 and 088 the face from the front, close: the eyes and pupils, the brow, the hair at the temples |
| JBS 094 to 101 | The face and the head in profile from the left, close: the curls over the ear; 097 and 098 the sling's end at the left hand and over the shoulder |
| JBS 102, 103 | The whole figure and the upper body from the front, below |
| JBS 104 to 110 | The head from the front and the left, close; 107 and 108 the profile with the sling's end at the hand; 110 the curls and their drilled recesses from the left |
| JBU 014, 015 | The whole figure from the left front; the upper body from the right |
| JBU 111 to 113 | The chest with the left hand; the left upper arm and the left arm and hand from the front left |
| JBU 114 | The right arm and the torso from the front right, below |
| JBU 115, 116, 122, 123 | The thighs and the knees from the front, close; 123 the right knee |
| JBU 117 | The left leg, the left foot and the base from behind (reference 26) |
| JBU 118 | The right hip and flank from the side, close |
| JBU 119 to 121 | The legs with the stump and the base from the front right and the front (119 is reference 42) |
| JBU 124 | The right lower leg, the stump with its rows of claw cuts and its branch stubs, and the base, from the front right (seen at 1280 px) |
| JBU 125 | The feet, the foot of the stump and the base from the front (landscape) |
| JBU 126 | The left foot and the base's chisel-cut facets, the stump's foot at the edge (landscape; seen at 1280 px) |
| JBU 127 | The right foot with the stump's claw rows and the base from the front (seen at 1280 px) |
| JBU 128 | The left foot at the base's edge from the front left: the base's flat top and front face |

What `references.md` should gain (this record does not edit it): rows for the stump (JBU 124 and 127, with JBU 120, 121 and JBS 020), the base rock (JBU 126 and 128, with JBU 125 and 117), the feet (JBU 125 to 128, in place of the 386 × 133 crop of reference 43), the sling's end and strap at the left hand (JBS 053, 097, 098, 107, 108), the right hand at the thigh (JBS 040 to 050 and 069 to 071), the face and pupils close (JBS 087, 088, 099, 100, 106) and the drilled curls (JBS 075, 076, 095, 110); a correction of references 32 and 33, which the thumbnails and the 1280-px images show as the head, chest and left hand from the front, below; and in "Gaps", that the stump, the base, the feet and the pupils now have open images, while the top of the head still has none (every file of both series is shot from the floor).

## Findings

Severity: high marks what the owner sees in an ordinary viewing of the finished statue or the making; medium what shows from a preset or in a close look; low what shows only in a detail or the tooling. Captures are named by their query; every one is under the worktree's ignored `.shots/` and none is committed.

**V1, high. Concave detail and narrow gaps keep stair-stepped stone at t = 25.**
- Captures: `view=free&t=25&noui=1&cam=0,4.88,0.75,0,4.86,0.1` and `cam=1.0,4.78,1.0,0.05,4.75,0.05` (the eyes, lids, brows and lips as stacked horizontal ledges); `cam=0,4.88,1.3,0,4.8,0.05` and `cam=-1.3,4.85,0.25,0,4.82,0.05` (the curls as blocky ledges); `cam=0.45,4.22,1.3,0.3,4.15,0.1` and `cam=0.75,4.0,1.0,0.3,3.95,0.1` (the left hand's finger edges saw-toothed); `cam=-0.95,2.2,0.75,-0.72,2.15,0.05` (a stepped web between the right hand's edge and the thigh); `cam=0,2.0,1.6,0,1.9,0.1` (a saw-toothed ridge down the crease between the thighs).
- References: 31 and 32, JBS 087, 088 and 099 (smooth, deeply cut eyes and lids), JBS 110 and 095 (rounded locks with drilled recesses), 34 and JBS 044 to 049 (a dark gap between the right hand and the thigh), 40 and JBU 115 (a clean crease).
- What differs: the statue's eyes, lids and lips are smooth and deeply cut; the page's are terraces of 8 mm stone. The figure grid's own surface, shaded from its signed distance, is smooth in the same places (the face and the curls, and a clean crease between the thighs), so the steps are stock the late tools did not take down to the figure. At the right hand the figure grid itself leaves a gap of only one cell (8 mm) between the hand and the thigh at most heights from y 2.18 to 2.34 m, and in some columns no gap, so there part of the web may be the grid's.
- Owner: engine (generators and kernel: the rasp, file, pumice and polish footprints of 3 to 15 cm cannot enter a concavity narrower than themselves, and the roundel, file and drill steps for the face and hair are few); the model for the hand's one-cell gap.
- Smallest fix: measure stock minus figure over the face, hair, hands and crease on the last snapshot; then plan the file-details and last-touches blows from that residual, with a footprint smaller than the concavity, until its 95th percentile is under the step's margin. Record the hand's 1-cell gap as a known compromise of the 8 mm grid.

**V2, high. Stone hangs in the air during "The point opens the sides", and the back is opened inside that step.**
- Captures: `view=back&t=9.25`, `view=back&t=9.5`, `view=back&t=9.75`, `view=three-quarter&t=9.5`, `view=left&t=9.5`; for contrast `view=back&t=9` (the back still block) and `view=back&t=10.5` (clean after the step's end).
- Research: technique.md, "How marble behaves under the tools" (chips break off and fall) and stage 4 (the sides and the back reached last, in the same order of tools); local rules (the material and how it breaks are authentic).
- What differs: from t = 9.25 to 10, dozens of plates and cubes of stone float unattached around the head, the raised arm, the torso and the legs, seen from the back, the three-quarter and the left presets, for most of the longest step (weight 3.0, about 36 s at 1×); a full-height slab of block stands behind the figure's right half at t = 9.25 and is gone by t = 9.75, so the figure's back is bare before "The point opens the back" (t = 10 to 11) starts. Islands cut loose are swept only when the step's last blow applies (spec, Undo and replay), so until then they hang where they were cut.
- Owner: engine (`src/stock/sweep.ts` runs at a step's end only; the sides-point generator cuts through the block's depth).
- Smallest fix: sweep, at each visible cycle's strike, the pieces that cycle cut loose (the planner can label them on its scratch stock and record them in the cycle's last blow, as the step-end sweep is recorded), which changes the plan file (a PLAN_VERSION bump); and stop the sides pass at the centre plane so the back step opens the back.

**V3, medium. A flat-faced stub of stone between the right hand's fingers.**
- Captures: `cam=-0.55,2.35,-0.75,-0.68,2.28,0.0`, `cam=-1.3,2.4,-1.0,-0.72,2.3,0.0` with and without `finish=1`, `cam=-1.9,2.4,0.4,-0.72,2.3,0.0`, all at t = 25.
- References: 30, JBS 070 and JBS 071 (the stone or the sling's end held in the right hand: rounded, continuous with the fingers and the thumb).
- What differs: confirmed: a short cylinder with a planar end face stands between the fingers, facing back. It carries the polish's code, so the rubbing steps reached its surface, but that does not prove it is the figure's surface. The figure grid's shaded relief from behind at 8 mm does not settle whether the planar face is in the grid (the mesh is hole-filled by the pipeline) or uncut stock.
- Owner: open between the model (the grid's hole fill) and the engine (stock left in the gap).
- Smallest fix: one probe of stock minus figure on the last snapshot in the box x −0.85 to −0.55, y 2.15 to 2.45, z −0.2 to 0.25; if the figure carries the face, round the cap in `scripts/build-grid.mjs` or record it in `docs/research/mesh-sources.md`; if it is stock, add the hand's inner gap to the web-clearing pass's region.

**V4, high. From the fine claw to the pumice the flesh looks the same.**
- Captures: `cam=0,3.4,2.2,0,3.3,0.1` at t = 9, 15, 19, 21 and 23; `view=front` and `view=three-quarter` at t = 15, 19 and 21; `view=follow&t=12.5072`, `view=follow&t=19.5001`, `view=follow&t=21.5002`.
- Research: technique.md stages 4 to 7 (fine crossing claw bands under 1 mm deep; a dull skin of crossing scratches; a satin sheen).
- What differs: at 2.1 m the torso at t = 15 (the fine claw done), 19 (drilled) and 21 (rasped) is one smooth skin that already looks finished; the fine claw's bands and the rasp's scratches the record describes never show, and t = 15 to 22 (5.7 of the 25.2 weights, about 70 s at 1×) changes nothing visible on the flesh but the tools. `marbleBands` in `src/viewer/marble-glsl.ts` fades a band out between seven and three pixels a band: at this viewport's 45° field a pixel spans about 0.83 mm per metre, so the fine claw's 3 mm bands are gone beyond about 1.1 m, the claw's 6 mm beyond 2.2 m and the rasp's 2 mm beyond 0.7 m; the follow view frames at 1 to 2.2 m and the presets at 2.4 m and more.
- Owner: page (shader).
- Smallest fix: fade the toothed and rasp bands to a floor that still reads as worked stone (a residual shading or roughness pattern) instead of to nothing, and give each finish code a tone and roughness step a viewer at 2 m can tell apart.

**V5, medium. The point's work reads as crescents and the claw's as scattered dashes.**
- Captures: `cam=0,3.4,2.2,0,3.3,0.1` at t = 7 and 9, `view=front&t=7`, `view=front&t=6.5`, `view=follow&t=7.2266`, `view=follow&t=8.50294`.
- Research: technique.md stage 2 (a faceted figure in parallel point furrows; the 45-degree stroke cuts "a series of more controlled parallel lines") and stage 3 (the claw combs the furrows down in bands).
- What differs: at t = 7 the roughed figure is covered in overlapping crescents, like fish scales or bird tracks, and the ground behind it in scalloped crater rims; at t = 9 the claw leaves short straight dashes in every direction over the crescents, not runs of parallel grooves.
- Owner: engine (generators: crater rims and short alternating furrow runs) and page (the point's pit shading).
- Smallest fix: let the last roughing pass on the figure lay long overlapping runs of the 45-degree stroke along the contour, keeping the round craters to the ground, and let each claw patch run its strokes side by side in one direction.

**V6, medium. The stump and the base read smooth where the statue shows claw rows and chisel facets.**
- Captures: `cam=-1.5,1.1,-1.4,-0.3,0.95,-0.35` at t = 23 and at t = 25 with `finish=1`; `cam=0,0.7,2.2,0,0.3,0.1` with and without `finish=1`; `cam=0.05,0.8,1.6,0.05,0.4,0.15`.
- References: JBU 124 and 127 (the stump's deep horizontal claw rows), JBU 126 and 128 (the base's flat chisel-cut facets and claw hatching), JBS 020.
- What differs: the finish codes are right (claw and fine claw on the stump, fine claw on the base), but the stump at t = 23 is as smooth as polished flesh and the base is a field of soft rounded mounds; the cause is V4's fade.
- Owner: page (shader); engine for the base's last pass.
- Smallest fix: V4's floor; and let the stump and the base end on the coarse claw, the record's texture there, instead of the fine claw.

**V7, low. Single-cell nubs and thin fins stand on finished surfaces.**
- Captures: `cam=0,2.0,1.6,0,1.9,0.1` (cubes of about 8 mm on the left thigh), `cam=0,3.4,2.2,0,3.3,0.1` at t = 15, 19 and 21 (the same nubs on the abdomen through the rasps and the pumice), `view=back&t=10.5`, `cam=0,0.7,2.2,0,0.3,0.1` and `cam=0.05,0.8,1.6,0.05,0.4,0.15` (thin fins over the base).
- References: 39 and 40 (a clean polished skin), JBU 126 and 128 (the base).
- What differs: cell-sized bumps survive every rubbing step on the flesh, and sharp fins stand on the base at t = 25.
- Owner: engine (generators: footprints that miss single cells; no clearing pass over the base).
- Smallest fix: in the last flesh step, cut any stock standing more than half a cell proud of the figure inside its region (the carving rule allows it), and give the base one claw pass at its margin.

**V8, medium. The gilding covers the stump in patches and the strap with toothed edges.**
- Captures: `view=back&t=25`, `view=sling-and-stump&t=25`, `cam=-1.5,1.1,-1.4,-0.3,0.95,-0.35`, `cam=0.05,0.8,1.6,0.05,0.4,0.15`, `cam=0,2.0,1.6,0,1.9,0.1`, `cam=0.9,5.0,-1.1,0.0,4.2,-0.2`, all at t = 25; `view=follow&t=24.5000` to `24.5030`.
- Research: david-history.md, The gilded details (the broncone and the sling were gilded in 1504; the rough texture of both helped the gold bond); technique.md stage 8. No photograph applies: none of the gilding survives.
- What differs: confirmed: the stump is gold on its front strip and in large patches behind, white on its prong tips, along its sides and between the patches; the strap is a gold band whose edges are 8 mm saw teeth with a white rim on both sides, and a raised gold lip where it crosses the shoulder.
- Owner: engine (regions and `src/choreography/generators/confine.ts`: a leaf blow is dropped where the region is narrower than its footprint).
- Smallest fix: where a full leaf will not fit, paint the region's surface cells inside the footprint instead of dropping the blow (a smaller leaf), so the whole stump and strap turn gold.

**V9, medium. The crown is terraced.**
- Captures: `cam=-0.9,5.15,0.6,0,5.02,0` with and without `finish=1`, `cam=0.35,5.9,0.7,0,5.0,0.0` with and without `finish=1`, `cam=-0.3,5.9,-0.8,0,5.0,0.0`, all at t = 25.
- Research: technique.md and david-history.md (Condivi: the block's old crust showed at the top of the head; Manni: gone by 1746). No open image of the top of the head exists (`references.md`, Gaps; the detail series has none either).
- What differs: confirmed: the top of the head is a stack of horizontal terraces of point-, two-tooth- and claw-cut stone (no block-face code anywhere), with a stepped edge where the finished curls begin. The figure grid's own crown, shaded from above, is a dome of wavy locks with no terraces, so the terraces are stock. A crust of the block's own face cannot remain while the block (`BLOCK_M.height` 5.25 m) stands 8 cm above the statue.
- Owner: engine (regions: the crown is left out of the fine claw and every later pass, so it keeps the planar layers of the point and the claw).
- Smallest fix: end the crown on one claw pass that follows the form at a few millimetres' margin, so it keeps a tooth-cut crust without terraces, and say in decisions.md that the crust is tool-cut, not the block's face.

**V10, medium. No knot is ever shown on the chest.**
- Captures: `cam=0,3.85,2.6,0,3.8,0.77` at t = 2 and 3, `cam=0,3.4,2.2,0,3.3,0.1` at t = 3, `view=front&t=3`.
- Research: technique.md, The record that anchors the timeline (with one or two blows Michelangelo removed a knot it had on the chest); david-history.md (Lavin: a knob Agostino left as a reference).
- What differs: at t = 2 the chest is the block's flat face; at t = 3 the nodo step has dug a pitted dent about 20 cm across with 11 shown blows. The record's knot stood proud and came off in one or two blows. The 11 blows are already open in the plan.
- Owner: engine (choreography: the setup steps).
- Smallest fix: let Agostino's step lower the front by a few centimetres round a 20 cm knob at the nodo box, so the knob stands at t = 2, and let the nodo step take it off with one or two blows.

**V11, medium. The follow view sometimes puts stone between itself and the tool.**
- Captures: `view=follow&t=7.50319` (the frame is the uncut block's face), `view=follow&t=17.5` (the frame is the arm), `view=follow&t=8.50294`, `view=follow&t=24.8152`, `view=follow&t=1.5` (no tool in frame); the standard set's `view=follow&t=0.5017`, `t=7.5000` and `t=8.5005` (no tool in frame).
- Spec: `view=follow` frames the current blow from its normal; `src/viewer/follow.ts` says the side it looks from keeps the stock from standing between the camera and the tool.
- What differs: the framing never checks the stock, so a blow in a recess or behind a slab puts the camera inside or behind stone. The standard set's follow time, `withBlows + (floor(count / 2) + 0.5) / count` in `scripts/lib/standard-set.mjs`, is reckoned in planned blows, not visible cycles, so it lands at an arbitrary phase and often shows no tool at the stone.
- Owner: page (`src/viewer/follow.ts`; `scripts/lib/standard-set.mjs`).
- Smallest fix: sample the stock along the line from the tip to the camera and shorten or swing the pose until the line is clear; take the standard set's follow time at a visible cycle's strike phase.

**V12, low. The polish reads wet.**
- Captures: `cam=0,3.4,2.2,0,3.3,0.1` at t = 23, `view=follow&t=22.3`, `cam=-0.75,2.35,1.15,-0.72,2.3,0.05` and `view=hands&t=25`.
- Research: technique.md stage 7 (a satin sheen on flesh, no mirror gloss); references 1, 34 and 39 (a soft sheen).
- What differs: broad bright highlights run over the abdomen, the arm and the hands as on wet stone.
- Owner: page (shader: `marbleRoughness` gives the polish 0.28).
- Smallest fix: raise the polish code's roughness to about 0.4 and check the torso at t = 23 again.

**V13, low. A false warning about the head bridge.**
- Captures and facts: 32 of the standard set's 40 captures (every one past t = 4) and every later capture past t = 4 log "head-bridge is needed from step 5 (high-points), but stone fills its planks' box up to 2.4 cm deep there (0 blows applied); it stays hidden until the box is clear."; the facts probe at t = 5, 6, 10 and 25 has that problem in `bridgeProblems` while `bridges` lists `head-bridge` as laid.
- Spec: Page, Yard spans (a needed bridge the stone fills is reported).
- What differs: the check ran on the untouched block (0 blows applied) before the position's snapshot landed, and the problem is never withdrawn once the box is clear.
- Owner: page (`src/viewer/bridges.ts` and `layBridges` in `src/main.ts`).
- Smallest fix: check a bridge's box only once the making stands at the player's position with no load or replay pending, and drop a problem when its box is later found clear.

**V14, low. The finish view cannot tell gold from the claw.**
- Captures: `cam=-1.5,1.1,-1.4,-0.3,0.95,-0.35` at t = 25 with and without `finish=1`.
- What differs: in `FINISH_FLAT_COLOURS` (`src/viewer/marble.ts`) gilt is (1.0, 0.8, 0.2) and claw (0.95, 0.85, 0.1), hues of 45° and 53°, so on the stump the gilded and the claw-cut cells look alike with `finish=1`.
- Owner: page (`src/viewer/marble.ts`).
- Smallest fix: give gilt a colour no other code is near, such as white or a dark brown, and keep the legend.

## What matches well

- The pose, the silhouette and the proportions from every side, against references 1, 11, 16, 20, 22, 27 and 42; the sling's course over the left shoulder and down the back (30, 33); the stump's form and place behind the right calf (JBU 124); the feet (JBU 125 to 128).
- The order of the making: Agostino's lump on the legs and the hole between them before 1501; the drawn principal view; the knee and the right hand first; a half relief with the back still block at t = 7; the sides, then the back, then finer tools over the whole figure; the drill at the curls and the pupils; rasps, pumice and polish; on site, the last touches with the file and the gilding.
- The tools at their strike: the point, the two-tooth, the claw, the fine claw and the gilding brush at the stone with the mallet at the head, at plausible angles, with dust at the point's strikes.
- The yard never stands between a preset's camera and the stock, at any of the stage boundaries or mid-step positions captured.
- The finish codes follow the research: tooth codes on the hair, the stump and the base, the polish on the flesh.
- The labels: years for Agostino's steps, days from 9 September 1501 after, a source in every step's detail.

## Findings and disposition

Dispositions by the coordinator, 2026-10-15; the repairs are round 3's (`plan.md`), beside review 2's findings.

| ID | Severity | Finding | Likely owner | Disposition |
|---|---|---|---|---|
| V1 | high | Concave detail and narrow gaps keep stair-stepped stone: the eyes, lips, curls, finger edges, the hand's web at the thigh, the crease between the thighs | engine; model for the hand's one-cell gap | Accepted: plan the late face, hair, hand and crease blows from the residual with a footprint smaller than the concavity (engine-e, with CE4); the hand's one-cell gap is CE19 |
| V2 | high | Stone hangs in the air during the sides step, and the back is opened inside it | engine | Accepted: pieces a visible cycle cuts loose are swept at that cycle, recorded in the plan file (engine-d); the sides pass stops short of the back (engine-c) |
| V3 | medium | A flat-faced stub between the right hand's fingers (known; confirmed) | model or engine, open | Same as review 2 CE19: no stock stands more than 2.5 mm off the figure there at t = N, so the face is the figure grid's (the pipeline's hole fill or a gap under 8 mm); deferred to the refinement boxes, a known compromise |
| V4 | high | From the fine claw to the pumice the flesh looks the same (bands fade out beyond 0.7 to 2.2 m) | page (shader) | Accepted: the marks fade to a floor that still reads as worked stone, each finish code told apart at 2 m (page-6, with CP1) |
| V5 | medium | The point reads as crescents, the claw as scattered dashes | engine and page | Accepted: the last roughing pass on the figure in long runs of the 45-degree stroke (engine-c); the claw's strokes side by side (page-6, with CP1) |
| V6 | medium | The stump and the base read smooth where the statue shows claw rows and chisel facets | page; engine for the base | Accepted: V4's floor (page-6); the stump and the base end on the coarse claw (engine-e) |
| V7 | low | Single-cell nubs and thin fins on finished surfaces | engine | Accepted: the last flesh step takes stock standing more than half a cell proud; one claw pass over the base (engine-e) |
| V8 | medium | The gilding covers the stump in patches and the strap with toothed edges (known; confirmed) | engine | Accepted: same as review 2 CE18 (engine-e); the strap's 8 mm saw teeth are the finish grid's cells: page-6 says whether the shader can soften the gilt boundary without an engine attribute |
| V9 | medium | The crown is terraced (known; confirmed) | engine | Accepted: same as review 2 CE17; the crown ends on a claw pass that follows the form, and decisions.md says the crust is tool-cut (engine-e) |
| V10 | medium | No knot is ever shown; a pit is dug with 11 blows (known in part) | engine | Accepted: same as review 2 CE3 and CE20, a knob left by Agostino and taken off in one or two blows (engine-c) |
| V11 | medium | The follow view puts stone between itself and the tool; the standard set's follow time ignores visible cycles | page | Accepted: the follow pose keeps the stock off the line to the tip; the standard set's follow time at a visible cycle's strike (page-7) |
| V12 | low | The polish reads wet | page (shader) | Accepted (page-6) |
| V13 | low | A false warning about the head bridge in the console and the facts | page | Accepted: same as review 2 XP5 and CP10, and a problem is withdrawn once its box is found clear (page-7) |
| V14 | low | The finish view's gilt and claw colours look alike | page | Accepted (page-6) |

## Verification

- Capture runs (`npm run shots`, all under the lock, which was released after each): `standard` 40 ready, exit 0 (the standard set from the facts: 9 presets and the finish view at t = 25, the front and three-quarter presets at the 9 stage boundaries, 12 follow shots); `close` 20 ready and 2 refused, exit 1; `b2` 21 ready, exit 0; `b3` 28 ready and 4 refused, exit 1; `b4` 8, `b5` 11, `b6` 2, `b7` 13 and `b8` 10 ready, each exit 0. The refused poses were `cam=0,4.82,1.3,0,4.8,0.05`, `cam=0.45,4.15,1.3,0.3,4.15,0.1`, `cam=-0.95,2.15,0.75,-0.72,2.3,0.05`, `cam=0,4.86,0.75,0,4.86,0.1`, `cam=0.75,3.85,1.0,0.3,4.15,0.1` and `cam=0.05,1.4,2.0,0.05,1.4,0`, each level with or below its target, past the orbit's 88.9° limit; each was shot again from an allowed pose.
- Every query captured, by batch, each prefixed `?shot=1&`. standard: `view=front&t=25`; `view=back&t=25`; `view=left&t=25`; `view=right&t=25`; `view=three-quarter&t=25`; `view=head&t=25`; `view=hands&t=25`; `view=sling-and-stump&t=25`; `view=free&t=25`; `view=front&t=25&finish=1`; `view=front&t=0`, `3`, `4`, `7`, `9`, `15`, `19`, `21`, `23` and `view=three-quarter` at the same nine; `view=follow&t=` `0.5017`, `3.5013`, `7.5000`, `8.5005`, `12.5001`, `14.5011`, `15.5040`, `19.5001`, `20.5002`, `21.5002`, `22.5000`, `24.5013`.
- close, each `view=free&t=25&noui=1&cam=`: `-1.3,4.85,0.25,0,4.82,0.05`; `1.0,4.78,1.0,0.05,4.75,0.05`; `0.35,5.9,0.7,0,5.0,0.0`; `-0.3,5.9,-0.8,0,5.0,0.0`; `-0.75,2.35,1.15,-0.72,2.3,0.05`; `-1.9,2.4,0.4,-0.72,2.3,0.0`; `-1.3,2.4,-1.0,-0.72,2.3,0.0`; `1.5,4.2,0.4,0.3,4.15,0.05`; `0.9,5.0,-1.1,0.0,4.2,-0.2`; `-0.2,3.7,-2.4,-0.25,3.5,-0.3`; `-1.5,3.0,-1.6,-0.5,2.9,-0.15`; `-1.5,1.1,-1.4,-0.3,0.95,-0.35`; `-1.9,1.0,-0.35,-0.3,0.9,-0.3`; `-1.3,1.0,1.3,-0.3,0.9,-0.1`; `0,0.7,2.2,0,0.3,0.1`; `0,0.8,-2.2,0,0.3,-0.1`; `0.05,0.8,1.6,0.05,0.4,0.15`; `0,3.5,-2.8,0,3.4,-0.1`; `0,3.4,2.2,0,3.3,0.1`; `0,1.7,2.2,0,1.6,0.1`.
- b2: `view=free&t=25&noui=1&cam=0,4.88,1.3,0,4.8,0.05`; `view=free&t=25&noui=1&cam=0.45,4.22,1.3,0.3,4.15,0.1`; `view=free&noui=1&cam=0,3.85,2.6,0,3.8,0.77` at t = 2 and 3; `view=free&noui=1&cam=0,3.4,2.2,0,3.3,0.1` at t = 3, 7, 9, 15, 19, 21 and 23; `view=free&t=15&noui=1&cam=1.0,4.78,1.0,0.05,4.75,0.05`; `view=follow&t=` `0.3`, `0.7`, `4.5`, `6.5`, `7.3`, `7.7`, `8.3`, `12.3`, `22.3`.
- b3: `view=free&noui=1&cam=-0.75,2.35,1.15,-0.72,2.3,0.05` at t = 25 with `finish=1` and at t = 19; `view=free&t=25&noui=1&cam=-0.9,5.15,0.6,0,5.02,0`; `view=free&t=25&noui=1&finish=1&cam=` `0.35,5.9,0.7,0,5.0,0.0`, `1.0,4.78,1.0,0.05,4.75,0.05`, `-1.5,1.1,-1.4,-0.3,0.95,-0.35` and `0,0.7,2.2,0,0.3,0.1`; `view=free&t=23&noui=1&cam=-1.5,1.1,-1.4,-0.3,0.95,-0.35`; `view=front&t=1`, `2`, `3`; `view=free&t=2&noui=1&cam=0.05,1.45,-2.0,0.05,1.4,0`; `view=back&t=10`, `11`, `12`; `view=left&t=10`; `view=right&t=12`; `view=three-quarter&t=7.5`; `view=three-quarter&t=0.5017`; `view=sling-and-stump&t=24.5013`; `view=follow&t=` `7.49`, `24.48`, `16.5`, `17.5`, `18.5`, `23.5`, `2.5`, `1.5`.
- b4: `view=free&t=25&noui=1&cam=` `-0.95,2.2,0.75,-0.72,2.15,0.05`, `0,4.88,0.75,0,4.86,0.1`, `0.75,4.0,1.0,0.3,3.95,0.1` (also with `finish=1`), `1.6,3.2,0.0,0,3.0,0`, `-1.6,3.2,0.0,0,3.0,0`, `0,2.0,1.6,0,1.9,0.1`; `view=free&t=2&noui=1&cam=0.05,1.45,2.0,0.05,1.4,0`.
- b5: `view=free&t=25&noui=1&finish=1&cam=-1.3,2.4,-1.0,-0.72,2.3,0.0`; `view=free&t=25&noui=1&cam=-0.55,2.35,-0.75,-0.68,2.28,0.0`; `view=free&t=25&noui=1&finish=1&cam=-0.9,5.15,0.6,0,5.02,0`; `view=follow&t=` `24.5000`, `24.5005`, `24.5010`, `24.5020`, `24.5030`, `0.5000`, `0.5010`, `0.5030`.
- b6: `view=back&t=9`; `view=back&t=9.5`. b7: `view=follow&t=` `0.25357`, `0.51548`, `0.73`, `7.2266`, `7.50319`, `7.7585`, `8.2088`, `8.50294`, `8.7971`, `24.19018`, `24.5116`, `24.8152`, `12.5072`. b8: `view=left&t=9.5`; `view=three-quarter&t=9.5`; `view=back&t=9.25`; `view=back&t=9.75`; `view=back&t=10.5`; `view=right&t=11.5`; `view=front&t=5.5`; `view=front&t=6.5`; `view=three-quarter&t=0.75`; `view=back&t=1.5`.
- References by number and address (`https://commons.wikimedia.org/wiki/File:` plus the name): 1 `%27David%27_by_Michelangelo_Fir_JBU002.jpg`; 11 `Michelangelo%27s_David_-_right_view_2.jpg`; 16 `Michelangelo_buonarroti,_david,_1501-1504,_01.jpg`; 20 `Michelangelo_buonarroti,_david,_1501-1504,_05.jpg`; 22 `%27David%27_by_Michelangelo_FI_Acca_JBS_020.jpg`; 27 `Michelangelo_buonarroti,_david,_1501-1504,_03.jpg`; 29 `%27David%27_by_Michelangelo_Fir_JBU028.jpg`; 30 `%27David%27_by_Michelangelo_Fir_JBU031.jpg`; 31 `David_Head_and_Left_Arm.jpg`; 32 `%27David%27_by_Michelangelo_FI_Acca_JBS_029.jpg`; 33 `%27David%27_by_Michelangelo_FI_Acca_JBS_028.jpg`; 34 `David_Hand.jpg`; 35 `%27David%27_by_Michelangelo_Fir_JBU035.jpg`; 42 `%27David%27_by_Michelangelo_FI_Acca_JBU_119.jpg`; and the detail series `%27David%27_by_Michelangelo_FI_Acca_JBS_<nnn>.jpg` and `%27David%27_by_Michelangelo_FI_Acca_JBU_<nnn>.jpg` through https://commons.wikimedia.org/wiki/Category:Details_of_David_by_Michelangelo_Buonarroti.
- Facts probe at t = 4, 5, 6, 10, 25: `planSource` `file` throughout; `blowsApplied` 775, 1,380, 1,652, 5,794, 28,986; `bridges` none at 4, `head-bridge` from 5, `head-bridge` and `back-bridge-3.2` from 10; `bridgeProblems` the head-bridge message from 5 on.
- Figure-grid probes: the face, the curls and the crown (from above) smooth in the figure's own shaded surface; the crease between the thighs a clean junction above the gap; between the right hand and the thigh, the narrowest gap per height is 3 cells at y 2.14 m, 1 cell (8 mm) from 2.18 to 2.34 m, 5 cells at 2.38 m and 14 or more from 2.42 m, with some columns from 2.14 to 2.34 m showing one unbroken run (the hand fused to the thigh, or the thigh alone); the hand's stub not resolved at 8 mm.
- Gates: none run; this commit adds one doc and touches no code (AGENTS.md: docs-only work uses content checks). Content checks: one line per paragraph, the revision named, every finding with an ID, severity, captures, reference, owner and fix.
