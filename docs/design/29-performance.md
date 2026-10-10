# 29. Large-figure performance baseline

Issue 55. What a big figure costs today, the budgets that guard it, and what
the baseline found.

## The fixture

`e2e/perf-large.spec.ts` builds it in the test (nothing large is committed):

- 480 generated objects: rectangles, ellipses, text, arrows, paths and icons
  (the icon asset is `v2.jfig`'s), laid out on a grid over the page;
- the `matplotlib-subplots` and `r-facets` SVG plot fixtures, imported;
- a 384-well plate and the pBR322 plasmid map (two procedural objects);
- a grey 8-bit micrograph, 5000 x 4000 px (20 Mpx, a 16 MB PNG), encoded in
  the test (Firefox had 2500 x 2500 until note 30).

The test saves the figure, closes it and opens the file again; "first render"
is the time from choosing the file to every layer row being present, the
micrograph's working copy on the canvas (note 30) and two animation frames
having passed. Drag timing is the `requestAnimationFrame`
interval while the pointer moves 40 steps, first on one object, then with
everything selected (Ctrl+A). Export is the whole Export dialog round trip
(SVG, PDF, PNG at 150 dpi) until the download exists. The result is logged as
one `PERF {json}` line and attached to the report.

## Numbers (this machine, headless, two runs each)

The baseline as #55 measured it; note 30 has the numbers after the working
copies (Firefox at 20 Mpx: open 2 - 4 s, PDF 7 - 8 s, PNG 2 - 3 s).

|                                     | Chromium (20 Mpx) | Firefox (6.25 Mpx)  |
| ----------------------------------- | ----------------- | ------------------- |
| objects in the layer list           | 486               | 486                 |
| first render after open             | 1.8 s             | 0.9 - 15 s (varies) |
| drag one object, median / p95 frame | 17 / 17-33 ms     | 17 / 33 ms          |
| drag all, median / p95 frame        | 17 / 33 ms        | 17 / 33 ms          |
| drag all, worst frame               | 1.1 - 1.2 s       | 84 ms               |
| SVG export                          | 1.4 - 1.9 s       | 1.2 - 1.4 s         |
| PDF export                          | 7.5 - 7.9 s       | 4.0 - 4.2 s         |
| PNG export (150 dpi)                | 2.8 - 2.9 s       | 19.9 - 20.3 s       |

A median of 17 ms is the 60 Hz frame: dragging 486 objects is not the
limit. No `objectToNode` memoisation was added: the drag numbers do not show
a hot spot, so the change would be cost without a measured win.

## Budgets

They sit 4 - 8 times above the measured numbers, to catch a 3 - 5x
regression and not CI noise. A frame median is capped at 50 ms (three
dropped frames), p95 at 150 ms; the worst frame is reported, not asserted.

|                              | Budget |
| ---------------------------- | ------ |
| first render after open      | 15 s   |
| drag frame median (one, all) | 50 ms  |
| drag frame p95               | 150 ms |
| SVG export                   | 8 s    |
| PDF export                   | 30 s   |
| PNG export                   | 15 s   |

## What the baseline found

- **PDF export hung on a big picture (fixed).** svg2pdf.js matches each
  image's data URI with `/((?:.|\s)*)$/`, which throws a stack overflow at
  about 12 MB (the failure left the export dialog waiting for ever, with no
  message). A 20 Mpx micrograph is 12 - 16 MB, so exactly the figure this
  tool is for could not be exported to PDF. `externaliseBigImages`
  (`src/export/pdf.ts`) now points an `<image>` over 4 M characters at a blob
  URL (`blob:...#.png`, the suffix is how svg2pdf learns the format), which
  svg2pdf reads as bytes; the blob is revoked once the page is drawn.
  `src/export/pdfBigImage.test.ts` covers the rewrite.
- **Firefox is slow with big pictures (fixed by note 30).** At 12 Mpx Firefox needs
  about 40 s each to open the figure, to export PNG and to export PDF
  (6 Mpx: 1 s open, 20 s PNG), against 2 - 8 s for 20 Mpx in Chromium, so the
  spec uses 6.25 Mpx there. Plain image decoding, base64 and `fetch` are fast
  in Firefox; it turned out to be Firefox's XML parser on the long data URI
  (note 30), mostly in the autosave thumbnail and the rasteriser.
- Dragging with everything selected could stall for about a second in
  Chromium (one frame, 20 Mpx picture in the selection); with the working
  copy the worst frame is under 0.2 s. It is reported, not asserted.

## Re-measuring

`npx playwright test e2e/perf-large.spec.ts --project=chromium --project=firefox`
and read the `PERF` lines. When a number moves for a reason, update the table
and, only if the margin is gone, the budget.
