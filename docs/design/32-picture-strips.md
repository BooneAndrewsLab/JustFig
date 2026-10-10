# 32 Big pictures in strips for PNG and TIFF

Issue #59, left by note 30: a PNG or TIFF at a resolution where a big picture
keeps all its pixels (the perf figure's 20 Mpx micrograph drawn 215 x 172 mm,
exported at 600 dpi) took 6.4 minutes in Firefox. The rasteriser's SVG held
the picture as one 21 M character data URI, Firefox's XML parser is
superlinear in an attribute's length, and a page over 16.7 Mpx is drawn in
bands that each parsed the whole SVG again (three here).

## Strips, not layers

The issue had two options. Drawing big pictures straight onto the canvas
between SVG layers needs z-order, transforms and group opacity composited
outside the one renderer. Cutting the picture into strips keeps everything in
the one renderer's SVG; only the href hook changes.

Firefox, a 20 Mpx picture rasterised from one SVG (headless, this machine):

| strip size (characters) | strips | load and draw |
| ----------------------- | ------ | ------------- |
| 3.0 M                   | 5      | 12.3 s        |
| 1.5 M                   | 10     | 6.6 s         |
| 750 k                   | 20     | 4.0 s         |
| 370 k                   | 40     | 2.4 s         |
| 190 k                   | 80     | 2.3 s         |

Under a few hundred thousand characters the cost is linear; strips aim at
`STRIP_CHARS` = 250 k. Chromium drew every row of this table in 1.4 - 1.7 s.

## What changed

- **The hook** (`ImageHref`, note 30) may return `PictureStrips` (rows of the
  picture, each strip's first row, row count and href) and is given the
  drawing object's frame. `objectToNode` draws them with `stripsNode`: a `<g>`
  of `<image>`s, each the full width of the picture's box at its rows'
  height (4 decimals, not 2: strip edges must meet), in order. Transforms,
  z-order and group opacity stay the browser's.
- **The memo** compares the hook only for objects that drew a picture (a
  counter of pictures drawn, carried up through groups and memo hits). A new
  hook now redraws pictures alone: on screen when a working copy is ready, and
  for each band below.
- **Cutting** (`src/export/resample.ts`, `rasterPictures`): every picture over
  `RESAMPLE_MIN_CHARS` that cannot have see-through pixels (`hasClearPixels`
  false) is drawn at the plan's size (the pixels it covers when the raster
  shrinks it, its own otherwise) and cut into strips, each re-encoded as PNG
  by the canvas. The first strip guesses 4 characters per pixel, the next
  ones use the last strip's. A copy of at most `SMALL_PIXELS` (125 k pixels,
  a thumbnail's) goes in whole, as before; whether a picture is opaque is
  worked out once per asset.
- **Seams.** Abutting antialiased edges let the background through
  (conflation): measured in the e2e below, about 12 000 wrong pixels per
  export with exact edges. So each strip reaches `overlap` rows under the
  next, which is drawn over it: two output pixels at the picture's smallest
  use (`rasterPlan`, at most 64 rows). The upper strip's partly covered edge
  pixels then lie over the lower strip's pixels, not the page. That is exact
  only for opaque pixels; a see-through pixel would be composited twice, so a
  picture with see-through pixels goes in whole as before (redrawn smaller
  when the raster shrinks it). Pixel-aligned exact edges were the other
  option, but only for axis-aligned pictures at a whole-pixel scale; the
  overlap works for any frame.
- **Bands** (`renderBands`): when a page with strips needs more than one band,
  each band gets its own root whose hook keeps only the strips that reach
  into the band (`stripsWithin`, the strip's box through the frame's matrix,
  against `bandBox`: the band in page coordinates plus 4 pixels). Thanks to
  the memo only the pictures are redrawn.

SVG and PDF are untouched: they always carry every pixel as it is.

## Numbers (perf spec, 486 objects, 20 Mpx micrograph, headless, one worker)

|                | Firefox before | Firefox after | Chromium before | Chromium after |
| -------------- | -------------- | ------------- | --------------- | -------------- |
| PNG at 600 dpi | 382 s          | 24.7 s        | 16.5 s          | 15.8 s         |
| PNG at 150 dpi | 3.4 s          | 1.8 s         | 1.7 s           | 1.7 s          |

Other numbers of the spec did not move beyond run-to-run noise.

The 600 dpi page is 7016 x 5087 pixels, three bands; the micrograph keeps all
its pixels and spans two of them. Where the 25 s now go in Firefox: about 2.5
s cutting and encoding the strips, 3 - 4 s loading each band holding strips
(12.5 M characters of strips each), and about 10 s in `PngWriter` (filtering
and deflating 36 Mpx in JavaScript), which was there before and is the same
in Chromium. The Firefox "before" ran beside the Chromium run for its first
minute (two workers), which may have added a little to its 150 dpi number.

## Tests

- `src/export/bigPictures.test.ts`: the plan (sizes, overlap), strip rows,
  the renderer drawing strips edge to edge, the strips a band keeps (turned
  frames too), `bandBox`, and the memo redrawing only pictures.
- `e2e/picture-strips.spec.ts`: a 1500 x 1000 grey-noise picture (values 100
  to 140) placed off the pixel grid, then turned 30 degrees, exported at 600
  dpi: no pixel well inside it may leave that range. With the overlap set to
  0 it fails in both browsers.
- `e2e/perf-large.spec.ts`: the 600 dpi export, budget 100 s.

## Known limits

- A big picture with see-through pixels still goes in whole: slow in Firefox
  at a resolution where it keeps its pixels.
- A strip's edge rows are resampled without the rows beyond it (the browser
  clamps at an image's edge). Where the upper strip lies over the lower one
  that is half a source row, visible only on a picture enlarged many times
  with sharp detail exactly there.
- Strips are canvas PNGs (RGBA): in Chromium the 21 M character grey PNG
  became 27 M characters of strips. Encoding them ourselves as grey would be
  smaller, but the parse is no longer what costs the time.
