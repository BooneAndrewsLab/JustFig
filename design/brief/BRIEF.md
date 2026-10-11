# JustFig logo, icons and app identity: design brief

For a Claude Design project. Everything referenced here is in this package;
the app's repositories are not needed.

## What JustFig is

A free, static, browser-only editor for scientific figures, made for
wet-lab biologists: panels lettered A, B, C, icons of cells and organelles,
arrows, labels, gels, plasmid maps, microscopy strips with scale bars,
exported to SVG, PDF, PNG and TIFF. No account, no upload, figures never
leave the computer. Tagline: "Scientific figures in your browser. Free,
private, offline."

It is the third of three sibling apps by the same author:

- **PlasmidPop**, a DNA sequence editor and plasmid viewer.
- **BarelySig**, a statistics and plotting app.
- **JustFig**, this one.

The two siblings already share a brand family (`references/`). JustFig
must join it so the three read as one set side by side.

## The family rules (follow these)

Taken from `references/plasmidpop/README.md` and
`references/barelysig/README.md`.

**Palette.** Ink `#201e1d` · Ground `#f3f2f2` · Accent red `#ec3013`.
Nothing else in the brand. No gradients, no shadows.

**The mark** is a lowercase first letter built from the product's subject:

- PlasmidPop's "p": stem 11 wide, open bowl r17 at stroke 11, the ring is
  a plasmid; a red feature segment after the gap and three red ticks
  radiating from the opening. `references/plasmidpop/plasmidpop-mark-light.svg`.
- BarelySig's "b": the same "p" flipped vertically, closed bowl, a red
  asterisk (significance stars) just off the bowl's shoulder at two
  o'clock, where PlasmidPop's ticks are.
  `references/barelysig/barelysig-mark-light.svg`.

Shared geometry: 64×64 viewBox, stem 11 wide, bowl r17 / stroke 11, red
elements at stroke 5–7 with square caps, the letter in ink and exactly one
red device. Three variants each: light (ink + red), dark (off-white
`#f3f2f2` + red), on-red (off-white + ink device).

**The lockup.** The mark stands in for the first letter; the rest of the
name is set in Archivo 700, width axis 88, letter-spacing −0.035em,
lowercase, line-height 0.8, with the last syllable in red: "lasmid**pop**",
"arely**sig**". At 64px type the mark is 84–92px tall and the bottom of its
stem sits on the text baseline (BarelySig: mark height 1.32 × font size,
shifted down 10 % with baseline alignment). The font is in
`references/fonts/Archivo[wdth,wght].ttf` (OFL). The apps outline the
wordmark to SVG paths, so the deliverable is geometry, not live text.

**Favicon cut.** A heavier version for 16/32 px: BarelySig uses stem/bowl
14 and asterisk 7, transparent background, ink flipping with
`prefers-color-scheme` via a `<style>` inside the SVG, red constant.
`references/barelysig/barelysig-favicon.svg`.

**App icon.** 512 px ink tile (`#201e1d` square, no rounding in the file;
the OS rounds) with the off-white + red mark centred at ~70 % of the tile.
`references/barelysig/barelysig-app-icon.svg`.

## The ask

### 1. The JustFig mark: a lowercase "j"

