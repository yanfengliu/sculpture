# sculpture

An animated 3D making-of of a famous single-figure sculpture: the real tools, in the real order, on the real material, with no sculptor shown. See `AGENTS.md` for the stack and gates and `docs/design/spec.md` for the contract.

## Run

- Node 24 (`.nvmrc`), then `npm install`.
- `npm run dev` serves the page at http://127.0.0.1:5181 (`SCULPTURE_PORT` picks another port); `npm run build` writes `dist/` and `npm run preview` serves it.
- `?shot=1` is capture mode and `?cam=px,py,pz,tx,ty,tz` sets the camera; the whole query contract is in `docs/design/spec.md`.

## Verify

- `npm run verify`: unit tests, typecheck, lint, build and the Playwright smoke test, in that order; all green before any commit that touches code.
- `npm run audit:full` and `npm run audit:runtime`: both must report 0 vulnerabilities; rerun on every dependency change.
- `node scripts/capture-shots.mjs` with `npm run dev` running writes `.shots/front.png`; look at it. `AGENTS.md` (Gates) says what each check proves.
