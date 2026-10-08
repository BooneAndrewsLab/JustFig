# 05 Fragment format (the sibling-app contract)

A fragment is how objects travel into this app from the clipboard, from a file, or from a sibling
app (PlasmidPop now, BarelySig in Phase 4). It is the contract those apps write to; the frozen
example is `src/io/fixtures/plasmidpop-pbr322.fragment.json`, the real output of PlasmidPop's
writer for its pBR322 example.

```json
{
  "format": "justfig-fragment",
  "schemaVersion": 1,
  "objects": [/* Obj, exactly as in a .jfig page (note 02) */],
  "assets": {/* AssetHash → Asset, only those the objects use */}
}
```

- `format` is the permanent id `justfig-fragment`. `schemaVersion` is the document schema the
  objects follow (note 02); a fragment from a newer schema is refused with a message, an older one
  is migrated.
- Objects are decoded by the same strict decoders as a `.jfig` file, so a malformed object refuses
  the paste with the path of the bad field. A procedural object's `params` are then decoded
  leniently by its kind (note 04): wrong or missing values fall back to defaults rather than
  failing.
- Ids only need to be unique strings: every pasted object gets fresh ids. Objects whose ids are
  already on the page land 10 pt from the originals; anything else is centred in the view.
- How it arrives: as clipboard text (`text/plain`, the JSON), or as a file opened with Open…
  (any `.jfig` whose `format` is `justfig-fragment` is added to the page, not opened as a
  figure).

## PlasmidPop: `procedural` / `plasmidMap` (kind version 1)

PlasmidPop's File menu → "Copy map for …" writes one object:

```json
{
  "id": "o_30ea4171d1b9bba3",
  "type": "procedural",
  "name": "SYNPBR322",
  "frame": { "x": 0, "y": 0, "w": 320, "h": 320, "rotation": 0 },
  "opacity": 1,
  "kind": "plasmidMap",
  "kindVersion": 1,
  "slots": {},
  "params": {
    "name": "SYNPBR322",
    "length": 4361,
    "topology": "circular",
    "features": [
      {
        "name": "bla",
        "start": 3293,
        "end": 4153,
        "strand": -1,
        "type": "gene",
        "color": "#7fb069"
      }
    ],
    "showName": true,
    "showLength": true,
    "showTicks": true,
    "showLabels": true
  }
}
```

| Param                                               | Meaning                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                              | Sequence name, ≤ 200 characters                                                                                                   |
| `length`                                            | Sequence length in bp, 1 … 100,000,000                                                                                            |
| `topology`                                          | `circular` or `linear` (a linear sequence draws as a bar map; frame 480 × 160)                                                    |
| `features[]`                                        | ≤ 500, in sequence order                                                                                                          |
| `.name`                                             | The label PlasmidPop shows (≤ 80 characters)                                                                                      |
| `.start`, `.end`                                    | **1-based, inclusive** (GenBank). Across the origin of a circular sequence `start > end`. A joined feature gives its overall span |
| `.strand`                                           | `1`, `-1` or `0` (none)                                                                                                           |
| `.type`                                             | GenBank feature key (`CDS`, `promoter`, `rep_origin`, …), ≤ 40 characters                                                         |
| `.color`                                            | `#rrggbb` as PlasmidPop draws it; omitted or `""` means "pick by type"                                                            |
| `showName`, `showLength`, `showTicks`, `showLabels` | Display toggles                                                                                                                   |

`ring` (feature width) and `labelSize` are this app's own params; PlasmidPop leaves them out and
gets the defaults. Anything else in `params` is ignored. PlasmidPop converts its 0-based half-open
ranges (a wrap has `end > length`) to this form and skips `source` and site-only features.

## BarelySig (Phase 4)

An `embedded` object: `source: { app: 'BarelySig', format, payload }` with the recipe from its
`src/io/recipe.ts` as the payload, and `snapshot` the hash of an `svgImport` asset holding its
`sceneToSvg` output, included in `assets`. It renders from the snapshot today.

No JSON Schema is generated yet (the plan suggested one from the TS types): the fixture above,
this table and PlasmidPop's own tests are the contract for now.