"j" in the family grammar: a stem 11 wide with a descender hook (the
bowl's arc, r17 / stroke 11, turning left at the bottom), and a dot. The
red device should come from figure-making. Directions worth exploring, in
rough order of preference:

1. **The dot is a panel label.** A small red square where the j's dot
   goes, like the red "A" tile that labels a figure panel. Simple, reads at
   16 px, and the panel letter is the one thing every JustFig figure has.
2. **The dot is a scale bar.** A short red horizontal bar instead of a
   dot, the microscopy scale bar.
3. **The hook is an arrow.** The descender ends in a red arrowhead, the
   stem becoming the shaft; the dot stays ink.
4. **The dot is a legend swatch pair.** Two tiny squares, one ink one red,
   like a legend key.

Avoid: a pen, a brush, a pencil, a picture frame, a "figure" person. The
siblings' devices are small, flat, geometric and sit at the letter's
shoulder; keep that scale and that flatness.

Test every candidate at 16 px, 26 px (toolbar lockup), 56 px (loading
screen) and 512 px. The "j" has less body than "p" or "b", so the stem and
the hook must carry weight; check it does not collapse into an "i" or a
hook at favicon size.

### 2. The lockup

"ust**fig**" after the mark, same type settings as the siblings. Provide
light and dark lockups like `references/*/\*-lockup-light.html`, and the
wordmark as outlined paths (one path for the ink letters, one for the red
syllable) so the app can ship it without a font. Report the mark's size and
baseline offset relative to the type size as BarelySig's README does.

### 3. Favicon and app icon

- `justfig-favicon.svg`: heavier cut, transparent, ink flips with
  `prefers-color-scheme`, red constant.
- `justfig-app-icon.svg`: 512, ink tile, off-white + red mark. Also a
  maskable-safe version if the mark would be clipped at 80 % safe zone.

### 4. Tool palette icons (16 px line set)

JustFig's tool column currently uses Unicode glyphs. PlasmidPop draws its
own 16-unit line icons instead (`references/plasmidpop/SidebarIcon.tsx`):
stroke 1.4, round caps and joins, `currentColor`, no fill, one `<path>` per
icon, drawn for recognising a tool at a glance (the word stays in the
tooltip). Draw the same kind of set for these ten tools, in this order:

| id      | tool        | what it does                                                |
| ------- | ----------- | ----------------------------------------------------------- |
| select  | Select      | pick and move objects, drag handles                         |
| hand    | Pan         | drag the canvas around                                      |
| rect    | Rectangle   | draw a rectangle                                            |
| ellipse | Ellipse     | draw an ellipse or circle                                   |
| line    | Line        | draw a straight line                                        |
| pen     | Pen         | click corners, drag curves, Enter to finish (a bezier path) |
| arrow   | Arrow       | draw an arrow, which can bind to objects at either end      |
| text    | Text        | place a text label                                          |
| panel   | Panel       | draw a lettered figure panel (A, B, C…)                     |
| note    | Review note | pin a review comment on an object or a point                |

Plus six chrome glyphs in the same style, used where a word does not fit:
undo, redo, zoom in, zoom out, close (tab ×), add (tab +).

Deliver as a single SVG sheet for review and as a list of `d` strings (one
per icon, 16×16 viewBox) for the code. Rendered size in the app is 16 px
inside a 34×34 button; also check them at 15 px and 20 px.

### 5. Optional: a figure-flavoured empty card illustration

PlasmidPop's start screen is a dashed card with text only. If a small ink

- red line drawing (a two-panel figure with labels A and B, 120 px wide)
  helps the Templates dialog, propose one; otherwise skip.

## Deliverables and naming

Match the siblings so the three `design/logo/` folders look alike:

```
justfig-mark-light.svg       ink + red, 64×64
justfig-mark-dark.svg        off-white + red
justfig-mark-on-red.svg      off-white + ink device
justfig-favicon.svg          heavier cut, prefers-color-scheme ink
justfig-app-icon.svg         512 ink tile
justfig-lockup-light.html    mark + wordmark, self-contained
justfig-lockup-dark.html
justfig-wordmark-paths.svg   outlined "ust" (ink) and "fig" (red)
justfig-tool-icons.svg       16-px sheet
justfig-tool-icons.md        the d strings, one per id
README.md                    geometry, sizes, palette, where each file is used
```

SVGs: plain, no editor metadata, no C2PA block, no `<defs>` unless
needed, hex colours inline. The app strips everything else.

## Where it will be used

- Top bar lockup at 26 px height, top-left, next to the figure title
  (`screens/plasmidpop-open.png` shows the sibling's placement).
- Loading screen: mark at 56 px over the name, then the editor replaces it.
- Favicon and PWA icons (192, 512, maskable).
- README, GitHub social preview, a future landing page.
- Guide header: "JustFig guide · Version x.y.z".

## What to retire

`current/justfig-favicon-current.svg` is the present mark: four Okabe-Ito
shapes (blue square, orange circle, green square, pink triangle) on a dark
rounded square. It is a figure-palette joke, not a family mark, and it
goes. The Okabe-Ito colours stay inside the app as the default figure
palette; they are not brand colours.

## Screens in this package

- `screens/plasmidpop-home.png`, `plasmidpop-open.png`, `plasmidpop-help.png`
- `screens/barelysig-home.png`
- `screens/justfig-home.png`, `justfig-guide.png`

They show the lockup placement, the "?" help button, the teal UI accent
PlasmidPop uses for controls (`#1b6e8c`; JustFig will adopt it), and how
far JustFig's chrome currently is from the family.
