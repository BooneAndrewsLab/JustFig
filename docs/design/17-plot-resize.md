# 17 Resizing plots without scaling their text

Issue 3 (after Scientific Inkscape's "Scale Plots"): resizing an imported plot used to scale it
like a picture, so 8 pt axis labels became 5 pt and lines got thin. Now the plot's axes and data
take the new size while text keeps its point size, strokes their width and ticks their length,
and every label stays attached to what it labels. Issue 30 (a restyled plot's bounds around its
text) is closed in the same work.

- **Trigger: on by default, one remembered switch.** Every resize of an imported plot keeps its
  text and line sizes: the canvas handles, Inspector W and H, Same width/height/size and Arrange
  in grid, for plots selected directly or inside selected groups and panels (Arrange in grid puts
  plots in panels). Plain scaling stays one click away: **Keep plot text and line sizes**, a
  checkbox in the Inspector's object section shown when the selection holds a plot, stored in
  `localStorage` (`plotSizing`, like the units). Rejected: a modifier key during the drag (not
  discoverable, does nothing for W/H or the grid, and Shift and Alt are taken: Shift keeps
  proportions, Alt drags windows on Linux); a per-object property (a `.jfig` schema change for
  what is a way of resizing, not a property of the plot: after a resize the asset already is what
  it is). Edits take it as an argument (`resizeObjects`, `matchSize`, `arrangeInGrid`: `plots:
'keep' | 'scale'`, `'scale'` when omitted), so the core keeps no UI state.
- **Model: rewrite the asset, copy-on-write (as note 16).** `keepPlotText(before, after, pageId)`
  runs after the plain resize: each plot whose frame changed size is redrawn from its asset in
  `before` into a new content-addressed asset only it points at; the old one is dropped when
  unused (`swapAssets`, shared with restyling). The frame is exactly the size asked for, and the
  new viewBox keeps the old user units per point (`k`), so every size written in the asset still
  means the same on the page. Undo is free (an edit returns the whole `Figure`).
- **Geometry** (`src/io/svg/plotResize.ts`, pure). From the roles of `plotParts` (note 16) and
  each drawn leaf's box (`drawnLeaves`, the cropping boxes of note 12):
  - the **area** is the union of the axis lines (the `axis` role), panel backgrounds and frames
    (large axis-aligned rectangles), without stroke padding; with none of those, everything
    drawn. Its top-left stays and it alone absorbs the change: `sx = (vw' − margins) / area.w`
    (likewise y), so the margins around it, where labels and ticks live, keep their size;
  - inside the area, shapes have their coordinates scaled (path points, rects, lines, polylines,
    circles becoming ellipses under an uneven scale), never their stroke width or dashes. An
    element whose map is not axis-aligned in its own frame (a rotated or skewed one) gets it on
    its `transform` instead;
  - everything else moves rigidly by the move of an **anchor** point `a`: `(a − area.x0)(sx − 1)`
    across x and likewise y, which is exactly where the area's scaling takes that point. A tick
    and its tick label anchor at the tick's base on its axis (`plotParts` now returns it); a
    **marker** (a small closed shape inside the area: at most 1.5× the median text size or 4 % of
    the area; a rect only when square, so a short bar still scales with its neighbours) at its
    centre;
  - a **legend** is found from labels with keys: a shape at most 3 em, just before a label on its
    row. Keyed labels within 1.5 em join; a label just above them is its title; a frame is the
    smallest shape around them that is not the whole plot. Two keyed labels or a frame make a
    legend, and everything inside the frame drawn after it (data under the legend is drawn
    before it) moves as one block, anchored per axis at the area edge it lies beyond or is
    aligned with, else at the nearer edge, or its centre when it is centred (ggplot2's legend
    beside the panel);
  - other labels and pieces drawn outside the area (axis titles, titles, annotations, glyph
    outlines) are clustered: text runs on one baseline within 1 em (mathtext split into runs),
    glyph outlines side by side on a row (words, spaces included) or touching in a column.
    A cluster with a tick label follows that tick; otherwise per axis it is pinned to the edge it
    lies beyond or is aligned with (within 2 % of the area: ggplot2's left-aligned title), else
    to its centre (axis titles and centred titles stay centred, annotations follow the data).
- **Limits.** The area never shrinks below 5 % of its size; past that the viewBox is wider than
  the frame asks for at the old scale, so the plot (text too) shrinks. The size asked for always
  wins: a plot made narrower than its title leaves the title wider than the frame.
- **Drag performance.** A drag recomputes every step from the gesture's start figure (`from`), so
  it bakes from the original asset each time (no drift) and the whole drag is one undo step. The
  analysis (`plotParts`, `plotLayout`) is cached per asset and parsed path data per element, so a
  step costs a coordinate rewrite, serialising and hashing the SVG, and parsing and laying it out
  for the screen. Measured in the production build (Chromium, from pointer event to React
  commit): about 11 ms median, 17–19 ms p95 for the matplotlib fixture, against 5 ms when scaling
  plainly. A plot whose steps take over 24 ms twice in a row (thousands of markers) is scaled
  plainly for the rest of the drag and redrawn once on release, in the same undo step (a
  3,000-marker plot: 66–100 ms per step, about 0.3 s on release). Inspector W and H also
  recompute from the start of the field's run (`History.runStart`), so typing "120" does not keep
  what "1" and "12" did (the 5 % floor made such steps lossy).
- **Issue 30.** Restyling (`setStyles`, `matchStyles`) grows the viewBox around every label that
  now reaches past it (`viewBoxAroundText`, beyond 0.05 units of rounding; never shrinks) and the
  frame with it at the same scale, keeping the shared part on the same page point under rotation
  and flips (`growFrame`). So the object's bounds, snapping and Arrange in grid include the label.
- **Exports** are unchanged in kind: the same attributes the import writes (`d`, `x`/`y`,
  `points`, `ellipse`, `matrix()` transforms), all in the export subset; the stored asset
  re-sanitises to itself (tested).
- **Tests:** `plotResize.test.ts` on all seven fixtures at three sizes (text sizes, widths and
  roles unchanged, tick lengths and tick label offsets kept, area scaled, round trip), titles and
  legends on matplotlib SVG and PDF, R `pdf()` markers, a synthetic ggplot2-style legend;
  `plotSize.test.ts` for the edits (copy-on-write, scale per point, drag determinism, groups,
  Match size, Arrange in grid, `growFrame`, issue 30); e2e `plot-resize.spec.ts` (W/H from the
  keyboard, the switch and its memory, export subset, axe, a timed drag with one undo step).
- **Not handled:** several subplots in one file share one area (the gaps between them scale, and
  an inner subplot's axis title keeps its centre's share, not its axis); facet strips scale with
  the panels; colour bars count as part of the area; a legend with one entry and no frame moves
  as separate pieces. Roles and legends are guesses from geometry, as in note 16.
