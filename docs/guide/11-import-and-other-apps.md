# Importing and other apps

## Import…

**Import…** in the top bar places a picture on the page. Choose an SVG, PNG or JPEG file. You can also drag a file from your computer onto the canvas to drop it where you want it, or paste an image from the clipboard (Ctrl+V).

- A **PNG or JPEG** is kept as a picture at its original quality. A very large image is scaled down to at most about 106 mm on its longer side when it is placed; resize it afterwards as you like.
- An **SVG** stays vector, so it remains sharp at any size and in every export. JustFig cleans it as it imports it, removing anything that is not plain drawing, such as scripts. If something had to be changed, a warning appears in the status line.

### Plots from matplotlib and R

SVG plots saved from matplotlib (`savefig("plot.svg")`) or R (`ggsave("plot.svg")`, or the `svg()` device) are tidied up as they are imported:

- The white page behind the plot is removed, so the plot sits directly on your figure. A coloured background is kept.
- Empty margins around the plot are trimmed, so the placed size is the size of the drawing.
- Axis labels, tick labels and titles that matplotlib saved as letter shapes become real text again, and text split into separate words or letters is joined back into whole labels.
- Unnecessary grouping inside the file is removed. The plot looks the same.

Labels rebuilt from matplotlib's letter shapes use the font matplotlib used (DejaVu Sans). If your computer does not have it, a similar font is shown. Mathematical labels (written between `$` signs in matplotlib) keep their letter shapes. Plots from R's `svg()` device keep their letter shapes too, because that device does not save which letters they are; save with `ggsave()` or the svglite package to get real text.

Imported pictures can be moved, resized, rotated and faded like anything else. In the Inspector they have an **Image** or **Imported SVG** section with a **Credit** field. Type who made the picture and the credit goes into the figure's credit line (see [Exporting](12-export.md)). Pictures with no credit typed are not mentioned in the credit line, so add one if you do not own the image.

**Open…** also accepts these files: if you choose an SVG or a picture instead of a `.jfig` file, it is imported onto the page.

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
