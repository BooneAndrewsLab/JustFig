# 25 Several figures open at once (tabs)

Issue #49, after PlasmidPop's note 06 (read-only reference). A figure's panel often comes from
another figure ("the gel from Fig. 2 goes into the supplement"); until now that meant Recent
figures, copy, Recent figures again, paste. Now each open figure is a tab.

## Per tab and shared

`AppStore` keeps one `TabState` per open figure and the app's shared state beside them:

| Per tab (`TabState`)                                             | Shared                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| `history` (so undo, redo and coalescing are per figure)          | `tool`, `snap`, `units`, `plotSizing` |
| `pageId`, `selection`, `editingText`                             | `vision`, `showNotes`, `keyBindings`  |
| `activeNote`, `noteDraft` (review notes, note 24)                | `notice` (the status line)            |
| `downloaded` (the figure as last saved to or opened from a file) | the clipboard (`session.ts`)          |
| `view` (zoom and scroll), `fresh` (see below), `key`             | the open dialog (`App.tsx`)           |

`getState()` flattens the front tab's fields over the shared ones into the same `AppState` every
view always read, plus `tabs` (all of them, in strip order) and `front` (the front tab's key). So
the canvas, Inspector, Layers, Notes, export and versions code did not change: they read the front
tab. `set()` splits a patch into the two halves, so `setView`, `select`, `setPage`… land in the
front tab and `setTool`, `setUnits`… in the shared state.

A tab's **key** (`tab-1`, `tab-2`…) lives as long as the tab and keys the React tree; the figure's
`doc.id` can change under it when a fresh tab is taken over. No two tabs ever hold the same
`doc.id`: autosave writes one IndexedDB row per id (note 02), so two tabs on one id would
overwrite each other.

Methods act on the front tab, except `edit(e, { tab })` (renaming a figure from Recent figures
while it is open in a background tab) and the tab methods, which take a key: `activate`, `close`,
`move`, `open`, `tabOf(docId)`.

## Edits, bindings and undo

Every edit still goes through `store.edit`, which runs `reconcileBindings` and `reconcileNotes`
on the result (notes 06, 24) for the tab it applies to, and pushes onto that tab's history. Tabs
never share a history: undo in one tab cannot reach another, a gesture's coalesce key only merges
within its own tab. Switching tabs seals nothing; it does not need to, since the other tab's run
of edits is in its own history.

## Opening, new and taken-over tabs

- **New** (and the strip's **+**) opens an empty figure in a new tab. A tab made this way is
  `fresh`. While it is fresh and untouched (no undo or redo, never saved to a file), the next
  figure opened (Open…, Recent figures, Templates…) takes its place instead of adding a tab, and
  **New** on it does nothing. The first edit makes it an ordinary tab.
- **Opening a figure already open brings its tab forward** (`tabOf(doc.id)`). From Recent figures
  that is all. From a `.jfig` file the tab is brought forward and, if the file differs from what
  the tab holds, the file's content is applied to it as one named edit (`Open “file”`) and marked
  as saved to file: undo brings back what the tab had. Nothing open is ever silently replaced.
- Otherwise a new tab is added at the end of the strip and brought forward.
- **Closing** a tab (×, `Alt+W`, Delete on the focused tab) writes it to the browser first (below)
  and never asks: the figure stays in Recent figures, as **New** always left the old figure there.
  The neighbour to the right (else left) comes forward. Closing the last tab leaves one fresh
  empty tab, since every view needs a figure.

## Autosave and flush rules

The `Autosaver` watches every tab, not just the front one. On each store change it compares each
tab's present figure with what it last wrote for that `doc.id` (`saved` map) and queues the
changed ones (`pending` map, keyed by `doc.id`, each with its `downloaded` flag captured at that
moment). One timer writes them all a second after the last change; `flush()` writes them at once.
Because the queue is keyed by `doc.id`, not by tab, a figure whose tab is closed or taken over is
still written: **`flush()` is called before anything closes a tab or replaces a tab's figure**
(`closeTab`, `openRecent`, `openFile`, `openGallery`, `newFigure`), and synchronously takes the
pending writes before the store drops the figure. Hiding the page flushes everything.

Thumbnails are drawn per `doc.id` after a write, at most one round per `THUMB_INTERVAL`, each
from the figure last written for that id.

**Eviction** (note 02) never drops a figure that is open in a tab: `save(…, { keep })` passes the
open ids, which `evict` skips like the one just saved. Thirty open tabs could therefore overshoot
the cap; in practice nobody keeps that many open, and losing an open figure would be worse.

## Remembering the open tabs

`localStorage['justfig.tabs']` = `{ ids, front }`: the `doc.id`s of the open tabs in strip order
and the front one's, rewritten when they change. A reload loads each id from IndexedDB (within
the same 1.5 s budget as before) and reopens them in order, the remembered one in front. Ids
whose row is gone (a fresh tab, never written; a figure deleted elsewhere) are skipped; if none
is left, the most recently changed figure opens as before. The old `justfig.current` key is still
read when `justfig.tabs` is missing, so the first load after the upgrade opens the same figure.
Selections, notes being written and the text being edited are not remembered, as before.

## Copy and paste between tabs

The clipboard was already a fragment (note 05) carrying the `doc.assets` its objects use (icons,
images, imported SVG) plus procedural snapshots, held both in the system clipboard and in
`session.ts`'s internal one. That is shared app state, so a copy in one tab pastes in another
unchanged: `importFragment` → `cloneObjects` (fresh ids, bindings among the copies remapped,
bindings to objects not copied dropped) → `addObjects` with the fragment's assets, in the front
tab. Since the copied ids are not on the other tab's page, the paste is centred in its view rather
than offset from the originals. An icon pasted into another figure brings its licence meta with
its asset, so the attribution of the receiving figure is right.

## Tab strip

`ui/panels/TabStrip.tsx`, a row under the top bar.

- **Recent…** at its start opens the Recent figures dialog (JustFig has no start screen to be
  a tab; PlasmidPop's fixed Files tab becomes this button, outside the tablist, so the tablist
  holds only tabs).
- A `role="tablist"` (`aria-label="Open figures"`) of `role="tab"` elements, one per figure:
  the title, a dot when changed since last saved to a file (`aria-label` says "unsaved"), and
  a × close control that is mouse-only (`aria-hidden`, not focusable: interactive content inside
  a tab is not allowed) while the keyboard closes with Delete or `Alt+W`. The selected tab has
  `aria-controls` pointing at the canvas.
- Roving tabindex: only the front tab is in the Tab order. ←/→ move to the previous/next tab and
  bring it forward (automatic activation, cheap here), Home/End to the first/last.
- **+** after the tablist: New figure.
- **Drag to reorder**: HTML5 drag and drop with our own type `application/x-justfig-tab`, so the
  canvas's file and icon drops ignore it and it ignores theirs; the drop side is the half of the
  tab under the pointer (`move(key, index)`).

## Shortcuts

Through `KEY_ACTIONS` (note 09), group **Tabs**, all changeable: `Alt+1`…`Alt+9` show the first
to ninth tab, `Alt+W` closes the front tab (Ctrl+W is the browser's), `Alt+Shift+PageUp/PageDown`
move the front tab left/right (the browser's own tab-moving keys with our modifier).

## Per-tab view

`view` is per tab, so each tab comes back at its zoom and scroll. The canvas fits a page the first
time it is shown; that memory was a ref in `Canvas`, which a tab switch remounts (the canvas is
keyed by tab, so drags and measurements start afresh), so it moved to a module map from tab key
to the page last fitted. A tab coming forward is therefore not refitted.

## Not done here

Opening a `.jfig` by dropping several files at once opens only the first, as before. Dragging a
tab out to its own window is not possible in a single-page app.
