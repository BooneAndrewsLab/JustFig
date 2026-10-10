# 02 Document format (`.jfig`)

A figure is saved as one plain JSON file. The file is self-contained: every icon, image and
imported SVG it uses is embedded, content-addressed, so the figure stays valid if the icon
library changes or disappears. The codec (`src/io/jfig.ts`) is modelled on BarelySig's `bsig.ts`:
hand-written decoders that report the path of the first bad field, a fixed field order on write
(so the same figure gives byte-identical files), and a typed `JfigError` whose message is for the
user.

## Units and coordinates

- Internal units are **points** (1/72 in). The UI shows mm or inches (`core/units.ts`).
- Page coordinates start at the page's top-left, with y pointing down.
- Every object has a `Frame { x, y, w, h, rotation, flipX?, flipY? }`. `x, y` is the top-left of
  the unrotated box. The object is drawn in frame-local space (0..w, 0..h), flipped about the
  frame centre, then rotated by `rotation` degrees (clockwise on screen) about the frame centre.
  The SVG transform is `translate(cx cy) rotate(r) scale(±1 ±1) translate(-w/2 -h/2)`.
- **Group and panel children are stored in page coordinates**, not relative to their parent. A
  group's frame is the bounding box of its children and always has `rotation: 0`: rotating or
  flipping a group applies the rotation or flip to each child (moving each child's centre and
  adding to its own rotation), which is exact. Scaling a group scales each child's centre and
  size. That is exact for unrotated children and for uniform scaling. A non-uniform scale of a
  rotated child is approximated by scaling its own w and h. A panel has its own frame (its
  border); moving a panel moves its children.
- **Path and arrow nodes are frame-local**, and resizing **bakes the scale into the nodes**, so
  stroke widths never scale by accident and `vector-effect` is never needed. Icons and images
  scale by transform, because their strokes are meant to scale.

## Types (`src/core/model/types.ts`)

```ts
interface JfigFile { format: 'justfig'; schemaVersion: number; app: { name; version };
                     document: Doc; assets: Record<AssetHash, Asset> }
interface Doc   { id; title; palette: Swatch[]; textStyles: TextStyle[];
                  panelLabelStyle: PanelLabelStyle; pages: Page[]; creditFooter: boolean;
                  notes: Note[] }                                     // notes: note 24 (schema 2)
Note  { id; page; at: Vec2; object?; text; author; time; resolved?; replies: { id; text; author; time }[] }
interface Page  { id; name; size: { w; h; preset? }; background: Paint | null; layers: Layer[] }
interface Layer { id; name; visible; locked; children: Obj[] }        // bottom -> top

type Obj = Rect | Ellipse | PathObj | Arrow | Text | Icon | Image | Procedural | Group | Panel | Embedded
Base { id; name?; frame; opacity; locked?; hidden? }
Rect   { type: 'rect'; rx; style }          Ellipse { type: 'ellipse'; style }
PathObj{ type: 'path'; nodes: PathNode[]; closed; style }
Arrow  { type: 'arrow'; nodes; start: Head; end: Head; style; bind? }  // bind: note 06
Text   { type: 'text'; runs: Run[][]; align: 'left'|'center'|'right'; lineHeight; autoWidth; styleRef? }
Run    { text; font: 'arimo'|'tinos'|'cousine'; size; bold?; italic?; script?: 'sub'|'sup'; color: Paint }
Icon   { type: 'icon'; asset; slots: Record<SlotId, Paint>; lockAspect: true }
Image  { type: 'image'; asset; crop? }      // asset is an 'image' or an 'svgImport'
Procedural { type: 'procedural'; kind; kindVersion; params; path?; slots; snapshot? }
Group  { type: 'group'; children }
Panel  { type: 'panel'; label: string; autoLabel: boolean; showLabel; showBorder; children }
Embedded { type: 'embedded'; source: { app; format; payload }; snapshot }

PathNode = { x; y; in?: Vec2; out?: Vec2 }  // cubic handles, frame-local; absent = corner
Head  = { kind: 'none'|'triangle'|'open'|'stealth'|'bar'|'circle'|'diamond'; size }
Paint = { hex } | { swatch }
ShapeStyle = { fill: Paint|null; stroke: Paint|null; strokeWidth; dash?; cap; join }
Asset = { kind: 'icon'; svg; slots: SlotDef[]; recolor: 'slots'|'whole'; meta: IconMeta }
      | { kind: 'image'; mime; dataBase64; meta: UserAssetMeta }
      | { kind: 'svgImport'; svg; meta: UserAssetMeta }
```

