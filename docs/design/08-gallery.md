# 08 Templates and examples gallery

**Templates…** in the top bar opens a gallery of starting points. Choosing one starts a new
figure, like New (save the current figure first if you want to keep it).

## The format: code, not files

An entry (`src/gallery/gallery.ts`) is

```ts
interface GalleryEntry {
  id: string; // stable kebab-case; tests and analytics name it
  title: string;
  description: string; // one sentence for the card
  kind: 'template' | 'example';
  build: () => Figure; // a fresh figure every time
}
```

`build()` makes the figure from the model's factories (`createRect`, `createText`, `createPanel`,
`createArrow`…) and `createProcedural`, the same functions the editor uses. We chose code over
saved `.jfig` files because:

- an entry is typechecked against the current schema, so it can never go stale or need a
  migration, and a schema change that breaks it fails the build;
- every use gets fresh ids, so two figures started from one template never share ids;
- arrows can be attached to objects (note 06) and placed by `reconcileBindings`, and colours
  linked to swatches (note 07), by construction rather than by hand-editing JSON.

The cost is that a contributor writes TypeScript rather than drawing in the app. A
"Save as template source" exports a figure as a `GalleryEntry` source file (below).

- **Templates** are empty layouts: lettered panels on a journal page size (2 × 2 on Nature
  double column, 1 × 3 on Cell full width, 1 × 2 on Nature single column).
- **Examples** are finished figures to take apart: a signalling pathway (membrane, receptor,
  kinase cascade, an inhibitor with a bar head, all arrows attached), an experimental workflow
  (Petri dish → 96-well plate → read-out) and a cloning figure (plasmid map and gel in panels).
  Their colours are swatches, so Apply to figure recolours them. Icons are not used: an icon
  entry would need the icon library loaded to build, and the gallery must work offline before
  it loads.

## The dialog

Three tabs: Templates and Examples, each a grid of cards with a live thumbnail: the entry is built
and exported through `exportSvg` (text outlined, no footer) into an `<img>`, so the thumbnail is
exactly what the figure is. Building all entries takes a few milliseconds. The third tab, My presets, holds
the user's saved presets (note 22); choosing one adds it to the current page instead of starting a
new figure.

## Tests

`gallery.test.ts`, for every entry: it saves and reopens byte-identically through the `.jfig`
codec; ids are fresh per build; every object is on the page; every procedural kind resolves;
the export stays in the subset; every arrow is attached at both ends and sits on its targets'
outlines. E2E: an example opened from the dialog, then recoloured.

## Save as template source

A contributor can draw a figure in the app and get the TypeScript of an entry instead of writing it
([#17](https://github.com/BooneAndrewsLab/JustFig/issues/17)). `src/gallery/source.ts` does the
writing; `kit.ts` holds `templateFigure`, which the generated file calls.

- **Where.** A button at the foot of the Templates dialog, labelled for contributors, opening a
  dialog with title, id, description and kind, the source in a read-only box, and Copy and Download
  buttons. It is not gated by a dev build: the e2e suite and CI run the production build, and a
  clearly labelled button two clicks from the toolbar costs a figure-maker nothing. The file never
  leaves the machine; analytics only count the click (`gallery`/`source`).
- **What.** The selection, else the current page's objects. Not preset-style baked swatches: a
  built-in entry should keep its palette links (note 07), so the document's palette, text styles,
  panel-label style and the page's size and background are emitted too.
- **Literal data, not factory calls.** A drawn object carries every field the editor set. Emitting
  `createRect(frame(…), style(…), 8)` per object would lose or restate fields (names, rotation,
  opacity, text runs, bindings) and need a mapping per type that drifts with the schema. The
  objects are emitted as a typed literal (`readonly Obj[]`), so the compiler checks them against the
  current schema, and the entry rebuilds them through `templateFigure`: fresh ids by
  `cloneObjects`, arrows' attachments remapped and solved by `reconcileBindings` (note 06). Icons
  keep their asset (SVG and licence meta) in the entry, found by `assetsUsed` (note 22), so it builds
  offline like the hand-written entries; the licence meta carries the library id.
- **Passes the repo's checks as generated.** The data blocks carry `// prettier-ignore`, the
  metadata block is laid out as Prettier does, and the result type-checks and lints. A test formats
  the output with Prettier and expects no change.
- A contributor who wants named swatches and factory calls, as the hand-written entries have, can
  tidy the generated file; nothing requires it.
