# 04 Procedural objects

A procedural object is drawn by code from a few parameters: a 96-well plate with coloured wells,
a bilayer along a path, a plasmid map. The document stores the kind and its params
(`Procedural { kind, kindVersion, params, path?, slots, snapshot? }`, note 02), never the
drawing, so the object stays editable as a whole.

## The kind API (`src/procedural/types.ts`)

```ts
interface ProceduralKind<P> {
  kind; version; title; category; description;
  keywords: string[];          // extra words an icon search finds it by
  fields: Field[];            // declarative params → decoder, Inspector, test arbitraries
  slots: SlotDef[];           // colour slots, recoloured like icon slots
  usesPath?: 'open' | 'closed';
  defaultSize; defaultPath?(w, h, closed);
  fix?(p): P;                 // cross-field rules after the generic decode
  migrate?(raw, fromVersion): unknown;
  overhang?(p): number;       // how far the drawing may reach past the frame or path
  render(p, { w, h, path?, slots }): Prim[];   // PURE
}
```

- **Fields** are `number`/`int` (min, max, step, unit), `enum`, `bool`, `text` (max length),
  `color` (a free colour; `auto` allows `''` for "pick one"), `list` of records of those (gel
  lanes, plasmid features, protein domains) and `wellMap` (well id → colour). A field may have
  `showIf`. That one list drives three things:
  - `decodeParams` (`params.ts`): any JSON in, valid params out. Wrong types fall back to the
    default, numbers are clamped, ints rounded, enums checked, colours normalised, lists capped.
    It never throws, so a damaged or hand-written fragment still draws.
  - The generated Inspector (`ui/panels/ProceduralInspector.tsx`): one control per field, a
    collapsible row editor for lists, the well-map editor, the colour slots (the Inspector's
    `ColorInput`, as for icons), and "Convert to shapes". No kind has UI code of its own.
  - The property tests' arbitraries (`src/test/procArbitraries.ts`).
- **Params are decoded at render time** (and cached per params object). The model keeps the raw
  JSON, so nothing is lost until the user edits the object; an edit stores the decoded, fixed
  params and the current `kindVersion`.
- **Plasmid label threshold**: `minLabelPct` (percent of the sequence length, default 1) hides the
  label of any feature shorter than that; the feature is still drawn. 1% leaves 11 of pBR322's 48
  labels (the nearest gap is 0.21% to 0.87%). PlasmidPop culls by pixel size (`MIN_FEATURE_PX`), which
  has no meaning in a fixed-size figure, so the threshold is relative to length. There is no
  per-feature label switch, so nothing overrides it. Adding a param needs no version bump: a
  missing value decodes to the field default, so old documents take the new default.
- **Versions**: an object with an older `kindVersion` goes through `migrate` then the decoder. A
  newer or unknown kind is not drawn by a kind (see Snapshots).
- **Slot colours** are resolved (overrides over defaults, swatches through the palette) before
  `render`, which gets plain hex. Kinds derive shades with `shiftLightness` (OKLCH lightness, as
  icon slot tones do).

## Primitives (`prims.ts`)

`render` returns primitives, not SvgNodes: a `path` primitive is a list of subpaths (`circle`,
`rect`, or `poly` with cubic handles, in our `PathNode` form) with one fill and stroke, and a
`text` primitive is a label with an anchor and a baseline. Two consumers read them:

- `render/procedural.ts` turns them into SvgNodes: each path primitive is one `<path>` (circles
  as two arcs), each label is laid out by our text layout and drawn like any text object
  (outlines on screen, `<text>` or outlines in exports). `objectToNode` calls it, so screen and
  every export draw the same thing, and the output is plain SVG groups and paths.
- `shapes.ts` turns them into plain objects for **Convert to shapes**: a circle becomes an
  Ellipse, a rect a Rect, a poly a Path, a label a Text. The objects are moved by the procedural
  object's frame (flip, then rotation, about its centre, which is exact), and wrapped in a Group
  named after the object. It is one undo step and one-way. An object of an unknown kind converts
  to an Image of its snapshot.

**Kinds merge subpaths per colour.** All lipid heads are one `<path>`, all wells of one colour are
one `<path>`; a full 1536-well plate is about ten DOM nodes, a 2,000-lipid bilayer three.

## The kinds (`procedural/kinds/`)

