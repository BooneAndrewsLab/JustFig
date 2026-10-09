# 21 Merged channels

Issue 45 (split from issue 6, note 19): combine single-channel micrographs of one field into a
pseudocoloured composite, each channel in a colour over a display range, added together; and
show the channels as a row beside it.

- **The merge is baked pixels.** The export subset (note 03) has no filters, masks or blend
  modes, and svg2pdf and the rasterisers could not be trusted with them anyway. So the merge is
  computed in the browser and stored as a PNG image asset (lossless: an 8-bit RGB merge of
  greyscale channels compresses well), and every renderer draws that plain `<image>`, as a crop
  does (note 20).
- **It stays re-editable: `Image.channels` is the recipe, `Image.asset` the merge.** Each
  `Channel` is `{ asset, color, on, min, max }`: the channel's own picture (as imported), a
  `#rrggbb`, whether it is in the merge, and its display range in 0–255. `asset` is then the
  baked merge of the channels at full size. A plain picture has no `channels`. Keeping the
  channel pictures costs their bytes in the file; in return a channel can be recoloured, re-ranged
  or turned off later, which the maintainer asked for. `objectAssets` lists the channel assets, so
  saving keeps them and attribution credits them (attribution is derived); the merge asset itself
  carries no credit unless one is typed on it, and a re-bake keeps that credit. Rejected: a merge
  that is only a baked asset (cannot be recoloured), and a merge drawn by stacking coloured
  layers (needs blend modes).
- **Schema.** `channels` is an optional field read by the hand decoder (levels checked 0–255,
  colours as hex), so as with `crop`/`cropped` (note 20) and earlier optional fields there is no
  schema bump: a file without it reads unchanged, and an older app reading a newer file still
  draws the merge from `asset`. `modelArbitraries` round-trips it.
- **The blend is pure and exact** (`io/channels.ts`): a channel's intensity is the brightest of a
  pixel's R, G, B (so a channel the microscope exported pre-coloured reads right), mapped by
  `levelTable(min, max)` to 0–255 (black at or below `min`, full at or above `max`, rounded), and
  each output component is `min(255, round(Σ level × colour / 255))` (255 is odd, so never a
  tie). Tested on pixel arrays and through a PNG round trip. A PNG that `decodePng` reads is
  decoded exactly; a JPEG or 16-bit PNG through a canvas (8-bit). 16-bit levels are out of scope:
  browsers decode to 8 bits.
- **Baking is asynchronous, the edits are pure.** The dialog decodes each channel once, previews
  the merge on a down-sampled copy as you change it, and on Apply bakes the full merge (and its
  crop, if the picture is cropped) before one named edit: `mergeChannels` (a new picture) or
  `setChannels` (one picture). Both are one undo step.
- **Crop interplay.** A crop applies to `asset` as for any picture, so a merge crops like a
  plain picture and in lockstep with its channels (same pixel size). `setChannels` keeps the crop
  and takes the re-baked crop of the new merge. A new merge takes the first channel's size,
  angle, flips and crop, so it shows the same region as that channel's panel.
- **Scale bars stay calibrated.** A new merge copies (`cloneObjects`) what lies over the first
  channel's box in its group (what "Add scale bar" makes), grouped with the merge: the same
  pixels across the same box, so the same `imageWidth` is right. Recolouring changes no box.
- **Channels as a row.** "Lay out the channels in a row" moves each channel (its group, when the
  group is only the picture and what lies over it) into a row from the first channel's place,
  left to right in selection order with a 2 mm gap, then the merge. Untick it and the merge goes
  2 mm right of the channels, which stay put. A single plain picture can be pseudocoloured with
  the same dialog (a one-channel merge), for coloured channel panels.
- **Default colours** are colour-blind safe first: green, magenta, then cyan, yellow, red, blue,
  grey. Selecting a merge together with other pictures merges its channels with theirs (each
  channel picture once).
- **UI.** An Inspector section **Channels** for any selection with pictures: **Merge channels…**
  for several, **Channels…** for one, opening the dialog of the same name (Show, Colour, Black
  at, Full at per channel; all form controls, so keyboard-accessible; `Dialog.tsx`).

## Known limits

- Channels must share a pixel size; no registration or resampling (a lockstep crop no longer
  needs one size, note 20).
- A row panel pseudocoloured by **Channels…** is its own recipe: recolouring the merge does not
  recolour it.
- The display range is in 8-bit levels; there is no gamma or auto-contrast.
