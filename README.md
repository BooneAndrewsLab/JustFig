# JustFig

Free, open-source scientific figure editor for wet-lab biologists, in the browser — a
BioRender alternative with no account and no backend: figures never leave your computer.

- Shapes, lines, Bézier paths, arrows (including the inhibition bar) that stay attached to
  what they point at, and rich text with sub- and superscripts and Greek letters.
- Lettered panels on journal page sizes, layers, pages, align and distribute, snapping.
- A library of openly licensed scientific icons (Health Icons, Bioicons and house icons),
  recolourable, with the attribution line written for you.
- Procedural objects: well plates (6–1536) with well maps, lipid bilayers, DNA/RNA, membrane
  proteins, plasmid maps (paste one from PlasmidPop), protein domains, Petri dishes, gels, cells.
- Colourblind-safe palettes, swatch-linked recolouring and a colour-vision preview.
- Templates and examples; BarelySig graphs imported with their data.
- Export to SVG, PDF, PNG and TIFF at a chosen DPI.

The user guide is in the app (**Guide**) and in [docs/guide](docs/guide). How it is built:
[docs/design](docs/design) and [CLAUDE.md](CLAUDE.md).

## Development

```sh
npm ci
npm run dev        # the editor at http://localhost:5173
npm run check      # typecheck, lint, format, unit tests
npm run e2e        # Playwright: chromium, firefox, webkit
```

The icon library is built in the sibling repository `justfig-icons` (see its CONTRIBUTING.md to
add an icon) and pinned in `icons.lock.json`.

## Citing

See [CITATION.cff](CITATION.cff). DOI: 10.5281/zenodo.0000000 (placeholder until the first
release is archived on Zenodo; see [docs/releasing.md](docs/releasing.md)).

## Licence

MIT. Icons keep their own licences (CC0, CC BY, MIT, BSD; CC BY-SA hidden unless chosen), listed
in the app's Icon credits and licences.
