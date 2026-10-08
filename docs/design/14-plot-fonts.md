# 14 Fonts inside imported plots

Imported SVGs and PDFs (notes 12 and 13) keep their labels as `<text>` in the font the plotting
library named: DejaVu Sans from matplotlib, Arial from svglite, Helvetica from R's `pdf()`,
Liberation Sans from cairo. Before issue 23 that text went through to the screen and every export
unchanged, so it was drawn in whatever the viewer had installed, PDF text mode fell back to
svg2pdf's standard font, and outline mode left it as text. Now it goes through our own text
layout like every other text (note 03).

- **When: at render time.** `svgImportNode(svg, w, h, textMode)` runs
  `layoutImportedTexts` (`src/render/importedText.ts`) on the parsed asset, cached per SVG
  string and text mode. The stored asset is not rewritten: it keeps the plot's own `font-family`,
  `font-weight`, `font-style`, `font-size` and `text-anchor`, so the asset stays what the plot
  file said (re-sanitising it gives it back unchanged, note 12), old figures need no migration,
  and the mapping can improve later without touching saved files. Restyling plot text (issue 11)
  and resizing a plot without scaling its text (issue 3) edit those stored attributes (or
  per-object overrides of them) and every label is still a `<text>` element with its own
  position and font, so they stay identifiable; the renderer maps whatever they say. The
  same applies to every `svgImport` asset: BarelySig and PlasmidPop fragments and procedural
  snapshots are laid out the same way.
- **Mapping** (`src/io/svg/plotFonts.ts`, pure and table-driven): the first family of the
  `font-family` list decides, since it is the font the plot was drawn with and the rest are the
  author's fallbacks. Monospace names (`mono`, Courier, Consolas, Menlo…) → Cousine, checked
  first so "DejaVu Sans Mono" is mono; serif names (Times, Georgia, Garamond, Palatino, STIX,
  Computer Modern, `cmr10`, "… Serif", `serif`) not containing "sans" → Tinos; everything else,
  including unset and unknown families → Arimo. A browser would draw an unset family in its
  default serif, but plotting libraries that leave it unset draw sans. Bold is `bold`, `bolder`
  or 600–900; italic is `italic` or `oblique`. Arimo, Tinos and Cousine are metric-compatible
  with Arial/Helvetica, Times and Courier, so those plots keep their exact label widths.
  DejaVu Sans (matplotlib) and Verdana are about 11 % wider than Arimo, so their labels get
  shorter; the alternative (scaling glyphs or letter-spacing to the source width) would distort
  the font, and the source width is only known at import (note 15) and not stored.
- **Layout** of one `<text>`: characters in document order through nested `<tspan>`s, with
  whitespace collapsed as browsers do (newlines and tabs are spaces, runs of spaces become
  one, leading and trailing spaces go) unless `xml:space="preserve"`. A chunk starts at the
  first character and at every character with a listed `x` or `y` (the innermost element whose
  list covers it, as in SVG); characters advance by opentype.js advance widths, kerning off; each
  chunk is shifted by its own `text-anchor` and its measured width. Consecutive characters with
  the same font, size and tspan paint form one segment. The anchor point is kept, so a label
  the plot centred stays centred and a start-anchored one keeps its left end. matplotlib's
  path-glyph SVGs and all PDFs write every label start-anchored; import infers the anchor the
  plot meant (note 15), so their centred and right-aligned labels hold under the narrower font.
- **Output** is the same shape as `textNodes` writes for our own text, so both modes come from
  one layout and match. Text mode: `<text xml:space="preserve">` keeping the original's
  `transform` and paints, with one `<tspan>` per segment carrying explicit `x`, `y`, the bundled
  `font-family` (`Arimo`, `Tinos` or `Cousine`, which PDF export embeds), size, weight and style,
  and tspan paints. Outline mode (screen, PNG, TIFF, and SVG/PDF with **Outline text**): one
  `<path>` of glyph outlines per segment, in a `<g>` carrying the text's `transform` and paints
  (dropped when there are none). `font-*` and `text-anchor` attributes elsewhere in the tree are
  removed since nothing reads them any more. No new element or attribute enters the export
  subset; `dx`/`dy`, `textLength` and letter spacing are already dropped by the sanitiser.
- **Measuring at import.** Merging split text (note 12) still judges gaps with the width
  estimate of the _source_ font (Helvetica metrics, ×1.12 for DejaVu), because that is the font
  the pieces were positioned with. Cropping now measures labels in the font they will be drawn
  in (`bundledFont`: Helvetica metrics for Arimo, ×0.9 for Tinos, 0.6 em for Cousine), so a
  matplotlib plot's crop no longer leaves room for DejaVu's wider labels. Both stay estimates,
  so an import does not depend on whether fonts are loaded.
- **Characters the fonts lack** (the bundled fonts cover Latin, Greek and scientific symbols)
  draw as the fonts' missing-glyph box, as in our own text.
- **Tests:** `src/render/importedText.test.ts` covers the mapping table, anchors, position lists,
  tspans, whitespace and the wrapper, and runs the matplotlib (path glyphs and `fonttype: none`),
  svglite and PDF (matplotlib Type 3 and TrueType, R `pdf()`, `cairo_pdf()`) fixtures through
  both modes: only bundled families in text mode, no text in outline mode, every tspan's glyph
  path present in the outline rendering, the stored asset still naming the plot's font, and a
  golden file of the text-mode labels per fixture in `src/render/__golden__/plots/`.
  `src/export/pdf.spike.test.ts` exports a matplotlib plot to PDF: text mode uses only embedded
  Arimo, outline mode embeds no font and shows no text.
