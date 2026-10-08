# 07 Palettes and swatch-linked recolouring

A figure's colours can be linked to named swatches, so one change recolours every use, and a
built-in palette (colourblind-safe ones marked) can recolour a whole figure at once.

## Model

Nothing new in the schema: `Doc.palette: Swatch[]` and `Paint = {hex} | {swatch}` have been in
note 02 since Phase 1. A `{swatch}` paint resolves through `resolvePaint` at render time, so a
swatch change is one small document edit and every linked use follows. A swatch missing from
the palette draws black (a damaged file, never something the app writes).

## Where paints are (`src/palette/recolor.ts`, `mapDocPaints`)

Shape fill and stroke (rect, ellipse, path, arrow), text runs, text styles, page backgrounds,
icon slot **overrides**, procedural slot overrides **and** (when linking) procedural slot
defaults. Not touched:

- **Icon defaults.** Linking an icon's default colour would put an override on it, and an
  override on a CC BY icon makes its credit say "modified" (note 03). Only colours the user
  already changed are linked.
- **Procedural params that hold colours** (a plasmid feature's colour, protein-domain colours,
  the well map's brush) are raw hex strings inside the kind's params (note 04), not `Paint`s,
  and they carry meaning (a condition, a feature type). Applying a palette must not recolour
  them. Their pickers still **offer** the document's swatches, but choosing one **copies its hex
  by value**: `ColorInput` takes a `copy` flag, its swatch buttons then emit `{hex}` rather than
  `{swatch}`, are not drawn as linked, and carry the tooltip "copies the colour; not linked to
  the palette" and a "Palette (copies):" caption. A later palette change leaves them alone.
- Images and imported SVGs keep their own colours.

## Edits (each one undo step)

- **Link colours:** every fixed colour becomes a swatch (one per distinct colour, reusing a
  swatch that already has it) and its uses point at it. The look does not change.
- **Apply to figure** (a built-in palette): links first, then gives the n-th _colourful_
  swatch the palette's n-th colour, cycling. Neutral swatches — OKLCH chroma < 0.035: black,
  white, greys, the outline ink — keep theirs, so text and outlines stay legible. A figure with
  no colourful swatches gets the palette's colours as new swatches, ready in every colour
  control.
- Change, rename, add and remove a swatch; removing one bakes its colour into its uses.
- **Unlink:** every use gets its current colour as a fixed colour; the swatches stay.

## Built-in palettes (`src/palette/palettes.ts`)

Okabe-Ito, Paul Tol's bright, muted and vibrant, the IBM accessible palette, viridis and
cividis (six even samples) are marked colourblind-safe. "Soft pastels" and "Classic" (the d3
category colours) are offered but not marked, and choosing one shows a warning. Values are
from the cited sources, written down in lower-case hex; tests check they are distinct and
colourful.

## In the UI

The Palette section of the Inspector (nothing selected) lists the swatches with a colour well,
a name and a remove button, the palette chooser with a preview strip, Apply to figure, Add
swatch, Link colours, Unlink, and **Preview as**. Every colour control (`ColorInput`) shows the
figure's swatches first, round, before the Okabe-Ito quick colours; picking one links the
colour, and the linked swatch is outlined. The exception is procedural params (above): there
the same swatches copy their hex and say so.

**Preview as** applies an SVG colour-matrix filter to the page on screen only (Machado, Oliveira
& Fernandes 2009 at full severity for protanopia, deuteranopia and tritanopia, applied in
linear RGB; and greyscale for print). It lives in editor state, not the document, and never
reaches an export (exports serialise the page, not the canvas).

## Tests

`recolor.test.ts`: palettes valid and distinct, neutrals detected; linking keeps the look and
de-duplicates; a swatch change recolours every linked use; applying recolours colourful
swatches and keeps neutrals; remove and unlink keep the look; a blank figure gets swatches.
E2E: an example figure recoloured with Tol bright, undone, and the vision filter on the page.
