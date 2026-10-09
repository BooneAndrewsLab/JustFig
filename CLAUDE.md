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
- The icon library is not in this repo: `npm run icons` puts the release pinned in
  `icons.lock.json` into `public/lib/<version>/` (from `../justfig-icons/dist` when built, else the
  private repo's release, which needs `JUSTFIG_ICONS_TOKEN`; CI has it as a secret). Bumping it: tag `v<version>` in justfig-icons,
  copy the release's version and `.sha256` into the lock, update `BRAND.iconLibraryPath`, then
  `npm run icons:fixture`.
  Unit tests use the committed `src/icons/fixtures/lib/`, never `public/lib/`.
- **Branding:** the display name lives only in `src/brand.ts`
  (`src/brand.test.ts` enforces it). The format id `justfig` in saved files
  and the IndexedDB name are permanent and separate.
- **One renderer:** `objectToNode` (pure) → `SvgNode` → React on screen,
  `nodeToSvgString` for every export. Never draw an object any other way.
- **Export subset:** plain SVG 1.1 presentation attributes only. No `<marker>`, filters, masks,
  `foreignObject`, CSS variables, `<style>` in exported pages, `vector-effect`, `baseline-shift`,
  `dominant-baseline`. Arrowheads are path geometry; sub/sup are tspans with explicit x/y/size;
  a crop draws its re-encoded pixels (`Image.cropped`, note 20), never a clip.
- **Text layout** is ours (opentype.js on `public/fonts/*.ttf`), never the
  browser's: every run is placed with explicit x/y, kerning off; imported SVG text too (note 14).
- **Units:** the model is in points (1/72 in); the UI shows mm or inches.
- **Resizing paths/arrows bakes the scale into the points**; icons and
  images scale by transform.
- **Every document change is a named edit** in `src/core/edits/` and one
  undo step; continuous drags coalesce via `coalesceKey` (history.ts).
- **Storage** (note 02): IndexedDB holds one row per `doc.id`, capped (30 figures / ~150 M chars,
  oldest evicted, never the one just saved). Anything that replaces the open figure must
  `flush()` the autosaver first; never use `window.confirm` (in-app `Dialog` only).
- **Files:** `.jfig` is plain JSON, hand-decoded in `src/io/jfig.ts`, with
  `MIGRATIONS`; a schema bump ships a frozen fixture and a round-trip test.
- **Icons** go through `src/icons/library.ts` (manifest, shards, MiniSearch
  index, sprite sheets of the `justfig-icons` release); placing one copies its
  SVG and licence meta into `doc.assets`. Attribution is derived, never stored;
  a recoloured CC BY/BY-SA icon is credited "modified". The library is data
  from another repo: paths stay inside it, CREDITS.md renders as text only.
- **Share-alike** (CC BY-SA) icons stay hidden unless the user opts in.
- **Procedural objects** (note 04): a kind in `src/procedural/kinds/` is declarative `fields`
  plus a PURE `render` to primitives, merged into one path per colour. Never add per-kind UI:
  the Inspector, decoder and test arbitraries come from `fields`. A new kind needs golden SVGs
  (`goldenCases.ts`) and must pass the bounded-render property test; changing a kind's params
  shape means bumping its `version` with a `migrate`. Params stay raw JSON in the model.
- **Fragments** (note 05) are the contract with PlasmidPop and BarelySig; frozen fixtures in
  `src/io/fixtures/` (PlasmidPop's pBR322 fragment; BarelySig 1.0.0's real SVG export and its
  recipe). Never write the display name into a fragment or kind (the brand test scans `src/`).
  PlasmidPop and BarelySig are read-only from here: build the import side against fixtures.
- **Arrow binding** (note 06) is solved only by `reconcileBindings`, run in `store.edit` after
  every edit; never move bound arrows in an edit. Copies go through `cloneObjects` (remaps it).
- **Colours** (note 07): paints are `{hex}` or `{swatch}`; recolour edits live in `src/palette/`.
  Procedural colour params are plain hex that palettes never recolour; their pickers offer swatches by copy
  (`ColorInput copy`), not link.
  Never link icon *default* colours (an override makes a CC BY credit say "modified").
- **Gallery entries** (note 08) are code in `src/gallery/`, built from the factories.
- **Shortcuts** (note 09) come only from `KEY_ACTIONS` in `src/ui/keyBindings.ts` (codes, not
  `e.key`); fixed keys are handled first in `shortcuts.ts`.
- **User guide** `docs/guide/*.md` is bundled in-app; `src/ui/guide.test.ts` fails when a tool,
  shortcut, panel, dialog, kind, palette or template lacks an entry: document new UI there.
- **Accessibility:** `e2e/a11y.spec.ts` (axe, no serious/critical) and keyboard e2e; every
  control must work from the keyboard. Dialogs use `ui/dialogs/Dialog.tsx` (focus trap).
- Analytics: `src/ui/analytics.ts` `EVENTS` allow-list only, never figure
  content; no-op when the Matomo env is unset.
