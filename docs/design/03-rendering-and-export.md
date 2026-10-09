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

## One file per panel

The export dialog's **One file per panel, in a zip** option ([#5](https://github.com/BooneAndrewsLab/JustFig/issues/5);
`export/panels.ts`) exports every panel of the current page as its own file in one zip, in any of
the four formats. It is the page export with a `crop` rectangle in `ExportOptions` (and
`RasterOptions`): `exportRoot` then takes the crop's size and origin (`ExportRoot.x/y`), and the
SVG, PDF and raster band code only change their `viewBox` to start at that origin. PNG and TIFF
therefore go through the same band path (and tiling) as a page.

- **Bounds** are the panel's frame (`frameBounds`, so a rotated panel gets its bounding box). The
  panel label sits inside it with the default offset; a label moved outside is cut. Hidden
  panels are skipped, nested panels count.
- **Straddling objects** are cut at the panel edge by the root `viewBox` (the viewport clips), not
  by `clipPath`, which the export subset does not use. Objects wholly outside are still in the
  file, invisible; viewers that ignore the viewBox clip (some editors) show them. The page
  background is drawn in the crop (white, or transparent for raster).
- **Names**: `<title>[-<page>]_<label>.<ext>` (`figure1_A.svg`, `.tif` for TIFF), the label with
  anything but letters and digits removed (`(b)` becomes `b`), `-2`, `-3` added on a clash, and
  `panelN` for an empty label. Order is reading order. The zip is stored, not deflated (the
  contents are already compressed or small) and named `<title>-panels.zip`.
- **Credit line**: no footer strip fits a crop, so the files have none and the zip holds
  `credits.txt` with the page's credit line when the footer option is on and the page needs one.
- **No panels**: the option is disabled with the reason beside it, and `exportPanelsZip` refuses.
- Analytics: `export` / `panels` with the format as the name.

## Checks before export

The export dialog's **Check before export** section ([#4](https://github.com/BooneAndrewsLab/JustFig/issues/4);
`export/checks.ts`) lists warnings, never blockers. `checkPage(figure, page, { journal })` is pure
and runs on the current page (every page for an all-pages PDF). Rules:

- **Text size, line width, picture resolution** are measured on the renderer's own output:
  `pageToNode` in screen mode (for each object's `data-id`), text mode, walked with the
  accumulated `transform` matrix and the inherited `font-size`, `stroke` and `stroke-width`. So
  text and lines inside icons, imported plots and procedural objects are measured as drawn, with
  the fit-to-frame scale applied; the effective size is the value times the matrix's geometric
  mean scale (`scaleOf`). Screen hit areas (`data-hit`) and transparent strokes are skipped.
  Each object gets one warning with its smallest value (an imported plot is one warning, not one
  per tick label). Pictures are `<image>` nodes, so pictures inside imported plots count too:
  pixels come from the PNG or JPEG header of the data URI (`imageSize`), dpi from the placed
  width and height (the lower axis wins for a stretched picture).
- **Limits**: text 6 pt (5 pt for Nature, whose guide asks for 5–7 pt), lines 0.25 pt, pictures
  300 dpi. They are constants, not settings; journals agree closely enough.
- **Journal width**: the dialog's **Journal** list (None, or a journal with column presets, from
  `PagePreset.journal`) defaults to the journal of the page's size preset, and remembers the
  choice for the session. A page wider than the journal's widest column is warned about, and the
  other rules are then checked at the scale the journal will shrink it to (`journalScale`). A
  page up to 15% wider than a narrower column is warned as "just over" it (likely meant to fit).
  Widths between columns otherwise pass: many journals take intermediate widths. Heights are not
  checked: the presets' heights are defaults, not published maxima.
- **Overlap** is kept to cases that are almost always mistakes, measured on the text layout
  (the SvgNode has no glyph widths): text over text, text (and panel labels) crossing a panel's
  edge, a panel label outside its own panel, and text running off the page. Boxes are per line,
  from 0.8 em above to 0.2 em below the baseline, not frames or line boxes, so stacked labels
  whose leading touches and fixed-width boxes with empty space pass; overlaps under 0.5 pt are
  ignored. Text over shapes, pictures and icons is not warned about (labels on shapes are the
  point of a figure), nor are overlapping shapes. Rotated text uses its bounding box per line.
- **Interaction**: warnings are grouped by rule, five shown per rule with **Select all**.
  Choosing one switches to its page if needed, selects its objects (both texts of an overlap)
  and closes the dialog, so the selection shows on the canvas. Page-wide warnings (journal
  width) are plain text. Analytics: `check` / `select` with the rule id as the name.

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
