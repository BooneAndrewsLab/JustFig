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
- With an imported plot in the selection (SVG or PDF, also inside a selected group or panel): **Keep plot text and line sizes** (on to start). On, resizing a plot (with W and H, the handles, Same width/height/size or Arrange in grid) stretches only its axes, grid and data: the text keeps its point size, lines keep their width, tick marks keep their length and markers their shape. Labels stay with what they label: tick labels with their ticks, axis titles centred on their axis, titles in place, and a legend moves as one block, keeping its corner. A plot with several panels (matplotlib subplots, ggplot2 facets) stretches each panel and keeps the gaps between them: every label stays with its own panel, facet strips keep their height on top of their panel, and a colour bar keeps its width beside its panel (a bar shared by a column of panels stays beside all of them, which stay aligned). Panels that touch stretch separately and keep touching, and a line drawn across panels keeps each end on its own panel. Off, the plot scales like a picture, text and all. The choice is remembered in this browser. A plot made smaller than its margins allow cannot shrink its axes further, so its text then shrinks too.
- **Flip H**, **Flip V**, **Front** and **Back**.
- With two or more objects: **Same width**, **Same height** and **Same size**. They give each selected object the width and/or height of the first object you selected (W and H above still resize the selection as one box). Same width and Same height keep each object's proportions; Same size stretches each to exactly the first object's size. Each object keeps its top-left corner, locked objects are skipped, and it is one undo step. To make five micrographs 40 mm wide, set the first to 40 mm and press Same width.
- With two or more objects: **Arrange in grid…** (Shift+G) lays them out in rows and columns, each in its own lettered panel. See [Arranging](05-arranging.md).
- The align and distribute buttons, and **Group** and **Ungroup**. See [Arranging](05-arranging.md).
- **Save as preset…** keeps the selection in this browser under a name, to place again in any figure from the gallery's My presets tab. See [Templates and examples](10-templates.md).

### Style

Shown for shapes, paths and arrows: **Fill**, **Stroke**, **Width (pt)**, **Dash** and **Corner (pt)** for rectangles. Every colour control is described in [Colours and palettes](09-colours.md).

### Text and lines

Shown for an imported plot (SVG or PDF), and when two or more objects with text or lines are selected. It sets fonts, text sizes and line widths across the whole selection at once, including the text and lines inside imported plots and inside selected panels and groups:

- **Font** and **Text size (pt)** for the text: text objects and the labels inside plots.
- **Line width (pt)** for the lines: shapes, paths, arrows and the lines inside plots.
- With a plot selected, **Text** and **Lines** choose which parts of the plots change. Text: **All text**, **Plot tick labels** (the numbers or names at the ticks), or **Other plot text (titles, legends)**. Lines: **All lines**, **Plot ticks**, **Plot axes and grid lines**, or **Other plot lines (data, legends)**. When you pick a plot part, text objects and shapes are left alone.
- **Same text and lines** (two or more objects) gives every selected object the fonts, text sizes and line widths of the first object you selected. Between plots it goes part by part: tick labels take the first plot's tick label size, axis titles its title size, ticks, axes and data lines their own widths. From a text object it copies the font and size; from a shape or arrow, the line width.

Sizes are in points on the page, so "7 pt" means 7 pt whatever size the plot is placed at. To make every tick label in four plots 7 pt Arimo, select the four plots (or their panels), choose **Plot tick labels**, pick Arimo and type 7. Each change is one undo step and locked objects are skipped. A tick label keeps the side that faces its tick, so it stays lined up with it when it grows or shrinks. Only the selected plots change: a copy of the plot you did not select keeps its look. A label made larger than the plot's margins allow makes the plot's box bigger around it, so the plot itself stays where it was and selection, snapping and Arrange in grid see the whole label. Resizing a plot afterwards keeps these sizes while **Keep plot text and line sizes** is on (see the object section above).

### Arrow

**Start** and **End** heads, **Head size**, **Curve %**, and "attached to" lines with **Detach** buttons. See [Arrows](03-arrows.md).

### Text

**Edit text**, **Font**, **Size (pt)**, **Align**, **Auto width**, **Line height** and **Colour**. See [Text](04-text.md).

### Icon colours

For an icon from the library: one colour control for each recolourable part, named by the icon (for example Primary and Outline), and **Reset colours** to go back to the original. Below them are the icon's title, source, author and licence. A recoloured CC BY or CC BY-SA icon is credited as "modified". See [Icons](07-icons.md).

### Panel

**Automatic label**, **Label**, **Show label** and **Show border**. See [Arranging](05-arranging.md).

### Image and Imported SVG

For a PNG or JPEG the section is called **Image**; for an imported SVG it is **Imported SVG**. It shows the file name and has a **Credit** field. If you type a credit there, such as "Photo: A. Author", it is added to the figure's credit line. Pictures you import are not credited unless you fill this in. An Image also has **Label gel lanes**, which puts lane labels and ladder sizes over a photo of a gel and groups them with it, and **Add scale bar**, which puts a calibrated scale bar on a micrograph and groups it with it (see [Scientific objects](08-objects.md)). See [Importing and other apps](11-import-and-other-apps.md).

