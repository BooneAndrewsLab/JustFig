# 12 Imported plots

Plots saved as SVG by matplotlib and R (issue 12) are written for viewers, not editors: a
page-sized white rectangle under everything, labels drawn as glyph outlines or split into
pieces, every element wrapped in groups and transforms, and margins the figure does not need.
**Import…** tidies them so they place cleanly and later work (font matching, issue 11;
resizing without scaling text, issue 3; PDF import, issue 1) can find text and strokes.

- **Where:** `sanitizeSvg(text, { plot: true })`, which `importSvgText` passes for every SVG
  file import (drop, paste, Open…). Icons and the render-time re-parse never clean up; a
  BarelySig figure is imported with `plot: false` because it must keep its physical size. The
  cleaned tree is serialised and sanitised once more, so the stored asset is exactly what
  rendering parses it into (tested: it re-sanitises to itself). Before this the sanitiser did
  neither transform flattening nor cropping, despite its old header; the icon pipeline
  (justfig-icons) does its own.
- **Sanitiser fixes plots needed:** descendant, compound and `*` CSS selectors (svglite's
  `.svglite polyline { fill: none }` used to be ignored, so its lines filled black), the
  `font` shorthand (matplotlib's `font: 10px 'DejaVu Sans'`), and `inherit` read as unset.
- **Glyph labels** (`glyphText.ts`): matplotlib's default `svg.fonttype: 'path'` draws each
  label as `<use>`s of glyph paths inside `translate(x y) scale(s -s)`, preceded by a
  `<!-- label -->` comment. Glyph ids are glyph indices in recent versions, so the comment is
  the only reliable text: a regex moves it onto the following `<g>` as `data-glyph-text`
  before parsing (the parser drops comments), and a group made only of plain glyph `<use>`s
  (x offsets, no scale) becomes one `<text>` at the run's origin, size `100·s` (matplotlib's
  `FONT_SCALE`), family and weight from the PostScript name (`DejaVuSans-Bold` → `DejaVu
Sans, sans-serif`, bold), `rotate(θ x y)` when rotated. Mathtext (`$…$`, issue 22): `mathtext.ts`
  reads the common subset of the source (`^`/`_` one level deep, `\mathdefault` and the other
  font switches, Greek, `\times`, `\cdot`, `\pm`, relations, `-` as U+2212, `\,`-style spaces)
  into characters with a level; anything else (`\frac`, `\sqrt`, accents, unknown commands,
  nested scripts, `\$`) returns null. The characters are paired one to one with the glyph
  `<use>`s (`translate(x dy)`, `scale(k)` for scripts) and must agree: base glyphs unscaled on
  one baseline, superscripts scaled and above it, subscripts below; a rule `<path>` among them
  (fraction bar, radical) or any mismatch keeps the outlines. Consecutive glyphs of one level,
  font and scale form a run; a label with several runs is one `<text>` whose runs are tspans
  with explicit `x`, `y` (in the label's unrotated frame) and `font-size` `100·s·k`, plus the
  font attributes that differ (math letters are `DejaVuSans-Oblique` → italic) — export subset,
  no `baseline-shift`. Each run keeps matplotlib's position, so in the narrower bundled font a
  small gap can open before a script; mathtext spacing around relations and binary operators
  (not signs, not in scripts) becomes a space inside a run. Such labels have positioned tspans,
  so alignment (note 15) and merging leave them start-anchored (issue 29); they still carry
  `data-advance` for the whole label. Plot cleanup drops what tspans repeat from their text (a
  `*` CSS rule's values), and a rotated one keeps `matrix()` (y-axis titles). R's cairo `svg()` device writes glyphs with no characters
  attached, so those stay outlines; svglite (ggsave's default) writes real text already.
- **Flattening** (`plotCleanup.ts`): the accumulated matrix is baked into each leaf:
  path points (arcs become cubics, H/V/S/T are made explicit), line/polyline/polygon points,
  rect (axis-aligned stays a rect; rotated becomes a path), circle (ellipse under an uneven
  scale), and text x/y lists. Stroke width, dashes and font size scale with it. What cannot be
  baked exactly keeps `matrix()` on that element alone: a stroked element under a non-uniform
  scale or skew, mirrored text, a rotated rounded rect or ellipse. Groups then go when they
  have no attributes left; a group with one child hands its attributes down (opacity
  multiplies); attributes that repeat the inherited value are dropped. Text is never turned
  into paths, and each stroke stays its own element with its own width.
- **Background:** leaf shapes at the start of the drawing order are dropped while they cover
  the whole viewBox (within 1 %) and paint only white or nothing (fill and stroke), so
  svglite's two page rects, cairo's oversized rects and the white plot border all go, but a
  grey page, the axes patch and the legend box stay.
- **Text merging:** consecutive sibling `<text>` with plain content, start anchor, identical
  attributes and angle are merged when the next piece is on the same baseline (within
  0.1 em, measured along the rotated baseline) and starts between 0.3 em before and 0.6 em
  after the previous piece's estimated end; a gap over 0.15 em becomes a space. Widths are
  estimated from Helvetica's advance widths (×1.12 for DejaVu/Verdana, ×0.9 for serifs,
  0.6 em monospace), not the bundled fonts, so the result is deterministic whether or not
  fonts are loaded. Tick labels are many em apart and anything between two pieces (a tick,
  a marker) breaks the run, so labels do not fuse. The merged label keeps the first piece's
  position and so may shift by the width estimate's error; that is the price of one
  editable string instead of per-glyph positions. Rendering then maps every label to Arimo,
  Tinos or Cousine and lays it out with our fonts (note 14); the asset keeps the plot's names.
- **Label alignment** (note 15): after merging, each plain start-anchored label is given the
  `text-anchor` the plot laid it out with (centred under a tick or axis, right-aligned to a
  tick), judged from the lines around it; the source's run width travels as a transient
  `data-advance` that is never stored.
- **Cropping:** the viewBox becomes the union of drawn boxes (control-point hulls for paths,
  padded by the stroke width, text boxes from the width estimate in the bundled font the label is drawn in (note 14) ×1.1 and −1 em/+0.3 em
  around the baseline), intersected with the original viewBox (what lay outside was never
  shown), so the placed size is the drawing's. Nothing drawn: unchanged.
- **Tests:** real matplotlib 3.11 output (`fonttype` path and none, and `matplotlib-log.svg`:
  log axes and mathtext labels, made by `scripts/svg-fixtures/matplotlib-log.py`) and ggplot2
  via cairo `svg()` in `src/io/svg/fixtures/`, plus an svglite 2.1 file transcribed in its exact format
  (svglite could not be built here); `plotCleanup.test.ts` covers each step on its own too.
