# 33 Big PNGs: a faster filter, encoded in a worker

Issue #60, left by note 32: a full-page 600 dpi PNG (7016 x 5087, 36 Mpx,
three bands) spent about 10 s of its ~25 s in `PngWriter`, on the main
thread, in both browsers.

## Where the time went

Timed inside `PngWriter` (Chromium, perf spec): of 19.5 s, about 3.5 s was
the row filters after the first fix below (some 7 s before it) and 3.4 s
waiting on the `CompressionStream` write (the platform's deflate, plus the
CRC and IDAT chunks as they come); the rest is drawing: cutting the strips
(note 32, ~2.5 s) and drawing and reading back each band (~2.5 s each).
Firefox: 6 s filtering after the fix, 2.3 s deflating, 11 s drawing.

The deflate was already native (`CompressionStream('deflate')`, note 03);
it has no level to turn down, and fflate's would be slower. So the work was
the filter and getting both off the critical path.

## What changed

- **One scoring pass per row** (`filterRow` in `io/png.ts`): the old
  chooser wrote five trial rows per scanline, with the filter picked by a
  branch inside the inner loop. Now one pass sums all five scores (a
  branch-free |signed byte|), and a second writes only the winner, with the
  first pixel's loop split off so the inner loop has no edge test. The
  heuristic and its tie order are unchanged, so the filtered bytes, and the
  files, are byte for byte what they were (a property test checks it
  against the old five-trial-row chooser, and that every filter type wins
  somewhere). About 2.5x faster in Node; `?? 0` on each read cost a fifth of
  that, so the two hot functions use `!` under a scoped lint exception.
- **No copies of a band**: RGBA bands are filtered where they lie; RGB ones
  are stripped of alpha once; only the band's last row is kept, as the row
  above the next band (it used to copy the band twice and slice the
  result). `encodePng`/`encodePngSync` share the same filter.
- **A worker** (`export/pngEncoder.ts`, `pngWorker.ts`): `exportPng` feeds
  bands to `pngEncoder()`, which runs the `PngWriter` in a module worker.
  Each band's buffer is transferred, not copied (it is a fresh
  `getImageData` array). `push` waits for the band before it, not for its
  own, so the worker encodes band n while the main thread draws band n + 1,
  and at most two bands are alive. A failure in the worker rejects the
  export; a drawing failure aborts and terminates the worker. Where there
  is no `Worker` (unit tests) the writer runs on the thread. TIFF still
  encodes on the main thread (#63).

What remains on the critical path is the drawing and the last band's
encode (about 2 s, the finish wait).

## Numbers (perf spec, 600 dpi PNG, headless, one worker)

|                          | Chromium      | Firefox       |
| ------------------------ | ------------- | ------------- |
| before                   | 19.5 s        | 29.0 s        |
| faster filter, no copies | 14.6 s        | 20.1 s        |
| plus the worker          | 11.6 - 13.3 s | 15.5 - 15.8 s |

Runs vary by a second or two; other numbers of the spec did not move. The
main thread is also free during each band's encode, so the page answers
while a big PNG is written.

## Tests

- `src/io/png.test.ts`: `filterRows` equals the old chooser on random rows
  of runs, ramps and noise (RGB and RGBA), every filter type winning.
- `src/export/pngEncoder.test.ts`: both sides of the worker joined by a
  `MessageChannel`: the same bytes as `PngWriter` on the thread, decoding to
  the input, a band moved (detached) when it owns its buffer; a writer error
  from the worker, a dead worker and abort.
- `src/export/tiles.test.ts` (unchanged): banded `PngWriter` output equals
  unbanded and decodes to the input.
- e2e: the torture figure at 600 dpi against the golden, picture strips and
  the perf spec go through the real worker in Chromium and Firefox.
