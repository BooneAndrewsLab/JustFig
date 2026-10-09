# Scientific objects

Scientific objects are things you would otherwise spend an hour drawing: a 96-well plate with coloured wells, a gel, a plasmid map, a lipid bilayer. You give JustFig a few settings and it draws the object. Because it stays an object, you can come back and change the settings at any time.

## Placing one

The **Scientific objects** shelf is at the top of the Icons panel. It can be folded away by clicking its title, and JustFig remembers whether it was open. Each tile shows a preview.

- **Click** a tile to place the object in the middle of what you can see.
- **Drag** a tile onto the canvas to drop it where you want it.
- **Search** for one in the icon search box: typing "plate", "gel", "agarose", "cell" or "umap" lists the matching scientific objects above the icons, each tagged **Adjustable**. Click, drag or press Enter on one exactly as on the shelf.

A scientific object is not the same as an icon of the same thing. An icon is a fixed drawing: you can recolour, resize and rotate it, but its shape never changes. A scientific object is redrawn from its settings, such as the number of wells, the lanes and bands, which organelles are shown or the plasmid's features, and resizing redraws it instead of stretching it.

Select an object to see its settings in the Inspector. Resize it with its handles; the object is redrawn at the new size. You can also rotate, flip and fade it like anything else.

## The objects

| Object            | What it is                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cell              | An animal cell. Choose an Oval or Irregular **Outline**, switch Nucleus, Nucleolus, Endoplasmic reticulum and Golgi apparatus on and off, set how many Mitochondria, Lysosomes and Vesicles, and the Membrane width. **Arrangement** is a number: another number shuffles the organelles.                                                                        |
| Lipid bilayer     | A phospholipid bilayer along a path. **Head size**, **Tail length**, **Leaflet gap**, **Tails** (Straight or Kinked), **Head outlines**, and **Closed (vesicle)** to close it into a ring.                                                                                                                                                                       |
| Membrane proteins | Receptors, channels or transporters spaced along a membrane path. Choose the **Protein**: Receptor tyrosine kinase, GPCR (7 helices), Ion channel, Transporter or Y-shaped receptor; set **Spacing** and **Size**; choose which side is outside with **Outside is**; draw the **Draw membrane** band and its **Membrane width**; **Closed (cell)** makes a ring. |
| DNA / RNA         | A double helix, or a single RNA strand, along a path. **Molecule**, **Turn length**, **Radius**, **Groove offset** (DNA only), **Base ticks** with **Bases per turn**, and **Strand width**.                                                                                                                                                                     |
| Plasmid map       | A circular or linear map with a list of **Features**. See below.                                                                                                                                                                                                                                                                                                 |
| Protein domains   | A protein drawn as a bar with its domains to scale. See below.                                                                                                                                                                                                                                                                                                   |
| Well plate        | A 6- to 1536-well plate with a colour for each well. See "The well-map editor" below.                                                                                                                                                                                                                                                                            |
| Petri dish        | An agar plate with colonies. See below.                                                                                                                                                                                                                                                                                                                          |
| Agarose gel       | A gel with a ladder and lanes of bands. See below.                                                                                                                                                                                                                                                                                                               |
| Placeholder plot  | A PCA, UMAP, scatter or bar plot of made-up points, for a schematic or graphical abstract before you have real data. See below.                                                                                                                                                                                                                                  |

Every object also has a **Colours** section with a control for each of its parts (for example Plate, Empty wells, Outlines and Labels for a plate). **Reset colours** goes back to the defaults.

### Plasmid map

Set the **Name**, the **Length** in bp and the **Topology** (Circular or Linear). Under **Features**, each feature has a name, **Start** and **End** (bp, counted from 1), **Strand** (Forward →, Reverse ← or None), **Type** and **Colour** (automatic unless you choose one). Click a feature to open it; use the arrow buttons to reorder, ✕ to remove and **Add** for a new one. You can show or hide **Name in the middle**, **Length**, **Scale ticks** and **Feature labels**, and set **Feature width** and **Label size**. Features shorter than **Smallest labelled feature** (1% of the length by default) are still drawn but have no label, which keeps dense maps such as pBR322 readable; set it to 0 to label every feature.

To bring in a real plasmid, copy it from PlasmidPop (see [Importing and other apps](11-import-and-other-apps.md)).

### Protein domains

