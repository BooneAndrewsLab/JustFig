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
- **Tests:** `plotResize.test.ts` on all ten fixtures at three sizes (text sizes, widths and
  roles unchanged, tick lengths and tick label offsets kept, area scaled, round trip), titles and
  legends on matplotlib SVG and PDF, R `pdf()` markers, a synthetic ggplot2-style legend,
  `matplotlib-subplots.svg` (2 × 2 with a colour bar and a one-entry legend) and
  `r-facets.svg` (ggplot2 `facet_wrap`), `matplotlib-shared-colorbar.svg` (a bar shared by a
  column beside a wider panel), `r-facets-touching.svg` (facets with no spacing),
  `r-facets-joined.svg` (one axis line along two touching facets) and `matplotlib-connected.svg`
  (`ConnectionPatch` lines from a zoomed region to its close-up), made by
  `scripts/svg-fixtures/`, a strip over two panels, a lone panel's colour
  bar, a polyline across a gap and the fallback when a circle lies across two panels;
  `plotSize.test.ts` for the edits (copy-on-write, scale per point, drag determinism, groups,
  Match size, Arrange in grid, `growFrame`, issue 30); e2e `plot-resize.spec.ts` (W/H from the
  keyboard, the switch and its memory, export subset, axe, a timed drag with one undo step).
- **Several panels** (issue 32). The area is split into **panels** when that is safe: area
  pieces (axis lines, and rectangles at least 10 % of the viewBox both ways that are not
  band-shaped) are grouped where they touch; a group whose rectangles fall into sets that only
  touch (ggplot2 `panel.spacing = unit(0, "pt")`, issue 34) is split into one panel per set, each
  with the axis lines on it; an axis line along two sets (or one that alone joined two groups
  of rectangles) is no panel's piece but **joins** them (issue 39); a group with no axis line and no straight stroke
  along most of a side (a legend's background) is no panel; any other group under 10 % makes
  the split fail. With two or more panels, and no shape that would scale overlapping two of them
  but cannot be mapped point by point (a circle across two fails it), each axis gets **spans**, the panels' extents
  merged where they overlap: spans scale by one growth `(sx, sy)` about their own start and the
  gaps between them only move, so `sx = (vw' − margins − gaps) / Σ span widths`. Otherwise the
  plot is the one area above, unchanged. Every action names its **region**: a panel scales by
  the map that takes its edges where the spans take them; an anchor (as above, but against the
  region nearest the cluster, so an inner subplot's axis title follows its own axis) moves by
  its region's map. `plotParts` also counts a straight stroke along a panel rectangle's edge
  as an axis line, and the edges of frames over 10 % long as long edges for ticks, so small
  subplots and colour bars keep their tick roles; short strokes from a region's edge, two
  alike, that the roles still missed move as ticks.
- **Bands:** colour bars and facet strips. A rectangle at most a quarter as thick as long,
  outside every panel, as long as 40 % of a panel along it and mostly beside it, within 30 % of
  the panel's size across: along it, it scales with the span it lies in; across, it keeps its
  size and moves with the panel edge it faces. Shapes filling its thickness (a colour bar's
  colours) are its cells and scale with it; its ticks and labels move with it. A colour bar
  inside its panel's span (matplotlib takes its room from that panel only, so the panel above
  is wider) keeps its distance to the span's end and its panel gives way: the panel scales by
  less so the bar keeps its width and stays aligned with the panel above (never below 5 %).
  A band **shared** by several panels on one side (issue 34: `fig.colorbar(m, ax=[c, e])`, a
  strip over two facets) belongs to all of them (`Band.also`) when it lies along half of each
  (or mostly beside it), they are about as close as the nearest, and together they cover half
  the band: every one of them gives way alike, so a column stays aligned. Along, a band's ends
  go where the spans take them and it scales between, so one across two spans keeps lying along
  them, the gap included (for a band inside one span this is the span's growth, as before).
- **Joining strokes** (issue 39): an axis line along two panels, or a path, line, polyline,
  polygon or upright rectangle overlapping two (a `ConnectionPatch` from a zoomed region to its
  close-up), is mapped **point by point**: each point (a curve's control points too) by the map
  of the panel it lies in, a point outside every panel where the spans take it (gaps move,
  keep their size). So each end stays on its own panel; along two touching panels with no band
  giving way the maps agree and such a line simply scales. A small closed shape across two
  (a marker on the shared edge) still moves by its centre, with the region under it.
- **Legends with one entry** move as one block when they have a title or a line key (1.2–3 em
  long, flat: matplotlib's handle); a lone marker beside a label may be an annotated point.
- **Pictures** (issue 24). A panel background holed for a picture still counts as a rectangle. An imported plot's pictures are `image` objects in its group (note
  12). `keepPlotText` moves every raster `image` in a resized plot's group that lay over the
  plot, turned the same way, like the smallest shape around it (`mapPlotBox`: its panel's
  background scales, a legend key moves with its legend: ggplot2's colour bar), else with the
  region under its centre (scaled by that panel's or band's map; outside every region, moved as
  the nearest one's map takes its centre), instead of scaling it with the group, so a heatmap stays on its axes. Its pixels
  stretch: a rasterized scatter layer's dots get wider with an uneven resize, unlike vector
  markers. Restyling keeps them where they are (`growFrame` keeps the shared part in place).
  A picture's frame is recomputed from the start of the gesture like the plot's asset.
  A see-through picture's backdrop (note 12, issue 35) is an `svgImport` too, but is told from a
  plot by its place (`isBackdrop`: right under a raster picture with the same box): it is never
  resized as a plot, and follows like its picture, so it keeps the same frame.
- **Not handled:** a shape across two panels that is not a path, line, polyline, polygon or
  upright rectangle (a circle, an ellipse, a rotated rectangle) makes them scale as one area, gap
  included; a joining stroke is not cut at panel edges, so a segment between its points stays
  straight (where it crosses a gap, the gap's part of it is not kept to size); members of a shared band whose edges differ follow the
  nearest one's edge. Roles, panels and legends are guesses from geometry, as in note 16.
