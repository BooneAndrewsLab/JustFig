# 11 Arrange in grid

**Arrange in grid…** (issue 2) lays objects already on the page out in rows × columns, each
in its own lettered panel. Templates give empty layouts; this one starts from the content.

- **Edit:** `arrangeInGrid` in `src/core/edits/grid.ts`, one named edit ("Arrange in grid")
  and so one undo step. The layout is `gridLayout`, pure box arithmetic tested on its own;
  the edit moves each object with `translateObj`, or scales it with the shared `resizeOne`
  step when the size changes, so paths and arrows bake the scale into their points, icons
  and images scale by transform, and text keeps its size and re-wraps. Bound arrows are left
  to `reconcileBindings`.
- **"Becomes a panel":** each object is wrapped in a new auto-lettered `Panel` whose frame is
  its cell, at the object's place in the stack. No new model or schema: panels already letter
  themselves in reading order (`panelLabels`), and a panel moves its contents with it. A
  selected panel becomes a cell itself (its frame is set to the cell, its contents mapped from
  its old frame); an object on an unselected panel is taken off it, and its new panel goes just
  above the old one, which stays (possibly empty). Panels never nest.
- **Order:** the objects' current positions, in reading order (rows top to bottom, then left
  to right; `inReadingOrder`, shared with panel labels). An object joins a row when its top is
  within half the row's first object's height (at least `ROW_TOLERANCE`), looser than for
  panel labels because hand-placed content is rough. Selection order was rejected: Ctrl+A and
  a marquee give stacking order, which means nothing to the user, and the letters are worked
  out from positions anyway, so cells filled in position order are the ones lettered A, B, C.
- **Cells:** filled row by row. Without fit, a column is as wide as its widest object, a row
  as tall as its tallest, and the grid starts at the selection's top-left; nothing scales.
  **Fit to page width** (default on; the default page is a 183 mm journal width) shares the
  page width equally between the columns, 2 pt in from each side so outer strokes are not
  clipped, and scales each object, keeping its proportions, to its column width. Rows and
  columns: the dialog keeps rows × columns ≥ the count (changing one recomputes the other);
  the edit refuses a grid too small. Empty trailing cells stay empty (no placeholder panels).
- **Letters:** "Leave room for panel letters" (default on) keeps a band of the label style's
  `offset.y + size` above each object in its cell, so the bold letter at the panel's top-left
  does not sit on the content. Not added for a selected panel (its frame already holds its
  label). Alignment (horizontal left/centre/right, vertical top/middle/bottom; default centre,
  top) places an object smaller than its cell.
- **Skipped:** locked objects, objects in locked layers, objects inside groups (the group is
  the unit).
- **UI:** `src/ui/dialogs/GridDialog.tsx` (via `Dialog`, so focus trap and Escape), opened from
  the Inspector's **Arrange in grid…** button for two or more objects or the `grid` action in
  `KEY_ACTIONS` (Shift+G, also for one object). Gutter is typed in the user's units (3 mm by
  default). Analytics: `arrange/grid`.
- **Fit height:** with fit on, the grid also starts 2 pt from the page top and no object is
  scaled taller than an equal share of the page height (less the gutters, the letter room
  and the 2 pt margins), so tall narrow objects shrink to stay on the page and sit in their
  full-width cell by the alignment. Rows can still overflow if fixed-size room alone exceeds it.
- **Not done:** per-column widths in fit mode.
