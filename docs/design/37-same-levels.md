# 37 Same levels

Issue #68: levels apply to one picture (note 27), but compared panels (treated vs control) must
share one display range, and journals ask how images were adjusted.

- **Same levels** beside Same width in the Inspector (two or more pictures selected): the first
  selected picture's levels and inversion are copied to the other selected pictures (`cropTargets`:
  pictures, and pictures directly inside selected groups; other objects are ignored). Levels and
  inversion are one adjustment state, so both are copied. If the first picture has none, the others
  are reset to their originals: "same as the first" includes "unadjusted". Pictures that already
  match are skipped; with none left to change the edit is not made.
- **Edit.** `matchLevels` (`core/edits/levels.ts`) applies `setLevels` per target, so each picture is
  baked from its own unadjusted pixels (`levels.base`) and crops are re-baked; one undo step. The
  baking is async and done in the Inspector (as for the Levels section), the edit stays pure.
- **Export check** `image-levels` (`checkLevels` in `export/checks.ts`): one warning per panel whose
  visible pictures (through groups, not nested panels) do not all share the same levels or
  inversion. Clicking selects those pictures. Pictures outside any panel are not compared.
- **Image adjustments statement** (`adjustmentsStatement` in `export/adjustments.ts`), shown in the
  Export dialog with a Copy statement button (analytics `export` / `copy-adjustments`). Derived,
  never stored; empty when no picture has levels or inversion. It names panels by their letter in
  reading order, says the levels are a linear stretch of black and white points over the whole
  image, and lists the panels whose pictures were not adjusted. It claims nothing the model cannot
  know: no gamma (there is none), and no "no other adjustments" (a channel merge has its own display
  ranges, note 21, not covered here).

## Known limits

- A panel counts as adjusted when any of its pictures is (the check flags mixed panels).
- Channel display ranges are not part of the statement.
