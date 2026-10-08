# JustFig

This file is loaded into every session, so it holds only what changes how
the code is worked on: decisions, rules, lessons, pointers — not status.
What a release did goes in its Release notes, why in a design note, what
is left in an issue. `src/claudeMd.test.ts` fails the build if it regains
a Status section or names a version other than `package.json`'s (current is 0.1.0).

## What this is

Free, static, browser-only scientific figure editor for wet-lab biologists
(a BioRender alternative). Third sibling of PlasmidPop and BarelySig
(`../PlasmidPop`, `../BarelySig`), built the same way: no backend, no
account, figures never leave the computer. Design notes: `docs/design/`.

## Rules

- **Node** is not on PATH: prefix with `PATH=/home/matej/Programs/miniconda3/envs/node/bin:$PATH`.
- `npm run check` (typecheck, lint, format, unit tests) gates every commit.
  `npm run e2e` runs Playwright on chromium, firefox and webkit. WebKit can't launch on this
  machine (missing libicu 74): run `npx playwright test --project=chromium --project=firefox`
  locally and let CI cover WebKit. `UPDATE_GOLDEN=1` rewrites goldens (Chromium for e2e).
- The stub icon library in `public/lib/stub/` is generated: `npm run icons:stub`.
- **Branding:** the display name lives only in `src/brand.ts`
  (`src/brand.test.ts` enforces it). The format id `justfig` in saved files
  and the IndexedDB name are permanent and separate.
- **One renderer:** `objectToNode` (pure) → `SvgNode` → React on screen,
  `nodeToSvgString` for every export. Never draw an object any other way.
- **Export subset:** plain SVG 1.1 presentation attributes only. No
  `<marker>`, filters, masks, `foreignObject`, CSS variables, `<style>` in
  exported pages, `vector-effect`, `baseline-shift`, `dominant-baseline`.
  Arrowheads are path geometry; sub/sup are tspans with explicit x/y/size.
- **Text layout** is ours (opentype.js on `public/fonts/*.ttf`), never the
  browser's: every run is placed with explicit x/y, kerning off.
- **Units:** the model is in points (1/72 in); the UI shows mm or inches.
- **Resizing paths/arrows bakes the scale into the points**; icons and
  images scale by transform.
- **Every document change is a named edit** in `src/core/edits/` and one
  undo step; continuous drags coalesce via `coalesceKey` (history.ts).
- **Files:** `.jfig` is plain JSON, hand-decoded in `src/io/jfig.ts`, with
  `MIGRATIONS`; a schema bump ships a frozen fixture and a round-trip test.
- **Icons** go through `src/icons/library.ts` (the loader interface the
  Phase 2 `justfig-icons` release also serves); placing one copies its SVG
  and licence meta into `doc.assets`. Attribution is derived, never stored.
- Analytics: `src/ui/analytics.ts` `EVENTS` allow-list only, never figure
  content; no-op when the Matomo env is unset.
