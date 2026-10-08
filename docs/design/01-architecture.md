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

Thumbnails in Phase 1 are the SVGs themselves. Phase 2 adds sprite sheets and a MiniSearch index
behind the same `IconLibrary` interface (`search(query)`). Phase 1's search is a substring filter
over title and tags.

## Analytics

`ui/analytics.ts` is ported from BarelySig: Matomo, cookieless, a no-op unless
`VITE_MATOMO_URL` and `VITE_MATOMO_SITE_ID` are set at build time, honours Do-Not-Track, and
sends only categories and actions from the `EVENTS` allow-list. It never sends figure content.
