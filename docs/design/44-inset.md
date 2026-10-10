# 44 Magnified insets

Issue 66: the most common microscopy figure element after the scale bar is a box on a
micrograph and an enlarged copy of that region beside it, joined by two lines. Before this the
user cropped a copy, resized it and drew a rectangle and two lines by hand, and moving the
source broke the link.

## Model

- **The inset is an ordinary cropped picture** (note 20): `asset` is the source's asset, `crop`
  (with `turn`) is the region in its pixels, `cropped` the baked pixels. Renderer and every
  export draw a plain `<image>`; the box and the lines are a plain `rect` and two open two-node
  `path`s. No clip, mask or filter (note 03), and an app that ignores the link draws the figure
  as saved.
- **The link is one optional field on the inset**, `Image.inset: { source, box, lines, stale? }`
  (`InsetLink`). The region is not stored twice: it is the inset's `crop`. Magnification is not
  stored either: it is derived (the inset's points per pixel over the source's, across), so it
  can never disagree with the boxes.
- **Schema:** an additive optional field read by the hand decoder (`insetLink` in `jfig.ts`), so
  no schema bump, as `crop`, `cropped`, `channels` and `levels` before it (note 20).
  `modelArbitraries` generates it, so the `.jfig` round-trip property covers it. An older app
  drops the field and keeps the objects as plain shapes and a cropped picture.
- Rejected: binding fields on the rect and the lines (three objects to keep consistent instead of
  one), and a new object type grouping the four (a group cannot hold the inset away from the
  source's group, and selecting the box or the inset alone must work).

## Binding

`reconcileInsets(before, after)` (`core/model/inset.ts`, pure) runs first inside
`reconcileBindings` (note 06), so it covers every edit, and an arrow bound to an inset or its box
then follows them. No edit moves a box or a line. Change is told by object identity, as for
arrows. Per inset with a link:

| Situation                                                         | Result                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Source or box gone (deleted), or the source is not a raster       | Box and lines removed, link dropped: a plain cropped image |
| Inset gone (deleted)                                              | Its box and lines removed                                  |
| A line gone                                                       | Link keeps the other; it takes the end pair nearest it     |
| The box changed and the source did not (the user dragged the box) | Re-crop: region from the box, inset re-sized, `stale`      |
| The source's asset changed (levels, channels re-baked)            | Inset takes the new asset, drops its own levels, `stale`   |
| Anything else (source moved or resized, inset moved, new link)    | Box laid over the region, lines laid                       |

- **Box:** `viewFrame(source.frame, size, sourceView, insetView)` (note 20's frame for another
  view of the same pixels), flips dropped. A box moved with its source (both changed) is laid
  from the region, so it ends where it was moved to.
- **Re-crop:** the box's centre goes back through the source's frame and view (`fromTurned` /
  `toTurned`) into the inset's view pixels, its size divided by the source's points per pixel,
  clamped to whole pixels on the picture (`clampCrop`); the box is then laid from that region,
  so it snaps to whole pixels and back onto the picture. The inset keeps its magnification and
  its frame's top-left corner; a scale bar grouped over it moves to its new box with
  `imageWidth` scaled (the crop edit's rule, note 20).
- **Lines:** the two box corners facing the inset to the two inset corners facing the box, paired
  along the other axis. The side is the axis with the larger gap between their bounds (left or
  right when the horizontal gap is larger, else above or below), so the corners swap when the
  inset moves to another side. Rotated frames use their real corners.
- Re-solving an unchanged figure returns it unchanged (tested), and a line or box moved by itself
  snaps back (a box re-crops instead).

## Baking after a re-crop

Baking is asynchronous (`bakeView`, note 20) and the reconcile is pure, so a re-crop sets
`stale` and keeps the old `cropped` (the inset shows the old pixels stretched for a moment).
`ui/insetBaker.ts` watches the store, waits for 150 ms of quiet (a drag bakes once), bakes every
stale inset in every tab, and applies `bakeInset` through `store.amend`: the present is replaced
without an undo step (`History.amended`), since the bake completes the edit that re-cropped. A
bake is applied only when the inset still shows exactly what was baked (asset, turn, crop), so an
undo or another drag in the meantime is never overwritten. A file saved while stale is baked when
opened.

## Edits and UI

- `addInset(pageId, sourceId, { region, baked, magnification })` — **Make inset**, one named edit,
  one undo step. The region is in pixels of what the source shows (`plannedInset` offsets it by
  the source's crop and takes its turn); the dialog bakes it first. The inset goes 12 pt right of
  the source's bounds, top-aligned, with the source's rotation and flips, inserted after the
  source's top-level object (outside a scale-bar group) in its panel or layer, then the lines,
  then the box; geometry of the box and lines is left to the reconcile.
- `setInsetMagnification` — the Inspector's **Magnification**: resizes the inset about its frame's
  top-left corner, with what lies over its box.
- **Inspector:** a **Magnified inset** section on a single PNG/JPEG picture: **Make inset…** (opens the
  **Make inset** dialog: drag on the preview or type Left/Top/Width/Height, Magnification), and
  on an inset the region, the magnification field and the source's calibration.
- **Scale bar:** the calibration on main is the scale bar's `pixelSize` (note 19). The inset
  shows the source's own pixels, so its bar takes the same pixel size (`insetSourcePixelSize`,
  from the bar grouped over the source) and `imageWidth` = the region's width; the bar is then
  longer by the magnification, i.e. µm per point is the source's divided by the magnification.
  A pixel size stated by the asset itself (a TIFF, note 43), which the inset shares with its source,
  is preferred; the source bar's is the fallback.
- **Copies:** `cloneObjects` → `remapBindings` → `remapInset`: kept, remapped, when the source and
  the box are copied too (lines not copied are dropped), else dropped.

## Known limits

- The inset bar's pixel size is copied when the bar is added, not kept in step with the source's.
- An inset of a level-cropped (turned) picture shares its turn; re-cropping the source with a
  different turn moves the box to where the inset's pixels now are, which may be turned.
- Magnification is measured across; a picture stretched unevenly has another one down.
