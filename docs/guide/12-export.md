# Exporting

**Export…** in the top bar (or Ctrl+E) opens the Export figure dialog. Choose a format, set the options and choose the **Export** button at the bottom, which is named after the format, for example "Export PDF". The file downloads with the figure's title as its name. When a figure has several pages, the page name is added to the file name.

## Formats

| Format | Use it for                                                                       |
| ------ | -------------------------------------------------------------------------------- |
| PDF    | Vector, fonts embedded. Best for journals and printing.                          |
| SVG    | Vector, editable in Illustrator or Inkscape.                                     |
| PNG    | An image at a set resolution, for slides and the web.                            |
| TIFF   | An image with LZW compression and the resolution recorded, as many journals ask. |

For a journal, send the PDF if they take one, or a TIFF at the dpi they specify.

## Options

**Resolution** (PNG and TIFF) offers 150 dpi (screen), 300 dpi (print), 600 dpi (line art) or Custom, between 36 and 2400. JustFig shows the size in pixels. Images over about 16.7 million pixels are drawn in pieces and joined, so large exports work but take longer, and the dialog says so. Images over 400 million pixels (or 32767 pixels wide) are too large: the dialog says so and disables the button. Lower the resolution, or export a PDF instead. A large picture in a PNG or TIFF is drawn at the pixels it covers at the chosen resolution (a raster cannot hold more), which keeps the export quick; SVG and PDF always hold every pixel of it.

**Transparent background** (PNG and TIFF) leaves the page colour out. Without it the page background, white unless you changed it, is drawn.

**Outline text** (PDF and SVG) turns every letter into a drawn shape. The file then looks the same everywhere without needing fonts, but the text can no longer be edited or searched. Without it the text stays real text in the three built-in fonts (embedded in PDFs). Both apply to text inside imported plots too. PNG and TIFF always show text exactly as on screen.

**All pages** (PDF, only when the figure has more than one page) puts every page in one PDF. SVG, PNG and TIFF export the current page.

**One file per panel, in a zip** exports every panel of the current page as its own file, in the format you chose, all in one zip named after the figure (for example `figure1-panels.zip` holding `figure1_A.svg`, `figure1_B.svg`). Some journals want each panel uploaded separately. Each file is cropped to its panel's frame, so anything that sticks out past the panel's edge is cut off, and the page background is included (or left out for a transparent PNG or TIFF). The files are named by the panel's label (A, B, and so on, with brackets removed). The option is switched off, with the reason shown, when the page has no panels (see [Drawing](02-drawing.md) for the Panel tool). SVG files keep objects that lie wholly outside the panel but hidden by the crop; some editors show them, so use PDF if that matters. The credit line is not drawn under panel files. When it is on and the page needs one, it is added to the zip as `credits.txt`.

**Include credit line under the figure** adds the credit line described below. The note under it shows the line for the current page, or says that nothing on this page needs one. The dialog also shows the page size in your units.

RGB only: journals convert to CMYK, and colours may shift slightly.

## Check before export

The **Check before export** section of the Export figure dialog lists what journals often send back. They are warnings only: you can always export.

- **Small text**: text smaller than 6 pt (5 pt when the journal is Nature), including text inside icons and imported plots at the size it is drawn.
- **Thin lines**: lines thinner than 0.25 pt, which may vanish in print.
- **Low-resolution pictures**: pictures under 300 dpi at the size they are placed. Make the picture smaller on the page, or import a larger one.
- **Overlapping text**: text on top of other text or a panel label, text crossing the edge of a panel (a per-panel export cuts it), a panel label outside its panel, and text running off the page. Text over shapes and pictures is not flagged.
- **Page width**: choose the journal in the **Journal** list (it starts at the journal of the page size you picked, if any). JustFig warns when the page is wider than the journal's widest figure, and then checks the sizes above at the scale the journal will shrink it to. It also warns when the page is just over a column width, for example 95 mm for Nature's 89 mm column.
- **Page height**: JustFig warns when the page is taller than the journal's published maximum figure height (Nature 170 mm, which leaves room for the legend; PLOS 222.25 mm), measured after the journal shrinks a too-wide page. Other journals' heights are not checked yet.

Choose a warning (click it, or Tab to it and press Enter) to close the dialog with the object it is about selected, on its page. When there are more than five of a kind, **Select all** selects them together. With **All pages** on for a PDF, every page is checked.

## Journal page sizes

Set the page size before you draw, with the **Size** list in the Page section of the Inspector. It includes column widths for Nature (1 and 2 columns), Cell (1 column and full width), Science (1, 2 and 3 columns), PNAS (1 and 2 columns), PLOS, and eLife (1 and 2 columns), as well as A4, US Letter and a 16:9 slide. Always check the journal's current guidelines, since they change.

## The credit line

Icons and credited pictures need acknowledgement under their licences. JustFig writes the line for you, such as "Created with JustFig. Icons: Health Icons (CC0); Bioicons: A. Author (CC BY 4.0)." It names each source and author with their licences, and says "modified" for CC BY and CC BY-SA icons that you recoloured.

By default the line is added in small type as a strip under the exported figure, and never overlaps the figure. It is only added when the page uses something that needs a credit. You can switch it off:

- for one export, with the checkbox in the Export dialog,
- for the figure, with **Credit line in exports** in the Inspector's Figure section, or in the Attribution dialog.

Turning it off in the Export dialog also changes the figure's setting. If you turn it off, put the credit in your legend or methods instead.

## Attribution and licences

**Attribution** in the top bar opens the Attribution and licences dialog. It shows:

- the **credit line** for the whole figure, with **Copy** to put it on the clipboard and **Add as text object** to place it on the page as text, at the bottom;
- a table of every icon and credited picture with its source and licence, linked to the originals;
- a warning if any icon is share-alike (CC BY-SA);
- notes on MIT, BSD and Apache icons, whose licence notices must travel with the figure, and on "modified" credits;
- the checkbox to include the credit line under exported figures;
- **Icon library credits**, which opens the full list (see [Icons](07-icons.md)).

If the figure uses no library icons or credited images, the dialog says no credit line is needed.

For how to cite JustFig itself, see [Citing JustFig](15-citing.md).
