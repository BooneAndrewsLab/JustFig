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

## BarelySig: `embedded` / `bsig`

BarelySig has no copy command that writes a fragment. What it does write today is an SVG export
"with data": `svgMeta` (its `src/io/recipe.ts`) puts the figure's **recipe** — a `.bsig`
document cut down to the graph, its table, analyses and results — gzipped and base64'd into
`<metadata><barelysig:recipe encoding="gzip+base64">`. So the import side is built on that,
and nothing was added to BarelySig:

- **Import…** (or Open…, or dropping the file) of an SVG whose metadata has a recipe makes an
  `embedded` object: `source: { app: 'BarelySig', format: 'bsig', payload: <the recipe as
parsed JSON, untouched> }`, `snapshot`: the hash of an `svgImport` asset holding the SVG after
  the usual sanitiser. The frame is the SVG's physical `width`/`height` (mm → pt), so a
  graph made at a journal width keeps it. Its name is the graph's title.
- An SVG BarelySig exported _without_ its data (the metadata says BarelySig, no recipe) is
  imported as a plain picture, with a notice saying why.
- The Inspector's "From BarelySig" section offers **Download .bsig for BarelySig**: the
  payload written back as JSON, which BarelySig opens as a project. Editing happens there;
  importing again replaces nothing (it is a new object).
- The fixtures are BarelySig 1.0.0's real output: `src/io/fixtures/barelysig-figure2.svg` and
  its recipe `barelysig-figure2.recipe.json`, made by running BarelySig's own `recipeText`,
  `svgMeta` and `exportSvg` on the graph of its recipe tests (in a scratch clone; BarelySig was
  not changed).
- `barelysig-figure2.fragment.json` is the same object as a fragment: the form a future
  BarelySig "Copy for figure" command should write. It pastes like any fragment.

## JSON Schema

`schemas/fragment.schema.json` (JSON Schema draft-07) describes the whole fragment. It is generated
from the `FragmentFile` type in `src/io/jfig.ts` (and the model types it pulls in) by
`ts-json-schema-generator`: run `npm run schema` after changing those types. Siblings can copy it
or reference it by its path in this repo to validate what they write.
`src/io/fragmentSchema.test.ts` validates every frozen fragment fixture against it and fails when
the committed file is stale.

The schema is structural only: it does not encode the strict decoders' range checks, and a
procedural object's `params` are free-form JSON (decoded leniently by its kind, see above), so the
tables in this note remain the contract for `params`
([#18](https://github.com/BooneAndrewsLab/JustFig/issues/18)).
