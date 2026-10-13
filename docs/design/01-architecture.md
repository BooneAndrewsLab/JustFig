# 01 Architecture

The editor is a static PWA with no backend, built like its siblings PlasmidPop and BarelySig.
This note records the structure that Phase 1 (editor MVP) puts in place and the extension points
that later phases build on.

## Stack

Copied from BarelySig: React 19, TypeScript ~6.0 strict (`tsconfig.base.json` with
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`), Vite 8, `vite-plugin-pwa`
(`autoUpdate`, registered by hand in `main.tsx`, production only), ESLint `strictTypeChecked`, the
same Prettier config, Vitest + Testing Library + jsdom + fake-indexeddb + fast-check, and Playwright.
Unlike BarelySig, Playwright runs **chromium, firefox and webkit**, because PNG and TIFF export go
through each engine's own SVG rasteriser.

`npm run check` = typecheck, lint, format check and unit tests. CI (`ci.yml`) runs it plus e2e in
all three engines. `deploy.yml` deploys to Pages only from a published GitHub Release, or from a
manual dispatch, after the check and e2e in Chromium at the site's base path (CI covers the
other engines on the same commit).

## Module layout

```
src/
  brand.ts         display name, tagline, repo URL, file ext, MIME, theme colours, icon-lib path
  core/            pure, no DOM
    model/         document types, ids, factories, validation, tree helpers
    geometry/      matrices, bounds, path ops (bezier bounds, hit tests)
    history/       ported from PlasmidPop (coalescing undo/redo)
    edits/         named commands: addObjects, transform, restyle, group, reorder, align...
    snapping/      smart guides (object edges/centres, page edges/centre)
    text/          font registry, opentype.js measuring, rich runs -> glyph-positioned lines
    color/         hex/OKLCH, icon slot tones
    attribution/   assets in use -> credit line
    presets/       page sizes, journal widths
  render/          SvgNode, objectToNode, nodeToSvgString
  icons/           library client: manifest, shards, SVG fetch, SVG -> SvgNode, slot recolouring
  io/              .jfig codec + migrations, SVG/PNG/JPG import, sanitiser, Dexie storage
  export/          svg.ts, pdf.ts, raster.ts, png.ts (pHYs, from BarelySig), tiff.ts, fixtures/
  ui/              App, canvas/ (viewport, tools, overlays), panels/, dialogs/, state/,
                   Logo + logoWordmark (the lockup), icons (line icons; note 50)
```

Phase 1 also has `ui/canvas/` (Canvas with the tools' pointer gestures, PageView, Rulers,
TextEditor), `ui/panels/` (IconBrowser, ToolPalette, Inspector, LayersPanel, PagesBar),
`ui/dialogs/` (Export, Attribution) and `ui/state/` (store, session actions, autosave).

`procedural/` (Phase 3) holds the procedural kinds, their registry, the params decoder,
"Convert to shapes" and snapshots; see note 04. There is no `workers/`: regenerating the largest
procedural objects takes a few milliseconds, so no worker was needed (note 04, Performance).
Raster export runs on the main thread (see note 03).

Phase 4 adds `palette/` (built-in palettes and the swatch-linked recolour edits, note 07),
`gallery/` (templates and examples built in code, note 08), `core/model/binding.ts` (arrow
binding, note 06), `io/barelysig.ts` (BarelySig SVG import, note 05), `ui/keyBindings.ts` (the
shortcut table, note 09), `ui/guide.ts` with `docs/guide/*.md` (the user guide, bundled and
shown in the Guide dialog; `guide.test.ts` checks it covers every tool, shortcut, panel, dialog,
kind, palette and template), and the Gallery, Keyboard shortcuts and Guide dialogs.

## State

One hand-written external store (`ui/state/store.ts`, after BarelySig) read with
`useSyncExternalStore`. It holds the history of the document, the selection, the active page,
the active tool, the view (pan and zoom) and a notice line. The document changes only through
named edits (`core/edits`). Each edit is one undo step, except that a continuous drag, nudge or
slider move passes a `coalesceKey` so that the whole gesture becomes one step (the PlasmidPop
`History.push(..., coalesce)` contract).

Selection is not part of the undo history. After undo or redo, any selected id that no longer
exists is dropped.

## Rendering

The renderer is a hand-rolled SVG scene graph. We do not use Fabric or Konva (reasons are in the
plan). `objectToNode(obj, ctx)` is pure and returns a tiny `{tag, attrs, children}` tree, memoised
per immutable object in a `WeakMap`. The canvas renders that tree with React (`SvgNodeView`), and
every export serialises the same tree with `nodeToSvgString`. Editor-only layers (selection box,
handles, guides, marquee, rulers) are drawn over the page and never exported. Hit-testing uses the
DOM: each top-level object's group carries `data-id`, and thin strokes get a transparent wide
hit stroke on screen only.

## Editing

- **Tools:** select (V), pan (H or Space), rectangle (R), ellipse (E), line (L), pen (P: click for
  corners, drag for smooth nodes, Enter or double-click to finish, click the first node to
  close), arrow (A), text (T) and panel (F). A drawing tool returns to select after one object.
  Keys are the defaults of the binding table (note 09); the user can move them.
- **Arrows** pressed or released on an object attach to it and follow it (note 06).
- **Selection:** a click selects the outermost non-panel object under the pointer, so a click in
  a panel selects the object on it and a click on the panel's empty area selects the panel.
  Shift adds to or removes from the selection, and a marquee selects what it fully encloses.
- **Handles:** the axis-aligned bounds of the selection carry eight resize handles and a rotate
  handle (Shift snaps to 15°). Icons and images always keep their aspect; Shift keeps it for
  everything. A rotated object is resized along the selection's axes (note 02).
- **Snapping:** edges and centres snap to other objects' edges and centres and to the page,
  within 6 screen pixels. The canvas shows guides while you drag. It is a linear scan; rbush comes
  in when a figure gets large.
- **Text** (the plan's riskiest UI): a plain `<textarea>` in an overlay _under_ the text object,
  with the canvas showing the live rich result above it. `core/text/rich.ts` maps every edit back
  onto runs (one style per character, common prefix and suffix kept). Ctrl+B, Ctrl+I, Ctrl+=
  (subscript) and Ctrl+Shift+= (superscript) apply to the selected range, or to what is typed
  next. Ω opens a picker of Greek letters and symbols. The whole edit session is one undo step.
- **Clipboard:** copy writes a fragment (note 02) as text/plain, keeping an in-app copy for
  browsers that block reading. Paste also accepts image files.

## Branding rule

`src/brand.ts` exports one frozen `BRAND`. `vite.config.ts` reads it for the PWA manifest and for
the `index.html` title (`%BRAND_NAME%`). `src/brand.test.ts` fails if the display name appears
anywhere else in `src/`, `index.html` or `public/manifest*`. The format id `justfig` and the
IndexedDB name `justfig` are permanent and separate, so a rename never breaks a file.

## Icon library (Phase 2)

The library is built in a separate repository, `justfig-icons` (private on GitHub,
`BooneAndrewsLab/justfig-icons`; a sibling checkout at `../justfig-icons`). It fetches openly licensed sources at pinned
commits, normalises every icon, and builds a versioned release: v1.2.0 holds 2,869 icons from
the house set (39, CC0), Health Icons (742, CC0) and Bioicons (2,088: CC BY 3.0/4.0, CC0, MIT,
and 26 CC BY-SA). Its `REPORT.md` has the counts per source and licence and the rejection
log; its README the pipeline.

**Pinning.** `icons.lock.json` names the release (version, URL, SHA-256 of the reproducible
tarball). `npm run icons` (`scripts/icons/fetch-library.ts`; `predev`/`prebuild` run it with
`--if-missing`) puts it in `public/lib/<version>/` (gitignored): from `--from DIR` or
`$JUSTFIG_ICONS_DIST`, else `../justfig-icons/dist` when its version matches, else by
downloading the URL and checking the hash, which is what CI and `deploy.yml` do. A `v*` tag in
justfig-icons builds and attaches the tarball. The repository is public, so the download needs no
token.
`BRAND.iconLibraryPath` is `lib/<version>/`; a unit test keeps it equal to the lock file.

**Layout** (`src/icons/manifest.ts` decodes it; fields marked * are optional v1 extensions):

```
manifest.json         { format: "justfig-icons", formatVersion: 1, library, version,
                        categories: [{ id, title, count, shard, shareAlike* }],
                        sources: [{ id, name, homepage, license, licenseUrl, attribution?,
                                    commit*, termsChecked* }],
                        thumbs*: { size: 96, columns: 10, ext: ".webp", hiDpi: "@2x" },
                        search*: "search-index.json", credits*: "CREDITS.md", licenses*: "LICENSES/" }
shards/<cat>.json     { category, icons: [IconEntry] }        (one per category, fetched on demand)
svg/<hash>.svg        normalised SVG (see below)
thumbs/<cat>-<n>.webp sprite sheets, 100 icons each, always 10 cells wide (+ @2x)
search-index.json     { format: "justfig-search", fields, storeFields, searchOptions, index }
CREDITS.md, LICENSES/ per-source, per-licence, per-author credits; MIT/BSD texts with copyright lines
```

`IconEntry = { id, title, tags, category, hash, svg, slots: SlotDef[], recolor: "slots"|"whole",
meta: IconMeta, thumb*: { sheet, i } }`, where `IconMeta` is the model type in note 02. The
decoder rejects entries without complete licence metadata, and every path must stay inside the
library (no `..`, no scheme): the release is data from another repository.

**Normalised SVGs**: a `viewBox` of `0 0 W H` with the longer side 100 (cropped to the drawing
plus 2%), only `<g>` (opacity, data-part) and `<path>` with presentation attributes, no
transforms, `<use>`, text, images, filters, masks or clip paths. Every painted element carries
`data-slot` and, when shaded, `data-tone` (an OKLCH lightness offset); its fill or stroke is
already the slot default shifted by the tone, so the SVG looks the way the app renders it before
any recolour. Recolouring replaces every fill and stroke that is not `none` with the slot colour
shifted by the tone. Slots: `s1`–`s4` (hue families, labelled Primary…), `outline` (dark
neutrals) or `neutral`, or `s1` "Colour" for a single-colour icon. An icon that needs more than
four hue families is `recolor: "whole"` with one slot `all`: it keeps its exact colours and a
recolour tints the whole icon. `SlotDef = { id, label, default }`.

**Client** (`src/icons/library.ts`, `HttpIconLibrary`): categories load one shard at a time;
`search` loads the MiniSearch index on the first query (prefix and fuzzy matching, title boosted,
taxonomy synonyms indexed) and fetches only the shards its best hits live in, falling back to a
substring filter for a library without an index; `byId` serves drag and drop; `thumb` positions a
sprite cell; `credits` fetches CREDITS.md. Share-alike icons are left out unless the caller asks.
The index query takes under 10 ms on the full library (budget 100 ms); the first payload
(manifest + first shard) is about 90 kB (budget 300 kB). The index runs on the main thread:
at this size a worker would cost more than the query.

**Browser** (`ui/panels/IconBrowser.tsx`): a category picker (one category at a time), search
over the whole library, 48 px sprite tiles (`image-set` 1×/2×), click to place at the view
centre or drag onto the canvas, an "SA" badge, and the **Show share-alike (CC BY-SA) icons**
opt-in (off by default, remembered in localStorage). "Icon credits and licences" opens
`CreditsDialog`, which renders CREDITS.md as plain React text (headings, lists, bold, https
links; never HTML).

**Preview** (`ui/panels/IconPreview.tsx`, logic in `previewTimer.ts`; issue #64): a 176 px
`role="tooltip"` beside the tile (right of it, else left, kept on screen; the tile's
`aria-describedby` points at it while open) with the name, source, author and licence; it
replaces the tile's native `title`. The picture is the icon's own SVG file as an `<img>`: crisp
at any size, fetched only when a preview opens (then cached by the service worker), and an image
runs no script, so it needs no sanitising, unlike the placed asset. `PreviewTimer` holds the
timing: hover opens after 350 ms (no flicker while the mouse crosses the grid), at once if a
preview is already up; leaving closes after a 150 ms grace, so the pointer can reach the next
tile or the preview itself (WCAG 1.4.13 hoverable). Keyboard focus opens it at once, but only
`:focus-visible` focus, since a click focuses the tile and places the icon instead. Blur, click,
drag and Escape close it, and so does scrolling its tile out of sight (a scroll otherwise moves
it with the tile: keyboard focus scrolls tiles into view); that Escape stops there, so the next
one still clears the selection.

**Offline**: the service worker precaches the manifest, shards and search index (~3 MB); SVGs,
sprite sheets and licence texts (~80 MB in all) are cached on first use (CacheFirst; the
versioned path never changes).

**Tests** read `src/icons/fixtures/lib/`, 12 icons cut from the release by
`npm run icons:fixture` (all three sources; CC0, CC BY 3.0/4.0, CC BY-SA, MIT; one
whole-recolour icon), so they need neither the full library nor the network. When the full
library is in `public/lib/`, a test also checks the budgets on it.

## Analytics

`ui/analytics.ts` is ported from BarelySig: Matomo, cookieless, a no-op unless
`VITE_MATOMO_URL` and `VITE_MATOMO_SITE_ID` are set at build time, honours Do-Not-Track, and
sends only categories and actions from the `EVENTS` allow-list. It never sends figure content.
