# 09 Keyboard shortcuts and accessibility

## The binding table (`src/ui/keyBindings.ts`)

Ported from PlasmidPop's `keyBindings.ts` and `KeyBindings.tsx` (its #79): one table,
`KEY_ACTIONS`, keyed by what an action does, read by the handler (`shortcuts.ts`), the
tooltips (`withKey`), the Shortcuts dialog and the guide's shortcuts page (a test checks the
page lists every action with its default key). A binding is the modifiers and the physical
`KeyboardEvent.code` in a fixed order (`ctrl+shift+KeyG`), so it is the same on every layout.

Differences from PlasmidPop:

- **Bare keys are allowed.** PlasmidPop needs a modifier because a bare letter types a base in
  its sequence view. Here nothing on the canvas types, and `isTyping` keeps every shortcut away
  from a focused field, so the tool letters (V, R, E…) stay single keys.
- **⌘ is Ctrl.** `bindingOf` writes Ctrl or ⌘ as `ctrl`, so one table serves both platforms.
- **Fixed keys** — undo/redo, save, copy/cut/paste, Delete, Escape, the arrow-key nudges,
  Enter to finish a pen path, and the text editor's Ctrl+B/I/= — are listed (group "Fixed")
  and handled before the table; they and their partners (Ctrl+X, Ctrl+V, Ctrl+Shift+Z…) are
  `RESERVED`, so no action can be moved onto them.
- New actions with no key before: fit page (Shift+1), zoom in (Shift+=) and out (−), and the
  guide (Shift+/, i.e. `?`).

Rules for a new binding (`bindingProblem`): not a modifier alone, not a key the browser takes
first (Ctrl+T/N/W, Ctrl+Tab, F5…), not reserved, not another action's. When a change takes a
key another action holds by default, the changed action wins and the other is left unbound
(`resolveBindings`), never both firing. Changes live in `localStorage` (`keyBindings`), per
browser; a stale entry (unknown action, fixed action, not a binding) is dropped on load.

## Accessibility pass (Phase 4)

Checked with axe-core (`e2e/a11y.spec.ts`, WCAG 2.1 A/AA rules) on the main screen, every
dialog and the Inspector of a procedural object: no serious or critical violations. Fixed on
the way:

- **Well map** (the Phase 3 gap): the grid takes focus; arrow keys move a cursor (Home/End to
  the row ends), Space or Enter paints, Delete clears, Shift+arrows paint as they move. A run
  of keys is one undo step, like a drag; stroke numbers are module-level so a re-render never
  reuses one. A live region announces the well and its colour. The grid stops its keys from
  reaching the canvas (no nudging the plate), but Ctrl+Z still undoes.
- **Layers:** each row's name is a button (`aria-pressed` = selected), so the selection can be
  made from the keyboard.
- **Pages:** a proper tablist (`aria-selected`, roving tabindex, ←/→ between pages), F2 or the
  Rename button instead of double-click only.
- **Dialogs:** focus moves in, Tab is trapped inside, Escape closes, focus returns to the
  control that opened it.
- **Space to pan** no longer swallows Space on focused buttons and checkboxes: it applies only
  over the canvas or with nothing focused.
- The canvas is a `main` landmark; the status line (a live region) names a single selected
  object; muted text moved from `--ink-3` to `--ink-2` for contrast.

Known gaps: objects on the canvas are not individually focusable (the Layers list is the
keyboard route to them, and the Inspector's fields move, size and rotate them); the rich-text
editor's Greek picker is a grid of buttons without arrow-key movement.
