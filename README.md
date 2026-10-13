# JustFig

Free, open-source scientific figure editor for wet-lab biologists, in the browser — a
BioRender alternative with no account and no backend: figures never leave your computer.

**Use it:** <https://booneandrewslab.github.io/JustFig/> — works in any modern browser,
installs as an app, and works offline after the first visit.

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

The user guide is in the app (**Guide**) and in [docs/guide](docs/guide).

## Privacy

Figures are kept in the browser (IndexedDB) and in the files you save; nothing is uploaded.
Usage statistics: `src/ui/analytics.ts` talks to a self-hosted Matomo instance only when
`VITE_MATOMO_URL` and `VITE_MATOMO_SITE_ID` are set at build time; otherwise it is a no-op. The deployed site (`.github/workflows/deploy.yml`) reports to site 8 on
the lab's Matomo (`https://boonelab.ccbr.utoronto.ca/matomo/`); local and CI builds do not.
It honours Do-Not-Track, sets no cookies, and sends only coarse feature events, never figure
content.

## Contributing

Issues and pull requests are welcome; planned work is in the
[issue tracker](https://github.com/BooneAndrewsLab/JustFig/issues).
[CLAUDE.md](CLAUDE.md) holds the rules the code is worked by, [docs/design](docs/design) the
reasoning behind each piece of work. Icons are contributed to the icon library repository,
`justfig-icons` (its CONTRIBUTING.md).

## Development

Requires Node 24 (see [.nvmrc](.nvmrc)).

```sh
npm ci
npm run icons      # the pinned icon library → public/lib/ (see below)
npm run dev        # the editor at http://localhost:5173
npm run check      # typecheck, lint, format, unit tests
npm run e2e        # Playwright: chromium, firefox, webkit
npm run build      # the static site → dist/ (BASE_PATH=/JustFig/ for GitHub Pages)
```

The icon library is built in the repository `justfig-icons` and pinned in `icons.lock.json`.
`npm run icons` copies `../justfig-icons/dist` when it is built at the pinned version, else
downloads the pinned release. The site deploys when a GitHub Release is published (see
[docs/releasing.md](docs/releasing.md)).

## Citing

See [CITATION.cff](CITATION.cff). DOI: 10.5281/zenodo.0000000 (placeholder until the first
release is archived on Zenodo; see [docs/releasing.md](docs/releasing.md)).

## Licence

JustFig is released under the [MIT License](LICENSE).

The icons are not code and keep their own licences: CC0, CC BY 3.0 and 4.0, MIT, and CC BY-SA
(hidden unless you turn share-alike icons on). Each icon's source, author and licence are in
the app's icon credits and in every exported figure's credit line.
