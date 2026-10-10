# 47 Tree from Newick

Issue 77: phylogenetic and clustering trees are pasted as bitmaps. The `tree` kind
(`src/procedural/kinds/tree.ts`, note 04) draws one from a Newick string.

## The parser

`src/procedural/newick.ts` is a recursive-descent parser: `subtree := ('(' subtree (',' subtree)* ')')?
label? (':' length)?`, an optional `;`. Labels are quoted (`''` escapes a quote) or bare (underscores
become spaces); `[comments]` are skipped wherever whitespace may be; text after the first `;` is
ignored (a file of several trees draws the first). It never throws: the result is `{ ok, root }` or
`{ ok: false, error }` with the character position. Nesting is capped at 200 levels so the recursive
render cannot overflow the stack, and a length must be a finite number (`1e999` is an error).

The decoder keeps the raw string (cap 4,000 characters); parsing happens in `render`, `problems`
and `overhang`, so a hand-edited or damaged string still loads and shows its error.

## How errors are shown

Kinds had no way to say "this input is wrong", so `ProceduralKind` gains an optional PURE
`problems(p): string[]`. The generated Inspector prints each message as a `role="alert"` note under
the fields, so there is still no per-kind UI. The render draws a short red message in the frame
("Newick: cannot read the tree") instead of a tree, so a broken object is visible on the canvas but
the long text (with the character position) lives in the Inspector. `problems` also lists a
`collapse` entry that matches nothing.

## Layout

- Leaves (and collapsed clades) take one row each, in string order; an internal node sits at the
  mean of its first and last child's row. Depth is the cumulative branch length (negative lengths
  count as 0; a missing length is 0 once any length exists), scaled so the deepest leaf is at the
  edge. With **Use branch lengths** off, or no lengths at all, it is a cladogram: depth is the node's
  height (edges to its deepest leaf), so every tip aligns.
- Rectangular: horizontal branches plus one vertical per internal node, labels left-aligned just
  right of each tip (ragged tips when lengths differ). Circular: the root is the centre, leaves are
  spread evenly round the circle, each node is an arc between its first and last child's angle
  with radial branches out to the children. Leaf labels are placed on the radius and rotated; on
  the left half they are turned by 180 degrees and end-anchored so they read upright.
- Text is in points and does not shrink; a tree with many leaves needs a taller object. Widths are
  estimated at 0.55 em per character (a pure render has no font metrics), and the plot area leaves
  that much room at the right (rectangular, at most 45% of the width) or round the circle (at most
  half the radius). `overhang` states the same estimate for the longest label, so a long name that
  does not fit may run outside the frame and the object's bounds say so.
- Support values (numeric or not, any internal label) sit above the node's incoming branch, left of
  the node, in a smaller size and a quieter colour. In the circular layout they are skipped near
  the centre where they would pile up.
- The scale bar (rectangular, with lengths) is a nice 1-2-5 length from the same `niceStep` the
  other kinds use, with end ticks and a label under it.

## Collapsed clades

`collapse` is a list of `name` rows, each resolving to a clade by the first rule that fits: an
internal label equal to the entry (every clade with that label); for a single name that is a leaf,
the clade directly above it; for `a, b` the smallest clade holding both leaves. This keeps the key
a plain string the Inspector can edit. A collapsed clade is one row, a filled triangle from the
node to the clade's deepest tip (the tip line in a cladogram), labelled `Name (n)` with the count of
leaves; the name is the clade's non-numeric label, else the entry as typed. Nested collapsed
clades: the outermost wins.

## Drawing

One stroked `<path>` for all branches and the scale bar (round caps and joins), one filled path for
the triangles, then the node labels and the leaf labels as text with explicit x/y and, for the
circular layout, a rotation about the anchor. Plain SVG 1.1 only, as for every kind. Colour slots:
Branches, Labels, Node labels, Collapsed clades. Golden SVGs: defaults, support, cladogram,
circular, collapsed, circular with collapsed clades, and a malformed string.

Not done: unrooted (equal-angle) layouts, per-clade colours, italic species names, labels that
shrink to fit, branch-length axis for circular trees. Params shape changes would bump `version`.
