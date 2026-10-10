# 36 Copy as image

Issue #72: getting a figure into a slide deck meant export, find the file,
insert. The Export dialog has **Copy as image** beside Export (no shortcut: the obvious keys
belong to the browser, and Ctrl+C copies fragments, note 05). It started in the top bar,
which put the bar over one row at 1280 px; a copy is an export, so it moved.

## What is copied

- Nothing selected: the current page, credit-line footer included (the
  Export default, note 03).
- Something selected: only the selected objects (`copyScope` filters the
  layers, keeping a container only as the way to a nested selected object;
  hidden layers stay hidden), cropped to their bounds plus 3 pt, with the
  page background. No footer, as in per-panel export; the guide tells the
  user to check the credit line themselves.
- Stale selection ids fall back to the page.

The renderer is the export's: `exportPng` (so the PNG worker and bands of
note 33 apply to big pages) and `exportSvg` through `exportRoot`, via the
`crop` option panels already use. Nothing is drawn another way.

## Resolution

300 dpi (`COPY_DPI`), lowered to `maxDpiFor` when a page would exceed what
an export can hold. The status line reports the pixel size.

## Clipboard and fallbacks

`writeToClipboard` makes one `ClipboardItem` of `image/png` and `text/plain`
(the SVG), both as promises so Safari still sees the click as the gesture
while the picture is drawn. If the write is refused it retries with the PNG
alone. With no `navigator.clipboard.write` or `ClipboardItem` (Firefox
without `dom.events.asyncClipboard.clipboardItem`), the status line says so
and points at Export. A failed drawing is reported as an error in the same
line. The app has no toasts: the notice line is its message mechanism, and
`window.alert` is not used.

## Browsers

Chromium: PNG and SVG text (assumed from its documented support; the unit
tests stub the clipboard). Safari: PNG; the text/plain SVG is not verified.
Firefox: image clipboard writes need a recent version or the flag; where
unavailable, the message. E2E covers only that the action is reachable, not
the clipboard contents.

Analytics: `export` / `copy-image` (PNG and SVG) or `copy-image-png`.

Not built: a `.pptx` export (the issue's "later, if asked for").
