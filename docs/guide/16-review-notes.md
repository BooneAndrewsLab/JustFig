# Review notes

Review notes are comments on a figure, for passing a figure file back and forth: a PI writes "make this label bigger" on the label, the student answers, fixes it and marks it resolved. Notes are saved in the `.jfig` file, so whoever opens the file sees them. They are never part of what you export: SVG, PDF, PNG and TIFF files, copies, presets and template sources never contain a note.

## Adding a note

Pick the **Review note** tool (key N) and click:

- **an object**, to pin the note to it. Its marker sits at the object's top-right corner and moves with it. If the object is later deleted, the note stays where the object was.
- **an empty spot** on the page, to pin the note to that point.

The Notes panel, at the bottom on the right, then shows a text box. Type the note and choose **Add note** (or press Ctrl+Enter); **Cancel** (or Escape) drops it. **+ Note** in the panel does the same without the pointer: the note goes on the selected object, or in the middle of the page when nothing is selected.

Type **Your name** in the panel once and every note and reply you write is signed with it. The name is remembered in this browser. Each note also records when it was written.

## Reading, answering and resolving

Each note has an orange numbered marker on the canvas, and the same number in the Notes panel's list (grouped by page when the figure has several). Click a marker, or a note in the list, to open it: the panel shows the whole note, who wrote it and when, what it is pinned to, and its replies. Choosing a note on another page shows that page.

- **Edit** changes the text. **Reply** adds an answer under it; each reply has its own **Delete**.
- **Resolve** marks the note done: its marker turns pale and the list strikes it through. **Reopen** undoes that.
- **Delete** removes the note and its replies.

Every one of these is a single step that **Undo** reverses. Deleting a page deletes its notes with it (Undo brings both back). Duplicated, copied and pasted objects do not take notes with them.

## Hiding notes

Untick **Show notes on the canvas** in the Notes panel to hide the markers while you work. The notes are still in the figure and the panel still lists them. Adding a note turns the markers back on.

## Notes and other features

Notes are text only: whatever a note says, it is shown as plain text. A saved version (see [Getting started](01-getting-started.md)) keeps the notes of that moment. A file with notes needs this version of JustFig or newer to open; an older one asks to be updated.
