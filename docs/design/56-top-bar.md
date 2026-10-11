# 56 Top bar: PlasmidPop's metrics, actions on the right, the History menu

2026-10-11. Side by side with the siblings, the top bar was the most visible
difference: 39px tall with 10px sides, and every action except Export… and
"?" packed on the left beside the title. PlasmidPop's toolbar is 48px tall
with 16px sides and all of its actions on the right.

## What

- **Metrics:** `.topbar` is `min-height: 48px`, `padding: 8px 16px` and
  `gap: 16px` between its clusters, as PlasmidPop's `.toolbar`. Inside a
  cluster (`.toolbar-group`) the gap is 6px. The divider lines between
  groups are gone, as PlasmidPop has none. Top-bar buttons take
  PlasmidPop's `5px 12px` padding.
- **Order:** the logo and the figure title stay on the left. The spacer now
  comes straight after the title, so File and Save, the history control,
  zoom, Export… and "?" all sit on the right, in that order.
- **History menu** (`src/ui/HistoryMenu.tsx`, PlasmidPop's `HistoryMenu`):
  Undo, Redo and a ▾ caret joined into one `.segmented` control
  (`role=group`, "History"). Undo and Redo keep their tooltips, which
  name the change and the key. The caret (`aria-label` "History",
  `aria-haspopup="menu"`) opens a "Changes" menu that lists every recorded
  change, newest first, numbered, with "Opened figure" last. The entries
  are `menuitemradio`, and the current state is checked and in bold. Undone
  entries are greyed and remain selectable. Choosing an entry calls
  `store.jumpHistory(position)`, which is `History.jumpTo`, so the jump
  takes as many undo or redo steps as it needs. It records no new step
  and goes through the same `fix` as undo and redo. The caret is disabled
  while there is nothing to list.
- `useMenu` now moves between `menuitemradio` items as well
  (`[role^="menuitem"]`). The analytics allow-list gains `history: jump`.

## Why

The user flipped between the three apps and the bar read as a different
product. The bar now matches PlasmidPop's on height, side padding and
which side holds the actions. The user preferred PlasmidPop's history
dropdown to two bare buttons, and the dropdown also makes undo depth
visible. BarelySig's bar (52px, beside a full-height sidebar) and
PlasmidPop are not changed from here.

## Tests

- e2e `polish.spec.ts`: the bar is 48–50px at 1280×720 (49.3px measured: 48 plus the border, as PlasmidPop), "?" ends 16px from the
  right edge, and File sits in the right half.
- e2e `history-menu.spec.ts`: the list has one entry per change plus
  Opened figure, jumping back and forward, keyboard open, End, Escape
  returning focus, and axe on the open menu.
- `guide.test.ts`: History and Opened figure are in the guide.
