# 16 Text and lines across a selection

Issue 11 (after Scientific Inkscape's Homogenizer): set fonts, text sizes and line widths on a
whole selection at once, including the labels and strokes _inside_ imported SVG and PDF plots
("every tick label in these four plots 7 pt Arimo"), and copy them from one object to the rest.

- **Editing model: rewrite the asset, copy-on-write.** A plot's text and strokes live in its
  `svgImport` asset (notes 12–15), where every label is a `<text>` with its own position and
  font attributes and every stroke its own element. Restyling writes `font-family`, `font-size`,
  `stroke-width` (and a scaled own `stroke-dasharray`) on those elements, serialises the tree and
  stores it as a **new** content-addressed asset that only the edited objects point at. Assets are
  shared by hash (placing or copying a plot reuses it), so an unselected copy keeps its look; two
  selected objects that end up identical share the new asset again. The replaced asset is dropped
  from `figure.assets` in the same edit once nothing uses it, so typing a size does not pile up
  versions (saving only writes used assets anyway). The asset's `meta` (file name, credit) is
  carried over, so attribution is unchanged; plot assets carry no licence, and icons, BarelySig
  snapshots (`embedded`, regenerated from their recipe) and procedural snapshots are not touched.
  Rejected: per-object overrides (`textStyle`/`strokeStyle` on the image object, applied at render
  time). They would need a `.jfig` schema change, a second code path in rendering, and either one
  override for all text or a role key per override; rewriting needs neither, keeps exports in the
  existing subset (the same attributes the import already writes), stays readable by old versions,
  and the asset remains exactly what rendering parses (re-sanitising it gives it back, tested).
  Undo is free: an edit returns the whole `Figure`, assets included.
- **Units.** Sizes and widths are points on the page. An image maps its viewBox onto its frame,
  so a plot has `k = √((w/vw)·(h/vh))` points per user unit; each element's own transforms
  (`scaleOf` of the accumulated matrix) are divided out too. Resizing a plot no longer scales its
  text (issue 3, note 17).
- **Roles** (`src/io/svg/plotRoles.ts`, `plotParts`), from geometry of the stored asset only:
  - stroke `tick`: a short (≤ 8 % of the plot) axis-aligned straight line that shares its range
    with at least one other of the same orientation, with one end on a long perpendicular edge
    of anything drawn (spine, frame, panel background: svglite and ggplot2 have no spines);
  - stroke `axis`: an axis-aligned straight line ≥ 30 % of the plot's width or height (spines,
    grid lines, reference lines) or a large frame whose ends all lie on its box;
  - stroke `data`: every other stroke, including markers, error bars, legend frames and handles
    (equal legend handles are not ticks: they touch no long edge);
  - text `tick`: for each tick, the nearest label centred on its line and lying beyond either
    end (ticks may point in or out), within max(1.5 em, 3 × tick length);
  - text `label`: the rest (axis titles, titles, legend entries, mathtext pieces).
    Fixture results are in `plotRoles.test.ts` (matplotlib SVG and PDF, svglite, R `svg()`, R
    `pdf()` with rotated y tick labels, ggplot2 `cairo_pdf()`). Issue 3 needs exactly this split
    (ticks and axes keep their width when the plot is resized, data does not) and reads the same
    function; nothing about roles is stored, so they improve without migrating figures. The
    distance limit does not shrink with the label, so a restyled label keeps its role (tested at
    2, 5 and 30 pt).
- **Keeping alignment.** A label's anchor already holds its alignment along the baseline (note
  15). Across it, a tick label keeps the edge facing its tick: the top of an x tick label under
  the axis (baseline moves by 0.72 em of the size change), the middle of a y tick label beside it
  (0.36 em), the baseline of R's rotated y tick labels and of every non-tick label. Only `y`
  values move, in the label's own frame, so a `rotate()` label moves along its own up direction.
- **Edits** (`src/core/edits/style.ts`), each one undo step: `setStyles(page, objs, change,
label)` for the Inspector fields (labels "Font", "Font size", "Line width"; typing coalesces per
  field), and `matchStyles(page, objs)` ("Match text and lines"). Both reach into selected groups
  and panels (Arrange in grid puts every plot in a panel), skip locked objects, and look objects
  up by id when applied so a coalesced step works on the latest state. Text objects take the
  font and size on every run; shapes, paths and arrows the stroke width.
- **Reference** for Same text and lines: the first selected object, as for Same width (note 10);
  it is not changed itself. Its sample is the most common value (to 0.01 pt) per role and
  overall. Plot to plot is role by role (tick labels from tick labels, axis titles from labels,
  ticks/axes/data widths from the same role; a missing tick or axis role falls back to the other,
  then to the overall value). From a text object: its first run's font and size; from a shape:
  its stroke width (none if it has no stroke). Bold and italic are kept: a bold title stays bold.
  Colours are not matched (in a plot they carry data).
- **UI:** one Inspector section, **Text and lines**, shown for an imported plot or for several
  objects with text or lines, so it never duplicates the single-object Text and Style sections.
  Font, Text size (pt) and Line width (pt) show the first matching value; with a plot selected,
  **Text** (all, tick labels, other plot text) and **Lines** (all, ticks, axes and grid lines,
  other plot lines) choose which parts change, and a plot-only choice leaves text objects and
  shapes alone. **Same text and lines** is a plain button, reached with Tab; no shortcut, so no
  `KEY_ACTIONS` entry. e2e: `plot-styles.spec.ts` (keyboard, undo, export, axe).
- **Not handled:** labels drawn as outlines (R's `svg()` device, mathtext) have no font to set;
  R `svg()` strokes are still classified. Text that grows past the plot's viewBox now grows
  the viewBox and the frame (issue 30, note 17). Roles are guesses from geometry: a long straight data line
  counts as an axis line, and tick labels on axes without ticks (ggplot2 `theme_minimal`) are
  "other plot text".
