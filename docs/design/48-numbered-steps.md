# 48 Numbered steps

Issue #74. Workflow figures number their steps with circled 1, 2, 3. Panel letters already follow
reading order (`readingOrder`, note 02); step numbers do the same, so moving or deleting a step
renumbers the rest without anyone retyping a number.

## Model

A step badge is a text object with one optional field (additive, so no `.jfig` schema bump; the
precedent is `crop`, `splitSet`, `inset`):

```ts
interface Text { …; step?: StepLink }
interface StepLink {
  target: Id; // the object it numbers
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset: Vec2; // anchor corner → badge centre, points
  variant: 'circle' | 'plain';
  paint: Paint; // circle fill, or the plain number's colour
}
```

A text rather than a new object type: every path that handles text (bounds, hit testing, export,
PDF, the decoder, the fragment schema, outlines) already handles the badge, and the one renderer
needs one addition: a circle badge draws a plain `<ellipse>` under its number. The number itself
is ordinary laid-out text (explicit x/y, our fonts), so the export subset is unchanged.

## Numbering is derived

`stepNumbers(page)` (`core/model/steps.ts`): a badge's scope is the group or panel it is in, else
the page. Within a scope, badges are numbered 1, 2, 3 in reading order (`inReadingOrder`, rows
within 14 pt, then left to right) of their **targets'** bounds. The number is formatted by the
panel-label format: A, a → `1`; (A), (a) → `(1)`; a) → `1)`; the font, size and bold also come
from the panel-label style, so one Figure setting styles letters and numbers alike.

The text, size and position are written into the badge only by `reconcileSteps`, which
`reconcileBindings` runs first (before arrows, so an arrow bound to a badge follows it) inside
`store.edit` after every edit (note 06). Edits never place or renumber badges themselves.

| Situation                                       | Result                                     |
| ----------------------------------------------- | ------------------------------------------ |
| Target gone                                     | Badge deleted                              |
| Target is the badge itself or another badge     | Link dropped, plain text stays             |
| Badge alone moved (same size), target unchanged | Its new place becomes its offset           |
| Anything else                                   | Centred on anchor corner + offset, re-laid |

A circle is `max(1.5 × size, text width + 0.6 × size)` across; a plain badge is its text. Laying
out returns the same object when nothing differs, so reconciling an unchanged figure is a no-op
and the render memo holds.

## Making badges

`numberSteps(pageId, ids)` (`core/edits/steps.ts`), one named edit: "Number steps" for several
objects, "Add step" for one. Each object that is not a badge and has none gets an unlaid badge
directly above it in its own container (so a step inside a group or panel is numbered there).
The paint is the one the figure's badges already use, else a swatch named "Steps" (`#0072b2`)
added to the palette in the same edit, so applying a palette recolours badges (note 07).
Inspector: the selection section's **Number steps** / **Add step** button (Shift+N); the **Step**
section shows the number (read only), Look, Corner and Colour.

## Copies

`cloneObjects` → `remapBindings` → `remapStep`: a badge copied with its target follows the copy;
copied alone it becomes plain text with its last number.

## Tests

`core/edits/steps.test.ts`: three objects numbered in reading order whatever the selection
order; moving one past the others renumbers and the badge follows; a dragged badge keeps its
offset; deleting a target deletes its badge and the rest close up; a copied group's badges point
at the copies and count from 1 in the group; format, font and size follow the label style; the
plain variant colours the number; a swatch change recolours the export; one undo step; reconcile
is idempotent. `modelArbitraries` covers `step` in the round-trip property. E2E
`e2e/steps.spec.ts`: Ctrl+A, Shift+N on three rectangles, drag the first to the end, the badges
read 1 2 3 left to right; axe on the Step section.
