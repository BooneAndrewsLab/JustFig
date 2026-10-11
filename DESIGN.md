# JustFig design plan: one family with PlasmidPop and BarelySig

Written 2026-10-10 from a side-by-side of the three apps' code and builds
(PlasmidPop 1.13.0, BarelySig, JustFig 0.1.0). It records what the family
already agrees on, where JustFig diverges, what it adopts, what it keeps,
and in which order. Decisions marked **open** need a call before the step
that depends on them. The logo and icon work is briefed separately in
`design/brief/` (a package for Claude Design).

## 1. The family baseline

PlasmidPop and BarelySig already share a brand, each in its own
`design/logo/README.md`:

- **Palette:** ink `#201e1d`, ground `#f3f2f2`, accent red `#ec3013`.
- **Mark:** a lowercase letter built from the product's subject (PlasmidPop's
  "p" is an open plasmid ring with a red feature segment and three red ticks;
  BarelySig's "b" is that "p" flipped, with a red asterisk at two o'clock).
  64×64 viewBox, stem 11 wide, bowl r17 at stroke 11, no gradients.
- **Lockup:** the mark stands in for the first letter; the rest of the name
  is set in Archivo 700, width axis 88, letter-spacing −0.035em, lowercase,
  with the last syllable in red ("lasmid**pop**", "arely**sig**"). The
  wordmark is pre-outlined to SVG paths in the app (`Logo.tsx` +
  `logoWordmark.ts`), so no web font is needed for the logo.
- **Files per app:** `<app>-mark-light.svg`, `-dark.svg`, `-on-red.svg`,
  `-favicon.svg` (heavier cut, ink flips with `prefers-color-scheme`),
  `-app-icon.svg` (512, ink tile), `-lockup-light/dark.html`.
- **Chrome conventions:** logo lockup top-left at ~26px, document name
  beside it; a round 28px "?" button at the far right of the top bar opens
  the in-app guide; the version is shown only in the guide header; Undo and
  Redo are text buttons; dialogs are `role=dialog` with backdrop click and
  Escape to close and focus returned; shortcuts appear in `title` text;
  native controls, no component or icon library; one global plain-CSS
  sheet with custom-property tokens.

Where the two siblings still differ (so the family has not decided):

|            | PlasmidPop                                    | BarelySig                                         |
| ---------- | --------------------------------------------- | ------------------------------------------------- |
| UI accent  | teal `#1b6e8c` (brand red only in the logo)   | red for focus/active, ink tints for selection     |
| UI font    | system stack                                  | Archivo UI (self-hosted subset, variable 380–720) |
| Base size  | 14px / 1.45                                   | 14px / 1.4                                        |
| Radius     | 6px, dialogs 10px                             | 4px                                               |
| Dark mode  | yes, `color-scheme: light dark` + media query | no                                                |
| Side panel | right, 330px, 30px vertical rail of tabs      | left, 250px, sections                             |

## 2. Where JustFig stands (0.1.0)

|                 | Family                                             | JustFig                                                                                            |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Brand in chrome | logo lockup                                        | bold text "JustFig" (`App.tsx` top bar)                                                            |
| Mark            | ink + red letter                                   | four Okabe-Ito shapes on a dark rounded square (`public/favicon.svg`, `index.html` loading screen) |
| Ink / ground    | `#201e1d` / `#f3f2f2`                              | `#1f2933` / `#f4f5f7`                                                                              |
| UI accent       | teal or red                                        | Okabe-Ito blue `#0072b2`, also the canvas selection colour                                         |
| Font            | 14px                                               | system 13px                                                                                        |
| Radius          | 6 / 4                                              | 5px, dialogs 8px                                                                                   |
| Help            | round "?"                                          | "Guide" and "Shortcuts…" text buttons                                                              |
| Undo / Redo     | text                                               | ↶ ↷ glyphs                                                                                         |
| Version         | guide header                                       | status bar, `v0.1.0`                                                                               |
| Dialog          | 20/22px padding, 26rem, title 16/600               | 16/18px, 560px, title 16                                                                           |
| Section headers | 13px/600 sentence case (PP), 11px uppercase (BS)   | 11px uppercase                                                                                     |
| Tool icons      | PP: own 16px line SVGs, stroke 1.4, `currentColor` | Unicode glyphs `↖ ⇄ ▭ ◯ ╱ ✒ → T ⊞ ✎`                                                               |
| Dark mode       | PP yes                                             | no                                                                                                 |