### Channels

Shown when the selection holds PNG or JPEG pictures (or groups with one in them). It makes a pseudocoloured merge of fluorescence channels: the single-channel pictures of one field, each shown in a colour and added together.

Select the channels (they must be the same size in pixels) and click **Merge channels…**. In the **Merge channels** dialog, each channel has **Show**, a **Colour** (green, magenta, cyan, yellow, red, blue or grey, or **Custom** with the colour button beside it) and a display range: **Black at** is the brightness shown black and **Full at** the brightness shown at full colour, from 0 to 255, so a dim channel can be brightened. The first two channels start green and magenta, which colour-blind readers can tell apart. The preview shows the merge as you change it. Tick **Lay out the channels in a row, the merge last** to line the channels up left to right with the merge at the end, the usual way to show channels and their merge; untick it to put the merge to the right of the channels and leave them where they are. Click **Merge**: the merge is a new picture, the same size, angle and crop as the first channel, and a scale bar grouped with the first channel is copied onto it, still calibrated. It is one step to undo.

The merge keeps its channels, so it can be changed later: select it and click **Channels…** to open the **Channels** dialog, where you can recolour a channel, change its range or turn it off, then **Apply**. **Channels…** on a single plain picture shows it in a colour (for example a channel in green beside the merge). A merge is ordinary pixels in exported files; the channels' own pictures stay in the figure file so it can be changed again. Cropping a merge with **Crop and rotate** works as for any picture: select the channels and the merge together to crop them all alike.

### Levels

Shown when one PNG or JPEG picture is selected. **Black at** and **Full at** set the brightness (0 to 255) shown as black and as full white, so a dim blot or micrograph can be brightened; **Invert** swaps dark and light; **Reset levels** goes back to the original. The sliders move with the arrow keys, and the picture updates as you change them. A whole drag of a slider is one step to undo, and so is Invert or Reset.

The adjustment always applies to the whole picture, never to a part of it: journal image-integrity rules do not allow adjusting part of a picture, and a picture changed this way should say so in its legend. The original pixels stay in the figure and every change is made from them, so changing the levels again never stacks on the last change. The adjusted picture is ordinary pixels in exported files. On a merge (see Channels) the levels apply to the merged colours, after the merge; a crop (see Crop and rotate) is then of the adjusted picture. Changing the channels of a picture that has levels keeps its levels.

### Crop and rotate

Shown when the selection holds PNG or JPEG pictures, or groups with one in them (such as a picture grouped with its scale bar). **Crop and rotate…** opens the **Crop and rotate** dialog, which applies the same crop and the same angle to every selected picture at once: select the channels of one field to crop and turn them together. The crop is typed in pixels of the first picture; pictures of a different size in pixels are cropped to the same part of themselves (the same fraction across and down).

In the dialog, type the crop as **Left**, **Top**, **Width** and **Height** in pixels of the picture, or drag a rectangle on the preview to fill them in; **Whole picture** takes the crop off again. **Angle (°)** turns each picture about its centre. Click **Apply**. The pictures keep their scale: a crop makes the picture's box smaller, and the part you kept stays where it was on the page. A scale bar grouped with a picture (from **Add scale bar**) moves to the new box and stays calibrated, and so do gel lane labels. The whole picture is kept in the figure, so you can widen a crop later or undo it in one step. The crop is in the picture's own pixels, before it is turned, so a turned picture is cropped along its own edges.

To crop a turned picture along the page instead (turn a field so a cell is level, then cut a level rectangle around it), tick **Crop level on the page (resample the turned picture)**. The preview then shows the picture turned by the angle, and the crop is in pixels of that turned picture; ticking or unticking it starts the crop again from the whole picture. On **Apply** the pixels are turned and resampled into a new picture, and the picture's box is level on the page. Where the crop reaches past the turned picture's corners, the pixels are clear. The original pixels stay in the figure, so you can change the angle or the crop later, or untick the box to go back to cropping along the picture's own edges.

A see-through picture from an imported plot has a backdrop under it (what the plot drew there, see [Importing and other apps](11-import-and-other-apps.md)); cropping or turning the picture crops and turns its backdrop with it.

### From BarelySig

For a graph imported from BarelySig with its data. It explains that the graph is drawn from the picture BarelySig made, and has **Download .bsig for BarelySig**. See [Importing and other apps](11-import-and-other-apps.md).

### Scientific objects

A cell, plate, gel or other scientific object gets a section named after it (for example "Well plate"), then **Colours** with **Reset colours**, and **Convert to shapes**. A drawn path gets **Follow this path**. See [Scientific objects](08-objects.md).

An object made by a newer version of JustFig shows a **Procedural object** section instead. It is drawn from its saved picture and kept as it is; **Convert to picture** turns it into a plain picture.

## Tips

- Several objects selected: the object section edits them together, and Style sets the same fill, stroke and width on all of them.
