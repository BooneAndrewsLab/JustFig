# 28 Editing a path's points

Issue #50. A path, line or arrow could only be moved, resized and rotated once drawn, and a
path-following procedural object (bilayer, DNA/RNA helix, membrane receptors) only took its
path from a drawn path (note 04 said "no node editing of the path yet"). Point editing lets the
user reshape any of them after the fact, with the mouse or the keyboard.

## What can be edited

`editableNodes(o)` (`src/core/edits/nodes.ts`) is the one accessor: a `path` or `arrow` gives
`o.nodes`, a procedural object with a `path` gives `o.path` (closed when its params say
`closed: true`); anything else, a locked object, or a procedural object without a stored path
gives nothing. The guide path is not a kind param: it is `Procedural.path`, frame-local like a
path's nodes (note 04), so the edits change that field and leave `params` alone. No kind knows
it is being edited and no kind has UI of its own for it; the kind just redraws from the new path
(its cache is keyed on the path array, note 04).

## The edits

All in `src/core/edits/nodes.ts`, each one named undo step:

| Edit                                  | Label                        |
| ------------------------------------- | ---------------------------- |
| `moveNodePart(page, id, ref, dx, dy)` | Move point / Move handle     |
| `insertNode(page, id, seg, t)`        | Add point                    |
| `deleteNodePart(page, id, ref)`       | Delete point / Remove handle |
| `setSmooth(page, id, index, smooth)`  | Make point smooth / corner   |

A `ref` is `{ index, part }` with `part` one of `node`, `in`, `out` (the node or one of its two
Bézier handles; a handle is stored absolute, frame-local, as everywhere else).

- **Moves take a page-space delta.** The edit turns it into the object's own axes with the
  inverse of the frame's rotation and flip, so a rotated or flipped path moves its point exactly
  under the pointer. A drag recomputes from its start figure (`from`) with the whole offset, like
  moving objects, and coalesces on one gesture key; a burst of arrow-key nudges coalesces like
  object nudges. Each drag or burst is one undo step.
- **Moving a node carries its handles.** Moving a handle of a node whose two handles are
  collinear and opposite (a smooth node) turns the other handle to stay collinear, keeping its
  length; otherwise the handles move independently (a cusp).
- **Adding a point splits a segment with de Casteljau** at `t`, so the drawn shape does not
  change; a straight segment gets a corner point on the line. A click on a segment adds at the
  nearest point; the key adds halfway along the segment after the current point (before it, on
  the last point of an open path).
- **Deleting** never leaves fewer than two points (an `EditError`, shown as a notice). Deleting a
  handle makes that side of the node a corner.
- **Corner/smooth.** A node with no handles is a corner. Making it smooth gives it handles along
  the line from its previous to its next neighbour, a third of the way to each (one handle at
  an open path's end); making it a corner removes both.

**Frame refit.** After any of these the frame is refitted to the nodes (handles included, as
`localise` does) plus the margins the old frame had around them, clamped at zero: a path or
arrow has none, so its frame stays its node bounds; a path-following object keeps the room its
units reach past the path. Rotation and flip are kept, not baked: the new centre is the old
frame matrix applied to the new box's centre in old local coordinates, so every unchanged node
stays exactly where it was on the page. This is the same rule for every kind and needs no kind
code in `core`.

**Bound arrows** are left to `reconcileBindings` (note 06), which `store.edit` runs after every
edit: editing a closed path re-solves arrows bound to it (its outline changed); dragging a bound
end point of an arrow detaches that end (the end moved, its target did not), as dragging the
arrow does; editing an arrow's middle point keeps its ends, so its bindings stay.

## The mode

`TabState.nodeEdit` is `{ id, index, part } | null`: the object whose points are shown and the
current point. `fix` drops it when the object is gone, no longer editable or no longer the one
selected, and clamps the index after undo. Choosing a tool or another selection leaves the mode.

Entering: double-click the object, press **Enter** with it selected (focus on the canvas or
nothing), or **Edit points** in the Inspector, which moves focus to the canvas so the keys below
reach it. Leaving: **Escape**, a click on empty canvas or another object, or any tool.

On the canvas the object's box and resize handles are replaced by: a square per node (rounded
when smooth, filled when current), a round dot per handle on a line to its node, and an invisible
wide stroke per segment to click. The overlay is drawn in screen space from
`frameMatrix(o.frame)`. Drags pass page deltas (the edit undoes rotation and flip); a click on a
segment or a double-click goes to the object's own coordinates with `toLocalPoint` (the inverse
frame matrix) to find the nearest segment or node.

Double-click picks the object with `elementFromPoint`: pointer capture (taken on every press)
makes the canvas itself the `dblclick` target in Chromium. The canvas has `tabIndex={-1}`, so
**Edit points** can give it focus; it is not in the Tab order.

## Keyboard (note 09)

Fixed keys, listed in `KEY_ACTIONS` and handled first in `shortcuts.ts` while the mode is on:

- **Tab / Shift+Tab** next and previous: nodes and their handles in path order. Tab is taken
  only while the mode is on and focus is on the canvas or nothing, and Escape always leaves, so it
  never traps focus.
- **Arrow keys** nudge the current point 1 pt, **Shift** 10 pt.
- **Delete / Backspace** delete the current point, or remove the current handle.
- **Enter** enters the mode (it shares the key with finishing a pen path).

Changeable keys, group "Points": **I** adds a point after the current one, **S** toggles corner
and smooth.

A live region in the canvas's bottom corner says which point is current and where ("Point 2 of 5, smooth,
X 12.0 mm, Y 4.5 mm"), after every move, and lists the keys.

## Tests

`src/core/edits/nodes.test.ts`: moving a node and a handle (smooth partner follows, cusp does
not), a rotated and flipped path moving its point exactly by the page delta and keeping the other
nodes in place, insert keeping the shape (sampled points equal), delete refusing below two, the
handle removal, corner/smooth both ways, a bound arrow following an edited closed path through
`reconcileBindings`, an arrow's end detaching when dragged (its middle point keeping the binding),
and a bilayer's guide path edited with its params untouched. `src/ui/state/store.test.ts`: a
coalesced drag is one undo step, and the current point survives delete and undo and is dropped on
another selection or tool. `e2e/path-nodes.spec.ts`: double-click, drag a node, add on a segment,
undo; Edit points, Tab, arrow keys, I, S, Delete, Escape and Enter from the keyboard, read from
the live region; a bilayer's path dragged and undone. `a11y.spec.ts` audits the mode.
