# sculpture

An animated 3D making-of of a famous single-figure sculpture: the real tools, in the real order, on the real material, with no sculptor shown. See `AGENTS.md` for the stack and gates and `docs/design/spec.md` for the contract.

## Run

- Node 24 (`.nvmrc`), then `npm install`.
- `npm run dev` serves the page at http://127.0.0.1:5181 (`SCULPTURE_PORT` picks another port); `npm run build` writes `dist/` and `npm run preview` serves it.
- `?shot=1` is capture mode and `?cam=px,py,pz,tx,ty,tz` sets the camera; the whole query contract is in `docs/design/spec.md`.

## Model pipeline

`npm run model` fetches the David mesh and builds the figure grid the page loads; `npm run model:fetch` and `npm run model:grid` run the two halves. The fetch (`scripts/fetch-model.mjs`) checks the Wikimedia Commons record against `docs/research/mesh-sources.md` (size, SHA-1, licence CC BY-SA 4.0), downloads the 60 MB STL into `assets/cache/david/` (ignored, never executed), verifies the SHA-1 and writes `SOURCE.json` with the attribution; a cached file with the right digest skips the download. The build (`scripts/build-grid.mjs`) parses the STL, turns the figure upright and facing +Z (the decisions and their numbers are logged; `scripts/lib/model/normalise.mjs` says how), scales it to `STATUE_HEIGHT_M`, checks the shell is closed and consistently wound, renders `output/model/{front,back,left,right,top}.png` to look at, samples the signed distance on the `BLOCK_M` lattice in worker threads, checks the grid's volume against the mesh's and writes `public/model/david.json` and `david.bin.gz` in the format of `src/contracts/grid.ts`. Options: `--cell=<metres>` overrides `DEFAULT_CELL_M`, `--block=auto` lattices the figure's own box plus 0.05 m when it does not fit `BLOCK_M`, `--workers=<n>` sets the thread count. Everything it writes lives under ignored paths; the mesh is never committed.

## Verify

- `npm run verify`: unit tests, typecheck, lint, build and the Playwright suite (`tests/e2e/`: the smoke test, every control and keyboard shortcut through real input, the query contract, and the check that a position reached through the controls gives the label and pixels of `?shot=1&t=`), in that order; all green before any commit that touches code.
- `npm run audit:full` and `npm run audit:runtime`: both must report 0 vulnerabilities; rerun on every dependency change.
- `npm run shots` with `npm run dev` running writes the standard set into `.shots/`: every preset at the finished state, the front and three-quarter presets at each stage boundary, the follow view mid-blow for each tool, and the finish codes; `SHOT_LIST` captures explicit shots instead. Look at each PNG at native resolution. `AGENTS.md` (Gates) says what each check proves.
- `npm run sweep -- --t <t> --count <n>` writes random camera angles around the block at `t` into `.shots/sweep/` for exploration.
- `npm run video` dumps frames through `?shot=1&t=` at 30 fps over the whole making at 1920 × 1080 and encodes `output/making-of.webm` (VP8, Playwright's bundled ffmpeg); `--from`, `--to`, `--fps` bound it and `--quick` makes a few seconds for checking.
