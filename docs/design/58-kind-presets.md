# 58 Kind presets: named starting points for procedural objects

2026-10-11. Step 1 (the mechanism, issue #82) is built; the rest is a plan. Every procedural kind (note 04) starts from its field
defaults: an agar plate is always 60 scattered colonies on yellow agar, a cell always the same
generic animal cell. A biologist wants "a tetrad dissection plate", "YPD", "a yeast cell", "a
96-well plate with controls in column 12", and gets there today by setting six fields by hand,
if the kind can draw it at all. Note 22's presets are something else: a selection the user saved.
These are built in, per kind, and written by us.

## What a kind preset is

Declarative data on the kind, next to `fields`, so the "never add per-kind UI" rule holds:

```ts
readonly presets?: readonly KindPreset[];

interface KindPreset {
  readonly id: string;        // stable, kebab-case, unique within the kind
  readonly label: string;     // "Tetrad dissection"
  readonly group?: string;    // "Patterns", "Media": headings in the picker
  readonly params?: Partial<Params>;          // over the field defaults
  readonly slots?: Readonly<Record<SlotId, string>>; // plain hex, never swatch links
  readonly size?: { w: number; h: number };   // when the default frame is the wrong shape
}
```

- A preset is **params over defaults**, never a full params object: it goes through
  `createProcedural(k, at, over)` (which already takes overrides) and so through `decodeParams`
  and `fix`. A preset can never produce params the decoder would not.
- **Slots are plain hex**, like procedural colour params (note 07): a preset knows nothing about
  the figure's palette. Media colours (LB, YPD, blood agar) are slot presets.
- A preset is **not stored**. The object records its params as usual; nothing remembers which
  preset it came from, so presets can be renamed, reordered or retired without a migration.
  Changing a preset changes only objects placed afterwards.
- **Groups** let one kind offer orthogonal sets: the petri dish has _Patterns_ (streak, tetrads,
  spots) and _Media_ (slot colours only). Applying a _Media_ preset keeps the pattern; applying
  a _Patterns_ preset keeps the media. Generally: applying a preset sets only the keys it names.

## Where it shows

All generic, driven by `presets`:

- **Objects shelf:** a kind with presets gets a disclosure ("Petri dish starting points") under
  the grid of kind tiles, not on the tile: a disclosure inside a three-column grid of buttons
  broke the grid and nested an interactive control in a button. Inside, a heading per group and
  a tile per preset drawn by the kind's own `render` (same `thumb` cache, keyed by kind and
  preset id; drawn only once the disclosure is opened). Click places, drag drops, as for the
  kind (the drag carries `kind/preset-id`).
- **Inspector:** a **Start from…** menu above the fields. Choosing one is one named edit
  (`Apply preset <label>`), one undo step, setting only the keys the preset names (and its
  frame size when it has one and the object still has the default size).
- **Icon search:** `matchPresets` (beside `matchKinds`): every query word must match the
  preset's label, its group, the kind's title or a keyword, and at least one the label itself, so
  "YPD" or "agar dilution" finds a preset while "petri" alone stays with the kind. Typing "YPD" finds the
  tile for that preset (with the Adjustable tag, as `matchKinds` does for kinds).

## The wizard

Some kinds need a few answers that fill many params: a plate map from "conditions × replicates,
controls where", a tetrad plate from "how many tetrads, which segregation". That is a **wizard**:

```ts
readonly wizard?: {
  readonly steps: readonly { question: string; fields: readonly Field[] }[];
  readonly build: (answers: Params) => Partial<Params>;  // PURE
};
```

- The questions are ordinary `Field`s, so one generic stepper dialog (`ui/dialogs/Dialog.tsx`,
  keyboard and focus trap included) asks them. `build` is pure, so it is unit-tested and
  property-tested like `render`.
- The answers are not stored, only the params they produce. Re-running the wizard on an
  existing object starts from the defaults again, not from the object.
- Only for kinds where questions really beat fields: the well plate first, then the tetrad
  plate. A kind whose presets plus Inspector already do the job gets no wizard.

## Styles

A preset says _what_ is drawn; a style says _how_. They are independent: a tetrad plate can be
flat, line art or a photo-like plate. Styles for the drawn kinds (cell, petri, well plate, gel);
the diagram kinds (plot, tree, timeline, sequence) stay as they are.

