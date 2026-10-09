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

Text inside imported SVGs and PDFs is laid out the same way, in the bundled font closest to the
one it names (note 14).

## Formats

| Format | How                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SVG    | `nodeToSvgString` of the page, text or outline mode.                                                                                                                                                                                                                     |
| PDF    | jsPDF + svg2pdf.js on the same SVG string, page size in points, one page per figure page. Fonts are registered from the same TTFs.                                                                                                                                       |
| PNG    | Outline-mode SVG with images as data URIs, then a Blob URL, an `<img>`, and a canvas at the chosen DPI (150, 300, 600 or custom). The background is transparent or white. The `pHYs` and `tEXt Software` chunks are inserted by `export/png.ts` (ported from BarelySig). |
| TIFF   | The same canvas pixels go through our writer (`export/tiff.ts`): baseline TIFF, 8-bit RGB or RGBA, LZW with a horizontal predictor, one strip per 64 KB, XResolution and YResolution with ResolutionUnit=inch. It is checked by decoding with UTIF in tests.             |

Raster export runs on the main thread in Phase 1, because only a document can decode SVG into an
image. A page within one canvas (16.7 Mpx, Safari's cap, and 32767 px a side) is drawn on one
canvas. A larger one is drawn in tiles ([#16](https://github.com/BooneAndrewsLab/JustFig/issues/16)):
full-width bands (`export/tiles.ts` `planBands`) each under the cap, drawn by cropping the SVG's
`viewBox` to the band, so each band is one canvas and one `getImageData`, freed before the next.
The writers take the rows band by band and never hold the raw image: `TiffWriter` packs them into
64 KB strips and LZW-compresses each as it fills (byte for byte what `encodeTiff` makes), and
`PngWriter` filters them against the row above (carried across band edges, so no seam) into the
platform's `CompressionStream` and writes the IDAT chunks as they come (fflate's streaming
`Deflate` was not used: it wrote invalid data for some tiny inputs). Only the compressed data is
kept. A page that fits one canvas still goes through `canvas.toBlob`. An upper bound remains for
memory: 400 Mpx in all and 32767 px wide, refused with "Use at most N dpi, or export PDF or SVG".
Unit tests check tiled output against untiled output with a tiny artificial cap; an e2e exports
the torture figure at 600 dpi (over the cap) and compares it with the 150 dpi golden. The export
dialog says: "RGB only.
Journals convert to CMYK; colours may shift slightly."

## Attribution footer

The export dialog's **Include credit line** option is **on by default**, as the user decided
(plan section 7). It can be turned off per export. When on, and the figure uses any asset with
attribution, the exported page grows by a footer strip under the figure, holding the credit line
in 6 pt Arimo, wrapped to the page width. The figure is never overlapped. The Attribution dialog
has the same toggle (it sets the default for this figure's exports), plus Copy and Add as text
object, and lists every asset with its licence, warning when share-alike icons are present.

The credit line is derived (`core/attribution`): grouped by source, then author, with each
author's licences. A CC BY or CC BY-SA icon that is recoloured in the figure (any slot override)
is credited as "modified" ("some modified" when only some of its uses are), as those licences
require; CC0, MIT and BSD icons never are. The page footer uses the same rule per page. MIT and
BSD icons are named in the line; their licence texts are in the library's `LICENSES/`, which the
dialog links to through "Icon library credits".

## Torture fixture and tests

`src/export/fixtures/torture.jfig` is generated by `src/export/fixtures/torture.ts` and checked in.
It holds every primitive (rect with rx, ellipse, open and closed bezier paths, polyline), rotated
and flipped objects, every arrowhead kind, sub- and superscripts with Greek letters in all three
fonts, a group with opacity 0.5, a recoloured icon, an imported SVG, a PNG image, a 2×2 panel
layout with auto labels, and a 384-well plate. The fixture predates procedural kinds (Phase 3), so
its plate is a group of 384 circles plus row and column labels; the kinds have their own golden
SVGs (note 04).

- **Unit (Vitest):** the golden SVG of the fixture in both text modes; the export-subset
  allow-list; PNG `pHYs` round trip; TIFF tags, LZW and decode round trip through UTIF; and PDF
  structure via pdf-lib (page size in points, embedded font files, no image XObjects except those
  from raster images in the fixture), with jsPDF running in Node.
- **E2E (Playwright, chromium, firefox and webkit):** open the fixture through the file input,
  export PNG and compare it with `e2e/golden/torture.png` (pixelmatch, threshold 0.2, at most
  0.5% of pixels differing, since engines anti-alias differently). Export a PDF from the UI and
  check it with pdf-lib. Export a TIFF and decode it. The editor smoke test builds a 2×2 figure.

## TIFF writer finding

UTIF (the test oracle, and the reader behind tools such as Photopea) treats a strip whose
compressed length _equals_ its raw length as uncompressed. With small random images this happens
now and then, and the image decodes as garbage. libtiff (checked through Pillow,
`scripts/oracle/check_tiff_roundtrip.py`) reads those strips correctly. The writer appends one
zero byte after EOI in that case. LZW decoders ignore it, and the collision goes away.

## Results so far (Phase 1)

- `npm run check`: typecheck, lint, format, unit tests (golden SVGs, export subset, svg2pdf
  spike, PNG and TIFF, codec properties, edits, rich text, snapping, icon library).
- `npm run e2e` in Chromium and Firefox: the 2×2 figure built in the UI and exported to all four
  formats; the torture suite (PNG within 0.5% of the Chromium golden, where Firefox scores 0.000%;
  PDF checked with pdf-lib; the pdf.js render of the PDF within 2% of the PNG, scoring about
  0.16%; TIFF decoded); and editing (handles, snapping, grouping, pen, clipboard, files, import,
  attribution, autosave).
- WebKit has not been run here: its build needs `libicudata.so.74`, which this machine (Gentoo)
  lacks. CI installs the dependencies with `playwright install --with-deps`.

## Spike findings (svg2pdf, week 1)

These come from `src/export/pdf.spike.test.ts`, which runs the torture fixture through jsPDF 4 and
svg2pdf.js 2.8, then checks the result with pdf-lib. A rasterised check (poppler `pdftoppm`)
matched the SVG by eye, apart from the opacity bug below.

- **Nested opacity does not multiply.** svg2pdf gives a child its own opacity _instead of_
  multiplying it by its group's, so a 0.8 child in a 0.5 group came out at 0.8. `pdf.ts`
  therefore pushes the effective opacity down to every leaf (`flattenOpacity`), and the test
  asserts `/ca 0.4` is present and `/ca 0.8` is not. Remaining difference: overlapping children
  of a translucent group show through each other in the PDF, which needs transparency groups
  that svg2pdf does not write. If that matters, the fallback is the plan's own pdf-lib backend.
- **Fonts.** svg2pdf picks a jsPDF font by `font-family`, `font-weight` and `font-style`. All 12
  TTFs are registered (`addFont(file, family, normal|bold|italic|bolditalic)`) under the exact
  family names that text mode writes. They embed as CID TrueType, Identity-H, with a ToUnicode
  map, so Greek, arrows and super/subscripts extract as text. The test asserts that every `Tf`
  in the content streams selects an embedded Arimo, Tinos or Cousine resource, never a
  standard-14 fallback. jsPDF still lists the standard 14 fonts as unused page resources, which is
  harmless. Poppler logs "Unknown character collection 'Adobe-Identity-H'" for jsPDF's
  CIDSystemInfo but renders and extracts correctly. The text-mode PDF of the fixture is about 60 KB.
- **Text positioning.** Every tspan carries explicit `x`/`y`. svg2pdf measures text with the
  browser (canvas or `getBBox`) only to advance to the next chunk, so with explicit positions its
  measurement never moves our text. `baseline-shift` and `dominant-baseline` are never written.
- **Images.** Data-URI PNGs embed as one image XObject each (the test counts exactly one: the
  fixture's PNG). svg2pdf asks `new Image()` for dimensions. Imported SVGs are inlined as groups,
  so they stay vector.
- **Testing in Node.** svg2pdf's `main` is a UMD build that expects a global jsPDF, so Vitest
  aliases its ES build (`vite.config.ts`). Under jsdom, images never load and `getBBox` does not
  exist, so `src/test/domStubs.ts` stubs both. The browser needs neither, and Playwright covers
  the real path.
- **Footer.** With the credit line on (the default), the PDF page grows by the footer strip.
