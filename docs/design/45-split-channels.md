# 45 Split channels

Issue #67: the usual channel figure is one picture per channel plus the merge, same crop and
levels, in a row, each labelled with the channel name in the channel's colour. Merge channels
(note 21) makes the composite; this makes the row from it.

- **Split channels** in the Inspector's Channels section (one merge selected; a button, so
  keyboard reachable) with a **Tinted** checkbox. `splitChannels` (`core/edits/channels.ts`) is one
  named edit, one undo step; the pixels are baked first (`io/split.ts`, as the merge is) and
  handed in, so the edit stays pure.
- **Pixels.** For each channel turned on: the channel's own picture through its display range
  (`bakeMerge` with one layer), white for greyscale (the default) or the channel's colour on
  black for Tinted; then the merge's levels, then its crop, in the same order as the merge
  (merge, levels, crop). A panel is an ordinary picture (no `channels`), its `levels.base` the
  single-channel pixels. The source channel's credit is copied to that baked asset, so
  attribution (derived from the assets in use) credits the panels as it credits the merge.
- **Layout.** The panels take the merge's frame and sit left to right from its place with the
  merge's 2 mm row gap (note 21), the original merge last. Rejected: `arrangeInGrid` (note 11),
  which makes lettered panels and scales to the page width; a split row is sub-panels of one
  figure panel. A scale bar over the merge is copied over each panel (as a new merge copies one).
- **Labels.** One text per panel inside its top-left (3 pt in, 9 pt bold, so it never needs a
  band above), named after the channel as the legend names it (`channelName`, the picture's name
  without extension; `Channel N` when empty), filled with the channel's colour. Runs carry their
  own colour, so the merge's label is one text with each name a run in its colour, joined by
  white `+` runs. No Inspector setting. Labels are plain text objects: renaming a channel
  later does not rename them. Light colours (yellow, green) read on a dark micrograph, poorly
  on a white page; the user recolours the text.
- **The row is one group** (`updateObjects` swaps the merge's unit for it in place), selected
  after the edit. Rows nest, so panels with scale bars are groups inside it.
- **Propagation, no new relation.** `Image.splitSet?: Id[]` holds the ids of the row's pictures,
  merge included. The Levels section and the crop dialog show **Apply to set** (default on, per
  session) when the selected picture's set still has other pictures on the page (`splitSetOf`;
  deleted or locked members are skipped); a levels or crop change is then made for all of them in
  one undo step: levels through `matchLevels` (each baked from its own base), crop through the
  existing multi-picture `cropImages` (`withSplitSets`). Copying (`cloneObjects`) remaps the set to
  the copies made together and drops it from a lone copy, so a copy never edits the original row.
  Not a prompt: an on-by-default toggle where the change is made says the same without a modal
  (and `window.confirm` is banned).
- **Schema.** `splitSet` is an optional field read by the hand decoder (as `channels`, `levels`
  and `crop`, notes 20, 21, 27), so no schema bump and no migration: an older file reads
  unchanged, and an older app drops the field and shows the pictures. `modelArbitraries`
  round-trips it.

## Known limits

- Channels must share the merge's pixel size (the merge dialog already requires it).
- Panels are plain pictures: recolouring the merge later does not recolour a tinted panel.
- The label size is fixed; the labels do not follow a changed channel name or colour.
