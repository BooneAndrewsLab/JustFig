# The fragment format

A **fragment** is a piece of figure as plain JSON: a list of objects. JustFig adds a fragment to the page when you paste its text (Ctrl+V) or open it with **Open…** (a file whose `format` is `justfig-fragment` is added to the current page, not opened as a figure). It is how other programs, scripts and notebooks hand drawings to JustFig: write the JSON, copy it, paste. This page is for the people who write such programs.

- JustFig never sends a fragment, or anything in it, anywhere. It does not call any model or service to read it, and pasting needs no account or network. Whatever produces the fragment is outside the app.
- The format is a contract: a fragment that pastes today keeps pasting. A fragment from a newer file format is refused with a message; one from an older format is migrated.
- Pasted objects get fresh ids. They land in the middle of the view, unless their ids are already on the page (a copy of this figure), when they land a little beside the originals.

## The envelope

```json
{
  "format": "justfig-fragment",
  "schemaVersion": 1,
  "objects": [],
  "assets": {}
}
```

- `format` is always `justfig-fragment`.
- `schemaVersion` is the version of the figure file format the objects follow. Write the current one, 3; an older number is migrated (in schema 1 and 2 an arrow's `bind` ends were plain ids).
- `objects` is the list of objects, back to front (the first is at the bottom).
- `assets` maps an asset key to the picture or icon an object uses (the object's `asset` or `snapshot` holds the key). It is `{}` when no object uses one.

## A minimal example

This pastes as one rectangle and one line of text. Every property shown is required: a missing one refuses the paste (see "When a paste fails").

```json
{
  "format": "justfig-fragment",
  "schemaVersion": 1,
  "objects": [
    {
      "id": "box1",
      "type": "rect",
      "frame": { "x": 0, "y": 0, "w": 144, "h": 72, "rotation": 0 },
      "opacity": 1,
      "rx": 6,
      "style": {
        "fill": { "hex": "#e6f0fa" },
        "stroke": { "hex": "#1f4e79" },
        "strokeWidth": 1.5,
        "cap": "butt",
        "join": "miter"
      }
    },
    {
      "id": "label1",
      "type": "text",
      "frame": { "x": 12, "y": 26, "w": 120, "h": 20, "rotation": 0 },
      "opacity": 1,
      "runs": [
        [{ "text": "Wild type", "font": "arimo", "size": 12, "color": { "hex": "#000000" } }]
      ],
      "align": "center",
      "lineHeight": 1.2,
      "autoWidth": false
    }
  ],
  "assets": {}
}
```

## Units, frames and colours

- **Points.** Every length is in points (1/72 inch). The page is measured from its top-left corner, x to the right and y down. The interface shows millimetres or inches; the file never does.
- **Frame.** `frame` is the top-left corner `x`, `y`, the width `w` and height `h` (both 0 or more), and `rotation` in degrees clockwise about the centre. `flipX` and `flipY` are optional.
- **Opacity** is 0 (clear) to 1 (solid). `name`, `locked` and `hidden` are optional on every object.
- **Paints.** A colour is `{"hex": "#rrggbb"}`, a fixed colour, or `{"swatch": "<id>"}`, a swatch of the figure's palette (it changes when the palette does). A generator should write `hex`: a fragment does not carry a palette, so a swatch id the page does not know has no colour to show. A fill or stroke of `null` means none.
- **Fonts** are `arimo` (sans-serif), `tinos` (serif) and `cousine` (monospace), the fonts built into JustFig.

## Object kinds

Every object has `id` (any string, unique within the fragment), `type`, `frame` and `opacity`, plus these.

| `type`       | Properties besides the common ones                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rect`       | `rx` (corner radius), `style`                                                                                                                                                                                             |
| `ellipse`    | `style`                                                                                                                                                                                                                   |
| `path`       | `nodes` (list of `{x, y}` in the frame's own coordinates, with optional `in` and `out` handle offsets `{x, y}` for curves), `closed`, `style`                                                                             |
| `arrow`      | `nodes` as for a path, `start` and `end` heads (`{kind, size}`: `kind` is `none`, `triangle`, `open`, `stealth`, `bar`, `circle` or `diamond`, `size` a multiple of the line width), `style`; optional `bind` (see below) |
| `text`       | `runs` (paragraphs, each a list of `{text, font, size, color}` with optional `bold`, `italic` and `script` of `sub` or `sup`), `align` (`left`, `center`, `right`), `lineHeight` (a multiple of the size), `autoWidth`    |
| `icon`       | `asset` (key in `assets`), `slots` (colour overrides by slot id, `{}` for the icon's own colours), `lockAspect` (`true`)                                                                                                  |
| `image`      | `asset` (key of an `image` asset: a base64 PNG or JPEG)                                                                                                                                                                   |
| `procedural` | `kind`, `kindVersion`, `params`, `slots`, and `path` for the kinds that follow one (see below)                                                                                                                            |
| `group`      | `children` (objects, in page coordinates)                                                                                                                                                                                 |
| `panel`      | `label`, `autoLabel`, `showLabel`, `showBorder`, `children` (objects, in page coordinates)                                                                                                                                |
| `embedded`   | `source` (`{app, format, payload}`) and `snapshot` (key of an `svgImport` asset): a drawing made by another app, kept with its data                                                                                       |

`style` is `{fill, stroke, strokeWidth, cap, join}` with an optional `dash` list of lengths. `cap` is `butt`, `round` or `square`; `join` is `miter`, `round` or `bevel`.

An arrow's optional `bind` attaches its ends to other objects in the same fragment: `{"start": {"id": "box1", "site": "right"}, "end": {"id": "box2"}}`. `id` names the object; `site` is `top`, `right`, `bottom`, `left` (an edge's midpoint, 2 pt outside it) or `center`, and without it the end sits on the object's outline facing the other end. The arrow's `nodes` are still required and drawn as given until something moves; a binding to an object that is not pasted with the arrow is dropped.

An asset is `{"kind": "image", "mime": "image/png", "dataBase64": "…", "meta": {"name", "width", "height"}}` (`image/jpeg` also works), `{"kind": "svgImport", "svg": "…", "meta": {…}}`, or an `icon` with its SVG, slots and licence information as the icon library writes it. A generator that needs a picture should use an `image` or `svgImport` asset; an `svgImport` is cleaned of anything that is not plain drawing.

## Procedural objects

A `procedural` object is drawn by JustFig from a short list of parameters, so a generator can ask for a gel, a plate or a plasmid map without drawing it. Write `kind`, `kindVersion` (given below), `slots` (`{}` for the default colours) and `params`. The frame sets the size; a kind's default size is a good start.

`params` is read leniently: a missing, misspelt or wrong-typed value takes its default, a number outside its range is moved into it, lists are cut to their limit and colours are tidied. A procedural object with bad `params` therefore still pastes, with defaults where the values were wrong; the schema describes what to send. A kind this version does not know is kept and shown as its snapshot, if it has one.

The drawn kinds (`cell`, `bacterium`, `wellPlate`, `petriDish`, `gel`) also take a `style`: `flat` (the default), `line-art`, `cartoon` or `textbook`; `cell` and `bacterium` also `fluorescence`, `em` and `brightfield` (micrographs), `petriDish` and `gel` also `photo`. It changes only how the object is drawn, never what it shows, and an object without one is drawn flat. Later versions may add styles; an unknown one (or one the kind does not have) reads as `flat`.

### `cell`: Cell

`kindVersion` 2. A eukaryotic cell (animal, plant, yeast, neuron, epithelial); switch organelles on and off and colour each one. Default size 220 x 160 pt. Version 1 cells are read as version 2 with the new parts off.

- `style`: one of `flat`, `line-art`, `cartoon`, `textbook`, `fluorescence`, `em`, `brightfield`, default `flat` (how it is drawn)
- `shape`: one of `round`, `irregular`, `box`, `neuron`, default `round`
- `wall`: number 0 to 12 pt, default 0 (no cell wall)
- `nucleus`: true or false, default true
- `nucleolus`: true or false, default true
- `er`: true or false, default true
- `golgi`: true or false, default true
- `mitochondria`: whole number 0 to 30, default 5
- `lysosomes`: whole number 0 to 40, default 4
- `vesicles`: whole number 0 to 60, default 8
- `vacuole`: number 0 to 0.8 (share of the cell), default 0
- `chloroplasts`: whole number 0 to 30, default 0
- `bud`: number 0 to 0.8 (share of the mother), default 0
- `microvilli`: whole number 0 to 40, default 0
- `division`: one of `none`, `metaphase`, `telophase`, default `none`
- `apoptotic`: true or false, default false
- `membrane`: number 0.25 to 8 pt, default 2
- `seed`: whole number 0 to 99999, default 3

### `bacterium`: Bacterium

`kindVersion` 1. A bacterium: rod, coccus or curved rod, Gram-negative or Gram-positive, with nucleoid, plasmids, flagella and pili. Default size 240 x 110 pt.

- `style`: one of `flat`, `line-art`, `cartoon`, `textbook`, `fluorescence`, `em`, `brightfield`, default `flat` (how it is drawn)
- `shape`: one of `rod`, `coccus`, `vibrio`, default `rod`
- `envelope`: one of `negative`, `positive`, default `negative`
- `capsule`: true or false, default false
- `nucleoid`: true or false, default true
- `plasmids`: whole number 0 to 6, default 2
- `ribosomes`: whole number 0 to 200, default 40
- `flagella`: one of `none`, `polar`, `tuft`, `peritrichous`, default `polar`
- `pili`: whole number 0 to 40, default 0
- `membrane`: number 0.25 to 6 pt, default 1.5
- `seed`: whole number 0 to 99999, default 7

### `bilayer`: Lipid bilayer

`kindVersion` 1. A phospholipid bilayer along a path; draw a path with the pen and turn it into one. Follows an open path in `path`. Default size 280 x 80 pt.

- `closed`: true or false, default false
- `spacing`: number 1 to 20 pt, default 6
- `tail`: number 1 to 40 pt, default 8
- `gap`: number 0 to 10 pt, default 1
- `tails`: one of `straight`, `wavy`, default `straight`
- `outline`: true or false, default true

### `receptors`: Membrane proteins

`kindVersion` 1. Receptors, channels or transporters spaced along a membrane path. Follows an open path in `path`. Default size 280 x 110 pt.

- `closed`: true or false, default false
- `protein`: one of `rtk`, `gpcr`, `channel`, `transporter`, `antibody`, default `rtk`
- `spacing`: number 4 to 400 pt, default 48
- `size`: number 2 to 60 pt, default 14
- `side`: one of `out`, `in`, default `out`
- `membrane`: true or false, default true
- `thickness`: number 1 to 30 pt, default 10

### `helix`: DNA / RNA

`kindVersion` 1. A double helix (or an RNA strand) along a path, with base-pair ticks. Follows an open path in `path`. Default size 260 x 50 pt.

- `molecule`: one of `dna`, `rna`, default `dna`
- `pitch`: number 4 to 300 pt, default 40
- `radius`: number 1 to 60 pt, default 9
- `groove`: number 0.05 to 0.5 turn, default 0.38
- `bases`: true or false, default true
- `perTurn`: whole number 2 to 24, default 10
- `width`: number 0.25 to 8 pt, default 1.75

### `plasmidMap`: Plasmid map

`kindVersion` 1. A circular or linear map with features; PlasmidPop maps paste in as these. Default size 300 x 300 pt.

- `name`: text up to 200 characters
- `length`: whole number 1 to 100000000 bp, default 2686
- `topology`: one of `circular`, `linear`, default `circular`
- `features`: list of 0 to 500 items; each item: `name` (text up to 80 characters); `start` (whole number 1 to 100000000 bp, default 1, 1-based and inclusive); `end` (whole number 1 to 100000000 bp, default 100); `strand` (one of `1`, `-1`, `0`, default `1`); `type` (text up to 40 characters); `color` (`#rrggbb` or `""` for automatic, default `""`)
- `showName`: true or false, default true
- `showLength`: true or false, default true
- `showTicks`: true or false, default true
- `showLabels`: true or false, default true
- `ring`: number 2 to 40 pt, default 11
- `labelSize`: number 3 to 18 pt, default 7
- `minLabelPct`: number 0 to 100 % of length, default 1

### `proteinDomains`: Protein domains

`kindVersion` 1. A protein as a bar with its domains to scale, a residue ruler and N/C termini. Default size 320 x 70 pt.

- `length`: whole number 1 to 100000 aa, default 600
- `domains`: list of 0 to 200 items; each item: `name` (text up to 60 characters); `start` (whole number 1 to 100000 aa, default 1); `end` (whole number 1 to 100000 aa, default 50); `color` (`#rrggbb`, default `#0072b2`); `shape` (one of `rounded`, `box`, `ellipse`, `hexagon`, default `rounded`)
- `height`: number 2 to 60 pt, default 18
- `showLabels`: true or false, default true
- `showScale`: true or false, default true
- `showTermini`: true or false, default true

### `wellPlate`: Well plate

`kindVersion` 1. A 6- to 1536-well plate; paint wells or paste a layout from a spreadsheet. Default size 240 x 160 pt.

- `style`: one of `flat`, `line-art`, `cartoon`, `textbook`, default `flat` (how it is drawn)
- `format`: one of `6`, `12`, `24`, `48`, `96`, `384`, `1536`, default `96`
- `shape`: one of `circle`, `square`, default `circle`
- `showLabels`: true or false, default true
- `outline`: true or false, default true
- `wells`: object of well id (`A1`) to `#rrggbb`

### `petriDish`: Petri dish

`kindVersion` 5. An agar plate with colonies: random, streaked, spotted dilutions (strain rows by 10-fold columns), a pinned grid, a lawn (with antibiotic discs and plaques) or a tetrad dissection; colonies can mix two colours and take other shapes. Round dish or rectangular plate. Default size 150 x 150 pt.

- `style`: one of `flat`, `line-art`, `cartoon`, `textbook`, `photo`, default `flat` (how it is drawn)
- `plate`: one of `round`, `rect`, default `round`
- `pattern`: one of `random`, `streak`, `spots`, `grid`, `lawn`, `tetrads`, `none`, default `random`
- `count`: whole number 0 to 1536, default 60
- `size`: number 0.5 to 30 pt, default 3.5
- `variation`: number 0 to 1, default 0.5
- `seed`: whole number 0 to 99999, default 7
- `lid`: true or false, default true
- `tetrads`: whole number 1 to 24, default 8
- `segregation`: one of `mixed`, `2:2`, `4:0`, `3:1`, `1:3`, `0:4`, default `2:2`
- `dead`: number 0 to 100 %, default 0
- `missing`: number 0 to 100 %, default 0
- `tetradLabels`: true or false, default true
- `spotRows`: whole number 1 to 8, default 3
- `spotCols`: whole number 2 to 8, default 5
- `rowLabels`: true or false, default false
- `discs`: whole number 0 to 8, default 0
- `haloSize`: number 0 to 40 pt, default 12
- `plaques`: whole number 0 to 300, default 0
- `plaqueSize`: number 0.5 to 10 pt, default 2
- `markerShare`: number 0 to 100 %, default 0
- `morphology`: one of `smooth`, `wrinkled`, `filamentous`, `petite`, `sectored`, default `smooth`

### `gel`: Agarose gel

`kindVersion` 1. A gel with a ladder and lanes of bands; type band sizes in bp. Default size 220 x 170 pt.

- `style`: one of `flat`, `line-art`, `cartoon`, `textbook`, `photo`, default `flat` (how it is drawn)
- `ladder`: one of `1kb`, `100bp`, `none`, default `1kb`
- `lanes`: list of 1 to 30 items; each item: `label` (text up to 24 characters); `ladder` (true or false, default false); `bands` (text up to 300 characters)
- `look`: one of `stained`, `inverted`, default `stained`
- `showLabels`: true or false, default true
- `showSizes`: true or false, default true
- `wells`: true or false, default true

### `gelLabels`: Gel lane labels

`kindVersion` 1. Lane labels and ladder sizes for a gel photo, laid over the picture. Default size 200 x 140 pt.

- `lanes`: list of 1 to 40 items; each item: `label` (text up to 24 characters); `shift` (number -50 to 50 %, default 0)
- `first`: number 0 to 100 %, default 8
- `last`: number 0 to 100 %, default 92
- `angle`: one of `0`, `45`, `90`, default `0`
- `sizes`: list of 0 to 30 items; each item: `label` (text up to 16 characters); `at` (number 0 to 100 %, default 50)
- `side`: one of `left`, `right`, default `left`
- `ticks`: true or false, default true
- `size`: number 4 to 24 pt, default 8

### `scaleBar`: Scale bar

`kindVersion` 1. A scale bar for a micrograph, calibrated from its pixel size. Default size 200 x 150 pt.

- `pixelSize`: number 0.0001 to 1000 µm/px, default 0.1
- `imageWidth`: whole number 1 to 100000 px, default 1000
- `length`: number 0.001 to 100000 µm, default 10
- `showLabel`: true or false, default true
- `label`: text up to 24 characters
- `corner`: one of `br`, `bl`, `tr`, `tl`, default `br`
- `thickness`: number 0.25 to 20 pt, default 3
- `margin`: number 0 to 72 pt, default 6
- `size`: number 4 to 24 pt, default 8

### `timeline`: Experiment timeline

`kindVersion` 1. A time axis with events (injection, boost, harvest) and treatment periods as bars. Default size 360 x 90 pt.

- `start`: number -100000 to 100000, default 0
- `end`: number -100000 to 100000, default 14
- `unit`: one of `hours`, `days`, `weeks`, default `days`
- `tickLabels`: one of `prefix`, `unit`, `none`, default `prefix`
- `step`: number 0 to 100000, default 0
- `events`: list of 0 to 40 items; each item: `label` (text up to 40 characters); `time` (number -100000 to 100000, default 0); `marker` (one of `triangle`, `tick`, `bracket`, default `triangle`); `end` (number -100000 to 100000, default 0); `color` (`#rrggbb` or `""` for automatic, default `""`)
- `ranges`: list of 0 to 20 items; each item: `label` (text up to 40 characters); `start` (number -100000 to 100000, default 0); `end` (number -100000 to 100000, default 1); `color` (`#rrggbb`, default `#56b4e9`)
- `side`: one of `above`, `below`, default `above`
- `arrow`: true or false, default true
- `size`: number 4 to 24 pt, default 8

### `sequence`: Sequence snippet

`kindVersion` 1. A short DNA, RNA or protein sequence with a numbering ruler, highlighted residues and labelled bars. Default size 300 x 56 pt.

- `sequence`: text up to 2000 characters; letters, `-` and `*` are kept, upper-cased, and cut to 200 residues
- `first`: whole number -100000 to 100000, default 1 (the number of the first residue)
- `ruler`: true or false, default true
- `interval`: whole number 5 to 1000 residues, default 10
- `highlights`: list of 0 to 20 items; each item: `start` (whole number -100000 to 100000, default 1); `end` (whole number -100000 to 100000, default 1); `color` (`#rrggbb`, default `#ffe08a`)
- `annotations`: list of 0 to 20 items; each item: `label` (text up to 24 characters); `start` (whole number -100000 to 100000, default 1); `end` (whole number -100000 to 100000, default 1); `color` (`#rrggbb` or `""` for the Annotations colour, default `""`)
- `size`: number 4 to 24 pt, default 9

### `studyDesign`: Study design

`kindVersion` 1. Study arms stacked on one time axis, with injection, dosing, sampling and endpoint markers and treatment bars. Default size 380 x 150 pt.

- `start`: number -100000 to 100000, default 0
- `end`: number -100000 to 100000, default 21
- `unit`: one of `hours`, `days`, `weeks`, default `days`
- `tickLabels`: one of `prefix`, `unit`, `none`, default `prefix`
- `step`: number 0 to 100000, default 0
- `arms`: list of 1 to 8 items; each item: `name` (text up to 40 characters); `n` (whole number 0 to 100000, default 8; 0 leaves the n out of the label); `color` (`#rrggbb`, default `#9aa5b1`)
- `marks`: list of 0 to 80 items; each item: `arm` (whole number 1 to 8, the arm's position in `arms`); `time` (number -100000 to 100000, default 0); `kind` (one of `inject`, `dose`, `sample`, `endpoint`, default `dose`)
- `bars`: list of 0 to 20 items; each item: `label` (text up to 40 characters); `arm` (whole number 0 to 8, 0 for every arm); `start` (number -100000 to 100000, default 0); `end` (number -100000 to 100000, default 1); `color` (`#rrggbb`, default `#56b4e9`)
- `legend`: true or false, default true
- `arrow`: true or false, default true
- `size`: number 4 to 24 pt, default 8

### `tree`: Tree from Newick

`kindVersion` 1. A phylogenetic or clustering tree drawn from a Newick string, rectangular or circular, with optional collapsed clades. Default size 260 x 230 pt.

- `newick`: text up to 4000 characters; kept as given, parsed when drawn (a string that does not parse draws a message)
- `layout`: one of `rectangular`, `circular`, default `rectangular`
- `branchLengths`: true or false, default true
- `support`: true or false, default true
- `labels`: true or false, default true
- `collapse`: list of 0 to 20 items; each item: `name` (text up to 80 characters: a clade's label, a leaf name for its parent clade, or two leaf names separated by a comma for the smallest clade holding both)
- `scaleBar`: true or false, default true
- `size`: number 4 to 24 pt, default 9
- `lineWidth`: number 0.25 to 6 pt, default 1

### `placeholderPlot`: Placeholder plot

`kindVersion` 1. A plot-shaped placeholder (PCA, UMAP, scatter, bar or flow cytometry) drawn from a seed. Default size 200 x 160 pt.

- `plot`: one of `pca`, `umap`, `scatter`, `bar`, `flow`, default `pca`
- `groups`: list of 1 to 8 items; each item: `name` (text up to 30 characters); `color` (`#rrggbb`, default `#0072b2`)
- `points`: whole number 1 to 1000, default 60
- `events`: whole number 50 to 5000, default 1500
- `gate`: one of `none`, `quadrant`, `polygon`, default `quadrant`
- `spread`: number 0.25 to 2.5, default 1
- `pointSize`: number 0.5 to 12 pt, default 2.5
- `axes`: true or false, default true
- `axisLabels`: true or false, default true
- `xLabel`: text up to 40 characters
- `yLabel`: text up to 40 characters
- `legend`: true or false, default true
- `errorBars`: true or false, default true
- `dots`: true or false, default true
- `seed`: whole number 0 to 99999, default 3

## The JSON Schema

A JSON Schema (draft 2020-12) describes the whole fragment, including each procedural kind's `params` above. It is generated from the same code that reads fragments and from the kinds' own parameter definitions, so it cannot drift from them. It is served with the app at `schema/fragment.schema.json`: for an app at `https://example.org/figures/`, that is `https://example.org/figures/schema/fragment.schema.json`. Any JSON Schema validator can use it; run it over what your program writes before you hand it to anyone.

The schema is structural. It does not check everything the reader checks, such as that a swatch exists, and a procedural object whose `params` break it still pastes, as described above.

## When a paste fails

Text that is not valid JSON, or whose `format` is not `justfig-fragment`, is not treated as a fragment. A fragment that is one but is damaged is refused, and a message names the object and the property, for example:

> Cannot paste: objects[1] (rect, id "box2") is damaged at property "frame.x": expected a finite number.

`objects[1]` is the second object of the list (counting from 0). The type and id say which one it is, and the property is its path inside the object (`children[0].style.fill.hex` for a colour in the first child of a group). Nothing is pasted when any object fails, so fix the objects one message at a time.
