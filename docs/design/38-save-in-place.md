# 38 Save in place

Issue #81: Save downloaded a fresh file every time, leaving `figure (3).jfig`
trails. Where the File System Access API exists (Chromium), Save now writes
back to one file.

## Behaviour

- Feature detection only: `showSaveFilePicker` present means save in place
  (`canSaveInPlace`); `showOpenFilePicker` present means Open… uses the picker.
  Elsewhere Save is the download of old and the input stays the Open fallback
  (and drag-and-drop, which does not keep a handle).
- **Save** (Ctrl/Cmd+S): flush the autosaver (note 02), then write to the kept
  handle. No handle, or permission refused, or the handle is gone
  (`NotFoundError`, and the other "lost" errors in `isHandleLost`): the Save as picker.
- **Save as…** (Ctrl/Cmd+Shift+S, top-bar button where supported) always asks, and
  replaces the kept handle.
- **Open…** keeps the picked handle for the opened figure's `doc.id`, so open, edit,
  Save writes the same file. Two files with one `doc.id` (a copy) share one handle:
  the last opened or saved wins.
- A cancelled picker (`AbortError`) is silent; any other error is an in-app notice.
- After a successful write the tab is marked clean (`markDownloaded`), but only if
  the figure did not change during the write.
- The file name shows in the window title and the Save button's tooltip.

## Storage

`handles` table (Dexie v5, `id` = `doc.id`): `{ id, handle, name, updatedAt }`;
handles are structured-cloneable in Chromium. Never in the `.jfig`. Removed with
the figure (`FigureStorage.remove`). After a reload `queryPermission` and, if
needed, `requestPermission` with `{ mode: 'readwrite' }` run inside the Save click.

## Code

`src/io/fileHandles.ts` takes an injectable `FsHost` (the `window`); unit tests stub
pickers, permissions and errors (`fileHandles.test.ts`). The orchestration is
`saveFile`/`saveFileAs`/`chooseFile` in `src/ui/state/session.ts`. Analytics:
`file/save-in-place`, `file/save-as`.

## Not covered

Playwright cannot grant File System Access, so e2e covers the fallback only; the real
picker, permission prompt and handle persistence are checked by hand in Chrome.