Everything lives in `src/ui/theme.css` (tokens at lines 7–25) plus a few
hard-coded hex values in `src/ui/canvas/Canvas.tsx`, `NodeOverlay.tsx`,
`Rulers.tsx` and `NoteMarkers.tsx`.

## 3. Decisions

### JustFig adopts

1. **The brand palette and lockup.** Ink `#201e1d`, ground `#f3f2f2`,
   red `#ec3013`; a lowercase "j" mark (see the brief) standing in for the
   "j" of "ust**fig**", Archivo wordmark outlined to paths. `BRAND.themeColor`
   becomes the ink, `backgroundColor` the ground. The Okabe-Ito mark is
   retired from the favicon, the loading screen and the manifest.
2. **PlasmidPop's teal `#1b6e8c` as the UI accent.** Red stays a brand
   colour, not a control colour, so it never reads as an error next to the
   figure (BarelySig's own reasoning, `theme.css` header). The canvas
   selection, handles and node overlay keep Okabe-Ito blue `#0072b2`: that
   is a figure-space colour and must stay distinguishable from any icon.
3. **Tokens:** 14px base, radius 6px (dialogs 10px), PlasmidPop's dialog
   proportions (`20px 22px` padding, title 16/600, `.dialog--wide` 52rem for
   the guide), menu shadow `0 6px 24px rgb(0 0 0 / 18%)`, focus ring
   `2px solid var(--accent)` offset 2px. Section headers 13px/600 sentence
   case as in PlasmidPop (BarelySig's uppercase is the minority).
4. **Chrome conventions:** round "?" help button at the far right of the
   top bar (opens the guide; Shortcuts… becomes a guide page with the
   rebinding table, reachable from the "?" menu or the guide nav); text
   Undo / Redo; version moves from the status bar to the guide header;
   Attribution stays a top-bar button (it is a JustFig-specific obligation);
   Export… stays the one primary button, as Open file is in PlasmidPop.
5. **Tool and chrome icons** drawn as 16-unit line SVGs with stroke 1.4,
   round caps, `currentColor`, in one `src/ui/icons.tsx` like PlasmidPop's
   `SidebarIcon.tsx`, replacing the Unicode glyphs in `tools.ts`. The word
   stays in the tooltip; the glyph is for recognising a tool at a glance.
6. **Empty and recent cards:** the Recent dialog and the New-tab start take
   PlasmidPop's `EmptyState` card (dashed 1.5px rule, radius 10, 32px
   padding, lead 17/600). JustFig keeps "no start screen" (note 25): the
   card appears only inside Recent… and Templates….

### JustFig keeps

- **The four-column editor** (icon browser 220 · tools 44 · canvas · inspector 260) with figure tabs under the top bar and page tabs under the canvas. A
  figure editor needs the tool column and a visible icon browser; the
  vertical rail is right for PlasmidPop's analysis tabs, not for this.
- **Okabe-Ito** as the figure palette default and as the canvas overlay
  colours. The brand and the figure palette are different things.
- **The guide, shortcuts, dialog and accessibility machinery** (note 09):
  only the skin changes.

### Open (decide before step 2)

Decided 2026-10-10: Archivo UI as BarelySig ships it (note 51); dark mode
yes, following the system setting, no toggle (step 5).

- **UI font.** Recommended: Archivo UI, as BarelySig ships it (subset
  `public/fonts/archivo-ui.woff2`, `font-weight: 380 720`, `font-display:
swap`) and the wordmark is Archivo already; PlasmidPop would follow later.
  Costs one ~40 kB font on first paint (note 49 budget) and a re-measure of
  the top bar. Alternative: all three stay on the system stack and BarelySig
  drops its font.
- **Dark mode.** Recommended: yes, PlasmidPop's way (`color-scheme: light
dark`, media query redeclaring the tokens, no toggle). The canvas page
  stays white in both schemes; the pasteboard and chrome flip. It doubles
  the token table and needs an e2e golden per scheme. If BarelySig will not
  get it, skip it here too so the family stays at one level.

## 4. Steps

Each step is one PR, `npm run check` and e2e green, guide updated where UI
changes (the guide test enforces it), and a design note in `docs/design/`
(next free number is 50) recording what changed and why.

1. **Logo and icons from the brief** (`design/brief/`, run in Claude Design).
   Land the exports in `design/logo/` with a README like the siblings',
   then: `public/favicon.svg`, PWA icons (`scripts/make-icons.sh` ported
   from PlasmidPop), `index.html` loading screen, `src/ui/Logo.tsx` +
   `logoWordmark.ts` (outlined wordmark, ink via `currentColor`),
   `BRAND.themeColor/backgroundColor`. `src/brand.test.ts` must keep
   passing: the lockup carries no text node, only paths.
2. **Tokens** in `src/ui/theme.css` (and the four TSX files with literals):
   palette, accent, base size, radii, shadows, focus ring, dialog metrics,
   section headers. Update e2e goldens (`UPDATE_GOLDEN=1`, Chromium) and
   check axe contrast on the new `--ink-2`/`--ink-3`.
3. **Top bar:** logo lockup, round "?" help, text Undo/Redo, version in the
   guide header, Shortcuts folded into the guide. `keyBindings.ts` gains a
   `help` fixed key `?` like PlasmidPop. Guide pages updated.
4. **Tool icons:** `src/ui/icons.tsx`, `tools.ts` drops `glyph`, tool
   palette buttons 34×34 with a 16px icon. Also undo/redo/zoom/close/add
   glyphs where a text label would not fit.
5. **Dark mode** (if decided): second token block, `index.html`
   `color-scheme` meta, favicon ink flip, canvas pasteboard token, e2e
   golden per scheme.
6. **Family base sheet.** Extract the shared tokens and the button, input,
   dialog, menu, tab and status-bar rules into `theme-base.css`, copied
   verbatim into each sibling repo with a header naming the source commit.
   Not a package: three static apps, no monorepo, and each app's own layer
   stays in its own `theme.css`.

## 5. Not doing

- No component library, no icon dependency, no Tailwind: the family's
  reason (nothing of anyone else's licence ships) holds.
- No menubar. PlasmidPop's File / Format / Edits menus suit a document
  editor with many commands; JustFig's commands live in the inspector and
  the tool palette, and the top bar stays flat.
- No shared npm package until a fourth app makes copying hurt.

## 6. Progress

- 2026-10-10: step 1 (logo, favicon, PWA icons, loading screen, brand colours) and the
  tool-icon part of step 4 landed; note 50. The chrome glyphs for undo, redo, zoom, close
  and add are in too, pending step 3's text Undo/Redo.
- 2026-10-10: step 2 (tokens: family palette, teal accent, 14px base, radii, dialog metrics,
  shadows, focus ring, sentence-case section headers, canvas overlay colours as tokens) and the
  Archivo UI font landed; note 51.
- 2026-10-10: step 3 (round "?" help, `?` a fixed key, Change shortcuts as a guide page,
  text Undo/Redo, version in the guide header); note 52.
- 2026-10-10: step 4 finished: the tool palette was already 34×34 with 16px icons (note 50);
  an e2e now checks it, and only zoom, tab close and new tab keep chrome icons; note 52.
