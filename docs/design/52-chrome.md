# 52 Chrome: the "?" help button, text Undo/Redo, the version in the guide

2026-10-10. Step 3 of `DESIGN.md` (the logo lockup in the top bar landed
with note 50).

## What

- **Help:** a round 28px "?" button at the far right of the top bar, after
  Export…, opens the user guide (PlasmidPop's `HelpButton`: `aria-label`
  "Help", `aria-haspopup="dialog"`, title "Open the guide (?)"). The
  "Guide" and "Shortcuts…" text buttons are gone.
- **`?` is a fixed key** (`help` in `KEY_ACTIONS`, group Fixed, shown as
  Shift+/). It was the rebindable `guide` action; like PlasmidPop it now
  matches the character `?` in the fixed-key block of `shortcuts.ts`, so it
  works on every keyboard layout and cannot be moved. A saved rebinding of
  the old `guide` id is dropped as unknown, as `resolveBindings` already
  does for removed actions.
- **Change shortcuts** is a page of the guide, listed after Keyboard
  shortcuts in its page list. It is the old Keyboard shortcuts dialog's
  table unchanged in behaviour (`src/ui/KeyBindings.tsx`, was
  `dialogs/KeyBindingsDialog.tsx`): Change, Default, All back to their
  defaults, the capture-phase listener that keeps Escape and the app's
  shortcuts from seeing the key. A refused key's message now shows in the
  row being changed, so it is visible wherever the page is scrolled.
- **Undo and Redo** are text buttons. The title names the change and the
  key ("Undo Move (Ctrl+Z)"); the accessible name is the visible word. The
  undo and redo line icons from note 50 are removed from `icons.tsx`;
  zoom, tab close and new tab keep theirs, where a word would not fit.
- **Version:** "Version 0.1.0" sits beside the guide's title
  (`Dialog`'s new `meta` slot), not at the end of the status line.

- **Step 4's remainder** needed no code: the tool palette buttons were
  already 34×34 with the 16px line icon (note 50, `.tools button`), and the
  zoom, tab-close and new-tab buttons keep their icons. An e2e now holds
  those sizes.

## Why

`DESIGN.md` §1: the family's chrome is a "?" at the far right, text
Undo/Redo and the version in the guide header. Two text buttons for help
cost top-bar width that the file buttons need, and the rebinding table is
reference material that belongs next to the shortcut list it edits.

## What is not changed here

Attribution stays a top-bar button (a JustFig obligation) and Export… the
one primary button. The shortcut machinery (note 09), the guide's
Markdown pages and exported figures are untouched; no golden moved.
`design/logo/justfig-tool-icons.md` still records the undo and redo
glyphs as drawn, since it is the design export, not the app.

## Tests

- `src/ui/guide.test.ts` checks the top bar's Undo, Redo and Help against
  the guide, and the Fixed `help` row against the shortcuts table.
- e2e `polish.spec.ts`: the guide opens from `?` and from Help and shows
  the version; a shortcut moved on Change shortcuts works at once and after
  a reload; the top bar is one row at 1280×720 (measured 39.3px in
  Chromium and Firefox) with the 28px "?" at its right end.
- e2e `a11y.spec.ts`: axe on the guide and on its Change shortcuts page,
  and the focus trap and focus return through the Help button.