Set the protein **Length** in aa. Each domain in the **Domains** list has a Name, Start, End, Colour and Shape (Rounded box, Box, Oval or Hexagon). Also available: **Domain height**, **Domain names**, **Residue ruler** and **N and C termini**.

### Petri dish

**Colonies** chooses the pattern: Scattered, Streak (three zones), Spot dilutions, Pinned grid, Lawn or None (empty plate). **Number** sets how many colonies (not for Lawn or None), **Colony size** and **Size variation** the look, and **Lid rim** adds the dish rim. **Arrangement** works as on the cell.

### Agarose gel

Choose the **Ladder**: 1 kb ladder, 100 bp ladder or None. Under **Lanes**, give each lane a **Label**, tick **Ladder lane** to make it a ladder, and type the fragment sizes in **Bands (bp)**, separated by commas. Add an intensity after a colon to make a band fainter: `3000, 1200:0.4, 700` is three bands, the middle one at 40% strength. Bands are placed on a log scale as on a real gel. **Look** is Stained (light bands on dark) or Inverted (dark bands on light); you can also show **Lane labels**, **Ladder sizes** and **Wells**.

### Placeholder plot

A plot-shaped drawing for when the figure needs "a UMAP goes here" rather than real data. The points are invented, so never use one where a reader could take it for a result.

**Plot type** is PCA (tilted clusters with axes labelled PC1 and PC2 and their share of variance), UMAP (lumpy clusters with two short corner arrows), Scatter (a rising cloud per group) or Bar chart (one bar per group). Under **Groups**, give each group a **Name** and a **Colour**; there can be 1 to 8, and each is a cluster, a cloud or a bar. **Points per group** sets how many points each cluster has (not for bar charts), **Spread** how loose the clusters are (or how long the error bars), and **Point size** their size.

**Axes** and **Axis labels** switch those on and off. Leave **x-axis label** and **y-axis label** empty for the usual labels of the plot type, or type your own, such as "Dose (µM)". **Group names** shows a legend beside the plot, or the names under the bars of a bar chart. A bar chart can also show **Error bars** and **Data points** (six dots per bar).

**Arrangement** works as on the cell: the same number always draws the same points, so the plot never changes by itself. Use **Convert to shapes** to move single points by hand.

## The well-map editor

A Well plate has a **Well colours** editor in the Inspector: a small picture of the plate that you paint on.

1. Choose a **Brush** colour with the colour box or one of the quick colours.
2. **Click or drag** over wells to paint them. Hold **Alt** while you drag to erase, or tick **Eraser**.
3. **Clear** removes all well colours.

A whole stroke is one undo step. The note under the grid says how many wells are coloured.

**From the keyboard:** click the grid or Tab to it, then use the arrow keys to move the cursor (Home and End jump to the first and last column), **Space** or **Enter** to paint the well, **Delete** to clear it, and **Shift+arrows** to paint as you move. The grid announces each well, such as "B3: empty".

**From a spreadsheet:** choose **Paste from spreadsheet…**, copy a block of cells in Excel or Sheets (the top-left cell is well A1) and paste it into the box, then choose **Apply**.

**From a file:** choose **Open CSV/TSV file…** (or drop a `.csv`, `.tsv` or `.txt` file onto the well editor). The file's cells appear in the same box so you can check them before choosing **Apply**. Files must be plain text under 1 MB; quoted fields (`"a, b"`) and Excel's UTF-8 CSV exports work.

- Numbers become a light-to-dark colour ramp.
- Words become one colour each, so every "Control" well is the same colour.
- Colours written as `#d55e00` are used as they are.

A legend lists what the colours mean. Pasted wells are added to what is already painted.

## Turning a drawn path into a membrane, helix or proteins

Bilayers, DNA / RNA and membrane proteins follow a path. To use your own curve:

1. Draw a line or a pen path.
2. Select it. The Inspector shows a **Follow this path** section.
3. Choose **Lipid bilayer**, **DNA / RNA** or **Membrane proteins**.

The path is replaced by the object, which follows the same curve. Drag the object's handles to resize it. Undo brings your path back. To start without a path, place the object from the shelf; it comes with a default arch.

## Convert to shapes

**Convert to shapes**, at the foot of an object's settings, replaces the object with a group of ordinary shapes and text that you can edit one by one. Do this when you want to change something the settings cannot, such as moving a single colony. It is one-way apart from undo: the object stops being editable as a whole.

Converting does not change the figure's credit line, because these objects use no library icons.
