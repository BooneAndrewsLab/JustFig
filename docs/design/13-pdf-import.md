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
  rectangle in page space plus, for any clip that is not an axis-aligned rectangle, a list of
  clip shapes (issue 25). A rectangular clip under an axis-aligned transform (what matplotlib,
  R and cairo write for the plotting area, and form XObject bounding boxes) is only the
  rectangle, and stays exact and cheap. Painting tests each subpath's control-point box: inside
  is kept as is, disjoint is dropped (a subpath whose box misses the clip cannot wind around it),
  straddling is flattened (16 steps per curve) and cut: Sutherland–Hodgman for fills (exact for
  a convex clip), Liang–Barsky for strokes. A stroke whose centre line is inside is kept whole,
  so a gridline on the clip edge is not halved. Text is dropped only when its origin is more
  than 4 em outside the clip's rectangle.
- **Clip shapes** (issue 25; `src/io/svg/clipRegion.ts`, independent of PDF; SVG `clipPath`
  around a plot picture uses it too, issue 36): a polar plot's circle, a rotated rectangle, grid's clipping paths in
  R. The clip path is flattened by size (each curve in `curveSteps` steps, within ~0.1 px of
  the curve) into a `Region`: rings plus the fill rule of `W` or `W*`. A shape is cut ring by
  ring so that the result's winding number equals the ring's inside the region and is 0
  outside; winding numbers add up, so the path keeps its own fill rule (holes stay holes), and
  nested clips simply cut in turn. A region that is one convex ring (the usual case) uses
  Sutherland–Hodgman per edge, since a half-plane cut keeps winding numbers on its side
  exactly; any other (holed, star-shaped, several rings) uses a sweep: horizontal slabs between
  every vertex and crossing, trapezoids where the ring winds and the region is inside, chained
  down the slabs into polygons. Both are checked by property tests on random self-crossing
  rings against random regions of either rule. A small library (polygon-clipping, Martinez) was
  considered and not taken: it computes boolean operations of polygon _sets_ under its own
  fill semantics, while PDF needs the subject's own fill rule and winding kept; the sweep is
  ~150 lines. Subpaths inside the region (all flattened points within 0.1 px, 0.5 px for
  strokes, so a polar plot's outer grid circle survives rounding) keep their curves; lines are
  cut where they cross the region's edges, keeping pieces whose middle is inside. Pictures:
  pixels whose centre is outside a clip shape (or outside the rectangle, when the picture is
  rotated) become see-through, row by row along the picture's own axes, so a rotated picture is
  no longer kept whole. A clip of over 20 000 points (clipping to text outlines) is still taken
  as its rectangle, with a warning.
- **Shadings** (issue 25; `src/io/pdf/shading.ts`): pdf.js resolves a shading to its IR in
  `page.objs` (sent before the operator list, as its canvas renderer relies on), which
  `loadPdf` hands over by id. `sh` paints the current clip; a shading pattern as the fill
  colour (`scn` with `/Pattern`, what R's `linearGradient()` writes) paints the path's shape,
  in the pattern's own space (the page's, or the form XObject's), its `/BBox` clipping too.
  Axial and radial shadings become **bands of flat colour**, not one average colour (what SVG
  gradients get in `sanitize.ts`): a gradient in a plot is usually there to be seen (a colour
  scale, a highlight), and its average would erase it; bands are plain paths, scale without
  smoothing. One band per 4 levels of the largest channel change, at
  most 64, equal neighbours merged: a black-to-white gradient is 64 bands, each 1/64 of it,
  which reads as smooth at figure sizes. Axial bands are strips across the axis, each reaching
  0.5 px into the next (painted over it) so anti-aliasing leaves no seams; radial ones are
  discs painted from the largest circle in, each covering the middle of the one before (rings
  with an even-odd hole when the fill is see-through, or where the shading does not extend
  inwards). Extension follows pdf.js's colour stops, which encode a non-extended end as a
  `transparent` stop; beyond the outer circle the end colour fills the clip. Radial shadings
  whose circles are not nested (a cone) get the disc stack too, approximately. **Mesh
  shadings** (types 4–7, and type 1, which pdf.js meshes; matplotlib's Gouraud `pcolormesh` and
  `tripcolor`) vary smoothly in two directions, which bands cannot follow and flat triangles
  show as facets: they are drawn as pixels (2 per unit, at most 1024² of them, colours
  interpolated across each triangle as viewers do) and become a picture, cropped and masked
  like any other. On text and strokes a shading is its average colour (with a warning for
  strokes).
- **Tiling patterns** (hatching; issue 37; `src/io/pdf/tiling.ts`): pdf.js hands the pattern
  to `scn` whole, `['TilingPattern', colour, cellOps, matrix, bbox, xstep, ystep, paintType]`.
  Filling a path with one runs the cell's operators once per cell whose box can touch the
  filled area (the path narrowed by the current clip, as for shadings), each from a fresh
  graphics state under `baseCtm × matrix × translate(i·xstep, j·ystep)`, clipped to the cell's
  `/BBox` and to the path, so hatching becomes plain lines and shapes and the export subset
  needs no `<pattern>`. Uncoloured patterns (paint type 2) take `scn`'s colour, their own
  colour operators locked as in a `d1` glyph. Inside a cell lines are cut at 0.01 px instead
  of the usual 0.5 px tolerance (hatching meets the bar's edge; a line on the edge between two
  cells is kept by both). What the cells wrote is joined into one path per paint, in
  first-seen order (cells do not overlap in what plotting libraries write, so the reorder is
  invisible), and pieces that paint nothing are dropped: matplotlib also fills its hatch
  lines, which, cut to a cell, are rings of no area. The work is bounded: at most 5000 cells
  and 200 000 cell operators per fill and 1 000 000 per page; a finer pattern becomes a flat
  fill (grey, or the uncoloured pattern's colour) with a warning. A pattern inside a pattern's
  cell is left out (its cells would multiply), with a warning; a cell's unpaired `Q` cannot
  pop the page's states. Strokes and text in a tiling pattern stay grey, with a warning for
  strokes. Fixtures: matplotlib `hatch=` bars and a hatched `fill_between`
  (`scripts/pdf-fixtures/hatch.py`), R grid's repeating `pattern()` fills (`r-pattern.R`).
- **Text:** each show-text run becomes `<text transform="matrix(…)" font-size="1" data-advance="…">` (its width from the PDF's own advances, for alignment inference, note 15), which plot
  cleanup turns into x/y, font size and `rotate()`. Family, weight and style come from the font
  name (subset prefix and `MT`/`PS` suffixes dropped, then `fontFromPsName` from note 12) and
  pdf.js's bold/italic flags; rendering maps them to the bundled fonts (note 14). A run is split where the PDF leaves a gap over 0.3 em (TJ
  offsets; a gap over 0.15 em becomes a space), and a run that starts exactly where the
  previous one ended on the same baseline, with nothing drawn in between, is joined to it
  using the PDF's own advance widths (matplotlib
  writes `−` as a run of its own; the width estimate in plot cleanup would have put a space
  there). Mathtext is one `<text>` per symbol here; plot cleanup joins the runs of one label (note 15). Invisible text (render
  mode 3, OCR layers) is skipped; stroked text is kept as stroked text.
- **Letters without meaning** (no ToUnicode entry: empty, U+FFFD, private use, control codes)
  would become the wrong text, so a run containing one is drawn as outlines instead: the
  font's glyph paths from pdf.js, or a Type 3 glyph's own operator list run under the glyph
  matrix (colour operators ignored after `d1`, as in PDF). A warning says so. matplotlib's
  Type 3 fonts carry glyph names pdf.js maps, so they become text.
- **Images** (issue 24). An RGB(A) image of at most 512 × 512 pixels that needs at most 4000
  rectangles (runs of equal pixels per row, merged with the same runs below) whose mean area on
  the page is at least (1.5 pt)², and that the PDF does not ask to smooth (`/Interpolate`, which
  pdf.js passes on), becomes one filled path per colour: a heatmap at data
  resolution, even upsampled by matplotlib, or a colour bar stays vector and crisp in every
  export (an enlarged `<image>` is smoothed). Every other image (an interpolated heatmap, a
  layer rasterized with `rasterized=True`, a photo; kinds 1-bit grey, RGB and RGBA, soft masks
  already merged by pdf.js) becomes a **picture**: `pageToSvg` writes
  `<image width="1" height="1" transform="matrix(…)" href="pdf-image:N">` (the CTM times a
  flip, PDF's first row being at the top), fill alpha as `opacity`, and returns the pixels;
  `loadPdf` encodes them as PNG in the browser (`src/io/png.ts`: `CompressionStream('deflate')`,
  no library; RGB when every pixel is opaque, so the header says it has no see-through parts)
  and puts data URLs in their place, so from there a PDF page is an SVG with embedded pictures
  and takes the SVG path (note 12). A rectangular clip crops the pixels of an axis-aligned
  image to whole pixels (an image outside it is dropped); a rotated image under a clip is kept
  whole, with a warning. Over 2048 × 2048 pixels an image is averaged down by a whole factor,
  with a warning, as storage holds ~150 M characters for all figures (note 02) and PNG does not
  compress photos the way the PDF's JPEG did. The cropping and masking live in
  `src/io/pictureClip.ts` (`clipPicture`), shared with SVG `clipPath` (issue 36, note 12).
- **Photos** (issue 36). pdf.js hands every image over as pixels, and a photo stored as PNG is
  4-6× its JPEG. pdf.js does not say which images were JPEG, but an image XObject is a stream and
  streams never sit in object streams, so `findJpegs` (`pdfJpegs.ts`) finds each
  `/Subtype /Image` dictionary in the file's bytes and reads its `/Width`, `/Height` and
  `/Filter`. A picture whose source image (`PdfPageSvg.sources`: its pixel size, and whether it
  was cut or reduced) has the size of a `/DCTDecode` image is stored as JPEG: the PDF's own bytes
  (`/Length`, ending at the end-of-image marker) when it is the whole image, the file has no other
  image that size, the dictionary has no `/SMask`, `/Mask` or `/Decode` and the JPEG has 1 or 3
  components (not CMYK); otherwise re-encoded with the browser's canvas (`encodeJpeg`, quality
  0.92) when that is smaller than PNG, so a cut photo stays small too. No size or "looks like a
  photo" guess: an image the PDF stored losslessly stays PNG. Node (unit tests) has no JPEG
  encoder, so there a cut photo is PNG; e2e checks the browser's. Stencil masks (`paintImageMask…`) and repeated
  images are still left out, each with a warning; soft masks on paths and blend modes are
  ignored with one.
- **Pages:** `importPdf(bytes, name, choosePage)` asks only when there is more than one page.
  The session passes `choosePdfPage` (`src/ui/state/pdfPagePicker.ts`), a promise the
  **Choose a PDF page** dialog resolves: a radio group of pages (focused first) with their
  sizes in the document's units, a preview of the selected page (the converted SVG as an
  `<img>`, drawn through `svgImportNode(..., 'outline')` so its text is in the bundled fonts, as placed), Import, and Cancel/Escape, which imports nothing. The asset is named
  `file.pdf (page n)` for multi-page files.
- **Detection:** `.pdf`, `application/pdf` or the `%PDF` magic number (pasted files may have
  neither name nor type). Password-protected and unreadable files raise `PdfImportError` with a
  plain message.
- **Tests:** `src/io/pdf/pdfImport.test.ts` runs pdf.js in Node on real output generated by
  `scripts/pdf-fixtures/`: matplotlib 3.11 with Type 3 and TrueType fonts (identical results),
  a two-page `PdfPages` file with an `imshow` heatmap, `matplotlib-images.pdf` (an interpolated
  `imshow` with a contour over it and a colour bar, and a `rasterized=True` scatter layer under a
  line; made with its SVG twin by `scripts/svg-fixtures/matplotlib-images.py`), `r-raster.pdf`
  (ggplot2 `geom_raster(interpolate = TRUE)` through `pdf()` on its grey panel, with a colour bar;
  `scripts/pdf-fixtures/r-raster.R`, timestamps fixed), base R 4 `pdf()` (non-embedded
  Helvetica) and ggplot2 via `cairo_pdf()` (embedded subset), plus `handmade.pdf` (pdf-lib, raw
  content: Type 3 glyphs without Unicode, rotated and invisible text, a circular clip, even-odd
  fill, CMYK dashes, transparency, a 3 × 2 image), and for issue 25 `matplotlib-shading.pdf`
  (`scripts/pdf-fixtures/shading.py`, run with `python -I`: a polar plot whose line and fill
  are cut to its circle, a Gouraud `pcolormesh`) and `r-gradient.pdf` (`r-gradient.R`: grid's
  circular clipping path, `linearGradient()` and `radialGradient()` fills), and for issue 35
  `r-see-through.pdf` (`r-see-through.R`: a soft-masked `annotation_raster` of soft dots over
  ggplot2's grey panel and grid, which gets a backdrop, note 12); `shapes.test.ts`
  holds those and the synthetic clip-shape and shading cases. `photo.pdf`
  (`scripts/pdf-fixtures/photo.py`, written by hand so its images stay `/DCTDecode`, as pdfTeX,
  Illustrator and Inkscape embed photos) has a whole JPEG and one cut by a clip (issue 36). No Prism file could be generated here; Prism
  writes ordinary embedded TrueType text, the same path as cairo. The converter's clipping,
  text splitting/joining, outline fallback and image cropping are also tested on synthetic
  operator lists; `png.test.ts` decodes what `encodePng` writes with pngjs.
  `e2e/pdf-import.spec.ts` imports a two-page PDF through the dialog from the keyboard.
