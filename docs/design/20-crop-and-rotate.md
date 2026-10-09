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
  rectangle of differently sized pictures is not the same region.
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

## Known limits

- Cropping in the turned picture's axes (a level crop of a turned cell) would need resampling;
  not done. The crop is in the picture's own pixels.
- Pictures of different pixel sizes cannot be cropped together; crop them one at a time.
- A see-through picture's backdrop (issue 35) does not follow a crop of its picture.
