# 22 Presets

A preset is a named selection the user keeps to place again in any figure (issue #7, idea 10 in
`LANDSCAPE.md`). **Save as preset…** in the Inspector's selection section names it; the gallery's
third tab, **My presets**, places, renames, exports and deletes presets and imports shared ones.

## What a preset is

A fragment (note 02, "Fragments") with a name: the selected objects and only the assets they use,
icons with their licence meta included, so attribution (derived, never stored) and the
"modified" rule keep working wherever it is placed. Built by the same `selectionFragment` as
Copy, so procedural objects carry snapshots. Two differences from a copy:

- **Swatch links are baked** to plain hex (`bakedSwatches` in `src/palette/recolor.ts`). A
  `{swatch}` paint names a swatch of the source figure's palette; in another figure it would
  resolve to black. Procedural hex params were never linked (note 07), so nothing else changes.
- Arrow bindings are kept as they are; placing goes through `cloneObjects`, which remaps a
  binding to the copy of its target or drops it when the target was not in the preset (note 06).

**Placing** is `importFragment(…, { at: viewCenter() }, 'Place <name>')`: fresh ids from
`cloneObjects`, centred in the view, assets merged into `doc.assets` by `addObjects`, one undo
step. It does not replace the figure, so no `flush()` is needed (unlike gallery entries, note 08).

## Storage

Same database as the figures (`justfig`, Dexie). Schema v3 adds a `presets` table
(`id, updatedAt`), keeps every figure row (tested). A row is `{ id: 'k_…', name, text,
updatedAt }`, where `text` is the fragment JSON, so a stored preset carries its schema version and
goes through the fragment migrations like everything else that is stored.

The table is driven by `NamedStore` (`src/io/storage.ts`), written for any row the user names
and keeps on purpose: add (all or none), list newest first, get, rename, remove. Named snapshots
(#10) and review notes (#9) are meant to get their own table with the same class; it knows nothing
about fragments.

**Caps, but no eviction.** Note 02's rule (oldest evicted, never the one just saved) suits
autosave: those rows are a by-product of working. A preset was saved deliberately, and silently
dropping the oldest would lose work nobody asked to lose. So presets keep note 02's idea of a
fixed budget (`PRESET_CAPS`: 100 presets, ~30 M characters, on top of the figures' 150 M) but a
save or import past it is refused with a message (`StoreFullError`), and the user deletes what
they no longer need. Delete is asked in an in-app dialog (Delete this preset?), never
`window.confirm`.

## The presets file

For sharing across a lab: **Export** (one preset) or **Export all presets** downloads a
`.jfigpresets` file (JSON):

```json
{ "format": "justfig-presets", "schemaVersion": 1, "app": {…},
  "presets": [{ "name": "…", "objects": [ … ] }], "assets": { "<hash>": … } }
```

One asset table for the whole file (an icon used by five presets is written once), canonical key
order and only used assets, so the same presets give the same bytes. `format` is permanent, like
`justfig` and `justfig-fragment`. Migrations run on the whole file via `migrate`, as for fragments:
a future migration that rewrites objects must handle `presets[].objects` where a fragment has
`objects`. Schema 1 is frozen as `src/io/fixtures/v1.jfigpresets`.

**Import treats the file as untrusted** (`readPresetsFile`, hand-decoded like `.jfig`):

- size checked before reading (`MAX_PRESETS_FILE_CHARS`, 60 M) and again on the text;
- not JSON, wrong `format`, a newer schema, no presets or more than the cap: refused;
- every object through the `.jfig` `object` decoder, every asset through `asset`;
- every asset's key must equal `hashAsset` of its content. Assets are content-addressed and
  merged into `doc.assets` by key, so without this a file could replace an asset the open figure
  already uses (another icon, or other licence meta under the same hash);
- every asset an object refers to must be present; unused ones are dropped;
- names: whitespace collapsed, cut to 80 characters, empty becomes "Untitled preset". They are
  shown as React text only.

Import is all or nothing (one transaction); a preset already kept with the same name and the same
stored text is skipped, so importing a file twice does not duplicate it. Stored rows are read back
through the same checks (`readPresetText`); a row this version cannot read is left out of the list,
as with Recent figures.

## UI and keyboard

The gallery dialog keeps its title; My presets is a third tab. A preset card is a button (place),
followed by Rename, Export and Delete buttons labelled with the preset's name; Import presets… and
Export all presets sit with Cancel. Rename is an inline field (Enter saves, Escape cancels), as in
Recent figures. The thumbnail is the preset exported through `exportSvg` on a page its own size.
Analytics: `preset` → `save`, `place`, `export`, `import`; never a name.

## Not done here

- Presets are per browser; there is no lab-wide shared library beyond passing the file around.
- A preset cannot be updated in place from a new selection; save a new one and delete the old.
- Save as a `GalleryEntry` source (#17) can start from the same fragment.
