# 19 Microscopy panels: calibrated scale bars

Issue 6 (idea 7 in `LANDSCAPE.md`) asks for three things for micrograph panels: a scale bar
from a calibration that stays correct as the picture is resized, merged channels, and crop and
rotate in lockstep across the channels of one field. The scale bar ships here; the other two are
follow-up issues (below).

- **A procedural kind, `scaleBar`, not new UI.** Pixel size (µm per pixel), image width (pixels),
  bar length (µm), a label (empty means written from the length: `10 µm`, `500 nm`, `1.5 mm`),
  show label, corner, and thickness, margin and text size in points. Bar and text are slots,
  white by default for fluorescence. Inspector, decoder, arbitraries and shelf entry come from
  `fields`, as for every kind.
- **The frame is the picture's box, and the calibration is the picture's.** The bar's length is
  `w × length ÷ pixelSize ÷ imageWidth`: a fraction of the frame, so any resize of the frame keeps
  it true, while a procedural resize leaves thickness, margin and text in points (as note 18).
  A bar longer than the picture is cut to the frame width (it would be meaningless and would
  break the bounded-render property); the guide says to check the length if it runs edge to edge.
  Rejected: storing "µm per point" on the bar (wrong after the first resize) and a calibration
  field on `Image` (a `.jfig` schema bump, migration and per-type UI for what a kind's params and
  a group already do; the picture never needs to know its scale except to draw a bar).
- **Following the picture is a group**, exactly as note 18. **Add scale bar** in the Inspector's
  Image section (PNG/JPEG only; an imported SVG has no pixels) runs one named edit, `addScaleBar`,
  which fills in `imageWidth` from the asset's intrinsic width (`UserAssetMeta.width`), so the only
  number the user must type is the pixel size. It shares `overImage` with `labelGelImage`.
  The pixel size is typed, not read from TIFF/OME metadata: imports are PNG/JPEG, which rarely
  carry it, and a wrong guess would be silently wrong in a paper.
- **Number display follows the field's step.** Generated number inputs showed two decimals; a
  pixel size of 0.0645 µm would have read back as 0.06. They now show as many decimals as the
  field's `step` (generic, no per-kind UI).
- **Known limits.** Ungrouping and then resizing the picture alone breaks the calibration (as it
  breaks gel labels). `Image.crop` exists in the model but is not drawn by `objectToNode`, so
  there is no in-app crop to account for yet; when there is, the bar must use the crop's width in
  pixels instead of the asset's.

## Follow-ups

- **Merge channels.** Combine single-channel greyscale images into one pseudocoloured composite
  (per-channel colour and display range, additive), plus the channels as a row. This needs pixel
  work in the browser (canvas decode, colourise, add, encode to a new PNG asset), a dialog to pick
  the channels and colours, and a decision on whether the composite stays re-editable (a recipe
  in the model) or is a baked asset.
- **Crop and rotate in lockstep.** Needs in-app image crop first: `Image.crop` is in the model and
  decoder but no renderer or UI uses it, and drawing a crop within the export subset (no masks)
  means either a `clipPath` decision or re-encoding the cropped pixels as `pictureClip.ts` does
  for PDF import. Lockstep then is one edit applying the same crop/rotation to a set of images.
