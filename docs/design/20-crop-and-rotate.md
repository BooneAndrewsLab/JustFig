# 20 Crop and rotate pictures, in lockstep

Issue 46 (split from issue 6, note 19): crop and rotate the channels of one micrograph field
together. `Image.crop` was in the model and decoder, but nothing drew it and there was no UI, so
in-app crop comes first.

- **A crop is re-encoded pixels, not a clip.** The export subset (note 03) has no `clipPath`,
  masks or nested `<svg>`, and `preserveAspectRatio="… slice"` only crops centred or edge-aligned
  at the frame's aspect. So the crop's pixels become their own image asset, as
  `pictureClip.ts` already does for imported plots, and every renderer and export draws that
  plain `<image>`. Rejected: adding `clipPath` to the subset (svg2pdf, Safari's rasteriser and
  the subset test were all built on not having it, and a clip leaves the hidden pixels in every
  exported file).
- **Model: `Image.asset` stays the whole picture, `crop` is in its pixels, `cropped` is the baked
  crop.** `crop` (x, y, w, h in pixels of `asset`'s `meta` size) is the description; `cropped`
  is the hash of an `image` asset holding exactly those pixels; `objectToNode` draws `cropped`
  when both are set and the asset exists. Keeping the whole picture means a crop can be widened
  or taken off later and undo is just the previous figure; the cost is both in the file.
  `objectAssets` lists both, so saving keeps both and loading checks both. This is an additive
  optional field read by the hand decoder, so no schema bump (as earlier optional fields);
  `modelArbitraries` round-trips it. The baked asset carries no credit (the whole picture, still
  in the figure, does: attribution is derived).
- **Baking is asynchronous, the edit is pure.** `io/cropImage.ts` `cropPicture` cuts a PNG that
  `decodePng` reads exactly (`cropPixels`, then `encodePng`), and anything else (JPEG, 16-bit or
  interlaced PNG) through a canvas, a JPEG staying a JPEG at quality 0.95 (photos grow several
  times as PNG) and a PNG staying a PNG. The dialog bakes first (once per asset, and not again
  for a picture already showing that crop), then runs one named edit, `cropImages`, which only
  places the baked assets and changes objects: one undo step.
- **The frame keeps the picture's scale.** `cropFrame` keeps points per pixel, rotation and
  flips, and moves the box so every kept pixel stays where it was on the page (tested with turned
  and mirrored frames, and back out to the whole picture).
- **Lockstep is one edit over a set.** `cropImages(pageId, ids, { crop, baked, rotation })` sets
  the same pixel rectangle (clamped to whole pixels) and the same angle on every picture; a crop
  of the whole picture removes `crop` and `cropped`. `cropTargets` takes the selected PNG/JPEG
  pictures and those directly in selected groups (a picture grouped with its scale bar), so the
  channels can be selected as they are; `sharedSize` requires one pixel size, since the same
  rectangle of differently sized pictures is not the same region (until issue 48, below).
- **What lies over a picture follows it, and stays calibrated.** A procedural object in the
  picture's group whose box is the picture's (what `overImage` makes: scale bar, gel labels,
  notes 18 and 19) moves to the new box; an `imageWidth` param is scaled by the crop's width
  change, so a scale bar keeps its length in µm (tested: the bar's length in points does not
  change). This is kind-agnostic: core never imports procedural kinds. `addScaleBar` on a
  cropped picture takes `crop.w`. A bar moved off the picture's box is left alone.
- **UI.** An Inspector section, **Crop and rotate**, for any selection with pictures, and a
  dialog of the same name: Left/Top/Width/Height in pixels and Angle (the keyboard way), a
  preview to drag a rectangle on, **Whole picture**. The angle is the frame's rotation, so a
  crop is along the picture's own edges, before turning.

## Level crops, other sizes, backdrops (issue 48)

- **A level crop of a turned picture is a resampled view, kept re-editable.** New optional
  `Image.turn` (degrees, clockwise): the pixels of `asset` turned by it, about the centres, into
  their bounding box at the same pixel size (`core/geometry/turn.ts`: `turnedSize`, `toTurned`,
  `fromTurned`); `crop` is then in pixels of that turned picture and `cropped` is its bake. The
  frame's rotation takes the rest of the angle, so the angle on the page is
  `rotation + s × turn` (`pageAngle`; `s` is −1 when the frame is mirrored one way, as a mirror
  reverses a turn). A level crop sets `turn = s × angle` and rotation 0. `asset` stays the whole
  picture, so the angle and crop can be changed or the turn taken off later; the turned view is
  only ever baked, never stored whole. `turn` only appears with `crop`.
  - _Baking_: `io/cropImage.ts` `turnPixels` samples each output pixel's centre bilinearly,
    premultiplied, clear outside the picture (an opaque result without alpha stays RGB);
    `cosSin` snaps quarter turns so they copy pixels exactly (tested). A PNG `decodePng` reads is
    turned here; anything else through a canvas (`rotate`, high-quality smoothing). The result is
    a PNG, or a JPEG (0.95) when a JPEG's crop lies wholly on the picture (`onPicture`), since
    JPEG has no clear corners. `bakeView` picks plain crop or turn.
  - _Frame_: `viewFrame` generalises `cropFrame` to views (turn + crop): same points per pixel,
    the new crop's centre mapped through the new view back to asset pixels and through the old
    view to the page, rotation adjusted by `s × (old turn − new turn)`; then the chosen angle is
    applied about the new centre as before. Tested: asset pixels stay put for upright, mirrored
    and doubly mirrored frames, and back to own edges.
  - _Edit and undo_: still one named edit, `cropImages`, with `level` in its options (default:
    as the picture is now); `plannedView` says what each picture will show, so the dialog bakes
    exactly what the edit sets. An angle-only edit keeps the turn and moves the frame.
  - _Channels_: a merge's crop is re-baked with its turn (`setChannels`), a new merge copies the
    first channel's `turn` with its crop, and lockstep crops turn every picture alike.
  - _Schema_: like `crop`, `cropped` and `channels`, an optional field the hand decoder reads, so
    no schema bump: older files read unchanged, and an older app still draws `cropped` right
    (it would only offer the crop in the unturned pixels when re-cropping).
  - Rejected: storing the turned picture as a new `asset` (loses the original, so the angle could
    not be changed without compounding resampling), and turning at export (the subset has no
    clip, and every export path would have to resample).
  - UI: **Crop level on the page (resample the turned picture)**, a checkbox in the dialog
    (keyboard-reachable); the preview then shows the turned picture and the fields are in its
    pixels. Toggling restarts the crop from the whole view, since the two pixel grids differ.
- **Pictures of different sizes crop the same part of themselves.** The crop is typed in the
  first picture's (view's) pixels and `scaledCrop` takes the same fraction of each other picture,
  edges rounded to whole pixels (`CropOptions.size` is the reference). No registration: pictures
  of one field at two resolutions line up; pictures that are not the same field do not. Scale
  bars stay calibrated per picture (`imageWidth` scales with each picture's own crop width).
- **A see-through picture's backdrop follows its picture.** The backdrop (issue 35, note 12: an
  `svgImport` right under the picture, the same box) is found as the group sibling just under
  the picture with its old box, and uses the same fields: `asset` the whole backdrop, `crop`
  (and `turn`) in its `meta` units, `cropped` the cut, which `objectToNode` draws like a cropped
  picture. Its view is derived from the picture's new state, never from its own earlier one (no
  drift): the whole picture's frame now, with the backdrop's flips, is where the whole backdrop
  lies; the picture's new box in it gives the crop. `io/cropBackdrop.ts` `cutBackdrop` places
  the whole backdrop in the crop's units (one `matrix` group) and cuts every shape to the box
  with the plot importer's clip cutter (`clipShape`), text kept whole when its anchor is inside,
  so the export stays plain SVG and nothing outside is left. It is vector: a level crop turns it
  exactly, without resampling. Synchronous, so it runs inside the edit.

## Known limits

- Pictures of different sizes are cropped by fraction, not registered: no shift or scale
  between them is corrected.
- A level crop resamples (bilinear): fine detail is slightly softened, except at quarter turns.
- A picture stretched unevenly (different points per pixel across and down) turns as its pixels,
  so a level crop of one is not the stretched picture turned.
