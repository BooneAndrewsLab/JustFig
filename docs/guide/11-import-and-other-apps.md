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
- Parts of the plot that the file hides outside the plotting area are cut off, as they are when the file is shown: a line running past the axis limits (a close-up panel made with `set_xlim`, for example) ends at the edge of its axes instead of running across the figure.
- **Pictures inside a plot** (a heatmap from `imshow`, a scatter layer saved with `rasterized=True`, a micrograph) are kept. The plot is placed as a group: the pictures at the bottom, each where it was, and the plot's lines, labels and markers on top. Open the group in the Layers panel to select a picture on its own, or Ungroup it. What the plot drew over a picture (contours, markers, labels) stays over it; what it drew underneath, such as the plot background, is cut away where the picture is. Grid lines under a picture are cut away too. A see-through picture (a rasterized scatter layer, points from ggrastr) gets a **backdrop** right under it, named after it in the Layers panel: a copy of what the plot drew beneath it (the panel colour, the grid lines), so its clear parts show the panel and grid as before while the grid no longer crosses its dots. The backdrop moves and stretches with its picture; delete it if you want the page to show through. A picture the plot cuts to its axes (matplotlib writes the whole image when you zoom in with the axis limits) or to another shape, such as a circle, is cut the same way: to the axes, or with the part outside the shape made see-through. A slanted picture is placed upright, and a picture the plot links to instead of carrying it is left out; the status line says so (also for a cut JPEG inside an SVG, which is placed whole). Pictures add to the size of the figure in your browser's storage, so very large ones (over about 4 million pixels in a PDF) are stored at a lower resolution.

Text inside an imported plot or drawing is shown in the built-in font closest to the one it names: Arimo for Arial, Helvetica, DejaVu Sans (matplotlib's default), Liberation Sans and other sans-serif fonts; Tinos for Times and other serif fonts; Cousine for Courier and other monospaced fonts. It therefore looks the same on every computer, in every export, and is outlined with the rest of the figure when you export with **Outline text**. The file keeps the font names it came with. DejaVu Sans is a little wider than Arimo, so a label from matplotlib comes out slightly shorter. Labels keep their alignment: a tick label or axis title the plot centred stays centred under its tick or axis, and a tick label that ended at its tick still ends there, even when the plot file (matplotlib's default SVG, or any PDF) only saved where each label starts. A label of several lines, such as a two-line axis title or tick label, keeps its lines aligned with each other: all centred, all ending at the tick, or all starting at the same place, also when a line has another colour (a grey "n = 12" under a group name). A label JustFig cannot place with confidence, such as a legend entry, keeps its left end. Mathematical labels (written between `$` signs in matplotlib) become text too when they use only superscripts, subscripts, Greek letters and simple symbols such as × and −: a log-axis tick label like 10³ is "10" with a raised, smaller "3". Such a label stays one piece of text in the built-in font, with no gap before the "3", and keeps its alignment like any other label. The same goes for a label a PDF saved in several parts, such as "Signal (μV)" with an italic μ, and for a label whose words have different colours, such as a title "Wild type vs mutant" with each genotype in its line's colour: it stays one label, each word keeping its colour. Labels with fractions, square roots or other layout keep their letter shapes. Plots from R's `svg()` device keep their letter shapes too, because that device does not save which letters they are; save with `ggsave()` or the svglite package to get real text.

To change the fonts, text sizes or line widths inside imported plots, for example to make every tick label in several plots 7 pt, select them and use **Text and lines** in the Inspector ([The Inspector](06-inspector.md)). **Same text and lines** makes the other selected plots look like the first one.

Resizing an imported plot (SVG or PDF) changes the size of its axes and data, not of its text: an 8 pt axis label stays 8 pt, lines keep their width and tick marks their length, whether you drag a handle, type W and H in the Inspector, use Same width or Arrange in grid. Tick labels follow their ticks, axis titles stay centred on their axis, a legend keeps its corner, and data markers keep their shape. In a plot with several panels, such as matplotlib subplots or ggplot2 facets, each panel stretches while the gaps between them keep their size, so each panel's labels stay with it; facet strips keep their height and a colour bar its width, also when it is shared by a whole column or row of panels. Panels that touch each other stretch separately. A line drawn across panels (from a zoomed region to its close-up, or one axis line along two panels) keeps each of its ends on its own panel. When the panels cannot be told apart with confidence (for example a circle drawn across two of them), the plot stretches as one area, gaps included. To scale a plot like a picture instead, text and all, switch off **Keep plot text and line sizes** in the Inspector. For a very large plot (thousands of points) the plot is scaled while you drag and redrawn when you let go. Pictures inside an imported plot stretch with the panel they are in when you resize the plot's group (or the plot inside it), so a heatmap stays between its axes; their pixels are stretched, not redrawn (a picture's backdrop stretches with it).

### PDF plots

Plots saved as PDF from matplotlib (`savefig("plot.pdf")`), R (`pdf()`, `cairo_pdf()` or `ggsave("plot.pdf")`), GraphPad Prism and similar programs can be imported like SVG plots. Everything happens in your browser; the file is not uploaded anywhere.

- **Several pages:** if the PDF has more than one page, the **Choose a PDF page** dialog opens. It lists the pages with their sizes and shows a preview of the selected one. Use the arrow keys or click to pick a page, then choose **Import page**. **Cancel** (or Escape) imports nothing.
- **What is kept:** lines, shapes, colours, transparency, line widths and dash patterns. Parts of the plot that the PDF hides outside the plotting area (a line running past the axis limits, for example) are cut off as they are in the PDF.
- **Text** stays real text. It is shown in the built-in font closest to the one the PDF names (DejaVu Sans from matplotlib, or Helvetica and Arial from R and Prism, become Arimo), as for SVG plots above. Text the PDF saved without saying which letters it is (some PDFs store only the letter shapes) is kept as letter shapes, so it looks right but cannot be edited as text; the status line says so.
- The same tidying as for SVG plots happens afterwards: the white page is removed, empty margins are trimmed and text split into pieces is joined.
- **Pictures inside the PDF:** pictures made of large flat blocks of colour, such as a small heatmap from matplotlib's `imshow` or a colour bar, become coloured rectangles, sharp at any size. Other pictures (an interpolated heatmap, a rasterized scatter layer, a photo) are kept as pictures, grouped with the plot as described above. A picture the PDF cuts to the plotting area, or to any other shape, is cut the same way. A photo the PDF stores as JPEG stays a JPEG, so it takes no more room than in the PDF. Pictures used as stencils (a shape filled with one colour through a mask) are left out; the status line says so.
- **Clipping and gradients:** parts the PDF cuts to a shape, such as the circle of a polar plot, are cut to that shape. Gradient fills become narrow bands of colour that look smooth at normal sizes. A smooth colour mesh (matplotlib's Gouraud shading) becomes a picture. Hatched fills (matplotlib's `hatch=`, R's pattern fills) keep their hatching as ordinary lines and dots, cut to the bar or area they fill. A pattern too fine to draw line by line becomes one colour; the status line says so.
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
