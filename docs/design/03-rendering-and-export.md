# 03 Rendering and export

There is one renderer. Everything on screen and in every export comes from the same pure
function, so the formats cannot drift apart.

## Pipeline

```
Obj --objectToNode(obj, ctx)--> SvgNode {tag, attrs, children}
       |                              |
       |                     SvgNodeView (React, canvas)
       |                     nodeToSvgString (SVG text) --> SVG file
       |                                                --> svg2pdf + jsPDF --> PDF
       |                                                --> <img> -> canvas --> PNG / TIFF
```

- `render/objectToNode.ts` is pure and memoised in a `WeakMap` per immutable object, per render
  context (text mode, asset table). `pageToNode` wraps a page's visible layers in the page
  background.
- `render/svgString.ts` serialises deterministically: a fixed attribute order (the order
  `objectToNode` writes) and numbers rounded to 2 decimals with `-0` written as `0` (from
  BarelySig's `sceneToSvg`). The result is golden-tested in `src/export/svg.test.ts` on the
  torture fixture.
- Exported SVG uses `width`/`height` in mm and a `viewBox` in points, plus a `<metadata>` holding
  the app name and version and the attribution line.

## Allowed export subset

Plain SVG 1.1, presentation attributes only: `g`, `path`, `rect`, `ellipse`, `circle`, `line`,
`text`/`tspan`, `image` (data URIs only), `transform`, `opacity`, `fill-opacity`,
`stroke-dasharray`. **Never:** `<marker>`, filters, masks, clip paths, `foreignObject`, CSS
variables, `style=` or `<style>`, `vector-effect`, `baseline-shift`, `dominant-baseline`,
external references. `src/export/subset.test.ts` walks the torture fixture's export and fails on
any element or attribute outside the allow-list. Arrowheads are explicit path geometry
(`render/arrows.ts`). Group opacity is `opacity` on a `<g>` (the svg2pdf spike showed it supports
this through a soft-mask-free graphics state for simple groups; see "Spike findings").

## Text

All text layout is ours. `core/text/fonts.ts` loads the TTFs in `public/fonts/` (Arimo, Tinos,
Cousine: regular, bold, italic and bold-italic, subset to Latin, Greek and scientific symbols)
with opentype.js. `core/text/layout.ts` turns `Run[][]` into lines of positioned runs: advance
widths only, **kerning off**, word wrap at the frame width unless `autoWidth`, line height
`lineHeight × max run size`, baseline = top + ascender. Sub/sup runs are 65% size with an
explicit baseline offset.

Text renders in one of two modes:

- **outline**: each run becomes a `<path>` of its glyph outlines from opentype.js. The screen,
  PNG and TIFF always use outlines, so they match pixel for pixel and need no font loading in the
  rasteriser. That rules out Safari's flaky web fonts in SVG-as-image.
- **text**: each run becomes a `<tspan>` with explicit `x`, `y`, `font-size`, `font-family`,
  `font-weight` and `font-style`. SVG export uses this by default, so text stays editable in
  Illustrator or Inkscape. Arimo, Tinos and Cousine are metric-compatible with Arial, Times New
  Roman and Courier New, so the family list falls back without reflowing. PDF export uses this by
  default too, with the TTFs registered in jsPDF (`addFont`), so the PDF has real, searchable text
  with embedded fonts. Both dialogs offer "Outline text".

## Formats

| Format | How                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SVG    | `nodeToSvgString` of the page, text or outline mode.                                                                                                                                                                                                                     |
| PDF    | jsPDF + svg2pdf.js on the same SVG string, page size in points, one page per figure page. Fonts are registered from the same TTFs.                                                                                                                                       |
| PNG    | Outline-mode SVG with images as data URIs, then a Blob URL, an `<img>`, and a canvas at the chosen DPI (150, 300, 600 or custom). The background is transparent or white. The `pHYs` and `tEXt Software` chunks are inserted by `export/png.ts` (ported from BarelySig). |
| TIFF   | The same canvas pixels go through our writer (`export/tiff.ts`): baseline TIFF, 8-bit RGB or RGBA, LZW with a horizontal predictor, one strip per 64 KB, XResolution and YResolution with ResolutionUnit=inch. It is checked by decoding with UTIF in tests.             |

Raster export runs on the main thread in Phase 1, because only a document can decode SVG into an
image. A pre-flight check refuses exports over 16.7 Mpx, Safari's canvas cap, and suggests a lower
DPI. Tiled rendering is deferred until a user hits the cap. The export dialog says: "RGB only.
Journals convert to CMYK; colours may shift slightly."

## Attribution footer

The export dialog's **Include credit line** option is **on by default**, as the user decided
(plan section 7). It can be turned off per export. When on, and the figure uses any asset with
attribution, the exported page grows by a footer strip under the figure, holding the credit line
in 6 pt Arimo, wrapped to the page width. The figure is never overlapped. The Attribution dialog
has the same toggle (it sets the default for this figure's exports), plus Copy and Add as text
object, and lists every asset with its licence, warning when share-alike icons are present.

## Torture fixture and tests

`src/export/fixtures/torture.jfig` is generated by `src/export/fixtures/torture.ts` and checked in.
It holds every primitive (rect with rx, ellipse, open and closed bezier paths, polyline), rotated
and flipped objects, every arrowhead kind, sub- and superscripts with Greek letters in all three
fonts, a group with opacity 0.5, a recoloured icon, an imported SVG, a PNG image, a 2×2 panel
layout with auto labels, and a 384-well plate. Procedural kinds are Phase 3, so the plate is a
group of 384 circles plus row and column labels.

- **Unit (Vitest):** the golden SVG of the fixture in both text modes; the export-subset
  allow-list; PNG `pHYs` round trip; TIFF tags, LZW and decode round trip through UTIF; and PDF
  structure via pdf-lib (page size in points, embedded font files, no image XObjects except those
  from raster images in the fixture), with jsPDF running in Node.
- **E2E (Playwright, chromium, firefox and webkit):** open the fixture through the file input,
  export PNG and compare it with `e2e/golden/torture.png` (pixelmatch, threshold 0.2, at most
  0.5% of pixels differing, since engines anti-alias differently). Export a PDF from the UI and
  check it with pdf-lib. Export a TIFF and decode it. The editor smoke test builds a 2×2 figure.

## Spike findings (svg2pdf, week 1)

Recorded from `src/export/pdf.spike.test.ts`:

- svg2pdf needs a DOM (`DOMParser`, `getComputedStyle`). In Vitest it runs under jsdom.
- Fonts: svg2pdf picks a jsPDF font by `font-family` plus `font-weight` and `font-style`. A family
  that was not registered silently falls back to Helvetica, so `pdf.ts` registers all twelve
  styles under the exact family names that `text` mode writes, and the test asserts the embedded
  font names.
- `<tspan>` needs explicit `x` and `y`. svg2pdf ignores `baseline-shift` and `dominant-baseline`,
  which confirms the rule above.
- Group `opacity` works (an ExtGState with `ca`/`CA`). Nested opacities multiply correctly.
- Data-URI PNG `<image>`s embed as image XObjects. Imported SVGs are inlined as groups, never
  `<image>`, so they stay vector.
