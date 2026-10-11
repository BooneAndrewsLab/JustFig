# 54 Family base sheet: theme-base.css under the app's theme.css

2026-10-10. Step 6 of `DESIGN.md`, this repo's side. The sibling copies are
left to the user. `design/theme-base/README.md` has the steps for each one.

## What

- **`src/ui/theme-base.css`** holds the family layer:
  - the Archivo UI `@font-face`;
  - the shared tokens: palette, text tiers, panel and rules, the teal accent
    and its ink and tint, backdrop, warning, error, radii, menu and dialog
    shadows, and `--font-ui`;
  - `color-scheme: light dark` with the dark block for those tokens;
  - base element rules (`*`, `html, body, #root`, the `body` font, form
    controls inheriting the font, `a`);
  - buttons (plain, `.primary`, `.icon`, pressed, `.link`), text inputs and
    `select`, and the `:focus-visible` ring;
  - section headers (`.section > h2`), the status bar's look, dialogs
    (backdrop, box, wide, title, head and meta, actions, fieldset), `.tabs`
    and `.sr-only`.
- **`src/ui/theme.css`** is the app's own layer, imported after it from
  `main.tsx`:
  - the tokens only this app uses: pasteboard, paper, the canvas overlay
    colours, page shadow and under-colour, and the figure tiles, with their
    own dark block;
  - the four-column layout, top bar, figure tabs, canvas, rulers, icon
    browser, tool palette, inspector rows, swatches, layers and notes;
  - every dialog's content, and `grid-area: status`.
- Rules moved unchanged and keep their order. The status bar is the only
  split rule: its look is in the base and its grid placement in the app.
- **Opting out of dark:** the base dark block is
  `:root:not([data-scheme='light'])`. A sibling with no dark mode (BarelySig)
  puts `data-scheme="light"` on `<html>`, and `color-scheme` becomes `light`.
  This app never sets the attribute.
- **Header:** the base sheet says what it is and that it is copied verbatim
  into PlasmidPop and BarelySig. Each copy adds one first line naming the
  source commit here. The source of truth is this repo. The comment
  names the app only as "the figure editor", because `src/brand.test.ts`
  scans `src/` for the display name.

## Why

Each of the three apps has its own copy of the same tokens and control rules.
That is how they drift apart, for example in the ink, the focus ring and the
dialog metrics (`DESIGN.md` §1). Copying one file with a commit line keeps
them the same without a package or a monorepo. Those cost more than they save
for three static apps (§5).

The base sheet uses class names this app already had (`.dialog-backdrop`,
`.dialog`, `.status`, `.section`, `.tabs`, `.sr-only`). Some of them match a
sibling: PlasmidPop has `.dialog-backdrop`, `.dialog` and `.dialog--wide`, and
BarelySig has `.dialog` and `.status`. Where the siblings use other names
(`.statusbar`, `.panel__heading`, `.visually-hidden`, `.backdrop`,
`.mode-tabs`), the README lists them instead of renaming anything here.

There is no menu rule. This app has no menus (§5), and a rule nothing here
renders would go untested. The menu shadow token is shared, so a later
`.menu` can join the base sheet once an app here uses it. (It did: note 55.)

## What is not changed here

- Nothing visible, and no exported figure.
- The siblings' repositories: they were only read, to choose the names and
  write the adoption steps.

## Tests

- `npm run check`, and the Chromium and Firefox e2e suites. No golden
  changed.
- Before/after comparison in Chromium and Firefox, light and dark, at
  1280×800. The views were the editor with an icon placed, the Templates,
  guide, Export and Attribution dialogs, and the well plate Inspector.
  - Screenshots: all 24 identical pixel for pixel.
  - Computed style of every element (30,108 elements): identical.
