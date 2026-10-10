# 35 Arrange extras: copy and paste spacing, paste in place, swap

Issue #71. Three small actions for laying out panels. Each is a named edit
(`src/core/edits/edits.ts`) and one undo step; none moves a bound arrow
(note 06: `reconcileBindings` follows the targets after the edit).

## Copy and paste spacing

- **Measure:** `spacingBetween(a, b)` is the edge-to-edge gap, like
  `distributeObjects`, using what the objects draw (`drawnBoundsIn`, issue
  44). `x` runs from the left object's right edge to the right object's left
  edge, `y` from the upper object's bottom to the lower object's top. An
  overlap is a negative gap and is kept.
- **One copy records both axes.** The user picks the axis when pasting
  (**Paste spacing ↔** / **↕**), the same way Distribute has one button per
  axis. This avoids a "which axis?" question at copy time and lets one copy
  serve a row and a column.
- **Only exactly two objects can be copied from**; paste needs two or more.
- **Apply:** `spaceObjects(pageId, objs, axis, gap)` sorts by the start of
  each bounds on that axis, keeps the first where it is, and sets every next
  object `gap` after the end of the previous one. Locked objects are left
  where they are (their space is still counted). Paths and arrows translate
  their points through `translateObj`, as every move does.
- The copied gap lives in module state in `session.ts`, so it survives page
  changes and tab switches, and is lost on reload. It is not on the system
  clipboard. Pasting with nothing copied shows a notice.

## Paste in place

The fragment format already carries absolute object positions; the 10 pt
offset is added at paste time. `pasteText(text, offset, inPlace)` therefore
imports with offset 0 when `inPlace`, whether or not the objects came from
the current page, so it also works on another page and in another tab (the
text comes from the system clipboard, else the internal one). Normal paste
keeps its rule: next to the original when copied from this page, else the
middle of the view.

The key is the fixed `Ctrl+Shift+V` (`paste-in-place` in `KEY_ACTIONS`;
free, since the app used only `Ctrl+V`). The keydown does not stop the
browser: it only arms a one-second flag, and the `paste` event that follows
(which carries the clipboard text without a permission prompt) reads it. It
is fixed, not rebindable, because it depends on the browser firing `paste`
for that chord. Firefox does not, so after 150 ms without one the app's own
clipboard (the last copy made in this app, shared by all tabs) is pasted in
place instead. The edit's label is "Paste in place".

## Swap positions

`swapPositions(pageId, objs)` takes exactly two objects and moves each so its
bounds' top-left corner lands on the other's. Sizes are untouched. Locked
objects, or any count other than two, make it a no-op (no undo step).

## Where they live

The Inspector's selection section, under the Align row: **Copy spacing** and
**Swap positions** (exactly two selected), **Paste spacing ↔ / ↕** (two or
more). They are ordinary buttons, so reachable by Tab. Only paste in place
has a shortcut. The user guide (`05-arranging.md`,
`13-keyboard-shortcuts.md`) documents all of them.
