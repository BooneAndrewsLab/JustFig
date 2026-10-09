# 15 Label alignment in imported plots

matplotlib's default SVGs (glyph outlines rebuilt as text, note 12) and every PDF (note 13) store
a label as a start-anchored run at its left end, whatever alignment the plot gave it. Once the
label is drawn in another font (DejaVu Sans → Arimo is ~11 % narrower, note 14) or restyled
(issue 11: "every label 7 pt"), the left end stays put: x tick labels and axis titles drift off
centre and y tick labels end short of their tick. Issue 27 infers the alignment at import and
stores it as an ordinary `text-anchor` with the matching `x`/`y`, so the label holds its place
under any size or font. Nothing new enters the export subset.

- **Where:** `anchorLabels` in `src/io/svg/plotCleanup.ts`, after text merging and before
  cropping (which then measures anchored boxes). Only one-line labels that are start-anchored
  and at 0°, 90°, 180° or 270° are considered: plain text, or the flowing runs below; anything
  already anchored (svglite, matplotlib `fonttype: none`), other positioned tspans, and other
  angles (`rotation=45` tick labels) are left alone.
- **Runs of one label** (issue 29). Mathtext and mixed styles reach cleanup as several runs:
  PDFs write one `<text>` per run (`Signal`, italic `μ`, `V`; `10` and a raised, smaller `3`),
  matplotlib's glyph SVGs one `<text>` with a tspan per run at its own `x`/`y` (note 12). Text
  merging joins them when they read as one line: consecutive siblings (or the tspans of one
  start-anchored text) with the same attributes and angle apart from `font-family`, `-size`,
  `-style`, `-weight` and `fill` (issue 38: "rainbow" text, a title whose words take their
  series' colours, written as one text per colour); in order along the baseline, each starting between 0.3 em before and
  0.6 em after the estimated end of the previous one; full-size runs on the base baseline
  (within 0.1 em) and smaller ones off it by more than 0.1 em and at most 0.6 em (scripts), em
  of the largest run. A smaller run on the base baseline, a same-size run off it, a script
  further off (a stacked line) or another `fill-opacity` keeps them apart, as before. Coloured
  legend entries in a row are not joined: the handle between two entries puts the next one more
  than 0.6 em after the previous one's end. The result is one `<text>` at the first run's start
  on the base baseline: runs of the base font and colour are plain text, others tspans with only
  the font attributes and `fill` that differ (an explicit `#000000` where the base run is
  coloured) and a `dy` where the baseline moves; a space joins two runs on one baseline whose gap is over 0.15 em, never next to a
  script (the width estimate is no judge there). No run keeps a position of its own, so the
  label stays joined up in the bundled font and its `text-anchor` moves it as one chunk (note
  14 lays out `dy`; export writes explicit `x`/`y` per segment as always, so nothing new
  enters the export subset). Its source width is the PDF's own advances summed from the first
  run's start to the last's end, or matplotlib's `data-advance` for the label; without one the
  estimate is the sum of the runs' estimates. Runs that do not read as one line stay as they
  were (separate texts, or positioned tspans) and keep start.
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
- **Lines of one label** (issue 33). A label of several lines reaches cleanup as one
  start-anchored `<text>` per line (matplotlib's glyph SVGs, `fonttype: none` too, and PDFs), each
  with its own evidence: the third line of a tick label is over 1.5 em from its tick, and a line of a
  left-aligned stack may happen to centre on something. So consecutive labels (document order) form
  one block when each is the next line of the one before: same angle, size (within 1 %),
  `font-family`, `-style` and `-weight` (any fill, issue 38: a grey sample size under a group
  name), its baseline 0.8–1.45 em further across (ggplot2's
  `lineheight` 0.9 to matplotlib's and R's 1.2; matplotlib's legend entries are 1.5 em apart) and
  its extent overlapping. A block is decided as one: start evidence on any line keeps it all at
  start; otherwise the decided lines (after the column veto) must agree on one anchor (else all
  start), and the lines' source centres (or ends) must line up within tolerance, when every line
  gets that anchor on the first decided line's anchor point (so the lines of a right-aligned label
  end together even where the last-glyph estimate differs); if they line up at their starts
  instead (a left-aligned stack) all keep start; if neither, each line keeps its own decision. A
  one-line block is decided as before. Nothing joins the lines into one `<text>`: each keeps its
  position, only its anchor follows the block.
- **Anchor point:** a centred label is anchored on the line it centres on (the tick or the
  spine's midpoint; the closest one, first in document order on ties), so an estimated width
  does not shift it; a right-aligned one at its source end. A rotated label's `rotate(θ x y)`
  moves with its anchor. Everything is a pure function of the tree, so imports are
  deterministic, and the result re-sanitises to itself (note 12).
- **Fixtures** (`importedText.test.ts` goldens, `plotCleanup.test.ts`): matplotlib path glyphs
  now get exactly the anchors of the same plot saved with `fonttype: none` (x ticks, axis titles
  and title middle, y ticks end, legend start), at the same positions (y tick ends within
  0.15 pt: the estimated last advance). matplotlib PDFs (Type 3 and TrueType): x ticks, x label
  and title middle, y ticks end, and the mathtext y label (three runs, `Signal μV`) middle as
  one label; the legend stays start. R `pdf()`: x ticks, the rotated y ticks, both axis titles and the title middle;
  the legend stays start. ggplot2 `cairo_pdf()`: y ticks end, x ticks and axis titles middle;
  the left-aligned plot title stays start. The `-30°` text of `handmade.pdf` stays start.
  Changed goldens: `matplotlib-paths`, `pdf-matplotlib-type3`, `pdf-matplotlib-truetype`,
  `pdf-r-pdf`, `pdf-r-cairo` (anchored labels sit at their plot's alignment in Arimo);
  `matplotlib-text` and `r-svglite` were already anchored and did not change.
  `matplotlib-log` (issue 29): the `10ⁿ` x ticks, `Dose (μM)`, the rotated `Signal ×10³` and the
  `α₁ response` title middle, the `10ⁿ` y ticks end, every exponent joined to its base in Arimo.
  `matplotlib-multiline` (issue 33; the same plot as a PDF imports alike): every line of the
  three-line x ticks and the two-line x and y axis titles middle, the two-line y ticks of a
  horizontal bar chart end at one point; the left-aligned two-line title and annotation and the
  legend stay start.
  `matplotlib-colour-runs` (issue 38, `scripts/svg-fixtures/matplotlib-colour-runs.py`; the same
  plot as a PDF imports alike): the three-colour title (three texts chained with `annotate`, as
  in matplotlib's gallery) one label with `fill` tspans, centred over its axes; three-line group
  labels whose grey last line is far from the tick all middle on the tick; a two-line title with a
  grey second line middle; the legend entries in their lines' colours (`labelcolor="linecolor"`)
  apart and start. No other golden changed.
- **Stored figures are left as they are.** Inference runs only at import, on the plot file's
  geometry plus the source width, and the source width is not in a stored asset; re-running the
  rules on saved assets would rely on the estimate alone and could move labels in figures their
  authors have already arranged around them. The drift in a saved figure is at most half the
  width difference of a label (a point or two for an axis title), and re-importing the plot
  gives it the anchors. So there is no migration and no `.jfig` schema change: the anchors are
  plain SVG attributes inside the asset, which old versions already read.
- **Not handled:** labels at other angles; runs or lines that differ in `fill-opacity`; lines with a pitch outside 0.8–1.45 em or out of document order;
  mathtext matplotlib keeps as outlines (note 12).
