# The Inspector

The Inspector is the panel on the right. It shows the properties of what is selected. With nothing selected it shows the page and the figure. Every change is one step you can undo, and typing in one field is one step however many keys you press.

## With nothing selected

Click an empty part of the canvas to see these sections.

### Page

- **Size** is a list of page sizes: Journal (Nature, Cell, Science, PNAS, PLOS and eLife column widths), Paper (A4, US Letter) and Screen (a 16:9 slide), or Custom.
- **W** and **H** set a custom size, in the current units.
- **Background** is the page colour (white by default). Choose "none" for a transparent background.
- **Units** switches between Millimetres and Inches.

### Figure

- **Panel labels**, **Size (pt)** and **Bold** style the letters on all panels (see [Arranging](05-arranging.md)).
- **Credit line in exports** adds the icon credit line under the exported figure (see [Exporting](12-export.md)).
- **Snap to objects and page** turns snapping on or off.
- **Title** names the figure. It is also the file name when you save or export.

### Palette

The figure's colour swatches, the built-in palettes and the colour-vision preview. See [Colours and palettes](09-colours.md).

## With something selected

### The object section

The first section is named after the object (for example "Rectangle", or "3 objects"). It holds:

- **X**, **Y**, **W**, **H**: position and size of the selection, in the current units.
- **Rotate °** (one object, not a group or panel) and **Opacity %**.
- **Flip H**, **Flip V**, **Front** and **Back**.
- The align and distribute buttons, and **Group** and **Ungroup**. See [Arranging](05-arranging.md).

### Style

Shown for shapes, paths and arrows: **Fill**, **Stroke**, **Width (pt)**, **Dash** and **Corner (pt)** for rectangles. Every colour control is described in [Colours and palettes](09-colours.md).

### Arrow

**Start** and **End** heads, **Head size**, **Curve %**, and "attached to" lines with **Detach** buttons. See [Arrows](03-arrows.md).

### Text

**Edit text**, **Font**, **Size (pt)**, **Align**, **Auto width**, **Line height** and **Colour**. See [Text](04-text.md).

### Icon colours

For an icon from the library: one colour control for each recolourable part, named by the icon (for example Primary and Outline), and **Reset colours** to go back to the original. Below them are the icon's title, source, author and licence. A recoloured CC BY or CC BY-SA icon is credited as "modified". See [Icons](07-icons.md).

### Panel

**Automatic label**, **Label**, **Show label** and **Show border**. See [Arranging](05-arranging.md).

### Image and Imported SVG

For a PNG or JPEG the section is called **Image**; for an imported SVG it is **Imported SVG**. It shows the file name and has a **Credit** field. If you type a credit there, such as "Photo: A. Author", it is added to the figure's credit line. Pictures you import are not credited unless you fill this in. See [Importing and other apps](11-import-and-other-apps.md).

### From BarelySig

For a graph imported from BarelySig with its data. It explains that the graph is drawn from the picture BarelySig made, and has **Download .bsig for BarelySig**. See [Importing and other apps](11-import-and-other-apps.md).

### Scientific objects

A cell, plate, gel or other scientific object gets a section named after it (for example "Well plate"), then **Colours** with **Reset colours**, and **Convert to shapes**. A drawn path gets **Follow this path**. See [Scientific objects](08-objects.md).

An object made by a newer version of JustFig shows a **Procedural object** section instead. It is drawn from its saved picture and kept as it is; **Convert to picture** turns it into a plain picture.

## Tips

- Several objects selected: the object section edits them together, and Style sets the same fill, stroke and width on all of them.
