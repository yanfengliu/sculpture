# Choreography of the David

The step list the page plays, derived from `docs/research/technique.md` (the stages, their order, tools, margins and shares of time) and `docs/research/david-history.md` (the dates). This is the contract for `src/choreography/david-steps.ts`; a step there carries exactly these fields, and a change is made here first. Where the record is silent the choice is marked (inferred) and its reason given; the decisions themselves are in `docs/research/decisions.md`.

## Calendar

The two documented anchors are the start on 13 September 1501 and the half-done report of 28 February 1502 (168 days), and "nearly finished" on 25 January 1504 (696 days more). The technique note's inferred shares of time are scaled inside each span so the anchors hold: before the report, roughing takes 12/19 of the span and the coarse claw 7/19 (the coarse claw's 55 days below are the whole report-to-report remainder after the setup and layout days); after it, the fine claw 37/72, drilling 8/72, rasps 12/72 and polishing 15/72. Agostino di Duccio's roughing of 1464 to 1466 (the end date inferred, `docs/research/decisions.md`) and the hole between the legs open the making, and the label shows their years; the knot blows of 9 September 1501 open Michelangelo's calendar and the label counts days from them (Day 1; the formal start of 13 September is Day 5); the public showing of 23 June 1503 falls in the rasping stage; the statue leaves the Opera on 14 May 1504, and the on-site steps run from the ringhiera of 8 June 1504 to the unveiling of 8 September 1504.

| Stage | From | To | Share |
|---|---|---|---|
| setup | 1464-08-18 | 1501-09-13 | Agostino's roughing and the hole between the legs (1464 to 1466), then the nodo and the start |
| layout | 1501-09-13 | 1501-09-20 | 1 % (inferred) |
| roughing | 1501-09-20 | 1502-01-04 | 12/19 of the first span |
| coarse-claw | 1502-01-04 | 1502-02-28 | 7/19 of the first span, to "iam semifactum" |
| fine-claw | 1502-02-28 | 1503-02-21 | 37/72 of the second span |
| drilling | 1503-02-21 | 1503-05-09 | 8/72 |
| rasping | 1503-05-09 | 1503-09-02 | 12/72; the door opened on 23 June 1503 |
| polishing | 1503-09-02 | 1504-01-25 | 15/72, to "nearly finished" |
| on-site | 1504-06-08 | 1504-09-08 | on the ringhiera after the move of 14 to 18 May: the touches, the gilding |

## Regions

Regions are boxes in world metres on the figure as placed by `src/david/frame.ts` (y from 0 at the bottom of the rock base), with a predicate on the figure's outward normal where a face matters; `src/choreography/regions.ts` holds the numbers, which govern where the table below and the code differ (the code's boxes reach the block's top, 5.25 m, so the stone above the head is cut; the hands, face and hair bands were refined from the pipeline's silhouettes). The bands were read off the reference photographs (inferred). Review found the sling and stump boxes swallow the shoulder, the upper back and the calf (gold landed on flesh), so those two regions become masks derived from the figure, a tube along the strap and the component behind the right leg, in the round after review 0.

