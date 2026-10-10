# 42 Study design

Issue 76: animal and clinical studies need several arms stacked on one time axis, each with a
group name and n, and per-arm markers for injection, dosing, sampling and endpoint.

## New kind, not a timeline version bump

`studyDesign` is a new kind (`src/procedural/kinds/studyDesign.ts`), not `timeline` version 2.
A timeline with arms would have had to keep its one-axis stack (event label rows above, period
lanes below) for the single-arm case and add a second, different layout for several arms; the
`events` list (a label, a marker shape, a bracket end) also does not carry what an arm needs (an
arm, a kind of marker with a fixed meaning, no label). Two layouts in one kind would make its
Inspector awkward. So the study design reuses what is shared and keeps the timeline as it was:
`tickTimes`, `tickText`, `WORD`, `est`, `rows` and `luminance` are imported from `timeline.ts`
(they gained `export`, nothing else changed), so ticks and labels read the same in both. No
migration and no frozen fixture are needed: `timeline` stays at version 1.

## Params

Lists of scalar records, as in the timeline (field lists cannot nest, so markers and bars refer
to an arm by its 1-based number rather than being nested in it):

- `start`, `end`, `unit`, `tickLabels`, `step`: as the timeline.
- `arms` (1 to 8): `name`, `n` (0 leaves it out of the label), `color` (the guide line).
- `marks` (0 to 80): `arm`, `time`, `kind` (`inject`, `dose`, `sample`, `endpoint`).
- `bars` (0 to 20): `label`, `arm` (0 is every arm), `start`, `end`, `color`.
- `legend` (names the glyphs in use), `arrow`, `size` (points).

Slots: Axis, Text and one per marker kind (Injection, Dosing, Sampling, Endpoint), so palettes
can recolour glyphs. Bar and guide-line colours are free hex, which palettes never recolour.

## Drawing

Glyphs differ in shape, not only colour, so they survive greyscale: injection a down-pointing
triangle, dosing a filled circle, sampling a ring (two circles of opposite winding in one path,
so the nonzero fill leaves the hole), endpoint a cross of two thin quads. All are plain path
geometry. Each arm is a row: name and n right-aligned at the left (the label column is at most
40% of the width), a thin guide line, markers on it, then its bars in greedy rows below (a label
that does not fit goes beside its bar, as in the timeline). The shared axis with ticks and
labels is under the last arm and the legend under that. The stack is centred vertically; text,
glyphs and rows are in points, only the axis length follows the frame. The drawing is one path
per colour in three layers (guides and axis, bars, markers), so markers always sit over bars.
`overhang` allows every arm, every bar on every arm, the longest label and the legend.
