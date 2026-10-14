# Gate proofs — sculpture

A gate counts only once it has gone red with its defect reintroduced (`../fleet/docs/lessons-template.md`). Each section records one gate: the claim, the mutation, the red it produced and where the retired evidence can be read back. Sections are kept; a gate that changes gets a new dated section.

## Yard sight lines: no shown span crosses the camera's view of the block (2026-10-14)

**Gate:** `src/viewer/yard-sightlines.test.ts`, the class gate for the defect register's first entry (the fences blocking the view). From every camera preset and some 400 seeded orbit positions (five preset targets, 11 shells from 0.5 m to 80 m, above the target's horizon), no yard span left shown has a piece whose world box crosses a sight line from the camera to the block's eight corners or its centre, up to where the line meets the block. The bench is exempt, as the spec keeps it.

**First run, before the fix:** 76 crossings with the rule as it stood (a span hid when the camera was past the plane through its centre): cameras on a deck, between the scaffold and the block, or just in front of the face above the head bridge looked through timbers and planks the rule kept shown. The rule now hides a span once the camera is past one of its inner faces, the planes that separate its pieces from the block (`src/viewer/yard-spans.ts`, `innerFaces`); the head bridge's plank ends, which stick out past the block's sides, gave the last crossing that a single plane per span could not remove.

**Mutation 1:** in `src/viewer/yard.ts`, the `scaffold-right` span set to `cameraHides: false` (a span that stays shown). Red: `201 crossings`, the first `preset three-quarter: scaffold-right scaffold-right-timbers[1] crosses the sight line to [1.11, 0, -0.77]`.

**Mutation 2:** `cameraOutside` in `src/viewer/yard-spans.ts` put back to the centre-plane test of `97f0b3a`. Red: `116 crossings`.

Both restored; the file passes 3 of 3.
