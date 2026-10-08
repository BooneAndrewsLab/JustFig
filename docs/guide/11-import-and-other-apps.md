# Importing and other apps

## Import…

**Import…** in the top bar places a picture on the page. Choose an SVG, PDF, PNG or JPEG file. You can also drag a file from your computer onto the canvas to drop it where you want it, or paste an image from the clipboard (Ctrl+V).

- A **PNG or JPEG** is kept as a picture at its original quality. A very large image is scaled down to at most about 106 mm on its longer side when it is placed; resize it afterwards as you like.
- An **SVG** stays vector, so it remains sharp at any size and in every export. JustFig cleans it as it imports it, removing anything that is not plain drawing, such as scripts. If something had to be changed, a warning appears in the status line.
- A **PDF** page is turned into the same kind of vector drawing as an SVG, so its lines, shapes and text stay sharp (see "PDF plots" below).

### Plots from matplotlib and R

SVG plots saved from matplotlib (`savefig("plot.svg")`) or R (`ggsave("plot.svg")`, or the `svg()` device) are tidied up as they are imported:

- The white page behind the plot is removed, so the plot sits directly on your figure. A coloured background is kept.
- Empty margins around the plot are trimmed, so the placed size is the size of the drawing.
- Axis labels, tick labels and titles that matplotlib saved as letter shapes become real text again, and text split into separate words or letters is joined back into whole labels.
- Unnecessary grouping inside the file is removed. The plot looks the same.

Text inside an imported plot or drawing is shown in the built-in font closest to the one it names: Arimo for Arial, Helvetica, DejaVu Sans (matplotlib's default), Liberation Sans and other sans-serif fonts; Tinos for Times and other serif fonts; Cousine for Courier and other monospaced fonts. It therefore looks the same on every computer, in every export, and is outlined with the rest of the figure when you export with **Outline text**. The file keeps the font names it came with. DejaVu Sans is a little wider than Arimo, so a label from matplotlib comes out slightly shorter. Labels keep their alignment: a tick label or axis title the plot centred stays centred under its tick or axis, and a tick label that ended at its tick still ends there, even when the plot file (matplotlib's default SVG, or any PDF) only saved where each label starts. A label JustFig cannot place with confidence, such as a legend entry, keeps its left end. Mathematical labels (written between `$` signs in matplotlib) keep their letter shapes. Plots from R's `svg()` device keep their letter shapes too, because that device does not save which letters they are; save with `ggsave()` or the svglite package to get real text.

### PDF plots

Plots saved as PDF from matplotlib (`savefig("plot.pdf")`), R (`pdf()`, `cairo_pdf()` or `ggsave("plot.pdf")`), GraphPad Prism and similar programs can be imported like SVG plots. Everything happens in your browser; the file is not uploaded anywhere.

- **Several pages:** if the PDF has more than one page, the **Choose a PDF page** dialog opens. It lists the pages with their sizes and shows a preview of the selected one. Use the arrow keys or click to pick a page, then choose **Import page**. **Cancel** (or Escape) imports nothing.
- **What is kept:** lines, shapes, colours, transparency, line widths and dash patterns. Parts of the plot that the PDF hides outside the plotting area (a line running past the axis limits, for example) are cut off as they are in the PDF.
- **Text** stays real text. It is shown in the built-in font closest to the one the PDF names (DejaVu Sans from matplotlib, or Helvetica and Arial from R and Prism, become Arimo), as for SVG plots above. Text the PDF saved without saying which letters it is (some PDFs store only the letter shapes) is kept as letter shapes, so it looks right but cannot be edited as text; the status line says so.
- The same tidying as for SVG plots happens afterwards: the white page is removed, empty margins are trimmed and text split into pieces is joined.
- **Pictures inside the PDF:** small pictures made of flat blocks of colour, such as a heatmap from matplotlib's `imshow`, become coloured rectangles. Other pictures (photos, smooth colour gradients and large images) cannot be part of an imported drawing and are left out; the status line says so. Import such a picture as a PNG or JPEG instead.
- **Approximations:** gradient fills become grey, and a clipping area that is not a rectangle is treated as the rectangle around it. The status line tells you when either happened.
- PDFs protected by a password cannot be imported.

Imported pictures can be moved, resized, rotated and faded like anything else. In the Inspector they have an **Image** or **Imported SVG** section with a **Credit** field. Type who made the picture and the credit goes into the figure's credit line (see [Exporting](12-export.md)). Pictures with no credit typed are not mentioned in the credit line, so add one if you do not own the image.

**Open…** also accepts these files: if you choose an SVG, a PDF or a picture instead of a `.jfig` file, it is imported onto the page.

## Copy and paste between figures and apps

Copying objects puts them on the clipboard as text, and pasting accepts that text again. This is how you move objects between two figures open in different tabs, and how other apps send things to JustFig.

- Paste into the same figure: the copy lands slightly offset from the original.
- Paste from another figure or app: the objects land in the middle of the view.

A file with objects, rather than a whole figure, that you open with **Open…** is likewise added to the page and does not replace your figure.

## PlasmidPop

PlasmidPop is a sibling app that draws plasmid maps from sequence files. To bring a map into JustFig:

1. In PlasmidPop's File menu, choose **Copy map for…**.
2. Click on the JustFig canvas and press Ctrl+V.

The map arrives as a **Plasmid map** object with all its features, in the middle of the view. Because it is an object, you can change its features, colours and labels in the Inspector (see [Scientific objects](08-objects.md)).

## BarelySig

BarelySig is a sibling app for statistical graphs. It can export SVGs in two ways.

- **With data:** the SVG carries the graph's data inside it. When you import it, JustFig places it as an embedded graph at its exact size. In the Inspector the **From BarelySig** section has **Download .bsig for BarelySig**, which saves a `.bsig` file you can open in BarelySig to change the graph. JustFig draws the picture BarelySig made; to change the graph, edit it in BarelySig, export again and import the new SVG.
- **Without data:** JustFig has nothing to edit, so it places the SVG as an ordinary picture. A message in the status line says so.

Use "with data" when you might want to change the graph later.

## Opening figure files

**Open…** reads `.jfig` files, the format **Save** writes. If your browser supports installing JustFig as an app, an installed copy can open `.jfig` files straight from your file manager.
