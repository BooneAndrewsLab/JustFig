# 13 PDF import

Plots from matplotlib, R and Prism are often saved as PDF (issue 1). **Import…** (and drop,
paste, Open…) turns one PDF page into SVG text and hands it to `importSvgText`, so it is
sanitised and cleaned up exactly like an SVG plot (note 12) and the result is the same kind of
`svgImport` asset: later work on imported plots (font matching, issue 11; resizing without
scaling text, issue 3) sees no difference between the two.

- **pdf.js, lazily.** pdf.js parses the file (streams, fonts, encodings, colour spaces); its
  SVG backend is gone, so `src/io/pdf/pageToSvg.ts` walks the page's operator list the way
  pdf.js's canvas renderer does and writes elements instead of pixels. pdf.js is imported only
  by `src/io/pdf/loadPdf.ts`, which `importPdf` loads with `import()`: the main bundle grows by
  the dialog and glue (~5 kB), while the first PDF import fetches a ~500 kB chunk (~155 kB
  gzipped) and the ~1.3 MB worker (~390 kB gzipped). Both are precached for offline use
  (`mjs` added to the PWA glob). The legacy build is used because pdf.js 6's modern build
  needs newer JavaScript than Playwright's WebKit (and older Safari) parse. No CMap or
  standard-font files are shipped: non-embedded standard fonts need only their names and
  pdf.js's built-in metrics, and CID fonts in plots use Identity encodings. `pdfjs-dist` moved
  from dev to runtime dependencies.
- **Options:** `disableFontFace` so glyph outlines reach the main thread as paths (for letters
  without text, below); `fontExtraProperties` for the font's PostScript name;
  `isOffscreenCanvasSupported`/`isImageDecoderSupported` off so images arrive as pixels;
  annotations excluded. Units: the viewport is scaled by 4/3 so SVG user units are CSS pixels,
  which `importSvgText` reads as 0.75 pt each, and a page keeps its real size (then capped at
  `MAX_PLACE` like any import).
- **Paths:** curves, fill rule, colour (pdf.js converts grey, CMYK and ICC to RGB), alpha
  (`ca`/`CA`), width, cap, join, miter limit and dashes are carried over. Under a similarity
  transform the coordinates and widths are baked; otherwise a stroked path keeps `matrix()`
  and plot cleanup decides, as for SVG. Width 0 (PDF's thinnest line) becomes 0.25 pt.
- **Clipping is geometric,** since the export subset has no `clipPath`. A clip is tracked as a
  rectangle in page space: a rectangular clip under an axis-aligned transform (what matplotlib,
  R and cairo write for the plotting area, and form XObject bounding boxes) is exact; anything
  else is approximated by its bounding box, with a warning. Painting tests each subpath's
  control-point box: inside is kept as is, disjoint is dropped (a subpath whose box misses the
  clip cannot wind around it), straddling is flattened (16 steps per curve) and cut:
  Sutherland–Hodgman for fills (exact for a convex clip), Liang–Barsky for strokes. A stroke
  whose centre line is inside is kept whole, so a gridline on the clip edge is not halved. Text
  is dropped only when its origin is more than 4 em outside the clip.
- **Text:** each show-text run becomes `<text transform="matrix(…)" font-size="1">`, which plot
  cleanup turns into x/y, font size and `rotate()`. Family, weight and style come from the font
  name (subset prefix and `MT`/`PS` suffixes dropped, then `fontFromPsName` from note 12) and
  pdf.js's bold/italic flags. A run is split where the PDF leaves a gap over 0.3 em (TJ
  offsets; a gap over 0.15 em becomes a space), and a run that starts exactly where the
  previous one ended on the same baseline, with nothing drawn in between, is joined to it
  using the PDF's own advance widths (matplotlib
  writes `−` as a run of its own; the width estimate in plot cleanup would have put a space
  there). Mathtext stays one `<text>` per symbol, as in SVG imports. Invisible text (render
  mode 3, OCR layers) is skipped; stroked text is kept as stroked text.
- **Letters without meaning** (no ToUnicode entry: empty, U+FFFD, private use, control codes)
  would become the wrong text, so a run containing one is drawn as outlines instead: the
  font's glyph paths from pdf.js, or a Type 3 glyph's own operator list run under the glyph
  matrix (colour operators ignored after `d1`, as in PDF). A warning says so. matplotlib's
  Type 3 fonts carry glyph names pdf.js maps, so they become text.
- **Images** are not in the export subset (no `<image>`): an RGB(A) image of at most 512 × 512
  pixels that needs at most 4000 rectangles (runs of equal pixels per row, merged with the
  same runs below) becomes one filled path per colour, so matplotlib `imshow` heatmaps and
  colourbars written at data resolution survive; anything else is left out with a warning.
  Shadings are left out and pattern paints become grey, each with a warning; soft masks and
  blend modes are ignored with one.
- **Pages:** `importPdf(bytes, name, choosePage)` asks only when there is more than one page.
  The session passes `choosePdfPage` (`src/ui/state/pdfPagePicker.ts`), a promise the
  **Choose a PDF page** dialog resolves: a radio group of pages (focused first) with their
  sizes in the document's units, a preview of the selected page (the converted SVG as an
  `<img>`), Import, and Cancel/Escape, which imports nothing. The asset is named
  `file.pdf (page n)` for multi-page files.
- **Detection:** `.pdf`, `application/pdf` or the `%PDF` magic number (pasted files may have
  neither name nor type). Password-protected and unreadable files raise `PdfImportError` with a
  plain message.
- **Tests:** `src/io/pdf/pdfImport.test.ts` runs pdf.js in Node on real output generated by
  `scripts/pdf-fixtures/`: matplotlib 3.11 with Type 3 and TrueType fonts (identical results),
  a two-page `PdfPages` file with an `imshow` heatmap, base R 4 `pdf()` (non-embedded
  Helvetica) and ggplot2 via `cairo_pdf()` (embedded subset), plus `handmade.pdf` (pdf-lib, raw
  content: Type 3 glyphs without Unicode, rotated and invisible text, a circular clip, even-odd
  fill, CMYK dashes, transparency, a 3 × 2 image). No Prism file could be generated here; Prism
  writes ordinary embedded TrueType text, the same path as cairo. The converter's clipping,
  text splitting/joining and outline fallback are also tested on synthetic operator lists.
  `e2e/pdf-import.spec.ts` imports a two-page PDF through the dialog from the keyboard.
