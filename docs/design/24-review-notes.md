# 24 Review notes

Comments on a figure, pinned to a point on a page or to an object, kept in the `.jfig` file and
never exported (issue #9, idea 11 in `LANDSCAPE.md`, after HelixCanvas). A PI and a student pass
the file back and forth: "make this label bigger", "done", resolved.

## Data (`Doc.notes`, schema 2)

```ts
interface NoteReply {
  id;
  text: string;
  author: string;
  time: number;
} // ms since 1970
interface Note extends NoteReply {
  page: Id; // every note is on a page
  at: Vec2; // marker position, page points
  object?: Id; // pinned object; the marker follows it
  resolved?: true;
  replies: NoteReply[];
}
```

- **On the document, not the page.** One list in the order notes were added, so a note's number
  (marker and list) is stable and the panel lists the whole figure. Each note names its page.
  Kept off `Page` so that nothing that copies pages or objects can carry a note by accident.
- **Author** is a name typed once in the Notes panel and remembered per browser (`localStorage`),
  `''` when none; there are no accounts. **Time** is when it was written; edits do not stamp it
  (kept minimal). Both come from the UI (`createNote(…, Date.now())`) so edits stay pure.
- **Resolved** is a flag, so a resolved note stays readable; **replies** are one level, append
  only, each deletable. Editing applies to the note's own text. No figure-level notes without a
  page: a general remark goes on a point of page 1, which keeps the model one shape.
- Ids use the `n_` prefix. Limits for untrusted files (`NOTE_LIMITS`): 10 000 characters of text,
  100 of author, 2 000 notes, 200 replies per note; the decoder refuses beyond them. A note's page
  must exist (refused with the field's path otherwise); its `object` is not checked, as a stale
  one simply falls back to `at`.

## Pinned to an object

`reconcileNotes` runs in `store.edit` after every edit, next to `reconcileBindings` (note 06):

- a note whose object is on its page has `at` set to the object's anchor, the top-right corner of
  its bounds (`noteAnchor`), so it follows moves, resizes and nesting into groups;
- a note whose object is gone **becomes a point note where the object was** (`object` dropped,
  `at` kept). Losing a reviewer's comment because its object was deleted is worse than a
  stray marker; Undo of the delete restores the earlier state, pin included;
- a note whose page is gone is removed with the page, in the same undo step.

It returns the figure itself when nothing changes, so a no-op edit stays a no-op. Edits never
move notes themselves. `at` is kept current because it is what is left when the object goes.

## Edits (`src/core/edits/notes.ts`)

`addNote`, `editNote`, `setNoteResolved` ("Resolve note" / "Reopen note"), `replyToNote`,
`deleteNoteReply`, `deleteNote`: each one named undo step. Empty text is refused
(`EditError`). Deleting needs no confirmation: it is one Undo away.

## Never exported, never copied

Notes are not objects, so `objectToNode` never sees one: SVG, PDF, PNG, TIFF and panel exports,
fragments (clipboard), presets (`cloneObjects` of objects) and template source (page objects) are
unchanged, and the golden SVGs did not change. A unit test exports a page with and without a note
and compares the bytes. Duplicating or pasting an object leaves the note on the original; a
duplicated page (copies of objects) gets none. Saved versions (note 23) store the whole document,
so a version keeps its notes and restoring one brings them back; that is wanted. The canvas
markers are drawn in the editor's screen overlay (`NoteMarkers.tsx`), outside the page group, like
the selection handles.

## Schema bump

`.jfig` schema 2. Notes are a required field (`notes: []`), so a schema 1 app refuses a file
with notes ("saved by a newer version") instead of opening it and silently dropping them on the
next save. `MIGRATIONS[0]` adds `notes: []` to a document; fragments and presets files share the
schema number but their objects did not change, so the step passes them through and sibling
fragments at schema 1 still paste. Frozen fixture `src/io/fixtures/v2.jfig` (a resolved object
note with a reply, and a point note whose text has `<`, `&` and a newline).

## UI

- **Review note tool** (`N`, `tool-note` in `KEY_ACTIONS`): click an object to pin to it (the
  top-level object hit, as selection picks), else the point. This opens a draft in the panel; the
  note is added only when it has text, so cancelling leaves no undo step.
- **Notes panel** (right column, under Layers): "+ Note" (on the selected object, else the page
  centre: the keyboard path), **Show notes on the canvas** (per browser; hidden markers are still
  listed), **Your name**, then the list: number and first line, grouped by page; ↑/↓ move between
  notes; opening one shows its page, selects its object, and offers Edit, Resolve/Reopen, Delete,
  replies and a Reply box. Text renders as React text with `white-space: pre-wrap`, never markup.
- **Markers**: orange numbered bubbles with the tail on the anchor; resolved ones pale; the open
  one outlined. Clicking one opens it in the panel. They are pointer conveniences; every action is
  in the panel.
- Analytics: `tool` → `note`; `note` → `add`, `reply`, `resolve`, `delete`, `hide`. Never text
  or names.

## Not done here

- Dragging a point note's marker to move it (delete and re-add instead).
- Mentions, notifications, or merging two people's copies of a file: the file is passed back and
  forth, one editor at a time.
