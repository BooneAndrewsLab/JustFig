# 10 Match size

Inspector **Same width / Same height / Same size** (issue 14) give each selected object the
size of a reference, where W/H still resize the selection as one box.

- **Edit:** `matchSize` in `src/core/edits/edits.ts`, one named edit ("Match width", "Match
  height", "Match size") and so one undo step. It computes a target box per object and runs
  the same `resizeOne` step as `resizeObjects` (extracted from it), so paths and arrows bake
  the scale into their points, icons and images scale by transform, text re-wraps, panels
  and groups behave as with the resize handles. Bound arrows are left to `reconcileBindings`.
- **Reference:** the first object in the selection (the one selected first; with Ctrl+A or a
  marquee, the lowest in the stacking order). The Inspector reads its bounds and passes
  `{ w }`, `{ h }` or `{ w, h }`; the edit itself takes any size, so a typed value could use it later.
- **Aspect ratio:** Same width and Same height keep each object's own proportions (the other
  dimension follows), which is what you want for micrographs. Same size stretches each object
  to exactly the reference width and height. No lock toggle: the three buttons cover it.
- **Anchor:** each object keeps its top-left corner. Sizes are the visual bounds, so a rotated
  object is matched by its rotated bounding box.
- **Skipped:** locked objects, and objects with zero width or height (nothing to scale).
  The reference itself is already at the target size and does not move.
- **Not done:** a "make all N mm wide" field. Set the first object's W (mm or inches), then
  press Same width.
