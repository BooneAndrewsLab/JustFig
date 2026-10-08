# 15 Label alignment in imported plots

matplotlib's default SVGs (glyph outlines rebuilt as text, note 12) and every PDF (note 13) store
a label as a start-anchored run at its left end, whatever alignment the plot gave it. Once the
label is drawn in another font (DejaVu Sans → Arimo is ~11 % narrower, note 14) or restyled
(issue 11: "every label 7 pt"), the left end stays put: x tick labels and axis titles drift off
centre and y tick labels end short of their tick. Issue 27 infers the alignment at import and
stores it as an ordinary `text-anchor` with the matching `x`/`y`, so the label holds its place
under any size or font. Nothing new enters the export subset.

- **Where:** `anchorLabels` in `src/io/svg/plotCleanup.ts`, after text merging and before
  cropping (which then measures anchored boxes). Only plain one-line labels that are
  start-anchored and at 0°, 90°, 180° or 270° are considered; anything already anchored
  (svglite, matplotlib `fonttype: none`), positioned tspans, and other angles (`rotation=45`
  tick labels) are left alone.
- **Source width.** The decision compares the label's own extent with lines nearby, so it needs
  the width the plot laid the label out with, not ours. The importers pass it as a transient
  `data-advance` (em of the label's font size, so baking transforms leaves it valid): PDF runs
  from the PDF's own glyph advances (exact, joined runs included), matplotlib glyph runs from
  the glyph positions plus an estimate of the last glyph's advance. Merging sums it. The
  sanitiser keeps the attribute only on the plot-cleanup pass and cleanup removes it, so it is
  never stored. Without it (other start-anchored SVG text) the Helvetica-based estimate of note
  12 is used with a wider tolerance (+3 % of the width).
- **Evidence,** in the label's frame (along its baseline from the start; across it, in em of
  its size), against the axis-aligned straight edges of every drawn shape (path `L`/`Z`
  segments, lines, polylines, polygons, rect edges, after their transforms) and the boxes of
  every drawn shape:
  - _centred_: a perpendicular edge (a tick) ending within 1.5 em above or below the label with
    its position within tolerance of the label's centre, or a parallel edge at least 1.2× the
    label's width within 6 em above or below with its midpoint there (a spine for axis titles
    and plot titles, a bar top, a significance bracket);
  - _right-aligned_: an edge at the label's height (across 0.1–0.6 em: a tick, a gridline, a
    spine) starting within 1.5 em after its end;
  - _start_: an edge or a shape's box at its height ending within 1.5 em before its start (a
    legend handle or marker, a bar the label annotates, a tick on the label's left as on a
    right-hand axis).
    Tolerance is 0.1 em with the source width. Start evidence wins; otherwise exactly one of
    centred/right-aligned decides; both or neither keep start. Last, a label kept at start within
    3 em above or below that starts at the same place but ends elsewhere vetoes the change: that is
    a left-aligned column, such as a legend whose handles are markers, where the longest entry
    would otherwise "end" at the legend frame. Only start-kept neighbours count, so a centred
    axis title that happens to start where a tick label does is still centred.
- **Anchor point:** a centred label is anchored on the line it centres on (the tick or the
  spine's midpoint; the closest one, first in document order on ties), so an estimated width
  does not shift it; a right-aligned one at its source end. A rotated label's `rotate(θ x y)`
  moves with its anchor. Everything is a pure function of the tree, so imports are
  deterministic, and the result re-sanitises to itself (note 12).
- **Fixtures** (`importedText.test.ts` goldens, `plotCleanup.test.ts`): matplotlib path glyphs
  now get exactly the anchors of the same plot saved with `fonttype: none` (x ticks, axis titles
  and title middle, y ticks end, legend start), at the same positions (y tick ends within
  0.15 pt: the estimated last advance). matplotlib PDFs (Type 3 and TrueType): x ticks, x label
  and title middle, y ticks end; the legend and the mathtext y label (three runs, `Signal (μV)`)
  stay start. R `pdf()`: x ticks, the rotated y ticks, both axis titles and the title middle;
  the legend stays start. ggplot2 `cairo_pdf()`: y ticks end, x ticks and axis titles middle;
  the left-aligned plot title stays start. The `-30°` text of `handmade.pdf` stays start.
  Changed goldens: `matplotlib-paths`, `pdf-matplotlib-type3`, `pdf-matplotlib-truetype`,
  `pdf-r-pdf`, `pdf-r-cairo` (anchored labels sit at their plot's alignment in Arimo);
  `matplotlib-text` and `r-svglite` were already anchored and did not change.
- **Stored figures are left as they are.** Inference runs only at import, on the plot file's
  geometry plus the source width, and the source width is not in a stored asset; re-running the
  rules on saved assets would rely on the estimate alone and could move labels in figures their
  authors have already arranged around them. The drift in a saved figure is at most half the
  width difference of a label (a point or two for an axis title), and re-importing the plot
  gives it the anchors. So there is no migration and no `.jfig` schema change: the anchors are
  plain SVG attributes inside the asset, which old versions already read.
- **Not handled:** labels split into several runs (matplotlib mathtext, a label with a mixed
  style) are aligned piece by piece, so they stay start; labels at other angles; multi-line
  labels (several `<text>` elements matplotlib centres as a block).