| Region | Box (y in m) | Predicate | Note |
|---|---|---|---|
| whole | 0 to 5.17 | none | the whole figure |
| front | 0 to 5.17 | normal z > 0.2 | the principal view |
| left-side, right-side | 0 to 5.17 | normal x > 0.6, normal x < -0.6 | the figure's left is +x when it faces +z |
| back | 0 to 5.17 | normal z < -0.2 | |
| high-points | 1.3 to 3.2 | normal z > 0.5 | the left knee and the right hand, the parts nearest the front face |
| chest-and-face | 3.2 to 5.17 | normal z > 0.2 | |
| head | 4.45 to 5.17 | none | the head with its hair |
| hair | 4.75 to 5.17 | normal y > -0.2 | the crown and curls; keeps texture |
| face | 4.5 to 4.95 | normal z > 0.3 | eyes, nose, mouth |
| left-hand | 3.6 to 4.2, x > 0.3 | none | the hand at the shoulder with the sling |
| right-hand | 2.1 to 2.9, x < -0.4 | none | the hand at the thigh |
| sling | 3.6 to 4.5, x > 0 | normal z < 0.3 | the strap over the left shoulder and down the back (inferred box) |
| stump | 0.4 to 2.0, x < -0.3 | normal z < 0.3 | the tree stump behind the right leg |
| base | 0 to 0.5 | none | the rock; left rough |
| flesh | 0.5 to 5.17 | none, minus hair, sling, stump and base | what is rasped and polished |
| agostino | 0.3 to 2.6 | normal z > 0.2 | Agostino's lump: the legs, the feet and the lower trunk |
| hole | 1.2 to 1.6, x -0.05 to 0.22 | none: it cuts through | the hole between the legs |
| gaps | above the base | minus the crown | the hollows and the gaps between the limbs |
| between-the-legs | 2.0 to 2.4, x -0.35 to 0.05 | none | the crease between the thighs, for the drill rows |

## Steps

Margins are the stone left above the final surface at the end of the step, in millimetres, from the technique note's bounds. `blowsPerShown` is the number of real blows one shown blow stands for: the step's days times five working hours times the tool's documented rate (point one a second, toothed chisels one and a half, rasps and abrasives one stroke a second), divided by the shown blows the generator plans and rounded; where the record gives the count directly (the knot's one or two blows, a drawn mark, a drilled hole, a brush stroke) the step states it instead. The blows column is what the generators plan on the David at 8 mm (`PLAN_VERSION` 2, 2026-10-14: 28,986 in all, read from `public/model/david.plan.bin`); the synthetic figure's counts differ with its shape (25,922 at 8 mm). Weights set playback length and are sized so the blow rate stays within a few hundred a second at 1×: the whole making plays in about five minutes.

