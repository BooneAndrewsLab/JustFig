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

The cost is that a contributor writes TypeScript rather than drawing in the app. A future
"Save as template" could export a figure as a `GalleryEntry` source file ([#17](https://github.com/BooneAndrewsLab/JustFig/issues/17)).

- **Templates** are empty layouts: lettered panels on a journal page size (2 × 2 on Nature
  double column, 1 × 3 on Cell full width, 1 × 2 on Nature single column).
- **Examples** are finished figures to take apart: a signalling pathway (membrane, receptor,
  kinase cascade, an inhibitor with a bar head, all arrows attached), an experimental workflow
  (Petri dish → 96-well plate → read-out) and a cloning figure (plasmid map and gel in panels).
  Their colours are swatches, so Apply to figure recolours them. Icons are not used: an icon
  entry would need the icon library loaded to build, and the gallery must work offline before
  it loads.

## The dialog

Two tabs (Templates, Examples), each a grid of cards with a live thumbnail: the entry is built
and exported through `exportSvg` (text outlined, no footer) into an `<img>`, so the thumbnail is
exactly what the figure is. Building all entries takes a few milliseconds.

## Tests

`gallery.test.ts`, for every entry: it saves and reopens byte-identically through the `.jfig`
codec; ids are fresh per build; every object is on the page; every procedural kind resolves;
the export stays in the subset; every arrow is attached at both ends and sits on its targets'
outlines. E2E: an example opened from the dialog, then recoloured.
