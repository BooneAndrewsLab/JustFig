# 06 Arrow binding

An arrow whose end is dropped on an object stays attached to it: move, resize or rotate the
object and the arrow follows. This is the most-asked-for diagram feature after icons, and the
model has carried `Arrow.bind` since Phase 1 (note 02). Connection sites (issue 98) made each end
an object: `.jfig` schema 3.

## Model

```ts
type BindSite = 'top' | 'right' | 'bottom' | 'left' | 'center';
interface ArrowBinding { id: Id; site?: BindSite }
interface Arrow { …; bind?: { start?: ArrowBinding; end?: ArrowBinding } }
```

- `bind.start` / `bind.end` name the object that end is attached to. Either, both or neither.
- `site` absent: the end **slides** on the outline (below). `site` set: the end is **fixed** at
  that connection site (Dia-style). Schema 2 stored a bare id; migration 2 → 3 rewrites it to
  `{ id }` in every arrow of a figure, fragment or presets file.
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
| The binding's id or site changed in this edit ("fresh")         | End re-solved onto the target   |
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

## Connection sites

Five per object, in its own frame: the midpoints of the frame's top, right, bottom and left
edges, and the centre (corners are deliberately left out for now). A group uses its bounds box.
`sitePoint(o, site)` (`binding.ts`) is where a fixed end goes: for an edge site, the ray from the
target's centre through the edge midpoint (after `frameMatrix`, so the site turns with rotation
and swaps sides with a flip) is clipped to the outline exactly as a sliding end is, plus
`BIND_GAP`. For a rectangle or an ellipse that is the edge midpoint itself, a gap out; for a
closed path it is where that ray leaves the shape. The centre site is the centre, no gap.

`siteExit(o, site)` is the unit direction an arrow leaves an edge site in, page space: centre →
edge midpoint, i.e. the edge's outward normal for a rectangle. It is `undefined` for the centre
(and for a degenerate frame). **Routing (issue 99) takes its exit directions from here**; a free
end, a sliding end or a centre site has none, so routing infers one from the other end.

Solving: a fixed end goes to its site point; a sliding end aims at the other end's site point when
that end is fixed (else its target's centre, else its position). A two-node arrow keeps its bend;
on a polyline only the end node moves (its handles with it). As before, the result depends only on
the inputs, so re-solving is a no-op.

## Making and breaking a binding

- **Arrow tool:** pressing on an object starts the arrow bound to it; releasing on an object
  binds the end. While dragging, the object under the pointer is outlined and its sites drawn
  as dots (canvas overlay only). Within `SITE_SNAP_PX` = 8 screen pixels of a site the end
  snaps to it (the dot fills) and binds with that `site`; elsewhere on the object it binds
  sliding. Because edge sites sit a gap outside the outline, an object whose site is within
  the radius counts as under the pointer even when the pointer is just off it. A drag that starts
  and ends on the same object binds only the start.
  Click-to-place (issue 96): a click without a drag places a point; more clicks add points
  (Shift snaps 45° off the previous one), double-click or Enter finishes (the double click's
  duplicate node is dropped), Esc or a tool change finishes with the placed points or cancels
  with one. The arrow has N nodes; only the first and last point can bind, each to the object
  under the pointer when it was clicked.
- **Dragging an end point** (issue 97): a selected arrow shows a handle per point. Dragging the
  first or last one moves it by the existing rule (the end detaches); the object under the
  pointer is outlined with its sites, and on release over one (not the arrow's other end's
  target) `attachArrowEnd(page, arrow, end, target, obj, site?)` binds the end, at the snapped
  site if any, in the same undo step (same `coalesce` key). A binding newly
  added by an edit is "fresh": `reconcileBindings` skips the moved-away check and places the end
  on the outline. Release in empty space leaves it detached. Middle points never bind.
- **Inspector:** the Arrow section shows "Start: attached to ‹name›" / "End: …", a site list
  (outline, top, right, bottom, left, centre; choosing one is `attachArrowEnd` again, so a fresh
  binding that re-solves) and a **Detach** button for each.
- **Copy, duplicate, paste:** `cloneObjects` remaps a binding (keeping its site) to the copy of
  its target when the target is copied too, and drops it otherwise, so a duplicated arrow never jumps back onto
  the original.

Numbered step badges (note 48) are the second binding solved here: `reconcileSteps` runs first
inside `reconcileBindings`, so arrows bound to a badge follow it.

## Tests

`binding.test.ts`: each row of the table; ends on rect, rotated rect, ellipse and closed path
outlines (distance from the outline = gap); curved arrows keep their bend; re-solving twice is a
no-op; clone remapping. A property test: for random targets and moves, a bound end is always
within `BIND_GAP` ± 0.5 pt of the target's outline. Sites: site points and exit directions
(rotated, flipped), nearest-site snapping, fixed ends following move/resize/rotate/flip,
attaching and switching sites, clones keeping the site, and a property test: for random rects
and ellipses, sites, moves, resizes, rotations and flips, a fixed end is within 0.5 pt of the
site computed independently from the frame's corners. `fixtures.test.ts`/`jfig.test.ts`: the
frozen schema 3 file and the 2 → 3 migration. E2E: draw two rectangles, draw an arrow
between them, move one, the arrow follows; drag the arrow away, it detaches.
