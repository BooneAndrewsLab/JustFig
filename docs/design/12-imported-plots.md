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
  no `baseline-shift`; mathtext spacing around relations and binary operators (not signs, not
  in scripts) becomes a space inside a run. The label carries `data-advance` for its whole
  width. Plot cleanup then makes the runs flow (note 15, issue 29): one `<text>` on the base
  baseline whose later runs are tspans with only their font and a `dy`, so the label stays
  joined up in the narrower bundled font and is aligned as one. Flattening maps the positions
  of a rotated text's tspans into its `rotate(θ x y)` frame (no `matrix()` for y-axis titles). R's cairo `svg()` device writes glyphs with no characters
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
- **Pictures** (`plotImages.ts`, issue 24). `<image>` is not in an `svgImport` asset's subset,
  and putting megabytes of base64 into the plot's SVG would make every restyle and resize
  step rewrite and hash them. With `plot: true` the sanitiser keeps embedded PNG and JPEG
  `<image>`s (data URLs only; a linked one is dropped with a warning); flattening bakes their
  matrix like any leaf, and after the background is dropped each one is taken out with the
  matrix of its unit square (its drawn rectangle under `preserveAspectRatio`, default `meet`)
  and its accumulated opacity. Import makes each an `image` asset whose frame is decomposed
  from that matrix (size, rotation, a mirror as `flipY`: matplotlib's SVG stores rows bottom
  first and mirrors them back; a slant is dropped with a warning) and places it in **one group
  with the plot, under it** (`placeImport` in `src/core/edits/`): what plots draw over their
  pictures (contours, markers, labels, spines) must stay on top, and splitting the plot into a
  layer above and one below would break restyling and resizing, which work on one asset. What
  was drawn **before** a picture is cut where the picture is: a filled axis-aligned rectangle
  around it (the axes background, a ggplot2 panel) gets an even-odd hole of the picture's
  shape, or loses its fill when an opaque picture (a JPEG, or a PNG without alpha or `tRNS`, at
  full opacity, or a PNG whose alpha channel is all 255: matplotlib writes RGBA even for a
  heatmap, so `hasClearPixels` inflates it with fflate and looks) covers all of it; anything else
  drawn before an opaque picture and wholly inside it is dropped, and a straight unfilled line
  partly under one (ggplot2's grid lines) loses the part under it (Liang–Barsky). Curves and
  fills partly under a picture (issue 42: a smooth curve or a filled region drawn before a
  rasterized scatter layer) are cut too, with `cutPath` (`src/io/pathClip.ts`, curves flattened
  by `curveSteps`) to an even-odd "everything but the picture's cover" region: fills to closed
  rings (`clipRing`), strokes to open pieces (`clipLines`). A shape both filled and stroked
  becomes a fill without stroke and an open outline without fill, so the cut edges are not
  stroked. A rounded rectangle, a shape with its own transform, or one too detailed to cut
  (`MAX_CUT_WORK`, with a warning) stays over the picture. The crop includes the pictures.
- **Clipped pictures** (issue 36). The sanitiser still drops `clipPath`, but first reads each clip
  that applies to an `<image>` (its own `clip-path` or an ancestor's; `svgClip.ts`): the clip
  path's one shape (`rect`, `circle`, `ellipse`, `polygon`, `path`) as path segments, mapped
  from the user space of the element that refers to it, through the transforms (and `use` / nested
  `svg` offsets) between, into the image's own space, carried on it as `data-clip` (full precision:
  PDF pictures are a unit square). `takeImages` maps them with the image's matrix: a clip that is
  an axis-aligned rectangle crops, any other is a `Region` (`clipRegion.ts`, its `clip-rule`), and
  `clipPicture` (`src/io/pictureClip.ts`, shared with PDF import) cuts the pixels exactly as for a
  PDF: to whole pixels of the rectangle when the picture is axis-aligned, else pixels whose centre
  is outside become see-through (and so the picture gets a backdrop). The PNG is decoded
  (`decodePng`: 8-bit, not interlaced, any colour type; fflate) and re-encoded synchronously
  (`encodePngSync`), as sanitising is synchronous; a picture its clip leaves nothing of is
  dropped, one wholly inside keeps its bytes. A JPEG cannot be decoded without the browser, and
  a clip of several shapes, of text or in `objectBoundingBox` units is not read: such a picture
  is placed whole with a warning. matplotlib's `interpolation='none'` with zoomed limits writes
  pixels aligned to the axes, so whole-pixel crops land on the axes edge.
- **Clipped lines and shapes** (issue 41). Every shape (`path`, `line`, `polyline`, `polygon`,
  `rect`, `circle`, `ellipse`) under a clip gets `data-clip` the same way, in the space its own
  geometry is in, so a matplotlib line in zoomed axes (`set_xlim` narrower than the data), which
  is written whole under the axes' clip, no longer runs across the figure (and plot resizing,
  note 17, no longer takes it for a stroke joining panels). `flatten` cuts it there, before its
  transform is baked (cutting commutes with an affine map), with the PDF importer's cutter
  (`src/io/pathClip.ts`, note 13): an axis-aligned rectangle (what plots use) is a box,
  Sutherland–Hodgman for the fill, Liang–Barsky for the stroke; any other clip a `Region`. A shape
  inside its clip is kept as it is (a rect stays a rect), one outside is dropped, one across the
  edge becomes up to two paths, its fill (closed rings) and its stroke (open where the clip cuts
  it; a dash pattern restarts there). Bounds: the sanitiser hands every shape under the same
  clips in the same space one shared string (a plot's thousands of markers), cleanup reads each
  once, and a clip shape of over 20 000 points, or a path whose points × the shape's exceed
  2·10⁷, is cut to the shape's box instead, with a warning. A rounded `rect` across the edge and
  shapes under an unreadable clip (as for pictures) are kept whole with a warning; text is never
  cut.
- **Backdrops** (issue 35). A see-through picture (clear pixels, or partial opacity: a
  `rasterized=True` scatter layer, ggrastr points) used to leave the grid lines under it on top
  of its dots, and its clear pixels showed the page through the holed panel. Compositing the
  panel colour into its pixels would need decoding and re-encoding them, would lose the grid
  under them and would not follow a restyle; splitting the plot would break restyling and
  resizing. Instead, it gets a **backdrop**: a small `svgImport` asset, viewBox the picture's
  box, holding what the plot drew under it inside that box (a rectangle of each background
  around it, the inside pieces of its straight lines, curves and fills (issue 42: cut to the
  cover, the same split into fill and outline), whole shapes wholly inside; inherited
  attributes, fill, stroke and accumulated opacity made explicit), placed as an image object
  named "Picture N backdrop" right under the picture. The picture then hides what was under it
  like an opaque one, and the plot is cut the same way. It is vector and stays in the export
  subset (no mask, no clip). Resizing moves it like its picture (note 17).
  - _Turned_ pictures (issue 40; rotated, or mirrored and rotated) are cut along their own
    edges: lines are clipped (Liang–Barsky) in the picture's frame (`Cover.toLocal`, a rigid
    map, so tolerances stay in plot units), "wholly inside" is tested there, and backgrounds get
    a hole of the turned quad. The backdrop's viewBox is `0 0 w h` in that frame (one group
    carries the turn) and it is placed with the picture's own frame, rotation and flip included,
    so it is the picture's box for `isBackdrop` and follows it alike. An opaque turned picture
    now hides what is under it too. A slanted one (placed without its slant) hides nothing.
  - _Overlapping_ pictures (issue 40): a backdrop drawn right under a later picture would cover
    the earlier one, so it leaves out what any earlier picture's quad covers (separating-axis
    test between the quads): line spans over earlier quads are subtracted, curves and fills are
    cut to the quad less theirs (`quadLess`), a whole shape counts
    only if clear of them, and its background is the quad less theirs (`clipRing` with an
    even-odd "everything but that quad" region per earlier picture). There, what the plot drew
    stays over both pictures, as before. Holes several pictures cut in one background are kept
    apart the same way (the later one's hole less the earlier ones'); even-odd filled the
    overlap of two holes back in, over both pictures, which hit opaque ones too.
