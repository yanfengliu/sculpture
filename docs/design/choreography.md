# Choreography of the David

The step list the page plays, derived from `docs/research/technique.md` (the stages, their order, tools, margins and shares of time) and `docs/research/david-history.md` (the dates). This is the contract for `src/choreography/david-steps.ts`; a step there carries exactly these fields, and a change is made here first. Where the record is silent the choice is marked (inferred) and its reason given; the decisions themselves are in `docs/research/decisions.md`.

## Calendar

The two documented anchors are the start on 13 September 1501 and the half-done report of 28 February 1502 (168 days), and "nearly finished" on 25 January 1504 (697 days more). The technique note's inferred shares of time are scaled inside each span so the anchors hold: before the report, roughing takes 12/19 of the span and the coarse claw 7/19; after it, the fine claw 37/72, drilling 8/72, rasps 12/72 and polishing 15/72. The nodo blows of 9 September 1501 open the calendar; the public showing of 23 June 1503 falls in the rasping stage; the on-site stage runs from the move of 14 May 1504 to the unveiling of 8 September 1504. The label shows the day count from 13 September 1501.

| Stage | From | To | Share |
|---|---|---|---|
| setup | 1501-09-09 | 1501-09-13 | the nodo and the start |
| layout | 1501-09-13 | 1501-09-20 | 1 % (inferred) |
| roughing | 1501-09-20 | 1502-01-04 | 12/19 of the first span |
| coarse-claw | 1502-01-04 | 1502-02-28 | 7/19 of the first span, to "iam semifactum" |
| fine-claw | 1502-02-28 | 1503-02-21 | 37/72 of the second span |
| drilling | 1503-02-21 | 1503-05-09 | 8/72 |
| rasping | 1503-05-09 | 1503-09-02 | 12/72; the door opened on 23 June 1503 |
| polishing | 1503-09-02 | 1504-01-25 | 15/72, to "nearly finished" |
| on-site | 1504-05-14 | 1504-09-08 | the move, the base, the touches, the gilding |

## Regions

Regions are boxes in world metres on the figure as placed by `src/david/frame.ts` (y from 0 at the bottom of the rock base), with a predicate on the figure's outward normal where a face matters. The bands below are fractions of the statue's 5.17 m, read off the reference photographs (inferred; the pipeline's silhouettes and the captures check them, and `src/choreography/regions.ts` holds the numbers).

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

## Steps

Margins are the stone left above the final surface at the end of the step, in millimetres, from the technique note's bounds. `blowsPerShown` is the number of real blows one shown blow stands for: the step's days times five working hours times the tool's documented rate (point one a second, toothed chisels one and a half, the drill counted as one hole, rasps and abrasives one stroke a second), divided by the shown blows the generator plans; the generator budget per step is in the table and the label shows the rounded ratio. Weights set playback length: the whole making plays in about five minutes at 1×.

| # | Stage | Step id | Tool | Region | Margin | Blows (shown) | Weight | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | setup | nodo | point | a 0.2 m box at the chest, front | 30 | 2 | 0.5 | technique.md stage 0; the 9 September entry |
| 2 | layout | principal-view | charcoal | front face of the block | 0 | 400 | 0.6 | technique.md stage 1; Cellini on drawing the principal view |
| 3 | roughing | high-points | point | high-points | 30 | 1,500 | 1.2 | technique.md stage 2; Vasari's water rule, St Matthew's knee and hand |
| 4 | roughing | chest-and-face | point | chest-and-face | 30 | 1,500 | 1.2 | technique.md stage 2 |
| 5 | roughing | front-furrows | point | front | 20 | 3,000 | 1.6 | technique.md stage 2; the sculptor's 45° stroke |
| 6 | coarse-claw | two-tooth-front | two-tooth | front | 8 | 1,200 | 1.0 | technique.md stage 3; Vasari's order |
| 7 | coarse-claw | claw-front | claw | front | 4 | 1,200 | 1.0 | technique.md stage 3; the 28 February 1502 valuation ends it |
| 8 | fine-claw | sides-point | point | left-side and right-side | 20 | 1,500 | 1.0 | technique.md stage 4; sides and back reached last (inferred: the point still opens them) |
| 9 | fine-claw | back-point | point | back | 20 | 1,200 | 0.9 | as 8 |
| 10 | fine-claw | sides-and-back-claw | claw | left-side, right-side, back | 4 | 1,500 | 1.0 | technique.md stage 4 |
| 11 | fine-claw | fine-claw-all | fine-claw | whole | 1.5 | 2,000 | 1.4 | technique.md stage 4; the dente di cane traces of 2003 |
| 12 | fine-claw | roundel-hollows | roundel | head, left-hand, right-hand | 1.5 | 600 | 0.8 | technique.md stage 4; the unghietto traces |
| 13 | drilling | hairline-and-curls | drill | hair | 0 | 300 | 0.8 | technique.md stage 5; the Stanford head page |
| 14 | drilling | pupils-and-nostrils | drill | face | 0 | 12 | 0.4 | technique.md stage 5 |
| 15 | drilling | fingers-sling-stump | drill | left-hand, sling, stump | 0 | 200 | 0.7 | technique.md stage 5 (inferred for the David) |
| 16 | rasping | rasp-flesh | rasp | flesh | 0.5 | 1,500 | 1.1 | technique.md stage 6 |
| 17 | rasping | file-details | file | face, left-hand, right-hand | 0.2 | 500 | 0.7 | technique.md stage 6 |
| 18 | polishing | pumice-flesh | pumice | flesh | 0 | 1,500 | 1.1 | technique.md stage 7; Cellini's white pumice |
| 19 | polishing | tripoli-straw-leather | polish | flesh | 0 | 1,000 | 0.9 | technique.md stage 7; Vasari's straw bunches |
| 20 | on-site | last-touches | fine-claw | face, hair | 0 | 60 | 0.5 | technique.md stage 8; Soderini and the nose |
| 21 | on-site | gilding | gilding | sling, stump | 0 | 300 | 0.7 | technique.md stage 8; the gilded broncone and sling |

About 22,000 shown blows, under the plan budget of 60,000 and near the 20,000 the decisions note sizes the time-lapse on. Weights sum to about 20, so at `BASE_SECONDS` of 12 the making plays in about four minutes at 1×.

## What each step's detail says

Each `detail` names its tool in Italian and English, the real blows one shown blow stands for, and the research section, for example: "Subbia (point) and iron mallet, one shown blow for about 190 real ones; the highest points of the front come out first, as Vasari's water rule and St Matthew's knee show (technique.md, stage 2)."

## Known compromises

- The two-tooth chisel's teeth, the claw's bands and the rasp's scratches are below the 8 mm grid and are shown by the finish attribute's shading, not by geometry.
- Drill holes at 8 mm come out wider than the documented 3 to 8 mm bits; the drilling steps say so in their detail until the refinement boxes land.
- The sling and stump regions are boxes, so a few blows of the gilding brush may touch neighbouring flesh; the generator confines the brush to cells whose finish is still claw or roundel texture, which is where the gilding bonded.
- The garland of 28 copper leaves on a brass thread was a separate object and is not shown.