Notes on specific fields:

- **Arrowhead `size`** is a multiple of the stroke width, so a thicker line gets a
  proportionally larger head (head length = `size × strokeWidth`, with a 3 pt floor). The path is
  shortened under heads that would otherwise show the line's end (triangle, stealth, diamond,
  circle). The `bar` head is the inhibition T-bar.
- **Text frames**: `x, y` is the top-left of the text box. With `autoWidth`, `w` follows the
  longest line. `h` always follows the layout. The edit that changes text recomputes both through
  the text layout module, so a stored frame is always the laid-out one.
- **Sub/superscript** runs are drawn at 65% size with a baseline shift of −0.35 em (sup) or
  +0.15 em (sub) of the parent size. Both are computed by us, never by `baseline-shift`.
- **Icon `slots`** stores only overrides. Defaults come from the asset's `SlotDef`s. An icon asset
  with `recolor: 'whole'` has one slot, `all`, that tints the entire icon.
- **Panels** are written as `label` plus `autoLabel`, not the plan's `label: string | 'auto'`,
  so that a hand-written label of "auto" is not mistaken for the flag. An `autoLabel` panel
  shows the letter from reading order. Objects drawn, dropped or moved so that their centre lands
  on a panel become its children, and leave it when moved off. Panels never nest.
- **`creditFooter`** (default `true`, as the user decided) is the figure's default for the
  export credit line. Both the Attribution dialog and the Export dialog change it.
- **Paint `swatch`** refers to `doc.palette`. A swatch that no longer exists renders as black, and
  validation reports it.
- **Asset hashes** are `h` plus 26 hex digits: two 53-bit cyrb53 hashes (seeds 0 and 1) of the
  asset's canonical JSON, taken when the asset is created. A user credit added later to an
  imported image changes the asset in place under the same key. That is synchronous (unlike `crypto.subtle`) and collision-safe at the
  scale of one figure. Placing the same icon twice stores one asset. Unused assets are dropped on
  save.
- **Attribution is derived**, never stored: `core/attribution` reads the `meta` of every asset
  in use.
- **Procedural** objects are drawn by their kind (note 04). `params` is stored as the JSON it
  was given and decoded at render time, so it is kept losslessly. A kind this version does not
  know, or a newer `kindVersion`, renders from `snapshot` (an `svgImport` asset written on save
  and copy) or as a dashed placeholder box, and is never dropped. A path-following kind keeps its
  path in `path` (frame-local, like path nodes) and resizing bakes the scale into it. **Embedded**
  objects render from their snapshot.

## Versioning and migrations

As in `bsig.ts`: `MIGRATIONS[i]` turns schema `i + 1` into `i + 2`, `SCHEMA_VERSION =
MIGRATIONS.length + 1`, and `migrate()` runs on open. A file from a newer app is refused with a
message saying so and suggesting a reload. Each procedural kind carries `kindVersion` and its
own `migrate` (note 04), so kinds evolve without a schema bump. Every schema bump ships a frozen fixture in `src/io/fixtures/` plus a round-trip
test. Schema 1 is frozen as `src/io/fixtures/v1.jfig`. Schema 2 adds `Doc.notes`, review notes
(note 24); its migration gives a schema 1 document `notes: []` and leaves fragments and presets
files (no document, objects unchanged) as they were. Frozen as `src/io/fixtures/v2.jfig`.

## Fragments (clipboard and sibling interchange)

