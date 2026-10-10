# 34 Legend text

Issue #70. A figure legend restates what the figure already knows: the panel
letters, the scale bar lengths, the channel names, the picture credits.
**Copy legend** in the Attribution dialog (next to the credit line) puts a
skeleton of it on the clipboard.

## What it derives from

`legendText(figure)` in `src/export/legend.ts` is pure and stores nothing,
like `creditLine`. For each page, in order:

- **Panels** in reading order (`readingOrder`), labelled by `panelLabels` in
  the document's label format: `A. Title`, `(b) Title`. The title is the
  panel's topmost (then leftmost) text object with words in it, found through
  groups but not in nested panels, paragraphs joined by spaces. No text: the
  letter alone, a stub to fill in.
- **Scale bars** (`scaleBar` objects, `length` in µm, written by
  `lengthLabel`): "Scale bars, 10 µm." with equal lengths said once, "Scale
  bar" for one. Different lengths: "Scale bars, 10 µm (A) and 50 µm (B)." naming
  the panels the bars sit in.
- **Channels** of merges (`Image.channels`, note 21): the enabled ones, each
  name once in order of first use, taken from the channel picture's file name
  without its extension (a channel has no name of its own).
- **Pictures' credits** (the Credit field, as `docCreditItems` reads it):
  "Images: credit; credit." once each. Library icons are not repeated; the
  credit line covers them.

Nothing is written when there is nothing to say; the dialog then says so.

## What it leaves out

- Anything about the experiment (n, statistics, conditions) and the
  figure title: the skeleton only restates the figure.
- Per-panel channel or credit lists, and a colour name per channel: the
  figure shows them; the names are the file names, which the user may want
  to edit.
- Text other than the title (axis labels, annotations).
- Pages are concatenated, panel letters restarting per page as on the page.
- No export, no "Add as text object": it is a clipboard action only.