| Style          | Look                                                                                                                         | For                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Flat**       | Today's: flat fills, thin outline. The default.                                                                              | Everything; matches most library icons              |
| **Line art**   | Outlines only, one ink colour, no fills.                                                                                     | Journals that want monochrome; methods schematics   |
| **Cartoon**    | Thick round outlines, saturated slots, fewer and bigger parts (3 mitochondria, not 12), a small highlight.                   | Talks, teaching, graphical abstracts                |
| **Textbook**   | Shaded: 2–3 tone bands per part (the house icons' tone offsets), double membranes, irregular organic edges.                  | Review-style figures; the closest to "realistic"    |
| **Micrograph** | Imitates the imaging: fluorescence (black ground, slot colours as channels, DAPI-blue nucleus), EM (greyscale), brightfield. | Explaining an imaging result next to the real image |
| **Photo**      | Petri and gel only: the plate or gel as photographed (agar sheen, translucent colonies, UV-lit gel).                         | Making a mock result look like the real one         |

How, keeping the rules:

- **A generic `style` param**, like `seed`: a kind lists the styles it supports
  (`styles?: readonly StyleId[]`) and the registry adds one enum field; `render` reads it like
  any param. No per-kind UI. Old objects decode to `flat`, so no kind version bump.
- **Shared helpers in `prims.ts`** do the work once: tone bands, outline weight per style, an
  organic wobble for edges, ink-only conversion for line art. A kind's render calls them
  instead of branching on the style everywhere.
- **The export subset holds.** No gradients or filters: shading is stacked tone bands, glow
  (fluorescence) is concentric strokes at falling `stroke-opacity`, sheen is a translucent arc.
  Each band is its own colour, so "one path per colour" still merges them. Photo and
  micrograph are imitations built from these, not raster effects.
- **Matching a figure.** "Apply this style to all" in the Inspector's selection section is one
  edit over every selected procedural object that supports the style. A figure-wide default
  would be a schema change; it waits until people ask for it.
- **Line art also needs icons.** A line-art cell next to filled library icons clashes. Icons
  already have an `outline` slot; a "line art" recolour (fills to white, outline to ink) is a
  palette edit (note 07), with the "modified" credit for CC BY icons. A follow-up.
- Gates: every kind × supported style gets a golden SVG; the bounded-render test covers
  styles; the guide documents each style.

## Gates

- Every preset renders a golden SVG (`kinds.test.ts` walks `presets` itself, writing
  `<kind>-preset-<id>.svg`, so `goldenCases.ts` needs no copy) and passes a bounded-render
  property over frame sizes.
- A unit test: preset ids unique per kind, every `params` key is a field of the kind, every
  value decodes to itself (a preset never relies on the decoder clamping it), every `slots`
  key is a slot of the kind.
- `src/ui/guide.test.ts` learns presets: every preset label appears on its kind's line under
  "Starting points" in the Scientific objects guide page.
- Analytics: `preset` events gain `kind-place`, `kind-apply` (built) and `wizard` (step 3),
  named `kind/preset-id` (our data, not figure content).

## What each kind gets

**Agar plate (`petri`).** With today's params: single-colony streak, spot dilutions, pinned
grid, lawn, empty plate. Media (slot colours): LB, YPD, SC/dropout, blood agar, MacConkey,
X-gal, chocolate agar. New params (version bump, `migrate`): _tetrad dissection_ (columns of
four spores per tetrad, dead or missing spores, 2:2 / 4:0 segregation, tetrad labels);
_strain rows × 10-fold spot columns_ with row labels; _disk diffusion_ (discs with inhibition
halos); _plaques_ on a lawn; _two colony colours by ratio_ (blue/white screening, red/white
_ade2_ sectoring); colony morphology (smooth, wrinkled, filamentous, petite, sectored); a
_rectangular single-well plate_ for 384/1536 pinned grids, which a round dish draws wrongly.

**Cell (`cell`).** Animal, plant, budding yeast, bacterium, neuron, polarised epithelial,
dividing, apoptotic. Most need fields the kind lacks: cell wall, chloroplasts, central vacuole,
bud, nucleoid instead of nucleus, flagellum or pili, capsule, microvilli. Each one is weighed
against a separate kind; a prokaryote probably deserves its own `bacterium` kind rather than
switching off half the cell.

**Well plate (`wellPlate`).** Layouts: controls in fixed columns, blank edge wells (edge
effect), dilution gradient across columns, standard curve plus samples in triplicate,
drug-combination checkerboard. The wizard (format, conditions, replicates, control placement)
fills the well map; a legend is a follow-up.

**Gel (`gel`).** Colony PCR check, restriction digest, a protein marker (the ladder enum gains
one), Western-blot look.

**Plasmid (`plasmid`).** Common backbones (pUC19, pET-28a, pLKO.1) as named features with
coordinates. Coordinates must be checked against the GenBank records and cited in the code; a
wrong map is worse than none. Built here from public records, not from PlasmidPop.

**Timeline and study design.** Mouse treatment schedule, time course, pooled CRISPR screen.

## Order

1. The mechanism (`presets`, shelf, Inspector, search, gates), seeded only with presets today's
   params can draw: petri patterns and media, gel, well-plate layouts. No version bumps.
2. New params per kind: petri (tetrads first, then the rest), cell types, plasmid backbones,
   timeline and study-design presets.
3. The wizard: the generic stepper with the well plate, then the tetrad plate.
4. Styles: the `style` param and the helpers with line art and cartoon (the cheapest), then
   textbook, micrograph and photo; line art for icons last.
