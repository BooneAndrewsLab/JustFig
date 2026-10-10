# 41 Sequence snippet

Issue #75: a short DNA, RNA or protein sequence with highlighted residues,
a numbering ruler and a mutation label or primer bar was drawn by hand in a
monospace text box. It is now a procedural kind (note 04), `sequence`.

## Params

Raw JSON, all decoded by the generic decoder from `fields`; no per-kind UI.

- `sequence` text. `fix` cleans it (the decoder only repairs): upper case,
  everything but letters, `-` and `*` dropped (whitespace, FASTA line
  breaks, GenBank position numbers), then cut to 200 residues
  (`MAX_RESIDUES`). The field itself allows 2000 raw characters so a pasted
  entry is not cut before its whitespace is removed. The cap bounds the
  render.
- `first` (int) number of the first residue; `ruler` (bool); `interval`
  (int, 5 to 1000).
- `highlights`: list of `{start, end, color}`; `annotations`: list of
  `{label, start, end, color}`. Positions are residue numbers (counted
  from `first`), ends inclusive, either order, clipped to the sequence.
  One residue is `start == end`. A list was chosen over a text syntax like
  `12-15:#ff0000` because the Inspector, decoder and arbitraries already
  handle lists of records, with colour pickers for free.
- `size` (points). Slots: `text`, `ruler`, `mark` (the colour of
  annotations whose own `color` is empty).

## Layout

Monospace is Cousine (`TextPrim.mono`, which `shapes.ts` maps to the
`cousine` font; part of `textKey`). The pure render cannot measure, so it
uses Cousine's known advance (1229/2048 em) times 1.15 as the column width;
every residue is its own text primitive centred in its column at an
explicit x and one baseline, so nothing depends on browser kerning or
spacing (the Text layout rule).

The row width is the frame width: `max(1, floor(w / cell))` residues per
row. Each row, top to bottom: ruler numbers, annotation levels (greedy
stacking by label extent, level 0 next to the letters), letters. Numbers
sit above the residue they name and are nudged inside the frame at the row
ends; the row's first residue is numbered too unless the next number is
too close. Highlights are rectangles behind the letters and annotations
are a thin bar with end legs (no leg at a wrap) and a label centred over
the segment that holds the annotation's first residue. Fills are merged
into one path per colour, drawn before the text, so the export subset is
respected.

Rows stack downwards from the frame's top, so a frame too small for the
text lets it run out below, and long labels hang out sideways. `overhang`
states that honestly for the bounded-render test: every residue on its own
row, every annotation on its own level, plus the longest label.

## Left out

The complementary strand, codon or reading-frame colouring, alignment of
several sequences, and automatic colour schemes by residue type (Clustal,
hydrophobicity). Highlights cover hand-picked cases.
