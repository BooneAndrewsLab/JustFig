# 59 Inspector layout: geometry grid, action strips, field groups

2026-10-11. The right panel (260px) was built from three generic pieces,
`Section`, `.row` (72px label + control) and `.grid2`, used for everything
whether they fit or not: six geometry inputs that did not line up, five rows
of differently shaped buttons, "Cell" as a heading twice, field labels
wrapping into the 72px column and help text set as large as the controls.

## What

- **Sections are boxed groups**, PlasmidPop's `.panel__group`: a rounded
  1px border with the heading cutting the top border like a fieldset's
  legend (`.section > h2` absolutely placed on a panel background). The
  element stays a `<section aria-label>`, so it is still a named region
  for the guide test and the e2e locators; a real fieldset would be a
  group. Buttons that sat inside a heading (Layers' + Layer, Notes' + Note,
  a kind's Presets and wizard) move to a `.section__head` row under it,
  right-aligned, since the legend strip is 16px tall. Chosen over a
  heading-on-the-rule, a collapsible strip and tabs on a mockup canvas.
- **Geometry** is a `.geo` grid of name · control · name · control
  (`Num` renders `.field` with `display: contents` inside it): X Y / W H,
  the unit as a `.unit` suffix in each control instead of a
  "76.2 × 57.7 mm" line below. Rotate and Opacity are a line each under it (`.geo-more`, the name in
  the same 92px column as the field rows below): in the X/Y/W/H grid their
  words widened the name columns, and in a half-width row of their own
  "100" lost its last digit beside the spinner. Visible labels are short ("Rotate"); the
  accessible name keeps the unit ("Rotate °", "Opacity %") so the guide and
  e2e `getByLabel('X', { exact: true })` still hold.
- **Numbers with units** are one box (`NumBox.tsx`): the number, its unit in
  11px `--ink-3`, and a 13px ▴▾ column at the right edge, as the author
  sketched it. The `<input type="number">` is inside with its native
  spinner hidden, so its name, min, max, step and ArrowUp/Down are the
  browser's; the two buttons call its `stepUp()`/`stepDown()` and are not
  tabbable (`tabIndex={-1}`, `aria-hidden`), since the arrow keys already do
  that. `mousedown` is prevented on them so focus stays in the field. Every
  number in the Inspector goes through it: `Num` and the kind fields'
  `ScalarControl`, so a unit-bearing row (`.row > .numbox:has(.numbox__unit)`)
  is 80px and a plain one 64px.
- **Two action strips** of 26px line-icon buttons (`Act`, `role="group"`):
  "Flip and order" (Flip H, Flip V | Front, Back | Add step / Number
  steps) and "Align" (six edges | distribute, with three or more selected).
  The word is the `aria-label` and the tooltip. The icons are in
  `icons.tsx` with the chrome's, drawn as open lines and chevrons: a closed
  shape under four units wide fills itself in at the 1.4 stroke.
- **Text commands** (Same width/height/size, Same levels, Arrange in grid…,
  spacing, Group, Ungroup, Edit points, Save as preset…) sit in one
  wrapping `.cmds` run; their old `.row` wrappers are `display: contents`.
- **The kind section** is headed "`<kind> options`" with Presets and
  the wizard button on the heading's line (`.section__head`), so the object
  name and the kind are not two identical headings.
- **Field groups:** `Field.group` (note 04's declarative fields, nothing
  per kind in the UI) gathers consecutive fields of one group into a
  `<fieldset class="field-group">` with a two-column grid: a block of
  switches, or of counts with the name above a short input (side by side,
  "Mitochondria" and an input do not fit in 112px). Cell uses "Organelles" (Nucleus, Nucleolus, ER,
  Golgi) and "How many" (Mitochondria, Lysosomes, Vesicles, Chloroplasts;
  Chloroplasts moved up to join them, which only reorders the Inspector
  and the generated schema).
- **Help** under a field is `.field-help`: 11px, `--ink-3`, under the
  control it explains. `.row` labels are 92px and may wrap; procedural
  selects and text inputs fill the row.
- **Tabs** (`SideTabs.tsx`, 2026-10-12). The column was one scroll stack,
  so the Layers panel's top edge was wherever the Inspector ended, and that
  changed with every selection (Rotate and Style for a shape, Ungroup for a
  group, a whole options block for a kind): clicking through the Layers
  rows made the rows jump under the pointer. Now the column is a tablist,
  Inspector | Layers | Notes, one panel at a time, remembered in
  localStorage `sideTab`, with Alt+I/L/N in `KEY_ACTIONS`. Selection never
  switches the tab; opening a note from its marker or starting one does
  (store `setActiveNote`, `setNoteDraft`), since the note is read and typed
  there. The Notes tab carries the count of open notes. The panels stay
  mounted, hidden with `hidden`, so Layers keeps its open groups and scroll
  across a switch and the e2e counts over `.layers` still hold; clicks there
  first choose the tab. Two panes with a draggable split were built and
  dropped: two scrollbars, and the top pane went empty when the lower one
  overflowed. Reserving space for the controls a selection lacks cannot
  absorb a kind's options; Layers above the Inspector moves the Inspector
  instead.

## Not changed

Nothing drawn or exported: no golden moved. Every control keeps its
accessible name, so the guide's bold names and the e2e locators are the
same. The geometry edits, coalescing and plot sizing are untouched.
