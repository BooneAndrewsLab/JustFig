# 30 Big pictures: working copies and output-size rasters

Issue #57, found by the performance baseline (note 29). Firefox needed about
2 minutes each to open, PDF-export and PNG-export a figure holding a 20 Mpx
micrograph; Chromium a few seconds.

## Where Firefox spent the time

Measured on the 20 Mpx, 16 MB grey PNG of the perf spec (21 M base64
characters), Firefox 20 Mpx unless noted:

| step                                                          | Firefox       | Chromium      |
| ------------------------------------------------------------- | ------------- | ------------- |
| decode (`createImageBitmap`), data URI (`FileReader`)         | 0.3 s         | 0.3 s         |
| `<svg><image>` in the page, data URI / blob URL               | 0.27 / 0.05 s | 0.56 / 0.43 s |
| `DOMParser` of an SVG with the data URI in it                 | 8.1 s         |               |
| rasterise (SVG through `<img>`, 150 dpi), full picture        | 114 s         | 1.2 s         |
| same, picture redrawn at 4 Mpx (5.3 M chars)                  | 5.7 s         | 0.35 s        |
| same, picture redrawn at the 1.25 Mpx it covers (1.4 M chars) | 0.57 s        |               |
| svg2pdf + jsPDF of the picture alone (blob URL, note 29)      | 10 s          | 5 s           |

Firefox parses a long attribute value in XML superlinearly: four times the
characters cost twenty times the time. Decoding and painting pixels are
not the problem; a long data URI inside any SVG that goes through the XML
parser is. That SVG is what the PNG/TIFF rasteriser and the PDF exporter
parse, and the rasteriser also runs for the Recent-figures thumbnail after
every autosave, which is what made opening the figure take 2 minutes (the
thumbnail held the main thread).

## What changed

One hook in the one renderer: `RenderCtx.imageHref` (`ImageHref`, given the
picture's asset hash and asset) may return a stand-in href for a picture.
`objectToNode` still draws the object exactly as before; only the `<image>`'s
href changes (`null` draws a grey box: not ready yet). The memo compares the
hook, so a new hook redraws. Three users:

- **Screen: working copies** (`src/ui/canvas/workingCopies.ts`). A picture
  over 6 Mpx is shown redrawn at about 4 Mpx (`src/io/downscale.ts`: canvas,
  halved step by step, PNG) as a blob URL, keyed by content hash, made once
  and kept (64 at most). `PageView` reads the hook with
  `useSyncExternalStore`, which hands out a new function each time a copy is
  ready. The page's markup no longer holds 21 MB of base64 either. Zoomed in
  far, the screen shows the copy's resolution; that is the trade.
- **PNG, TIFF and thumbnails: output size** (`src/export/resample.ts`). A
  raster cannot hold more of a picture than the pixels it covers, so a big
  picture (over 1 M characters of data) that the raster shrinks goes in
  redrawn at exactly `ceil(w x dpi/72)` x `ceil(h x dpi/72)`, the largest use
  on the page. It is resampled twice (canvas, then the SVG rasteriser at
  1:1), so a picture off the pixel grid is a little softer than when the
  browser resampled once; at 150 dpi on the perf figure the difference is
  not visible. A picture the raster enlarges goes in whole, as before.
- **PDF: every pixel, no long string.** `bigPictureUrls` (`src/export/pdf.ts`)
  gives a picture over 4 M characters a blob URL of its own bytes before the
  SVG is written (note 29 rewrote the parsed SVG instead, so the data URI
  still went through `DOMParser`). svg2pdf fetches it; jsPDF embeds every
  pixel. SVG export is untouched and always carries the data URI.

## Numbers (perf spec, 20 Mpx in both browsers, headless)

|                         | Firefox before | Firefox after | Chromium before | Chromium after |
| ----------------------- | -------------- | ------------- | --------------- | -------------- |
| first render after open | 126 s          | 2.3 - 3.6 s   | 1.8 s           | 1.2 - 2.4 s    |
| drag one, median / p95  | 17 / 33 ms     | 17 / 33-49 ms | 17 / 17-33 ms   | 17 / 33 ms     |
| drag all, worst frame   | 67 ms          | 84 - 434 ms   | 1.1 - 1.2 s     | 33 - 183 ms    |
| SVG export              | 1.8 s          | 1.5 - 1.7 s   | 1.4 - 1.9 s     | 1.6 s          |
| PDF export              | 139 s          | 7.0 - 7.6 s   | 7.5 - 7.9 s     | 7.1 - 7.5 s    |
| PNG export (150 dpi)    | 142 s          | 2.1 - 2.8 s   | 2.8 - 2.9 s     | 2.1 - 2.2 s    |

"First render" now waits for the working copy to be on the canvas. Firefox
gets the 20 Mpx micrograph again and the budgets are shared: open 15 s
(was 30 s), PNG 15 s (Firefox was 60 s); see note 29.

## Known limits

- PDF export is still about 7 s for a 20 Mpx picture in both browsers: jsPDF
  decodes the PNG and deflates its pixels again in JavaScript. Passing a
  PNG's IDAT straight through as a `/Predictor 15` stream would avoid it;
  not done (issue #58).
- A raster at a resolution where the picture keeps all its pixels (a full
  page 20 Mpx picture at 600 dpi) still sends the whole data URI through
  Firefox's XML parser and is slow there. Drawing big pictures straight onto
  the canvas between SVG layers would avoid it but needs z-order and group
  opacity handled outside the renderer (same issue).
