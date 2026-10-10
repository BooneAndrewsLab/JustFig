# 23 Saved versions

Named copies of the whole figure, kept beside it to compare or restore later: "sent to PI",
"before revision" (issue #10, idea 11 in `LANDSCAPE.md`, after HelixCanvas's snapshots). Undo is
per session and autosave keeps only the latest state; neither answers "what did the figure look
like when I sent it?".

**Naming.** The issue calls them snapshots, but `src/procedural/snapshot.ts` already means a
procedural object's fallback picture (`figureWithSnapshots`). To keep the two apart the feature is
**saved versions** everywhere, in code (`versions` table, `getVersionStore`, `restoreVersion`,
`src/ui/state/versions.ts`) and in the UI (**Versions…**, Saved versions dialog).

## What a version is

The open figure's `.jfig` text (`writeJfig`, as autosave writes it) with a name and a time. Being
the file format, it goes through the `.jfig` migrations when read back, so a version saved today
restores in a later release. Everything is copied, pictures included; no sharing of assets
between versions (simple, and the caps below bound it).

## Storage

Same database (`justfig`, Dexie). Schema v4 adds `versions: 'id, updatedAt, owner'`; the upgrade
keeps every figure and preset row (tested from a real v3 database). Rows are note 22's
`NamedStore` rows with one optional field more, `owner`: the `doc.id` of the figure they belong
to. `NamedStore` gained `add(…, { owner })`, `all(owner)` / `list(owner)` and an optional
`maxPerOwner` cap; presets do not use any of it.

- **Per figure.** A version belongs to one `doc.id`; the dialog lists only the open figure's.
  New and templates make a new id, so a new figure starts with none. Opening a `.jfig` whose
  `doc.id` is already kept opens the same document, with its versions.
- **Caps, refused, not evicted** (consistent with note 22: a deliberate save is never silently
  dropped): `VERSION_CAPS` = 30 per figure, 200 in all, ~60 M characters in all. A save past any
  of them fails with `StoreFullError`'s message and the user deletes some.
- **Eviction of figures (note 02) skips any figure with saved versions.** A version is kept on
  purpose; losing it because thirty other figures were touched since would defeat the feature.
  The figure row is needed too: the dialog is reached by opening the figure. The cost is that the
  figures' own caps can be overshot by figures with versions, at most one row per owner and so
  bounded by the 200-version cap. Saving a version also writes the figure row if autosave never
  has (an untouched new figure), so a version always has its figure.
- **Deleting a figure** in Recent figures deletes its versions in the same transaction; the
  confirmation says so.

## Not in the `.jfig` file

Versions are local, like Recent figures. Putting them in the file would make every saved file
carry every earlier state (pictures included, many times over), change the format for something
most files would never use, and send drafts along with a figure emailed to a co-author. A user who
wants a version as a file restores it and saves, or saves the file at that moment. No schema bump.

## Restore

`restoreVersion(name, saved)` (`src/core/edits/version.ts`) is a named edit: it replaces the
pages, settings and assets with the version's, keeps the open figure's `doc.id`, and is one undo
step ("Undo Restore version “sent to PI”"). Before it runs the autosaver is flushed, so the
browser's copy holds what is being replaced even if the tab dies before the restore is saved.
The figure is not reloaded (`store.load` would drop the undo history). The confirmation is an
in-app dialog ("Restore this version?") whose first focused button is Cancel, so Enter alone
never replaces the figure.

## Compare

The Compare versions dialog (`CompareView.tsx`, issue #80) takes two sources, **Older** and **Newer**,
each a saved version or the open figure (Now; default: the clicked version against Now), and a
mode: **side by side** or **onion skin** (the older page at 50% opacity, without its background, over
the newer; screen only, nothing is exported). Both draw pages with `PageView`, the canvas's own
`objectToNode` → `SvgNode` → React path, so a picture is not drawn by any second renderer.

**Diff.** `diffDocuments(older, newer)` (`src/core/model/diff.ts`) pairs pages and objects by id and
returns per page the `added` (newer only), `removed` (older only) and `changed` ids. Changed is
structural inequality of the object's JSON (`jsonEqual`, nothing ignored; an `undefined` field equals
a missing one). One decision: a group or panel is compared by its own fields and its children's ids,
not their content, so one edited child is reported once rather than with every container above it
(a reordered or re-parented child still flags the container). A page only one figure has appears with
`inA`/`inB` false on the missing side; its objects are all added or all removed.

**On screen.** Changed, added and removed objects are outlined (`objBounds` in page points; orange,
green, dashed red) on the side(s) that have them, and listed by name under the pictures, so colour is
not the only cue. Everything is a native control: the two selects, the mode radios, the page buttons,
the list's buttons (pressing one thickens its outline). Pages are paired by id, not index (this
replaced the first version's index pairing).

**Restore one object.** `restoreObject(pageId, obj, from, versionName)` (`src/core/edits/restoreObject.ts`)
is a named edit and one undo step. It keeps the object's **id** (not `cloneObjects`, which would mint a
new one and orphan arrows bound to it), replaces the object with that id in place, or, when it was
deleted, adds it back to its old parent if that still exists, else its old layer, else the first
unlocked layer. Descendants of a restored container are removed from wherever else they now sit, so
no id appears twice. The assets the object draws (`objectAssets`) are copied from the version into the
figure (content-addressed hashes, as `addObjects` merges them). `store.edit` then runs
`reconcileBindings` as for any edit. Offered for an object the saved (not Now) side holds, when the
open figure still has that page. An object added since cannot be "restored"; delete it as usual.

## UI, keyboard, analytics

**Versions…** in the top bar opens Saved versions: a name field (starts as "Version of
<date>") with Save version, then the list (name, time; Compare, Restore…, Rename inline as in
Recent figures, Delete with an in-app "Delete this version?"). Every control is a button or field
reachable by Tab; all dialogs use `Dialog`. Analytics: `version` → `save`, `restore`, `compare`;
never a name.

## Not done here

- No thumbnail per version in the list (Compare renders on demand).
- Versions are per browser; they do not travel with the file or between computers.
- Review notes (#9) are a separate feature: they live in the `.jfig` document (note 24), so a
  version keeps the notes of its moment and restoring it brings them back.
