# 06 Arrow binding

An arrow whose end is dropped on an object stays attached to it: move, resize or rotate the
object and the arrow follows. This is the most-asked-for diagram feature after icons, and the
model has carried `Arrow.bind` since Phase 1 (note 02), so no schema change is needed.

## Model

```ts
interface Arrow { …; bind?: { start?: Id; end?: Id } }
```

- `bind.start` / `bind.end` name the object that end is attached to. Either, both or neither.
- The arrow's nodes are still stored, in full, in frame-local coordinates. Binding never makes
  geometry implicit: a file read by an app that ignores `bind` draws the arrow where it was last
  saved, and every export is unaffected.
- A binding may name any object on the same page except a panel, an arrow, or the arrow itself
  (a panel is a container, and arrow-to-arrow chains re-solve each other). It may point into a
  group or panel: ids are unique per page and `findObj` recurses.

## When the geometry is re-solved

`reconcileBindings(before, after)` (`src/core/model/binding.ts`, pure) runs inside
`store.edit` after every edit is applied, so it covers every edit there is — move, nudge,
resize, rotate, flip, align, distribute, Inspector changes, paste — without each edit knowing
about arrows. Undo and redo restore whole snapshots, which are already consistent, so they do
not run it.

Magnified insets (note 44) are bound the same way: `reconcileInsets` runs first inside
`reconcileBindings` and lays out each inset's box and connector lines (or re-crops it).

For each arrow with a `bind` in `after`, per bound end:

| Situation                                                       | Result                          |
| --------------------------------------------------------------- | ------------------------------- |
| Target no longer on the page (deleted, converted to shapes)     | Binding dropped, arrow stays    |
| Target is a panel, an arrow or the arrow itself (bad file)      | Binding dropped                 |
| Arrow is new, or its target changed (different object identity) | End re-solved onto the target   |
| Arrow changed, target did not, and that end moved on the page   | Binding dropped (user moved it) |
| Nothing relevant changed                                        | Left alone                      |

Object identity is enough to tell "changed" because the model is immutable: an edit that does not
touch an object returns the same object. The last row means re-solving is idempotent in effect —
it runs only when an input changed — and restyling an arrow never moves it.

Dragging a bound arrow by itself detaches the ends that moved (the Excalidraw rule): the user
asked for the arrow to be somewhere else. Moving the arrow together with its targets keeps the
binding.

## Where the end goes

The end sits on the target's outline, a gap of `BIND_GAP` = 2 pt outside it, on the ray from the
target's centre towards the arrow's "aim":

- both ends bound: the other target's centre (centre-to-centre, as diagram tools do);
- the other end free: that end's page position;
- an arrow of more than two nodes: the neighbouring node.

For a two-node curved arrow the aim ray is turned by the curve's start or end tangent angle,
`atan(3b)` where `b` is the bend fraction the Inspector's "Curve %" sets, and the bend is
re-applied to the new chord. The result depends only on the targets, the free end and `b`, so
re-solving an unchanged figure gives the same nodes.

The outline is, by type: a rectangle's rotated frame; an ellipse sampled as a 64-gon; a closed
path flattened with `core/geometry/sampling.ts` `flatten`; for everything else (text, icon,
image, procedural, group, embedded, open path) the rotated frame rectangle. The crossing chosen
is the one nearest the aim along the ray, so a concave outline still takes its outer edge. If
the aim lies inside the target, the end goes to the centre ray's outline crossing in the aim's
direction anyway; if aim and centre coincide, the end is left where it is.

## Making and breaking a binding

- **Arrow tool:** pressing on an object starts the arrow bound to it; releasing on an object
  binds the end. While dragging, the object under the pointer is outlined. A drag that starts
  and ends on the same object binds only the start.
- **Inspector:** the Arrow section shows "Start: attached to ‹name›" / "End: …" with a
  **Detach** button for each.
- **Copy, duplicate, paste:** `cloneObjects` remaps a binding to the copy of its target when
  the target is copied too, and drops it otherwise, so a duplicated arrow never jumps back onto
  the original.

Numbered step badges (note 48) are the second binding solved here: `reconcileSteps` runs first
inside `reconcileBindings`, so arrows bound to a badge follow it.

## Tests

`binding.test.ts`: each row of the table; ends on rect, rotated rect, ellipse and closed path
outlines (distance from the outline = gap); curved arrows keep their bend; re-solving twice is a
no-op; clone remapping. A property test: for random targets and moves, a bound end is always
within `BIND_GAP` ± 0.5 pt of the target's outline. E2E: draw two rectangles, draw an arrow
between them, move one, the arrow follows; drag the arrow away, it detaches.