`{ format: 'justfig-fragment', schemaVersion, objects: Obj[], assets }` holds the selected
objects with only the assets they use. Copy writes it to the clipboard as JSON text, with an
`image/svg+xml` rendering where the browser allows. Paste reads it and gives every object fresh
ids; objects copied from this figure land 10 pt from the originals, objects from elsewhere in the
middle of the view. A fragment file opened with Open… is added to the page the same way. Sibling
apps emit fragments: PlasmidPop a `procedural` `plasmidMap`; BarelySig graphs arrive as an
`embedded` object from its SVG exports (and the frozen fragment form of one). The contract is
note 05. Arrow bindings (note 06) follow their targets into the copy, or are dropped when the
target is not copied.

## Storage

Autosave writes the `.jfig` text itself to IndexedDB (Dexie, database `justfig`, table
`figures`), a second after the last change and at once when the page is hidden. That is the
BarelySig pattern, so what is stored is always the file format with its migrations. Saving
downloads the file. No file handle is ever kept.

### Recent figures

Each document is its own row, keyed by `doc.id` (this was already the case in schema v1: the
"single autosave" was only the most recently changed row, restored at start-up). Schema v2 adds
an optional, unindexed `thumb`; its upgrade keeps every v1 row, so an existing autosave
becomes one entry of the list (tested). Writes keep the row's thumbnail until a new one replaces it.

- **Limits:** the 30 most recently changed figures and about 150 M characters of stored text plus
  thumbnails in total (`MAX_FIGURES`, `MAX_TOTAL_CHARS`). After every save the oldest rows past either
  cap are evicted; the figure just saved never is.
- **Thumbnail:** the first page through the normal raster pipeline (`renderCanvas`) at ~160 px
  wide, stored as a JPEG data URL (a few kB). It is drawn after the save, at most once per 15 s
  (`THUMB_INTERVAL`), with a trailing draw so a quiet figure ends up current. Where drawing
  fails the list shows a blank placeholder.
- **Switching:** New, Templates and Open first `flush()` the autosaver, so replacing the figure
  loses nothing; the old "not saved to a file" confirm boxes are gone. The last open id is kept
  in `localStorage` so a reload restores the figure last opened, not just the last changed.
- **Rename** rewrites the row's title and the `.jfig` text and keeps the modified time.
  **Delete** is confirmed in an in-app dialog and is not offered for the open figure.

### Durable storage and failed saves

After the first write that works, the app calls `navigator.storage.persist()` once
(`requestPersistence`, guarded where the API is missing or throws), so the browser is less likely
to evict the database under pressure. Recent figures shows `navigator.storage.estimate()` usage and
quota, and whether storage is persistent (`storageUsage`).

A write that throws (a `QuotaExceededError` from IndexedDB, or a `StoreFullError`) is never a passing
notice. `Autosaver` keeps a set of figure ids whose last write failed, reports it through its
`hooks.unsaved` callback into `store.unsaved`, and puts the figure back in its queue to retry every
`RETRY_DELAY` (10 s) unless a newer change has queued it. A figure whose tab closes drops out of the set.
The `SaveFailureBanner` (a persistent `role="alert"` above the tab strip, keyboard reachable) names the
front figure first, then the others, with **Download a copy** per figure for up to three and a count
beyond; it clears when each figure's write later succeeds. Tested with a storage that throws, and
in `e2e/save-failure.spec.ts`.

### Presets

Schema v3 of the database adds a `presets` table for saved selections (note 22). Presets are
capped too but never evicted: a save past the cap is refused, since the user kept them on purpose.

### Saved versions

Schema v4 adds a `versions` table (note 23): named copies of a figure's `.jfig` text, keyed to
their figure by an indexed `owner` (its `doc.id`). Refused past their caps like presets. Eviction
above skips any figure that has saved versions, and deleting a figure deletes its versions.

### Save in place

Schema v5 adds a `handles` table (note 38): the file handle a figure saves to, one row per
`doc.id`, deleted with the figure. Handles never enter the `.jfig` or the document model.
