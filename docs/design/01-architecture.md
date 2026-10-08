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
manual dispatch.

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
  ui/              App, canvas/ (viewport, tools, overlays), panels/, dialogs/, state/
```

Phase 1 also has `ui/canvas/` (Canvas with the tools' pointer gestures, PageView, Rulers,
TextEditor), `ui/panels/` (IconBrowser, ToolPalette, Inspector, LayersPanel, PagesBar),
`ui/dialogs/` (Export, Attribution) and `ui/state/` (store, session actions, autosave).

`procedural/` and `workers/` are Phase 3 and do not exist yet. Raster export runs on the main
thread in Phase 1 (see note 03).

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

## Icon library loader (the Phase 2 contract)

The app reads every icon through `src/icons/library.ts`. Phase 1 serves a stub library from
`public/lib/stub/`. Phase 2's `justfig-icons` release tarball is unpacked to
`public/lib/<version>/` with the **same layout**, and `BRAND.iconLibraryPath` points at it:

```
manifest.json         { format: "justfig-icons", formatVersion: 1, library, version,
                        categories: [{ id, title, count, shard }],
                        sources: [{ id, name, homepage, license, licenseUrl, attribution }] }
shards/<cat>.json     { category, icons: [IconEntry] }
svg/<hash>.svg        normalised SVG (see below)
```

`IconEntry = { id, title, tags, category, hash, svg, slots: SlotDef[], recolor: "slots"|"whole",
meta: IconMeta }`, where `IconMeta` is the model type in note 02 (library, libraryVersion, id,
title, source, author?, license (SPDX), licenseUrl, originalUrl, shareAlike). The decoder in
`icons/manifest.ts` validates both files and rejects entries that lack licence metadata.

Normalised icon SVGs: a `viewBox` starting at `0 0` with the longer side 100, presentation
attributes only (no `style`, `<style>`, `class`), no transforms, `<use>`, text, images, filters
or masks. Every painted element carries `data-slot="<slotId>"` and, optionally,
`data-tone="<±lightness>"`. Recolouring replaces every fill and stroke on that element that is not
`none` with the slot colour, shifted in OKLCH lightness by the tone. An element whose fill and
stroke belong to different slots must be split by the pipeline. `SlotDef = { id, label, default }`.

The stub library (`npm run icons:stub`, `scripts/icons/make-stub-library.ts`) holds 39 house
icons drawn to the house style in a 100-unit viewBox, plus 15 Health Icons (CC0, vendored at a
pinned commit in `scripts/icons/healthicons/`). The Health Icons keep their 48-unit viewBox:
the renderer maps any viewBox, and normalising to 100 is the Phase 2 pipeline's job. Each
painted element gets `data-slot="s1"`.

Thumbnails in Phase 1 are the SVGs themselves. Phase 2 adds sprite sheets and a MiniSearch index
behind the same `IconLibrary` interface (`search(query)`). Phase 1's search is a substring filter
over title and tags.

## Analytics

`ui/analytics.ts` is ported from BarelySig: Matomo, cookieless, a no-op unless
`VITE_MATOMO_URL` and `VITE_MATOMO_SITE_ID` are set at build time, honours Do-Not-Track, and
sends only categories and actions from the `EVENTS` allow-list. It never sends figure content.
