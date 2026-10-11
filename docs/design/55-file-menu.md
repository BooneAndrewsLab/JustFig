# 55 File menu: the top bar's file actions behind one button

2026-10-11. Asked for after the hovered Export… button turned unreadable in
light mode (fixed in `56bb94a`: `button:hover:not(:disabled)` outranked
`button.primary`, so the label went white on `--ground`). The top bar was
also full: eleven text buttons before the zoom (note 51 kept it to one row
at 1280px only by tightening padding).

## What

- **File ▾** (`src/ui/FileMenu.tsx`) at the start of the top bar holds New,
  Templates…, Open…, Import… | Save, Save as… (only where files can be
  written in place), Versions… | Export…, Attribution…. Items show their
  current key binding at the right (`formatBinding`); the binding is
  `aria-hidden`, so an item's accessible name is its words alone.
- **Still buttons in the bar:** Save, beside the menu, because autosave only
  keeps the figure in the browser and saving to a file is the habit to
  encourage; Export… as the one primary button at the right, the action the
  app exists for. Both are in the menu as well. Attribution is now
  "Attribution…" (it opens a dialog) and lives only in the menu; the
  Export dialog and the Inspector's credit line still lead to it.
- **Keyboard** (`src/ui/useMenu.ts`, PlasmidPop's `useMenu` plus the
  WAI-ARIA menu button keys): Enter, Space or ArrowDown on File opens on
  the first item, ArrowUp on the last; the arrows wrap, Home and End jump;
  Enter runs an item and closes the menu; Escape closes it and puts focus
  back on File; Tab or a click outside closes it. Items are `tabIndex={-1}`
  so Tab leaves the menu instead of walking it. Keys the menu handles stop
  propagating, so the window shortcuts (arrows nudge the selection, Escape
  deselects) never see them.
- **Styles:** `.menu`, `.menu__list`, `.menu__item`, `.menu__separator` and
  `.menu__shortcut` join the family base sheet (note 54 left room for them)
  under PlasmidPop's names. The base sets no left or right on the list; this
  app's `theme.css` anchors the File menu's list to the left.
  `design/theme-base/README.md` says how the rules meet PlasmidPop's and
  BarelySig's own menus.

## Why

`DESIGN.md` §5 said "no menubar": JustFig's commands live in the
inspector and tool palette. That still holds. This is one menu for the
file-level actions, which are used a few times a session and which people
look for under "File" in every other editor. PlasmidPop already groups the
same actions the same way, so the family now agrees.

## Tests

- `e2e/file-menu.spec.ts`: the keyboard path, axe on the open menu, a click
  outside closing it, and a hovered primary button keeping its accent.
- `e2e/helpers.ts` `fileMenu(page, item)`: the specs that used the old
  buttons go through it.
- `src/ui/guide.test.ts` reads `FileMenu.tsx` with `App.tsx` and wants File,
  Save as… and Attribution… documented.