- **Cropping:** the viewBox becomes the union of drawn boxes (control-point hulls for paths,
  padded by the stroke width, text boxes from the width estimate in the bundled font the label is drawn in (note 14) ×1.1 and −1 em/+0.3 em
  around the baseline), intersected with the original viewBox (what lay outside was never
  shown), so the placed size is the drawing's. Nothing drawn: unchanged.
- **Tests:** `svgClip.test.ts` (shapes cut to rectangles and circles, through `use` and
  transforms, fill and stroke, the bounds, and `matplotlib-connected.svg`'s close-up); `plotImages.test.ts` (holes, drops, backdrops, curves and fills partly under plain, turned and overlapping pictures, all-opaque alpha, `meet`, mirrored and linked pictures, clips (rectangle, circle, through transforms, disjoint, JPEG, unreadable) and
  `matplotlib-clipped.svg` from `scripts/svg-fixtures/matplotlib-clipped.py`, and
  `matplotlib-images.svg` from `scripts/svg-fixtures/matplotlib-images.py`); real matplotlib 3.11 output (`fonttype` path and none, and `matplotlib-log.svg`:
  log axes and mathtext labels, made by `scripts/svg-fixtures/matplotlib-log.py`) and ggplot2
  via cairo `svg()` in `src/io/svg/fixtures/`, plus an svglite 2.1 file transcribed in its exact format
  (svglite could not be built here); `plotCleanup.test.ts` covers each step on its own too.