| Kind              | Title               | Notes                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cell`            | Cell                | Oval or irregular outline; nucleus, nucleolus, ER, Golgi toggles; counts of mitochondria, lysosomes, vesicles; a slot per organelle; seeded placement                                                                                                                                  |
| `bilayer`         | Lipid bilayer       | Follows a path (open, or closed as a vesicle); head size, tail length, leaflet gap, straight or kinked tails; at most 6,000 positions                                                                                                                                                  |
| `receptors`       | Membrane proteins   | Follows a path; RTK, GPCR, channel, transporter or Y-shaped receptor, spaced along an optional membrane band, on either side                                                                                                                                                           |
| `helix`           | DNA / RNA           | Follows a path; double helix with groove offset, or single-stranded RNA; base ticks                                                                                                                                                                                                    |
| `plasmidMap`      | Plasmid map         | Circular or linear; features as arrows with labels pushed apart, ticks, name and length; the PlasmidPop import target (note 05)                                                                                                                                                        |
| `proteinDomains`  | Protein domains     | Backbone, domains to scale (box, rounded, oval, hexagon), residue ruler, N/C                                                                                                                                                                                                           |
| `wellPlate`       | Well plate          | 6 to 1536 wells, round or square, labels; well-map editor (paint, erase, paste from a spreadsheet or open/drop a .csv/.tsv (it fills the paste box, same parser, Apply to commit; 1 MB, UTF-8/UTF-16 text only): hex as is, numbers on a colourblind-safe ramp, words one colour each) |
| `petriDish`       | Petri dish          | Scattered, streak (three zones), spot dilutions, pinned grid, lawn or empty; seeded                                                                                                                                                                                                    |
| `gel`             | Agarose gel         | 1 kb or 100 bp ladder, lanes of bands typed as `3000, 1500:0.4` (size:intensity), log-scale migration, stained or inverted look; intensities are colour blends, not opacity                                                                                                            |
| `timeline`        | Experiment timeline | Axis start/end in hours, days or weeks; events (tick, triangle or bracket, stacked in rows when labels collide) on one side, periods as bars in lanes on the other; text in points (see below)                                                                                         |
| `placeholderPlot` | Placeholder plot    | PCA, UMAP, scatter, bar or flow cytometry (log axes, gates) of invented points for schematics; 1–8 groups (name, colour), points per group, spread, point size, axes, automatic or typed axis labels, legend or bar names, error bars and dots on bars; seeded (see below)             |

**Placeholder plots are seeded and say nothing.** `placeholderPlot` exists for schematics
and graphical abstracts that need a plot shape before there is data (issue #8). Every point comes
from the mulberry32 `rng(seed)` with Box–Muller normals, in a fixed draw order, so the same params
give the same SVG on every machine and in every export (the golden SVGs pin it). Clusters are
placed by best-of-20 candidate sampling so they rarely overlap; PCA clusters are tilted
elongated Gaussians, UMAP clusters two to four tight sub-blobs (its islands look lumpy), scatter
a rising cloud per group. Points live in a unit square and are mapped inside the plot area less
the point radius, so nothing leaves the frame. There are no tick numbers on purpose: a
placeholder must not look like a measured result. PCA's axis labels carry a plausible
variance share from the seed. Group colours are free `color` fields defaulting to Okabe–Ito, so
palettes never recolour them (the rule for procedural colour params); the axes and text are slots.

**The flow style** (issue #78, `kinds/flow.ts`) is one more value of `plot`, so the Inspector and
the property tests still come from `fields`. Events are drawn from four seeded Gaussian
populations (negative, x-positive, y-positive, double-positive) in log10 units, each with a tight
and a wide scale for a denser core, on axes spanning 10^0.5 to 10^5.5 with decade labels
10^1 … 10^5 (a "10" and a smaller raised exponent, each with explicit x/y: no `baseline-shift`).
The `gate` field (`none | quadrant | polygon`) draws two crossing lines or a seven-vertex outline
round the x-positive population. The percentages are derived, never typed: the share of the
generated events in each quadrant, or inside the polygon (ray casting), to one decimal, so a
label never contradicts its dots. Events inside the polygon take the second group's colour.
New fields (`events`, `gate`) have defaults the decoder fills, so existing params decode
unchanged and `version` stays 1. Events are one path per colour; the dot radius is a quarter of
the point size, since flow plots are dense.

**Timelines are laid out in points, not in the frame.** `timeline` (issue #52) is the
"day 0 injection, day 7 boost, day 14 harvest" drawing. Only the axis length follows the
frame's width; text size, marker size, row height and bar height are in points from **Text
size**, and the stack (event label rows, markers, axis, tick labels, period lanes) is centred
vertically in the frame, so a resize never squashes text. Rows and lanes are greedy: each event
label (width estimated at 0.56 em per character, as there are no font metrics in a pure render)
goes in the first row it does not collide with, and outer rows get a thin stem to their marker;
periods do the same in lanes, counting a label written beside a bar that is too short for it.
Every mark is a fill (axis, ticks, stems and brackets are thin rects), so the drawing is exactly
one `<path>` per colour. The automatic tick step prefers a week of days or a day of hours when
that gives at least two and few enough ticks, then a 1-2-5 step of whole units; a typed step
that would give more than 200 ticks falls back to it. Minor ticks mark each whole unit up to 31.
`fix` keeps the axis at least 0.001 long (a zero span would divide by zero). Events and periods
outside the axis are not drawn; event colours are free hex (`''` is the Markers slot), so
palettes never recolour them. `overhang` allows for every event on its own row, every period on
its own lane and the longest label, since text keeps its size on a frame of 1 pt.

**Found from icon search.** Icons are fixed drawings; a kind is redrawn from settings, and some
names overlap ("cell", "petri", "plate"). So an icon search also runs `matchKinds`
(`procedural/search.ts`) on the kinds' own `title` and `keywords`, locally and never through the
icon library's index (data from another repo). Every query word must be a prefix of a title or
keyword word (a trailing "s" may be dropped); title hits rank above keyword hits, then shelf
order. The matches are listed above the icons as the shelf's own tile, outlined and tagged
"Adjustable" (accessible name "Add _title_ (adjustable object)"), so click, drag and Enter do what
they do on the shelf. Result headings say "Scientific objects · redrawn from settings" and
"Icons · fixed drawings", and the shelf carries a one-line hint saying the same.

## Path-following kinds

`core/geometry/sampling.ts` flattens the path (corners exact, curves cut into short pieces),
measures it, and samples it every `spacing` points with the unit tangent there; the normal is the
tangent turned 90°. A closed path gets a whole number of units, so there is no seam. A kind
builds each unit in local (along, across) coordinates and maps them through the sample.

The path is stored frame-local in `obj.path`. A new object gets the kind's `defaultPath`; a
drawn path or line becomes one through the Inspector's **Follow this path** buttons (the
frame grows by the kind's `overhang`). Resizing scales the path, not the units, as for path
objects. Ticking **Closed** on a two-node path swaps it for the kind's closed default (an oval); unticking
it on a plain oval (even resized) swaps back. A path of any other shape is kept and just opened or closed.
Its points are edited like a path's (note 28): the edits change `obj.path`, never the params.

## Snapshots

When a figure is saved, or objects are copied, every procedural object of a known kind gets an
SVG picture of itself (outlined text) as an `svgImport` asset in `snapshot`. An app that does not
know the kind (an older version, or a sibling reading a fragment) draws that instead of a
placeholder and keeps the object untouched. The snapshot's viewBox is frame-local and covers the
frame plus everything drawn past it (`drawnBounds`, issue 44); its `meta` width × height is the
frame, which sets the scale (`snapshotNode`), so labels hanging outside are drawn where they were.
Older snapshots, whose viewBox is the frame, draw the same either way. Converting an unknown kind
to a picture gives the Image the snapshot's whole box. Snapshots have no credit, so they never appear in
the attribution line; the asset is dropped on save when unused. Attribution stays derived from
`doc.assets` only, and procedural kinds draw nothing from the icon library, so converting one to
shapes neither adds nor removes credits (tested in `procedural/fragment.test.ts`).

## Performance

Moving or rotating a procedural object never regenerates it: its primitives are cached on the
params object, path, size and slot colours, its SvgNodes on the primitive list, and the canvas
serialises an object's content once per content array (`PageView`), so a move only changes the
group's transform. Labels' glyphs are cached by text and style, since plates and rulers repeat
them.

Measured (`src/procedural/perf.test.ts`, Node, this machine): a full 1536-well plate in seven
colours moves in about 0.01 ms per step and regenerates (resize) in about 30 ms with labels; a
2,000-lipid bilayer moves in 0.005 ms and regenerates in about 12 ms. In the browser
(`e2e/procedural.spec.ts`, headless, software rendering): dragging the full plate gave a median
frame of 16.7 ms (p95 16.8–33 ms) and no long tasks in Chromium, 17.1 ms (p95 17.1 ms) in
Firefox; the bilayer 16.7 / 17.1 ms. A scripted mouse move took 51–83 ms round trip (varying run to run) for the
plate and 18–33 ms for the bilayer, with no main-thread long tasks, so the time is probably rasterising. This is not a 60 fps
claim for a mid-range laptop, which was not measured.

Regeneration happens only on resize or a params change and takes one or two frames at the sizes
the plan names, so the plan's debounced regeneration and worker are not built. If a kind ever gets slower, debounce in `proceduralPrims`
first.

## Tests

`procedural/search.test.ts` covers the search matching (titles, keywords, prefixes, plurals, ranking).
`procedural/kinds.test.ts` runs for every kind: golden SVGs of the defaults and a few variants
(`__golden__/`, `UPDATE_GOLDEN=1` rewrites), defaults decoding to themselves, a property test that
any valid params (from the field arbitraries, any frame from 1 to 2,000 pt, any path inside it)
decode to themselves, render only finite numbers, at most 50,000 subpaths and labels, every point
inside the frame plus the kind's `overhang`, and serialise with no NaN or Infinity
(`PROC_RUNS=n` raises the 40 runs; 800 runs per kind passed), and that Convert to shapes keeps
every fill colour. The NaN/Infinity check reads markup only: a label the user types as "NaN" is
text, not a bad number (issue #62: `fc.string` produced it once in ~10,000 runs).
