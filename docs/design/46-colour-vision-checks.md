# 46 Colour-vision checks

Issue #69: the vision preview (note 07) is screen-only, so a figure whose two groups become one
colour for 1 reader in 12 men passes every export check. Three rules in the export check (note 03)
catch it. All are pure and live in `export/colourVision.ts` (maths) and `export/checks.ts` (rules).

## One set of matrices

`CVD_MATRIX` (Machado, Oliveira & Fernandes 2009, full severity, applied in linear RGB) is the single
source: the canvas's `VisionFilters` builds its `feColorMatrix` values from it (`cvdFilterValues`),
and `simulateLab` applies the same rows to the swatch, so the check and the preview agree.
Greyscale is relative luminance (the preview's `saturate 0`).

## Metric and thresholds

Distance is CIE76 ΔE (Euclidean in CIE L*a*b*, D65). Simple, standard, and enough for "alike or not".

- **Told apart normally**: ΔE >= 25 (`DISTINCT_DE`). Pairs already close are the user's choice.
- **Confused** under a deficiency: simulated ΔE < 12 (`CONFUSED_DE`).
- **Greyscale**: told apart in colour (ΔE >= 25) but lightness differs by ΔL* < 8 (`GREY_DL`).

12 was chosen against the built-in palettes at full severity: Okabe-Ito (worst pair 16), Tol
bright (13), muted (16), vibrant (13) and viridis stay quiet; IBM's pink/orange under tritanopia
(9) and the "classic" tab10 orange/green under protanopia (4.6) warn. A higher threshold would
flag the palettes the app recommends. Full severity is the worst case; milder forms are not tested.

## Rules

- `colour-confusion` (`checkColourConfusion`): scopes are each lettered panel (through groups, nested
  panels their own scope) and the page outside panels. In a scope, collect the _linked swatches_
  used by fills, strokes, text colours and icon/procedural slot overrides of visible objects (fixed
  `{hex}` colours are a deliberate choice and ignored, as palettes never recolour them). Test every
  pair under all three deficiencies. One warning per scope, for the worst pair (smallest simulated
  ΔE), naming both swatches, the deficiency and how many other pairs are alike. Clicking selects the
  objects using either swatch.
- `colour-greyscale` (`checkGreyscale`): same scopes and swatches, worst pair by ΔL*, one warning per
  scope.
- `channels-red-green` (`checkRedGreenMerge`): a visible picture whose _on_ channels (note 21)
  include a red and a green, by hue test in HSV (saturation and value >= 0.5; red within 20 degrees
  of 0, green 75 to 165 degrees), so #ff0000 with #00ff00 warns and magenta with green does not.
  Suggests magenta and green. Clicking selects the picture.

Cost: n swatches per scope, n^2 pairs x 3, a few microseconds each; the checks are not memoised
(neither are the others; the dialog computes them when opened).

## Tests

`colourVision.test.ts`: Lab against known values, neutrals unchanged, confusable and safe pairs,
greyscale pairs, hue tests. `checks.test.ts`: per-panel scoping, hidden and fixed colours skipped,
selection ids, greyscale, channel merges. E2E (`export-checks.spec.ts`): the classic palette applied
to an example yields the warning and clicking it selects the objects.