| # | Stage | Step id | Tool | Region | Margin | Blows (shown) | Weight | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | setup | agostino | point | agostino: the legs, the feet and the lower trunk, front relief | 80 | 292 | 1.0 | technique.md stage 0; david-history.md, The block (Agostino had begun "only the trunk, lower limbs and feet") |
| 2 | setup | hole-between-legs | point | hole: through between the thighs | 30 | 98 | 0.5 | technique.md stage 0; Vasari's Maestro Simone and the documents on Agostino |
| 3 | setup | nodo | point | a 0.2 m box at the chest, front | 30 | 11 | 0.5 | technique.md stage 0; the 9 September entry |
| 4 | layout | principal-view | charcoal | front face of the block | 0 (removes nothing) | 374 | 0.6 | technique.md stage 1; Cellini on drawing the principal view |
| 5 | roughing | high-points | point | high-points, front relief | 30 | 605 | 0.85 | technique.md stage 2; Vasari's water rule, St Matthew's knee and hand |
| 6 | roughing | chest-and-face | point | chest-and-face, front relief | 30 | 272 | 0.85 | technique.md stage 2 |
| 7 | roughing | front-furrows | point | front relief | 20 | 748 | 2.5 | technique.md stage 2; the legs and base, then the sculptor's 45° stroke |
| 8 | coarse-claw | two-tooth-front | two-tooth | front relief | 8 | 981 | 1.0 | technique.md stage 3; Vasari's order |
| 9 | coarse-claw | claw-front | claw | front relief | 4 | 1,068 | 1.1 | technique.md stage 3; the 28 February 1502 valuation ends it |
| 10 | fine-claw | sides-point | point | left-side and right-side, the top | 20 | 1,345 | 3.0 | technique.md stage 4; sides and back reached last (inferred: the point still opens them); the crown kept under its crust |
| 11 | fine-claw | back-point | point | back relief | 20 | 128 | 0.5 | as above; the sides pass has already opened the stone beside the figure |
| 12 | fine-claw | sides-and-back-claw | claw | left-side, right-side, back | 4 | 1,856 | 1.75 | technique.md stage 4 |
| 13 | fine-claw | fine-claw-all | fine-claw | whole but the crown | 1.5 | 5,564 | 1.9 | technique.md stage 4; the dente di cane traces of 2003 |
| 14 | fine-claw | fine-claw-gaps | fine-claw | gaps: the hollows and the gaps between the limbs, from the open side, not the crown | 1.5 | 558 | 0.5 | technique.md stage 4 |
| 15 | fine-claw | roundel-hollows | roundel | head, left-hand, right-hand | 1.5 | 444 | 0.4 | technique.md stage 4; the unghietto traces |
| 16 | drilling | hairline-and-curls | drill | hair | 0 | 124 | 0.5 | technique.md stage 5; the Stanford head page |
| 17 | drilling | pupils-and-nostrils | drill | face | 0 | 4 | 0.3 | technique.md stage 5 |
| 18 | drilling | fingers-sling-stump | drill | left-hand, sling, stump | 0 | 24 | 0.4 | technique.md stage 5 (inferred for the David) |
| 19 | drilling | between-the-legs | drill | between-the-legs: the crease between the thighs | 0 | 18 | 0.3 | technique.md stage 5; tools.md, Trapano (running holes where the chisel cannot reach) |
| 20 | rasping | rasp-flesh | rasp | flesh | 0.5 | 6,520 | 2.4 | technique.md stage 6 |
| 21 | rasping | file-details | file | face, left-hand, right-hand | 0.2 | 2,430 | 0.5 | technique.md stage 6 |
| 22 | polishing | pumice-flesh | pumice | flesh | 0 | 3,198 | 1.3 | technique.md stage 7; Cellini's white pumice |
| 23 | polishing | tripoli-straw-leather | polish | flesh | 0 | 1,909 | 0.95 | technique.md stage 7; Vasari's straw bunches |
| 24 | on-site | last-touches | file | face, hair | 1 | 29 | 0.3 | technique.md stage 8; Soderini and the nose (a file, since a toothed chisel on the polished face would leave claw marks over the polish) |
| 25 | on-site | gilding | gilding | sling, stump | 0 | 386 | 1.3 | technique.md stage 8; the gilded broncone and sling |

About 29,000 shown blows on the David, under the plan budget of 60,000. Weights sum to 25.2, so at `BASE_SECONDS` of 12 the making plays in about five minutes at 1×. The hollows and the drilled gaps plan few blows on the synthetic mannequin, which has few creases; the David grid gives the roundel and the drill more to do.

## What each step's detail says

Each `detail` names its tool in Italian and English, the real blows one shown blow stands for, and the research section, for example: "Subbia (point) and iron mallet, one shown blow for about 190 real ones; the highest points of the front come out first, as Vasari's water rule and St Matthew's knee show (technique.md, stage 2)."

## Known compromises

- The two-tooth chisel's teeth, the claw's bands and the rasp's scratches are below the 8 mm grid and are shown by the finish attribute's shading, not by geometry.
- Drill holes at 8 mm come out wider than the documented 3 to 8 mm bits; the drilling steps say so in their detail until the refinement boxes land.
- Every footprint tool (the fine claw's patch, the rasp, the file, the pumice, the polish, the gilding leaf) keeps its paint and cut inside its step's region: the planner tries each blow on the step's scratch and moves it inward or drops it (2026-10-14). Where a region is narrower than the footprint, as on the stump beside the calf, the leaf cannot lie, so the stump shows gold in patches; open.
- The garland of 28 copper leaves on a brass thread was a separate object and is not shown.
- Gaps narrower than the 8 mm grid resolves close in the figure grid itself: between the right hand's fingers and the thigh the statue shows a flat face of stone that the real David does not (review 2, CE19); it waits for the 4 mm refinement boxes.
