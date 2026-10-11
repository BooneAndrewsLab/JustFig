# 51 Tokens: the family palette, teal accent and Archivo UI

2026-10-10. Step 2 of `DESIGN.md`, plus its two open decisions: the UI font
is Archivo UI as BarelySig ships it, and dark mode will follow the system
setting with no toggle (step 5, not built here).

## What

- **Palette** (`src/ui/theme.css` `:root`): ink `#201e1d`, ground `#f3f2f2`,
  brand red `#ec3013` (`--brand-red`, logo only). Secondary text `--ink-2`
  `#57524f` (BarelySig's), `--ink-3` `#6f6966`; rules `#dcd9d7` /
  `#c4c0bd`, pasteboard `#e6e4e3`, all warm greys from the new ink.
- **Accent:** PlasmidPop's teal `#1b6e8c` for primary buttons, pressed
  states, focus and the current tab (`--accent-soft` is its 12% tint).
  Red is never a control colour, so it never reads as an error.
- **Metrics:** 14px/1.45 base on `body` (so `rem` stays 16px, as in
  PlasmidPop), radius 6px, dialogs 10px, dialog padding `20px 22px`,
  title 16/600, `Dialog wide` → `.dialog--wide` 52rem for the guide; menu
  and popover shadow `0 6px 24px rgb(0 0 0 / 18%)`; focus ring
  `2px solid var(--accent)` offset 2px. Section headers (inspector
  sections, icon-browser groups, the objects shelf, key-binding groups) are
  13px/600 sentence case; the source strings already were.
- **UI font:** `public/fonts/archivo-ui.woff2`, BarelySig's file unchanged
  (37.9 kB, variable weight 380–720, `font-display: swap`), with its OFL
  licence beside it and a section in `public/fonts/README.md`. It is
  preloaded as a font next to the layout TTFs (`fontPreloads`,
  `vite.config.ts`) and precached by the service worker. The figure fonts
  (`public/fonts/*.ttf`, opentype.js) are untouched.
- **Canvas overlay colours** are tokens too: `--select` (Okabe-Ito blue
  `#0072b2`, kept), `--select-wash`, `--handle`, `--snap-guide`,
  `--bind-target`, `--page-edge` and the note-marker colours. The SVG in
  `Canvas.tsx`, `NodeOverlay.tsx`, `Rulers.tsx`, `NoteMarkers.tsx` and the
  well-map editor reads them through `OVERLAY` (`src/ui/canvas/overlayPaint.ts`)
  as `var()` in `style`, because SVG presentation attributes do not resolve
  `var()` in every engine.
- **Top bar:** its text buttons do not wrap and are 7px a side, the group
  rules 5px, so it stays one 39px row at 1280×720 with Archivo and with the
  wider system fallback (measured in Chromium and Firefox).

## Why

The three apps should read as one set (`DESIGN.md` §1); the old cool greys
and the blue accent were JustFig's own. Every colour in a rule now goes
through a custom property, so dark mode (step 5) is one redeclared block,
not a hunt through the sheet and the canvas components.

Contrast (WCAG AA, 4.5:1 for text): ink 16.6:1 on the panel, 14.9:1 on the
ground; `--ink-2` 7.7:1 / 6.9:1; `--ink-3` 5.4:1 / 4.8:1, so it may carry
text, unlike the old `#9aa5b1`; teal 5.7:1 / 5.1:1, white on teal 5.7:1.

## What is not changed here

Exported figures: tokens are chrome only, and the export goldens did not
move. The default dialog width stays 560px rather than PlasmidPop's 26rem,
since JustFig's dialogs hold previews and tables. The loading screen keeps
its inline system-font styles (it paints before the stylesheet). Small
11–12px secondary sizes are kept. The logo, "?" help, text Undo/Redo and
dark mode are other steps.

## Tests

- `npm run check` and the Chromium and Firefox e2e suites, including axe in
  `e2e/a11y.spec.ts`, pass; no golden changed.
- The snap-guide e2e check finds guides by `data-snap-guide` rather than by
  their stroke colour, which now lives in a token.
