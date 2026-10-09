# 27 Levels and invert

Issue 51: a single gel, blot or micrograph has no brightness or contrast control (a channel merge has
display ranges, note 21). Levels (black and white point) and Invert for one picture.

- **Whole picture only.** Applied to every pixel, never a region: journal image-integrity rules
  (adjustments must apply to the whole image). The Inspector section says so; the controls are one
  picture, two sliders (Black at 0-254, Full at 1-255, kept `min < max`), Invert and Reset.
- **Baked pixels, recipe on `Image`.** `Image.levels = { min, max, invert, base }` with `asset` the
  baked result, as for `channels` and `cropped` (notes 20, 21); the export subset has no filters.
  `base` is the picture before the levels. It is kept in the figure (`objectAssets` lists it, so it is
  saved and credited), so every change bakes from `base` and never compounds, and Reset puts `base`
  back as `asset`. The adjusted asset carries no credit (the Credit field edits `base`).
- **The transform is `levelTable`** (note 21) on each of R, G, B (colour is kept, not collapsed to
  grey); then invert (`255 - v`); alpha untouched. Pure on pixel arrays (`io/levels.ts`), tested
  exactly. A JPEG is baked as lossless PNG; 16-bit is out of scope (browsers decode to 8 bits).
- **Order: merge, then levels, then crop.** A merge's levels adjust the merged colours; a crop is of
  the adjusted `asset` (the dialog and `setLevels` re-bake `cropped`). `setChannels` on a picture with
  levels takes the adjusted merge plus the unadjusted one (`BakedMerge.unadjusted`) and re-bases
  `levels.base` on it, so levels survive recolouring. A new merge from selected pictures starts
  without levels. Levels on a plain picture then "Channels…" use `levels.base` as the channel.
- **Edit.** `setLevels` (`core/edits/levels.ts`): pure, baked pixels handed in (async baking in the
  Inspector, latest bake wins); an identity or `null` is a reset. One undo step; a drag of one
  slider coalesces under `levels-min:<id>` or `levels-max:<id>`; Invert and Reset never coalesce.
- **Schema.** `levels` is an optional field read by the hand decoder (`min < max`, 0-255), so as for
  `crop`, `channels` there is no schema bump: a file without it reads unchanged, an older app
  reading a newer file still draws `asset`. `modelArbitraries` round-trips it.

## Known limits

- Levels apply to one picture at a time (no shared setting across a panel's pictures); no gamma or
  auto-contrast; no per-channel RGB levels.
