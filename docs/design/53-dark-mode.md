# 53 Dark mode: the chrome follows the system setting

2026-10-10. Step 5 of `DESIGN.md`. Decided with step 2 (note 51): dark
mode follows `prefers-color-scheme`, with no toggle, PlasmidPop's way.

## What

- **Tokens:** `:root` declares `color-scheme: light dark`, so native
  controls (selects, checkboxes, scrollbars, number spinners) follow, and a
  `@media (prefers-color-scheme: dark)` block in `src/ui/theme.css`
  redeclares the chrome tokens. Warm greys from the same ink: ink `#f3f2f2`
  (the favicon's dark ink), ground `#1a1918`, panel `#242221`, pasteboard
  `#141312` (darkest, so the white page stands out), rules `#3a3735` /
  `#5c5754`, `--ink-2` `#c4bfbc`, `--ink-3` `#a29c98`. Accent is
  PlasmidPop's dark teal `#5fb0d0` with `#0e1620` on it; warning `#e0a458`,
  error `#ff8a80` (PlasmidPop's); backdrop and shadows darker.
- **Figure stays light:** the canvas page is the figure and keeps its own
  colour. Overlay colours drawn over the page (selection Okabe-Ito blue,
  handles, snap guides, bind targets, notes) are unchanged; only the
  pasteboard-side ones move: `--page-edge` `#6f6966`, the page shadow (new
  `--page-shadow`, was a literal in `Canvas.tsx`), and a page with no
  background now has `--page-under` drawn beneath it (transparent in light,
  the light pasteboard `#e6e4e3` in dark) so black ink stays visible.
- **Previews of figure content sit on light tiles** (`--figure-tile`,
  `--thumb-tile`, `--thumb-tile-hover`; `#e6e4e3`/white in dark, unchanged
  in light): icon browser tiles, the objects shelf thumbnails, template,
  example and preset cards, Recent figures and Saved versions thumbnails,
  and the versions compare pictures. The large icon preview, crop, inset
  and PDF previews already used `--paper`; the channels preview keeps black.
  The pages bar and layers panel show names, not pictures.
- **index.html:** `<meta name="color-scheme" content="light dark">`, two
  `theme-color` metas by media (the ground of each scheme), and the inline
  loading screen reads its colours from its own small light/dark variable
  block, with the mark's ink as `currentColor`, so a dark system gets no
  white flash before the stylesheet loads.
- The logo lockup's ink is `currentColor` and flips; its red square is a
  literal and stays red. The favicon already flipped (note 50).

## Why

A figure editor is used for hours, often next to dark-mode tools, and the
family has it (`DESIGN.md` §1). Following the system keeps it to one token
block and no setting to store. The figure is not chrome: its colours are
chosen for paper, so the page and every picture of figure content stay on
light ground, or a black icon would vanish on a dark tile.

Contrast (WCAG AA): ink 14.2:1 on the panel, 15.7:1 on the ground;
`--ink-2` 8.7:1 / 9.6:1; `--ink-3` 5.8:1 / 6.5:1; accent 6.5:1 / 7.2:1,
`--accent-ink` on accent 7.5:1. The selection blue is 3.6:1 against the
dark pasteboard, enough for a graphic outside the page.

## What is not changed here

Exported figures: tokens never reach `nodeToSvgString`; no export golden
moved. No toggle and no stored preference. Okabe-Ito swatches, palette
colours and procedural colours are figure colours and stay as they are.
Guide links keep the browser's link colours, which follow `color-scheme`.

## Tests

- e2e `dark.spec.ts` (`colorScheme` per describe): in light the root
  background is the light ground; in dark it is `#1a1918` while the page
  rect stays `#ffffff` and an icon tile is the light tile; axe (moved to
  `e2e/helpers.ts` as `audit`) finds no serious or critical problems in
  dark on the editor with an icon placed, the icon preview, the Templates,
  guide, Export, Attribution, Recent and Versions dialogs and the well
  plate Inspector. `E2E_OUT=<dir>` saves a screenshot of each.
- The repo has no chrome screenshot goldens, so none were added.
- Guide: Getting started gains "Light and dark".
