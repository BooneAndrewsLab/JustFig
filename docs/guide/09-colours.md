# Colours and palettes

## Choosing a colour

Every colour control in the Inspector (Fill, Stroke, Background, Colour, icon colours and object colours) works the same way: one box showing the colour and its hex code (or the name of the palette swatch it is linked to, or "None"). Click it, or press Enter or Space on it, to open the picker:

- A **square** for saturation and brightness and a **hue** slider under it. Drag them, or use the arrow keys (Shift for bigger steps).
- A **hex field**: type or paste a code such as `#0072b2` and press Enter.
- **Eyedropper**, where your browser has one (Chrome and Edge), picks a colour from anywhere on the screen.
- The figure's **Palette** swatches, if it has any. Choosing one _links_ the colour to that swatch.
- **Quick** colours: the colourblind-safe Okabe-Ito colours, white and, where "no colour" makes sense (a transparent fill, for instance), **none**.
- Your **Recent** colours.

Escape or a click outside closes the picker.

## Linked colours and the palette

A figure can have a palette of named swatches. When an object's colour is linked to a swatch, changing the swatch recolours every object that uses it. This is the quick way to restyle a whole figure, or to keep the same cell type the same colour in every panel.

The palette is in the Palette section of the Inspector (click an empty part of the page).

- **Swatches** lists the swatches. Click the colour box to change one, type in the name field to rename it, and click **×** to remove it. A removed swatch's uses keep their colour.
- **+ Swatch** adds a new one.
- **Link colours** turns each colour the figure uses into a swatch, one per distinct colour, and links the objects to it. This includes the default colours of scientific objects. Do this on a finished figure, and you can then recolour it by editing the swatches.
- **Unlink** fixes every colour as it is now. The swatches stay in the palette for later use, but nothing follows them any more.

Choosing a plain colour with the picker, the hex field or a quick colour makes that one use unlinked, so a figure can be partly linked. **Link colours** is greyed out once every colour is linked, and **Unlink** when nothing is.

## Built-in palettes

Choose a palette in the **Built-in palette** list and choose **Apply to figure**. The dots beside the button preview its colours first. Applying links the figure's colours to swatches, if they are not already, and gives the swatches the palette's colours in turn, so the whole figure is recoloured in one undo step. Black, white and greys are left alone, and so are the original colours of library icons (recolour those in the Inspector's Icon colours section).

| Palette                        | Kind                 | Colourblind-safe |
| ------------------------------ | -------------------- | ---------------- |
| Okabe-Ito                      | categories           | yes              |
| Tol bright                     | categories           | yes              |
| Tol muted                      | categories           | yes              |
| Tol vibrant                    | categories           | yes              |
| IBM accessible                 | categories           | yes              |
| Viridis                        | ordered (sequential) | yes              |
| Cividis                        | ordered (sequential) | yes              |
| Soft pastels                   | categories           | no               |
| Classic (not colourblind-safe) | categories           | no               |

Use a category palette for separate groups (control, drug A, drug B). Use an ordered palette for something that goes from low to high, such as a dose or a heat map. The list marks safe palettes with "✓ colourblind-safe", and warns when you choose one that is not: some of its colours look alike to about 1 in 12 men.

## Preview as: how others see your figure

The **Preview as** list in the Palette section shows the canvas as people with other kinds of colour vision see it:

- Normal colour vision
- Deuteranopia (green-blind)
- Protanopia (red-blind)
- Tritanopia (blue-blind)
- Greyscale (printing)

This colour-vision preview changes only what you see on screen. Your exports are never affected. Check that groups you want to tell apart still look different, and that nothing disappears in greyscale, since many readers print figures in black and white. Set it back to Normal colour vision when you have finished.

You do not have to look for every problem yourself: **Check before export** (see Export) warns about swatches in one panel that look alike with deuteranopia, protanopia or tritanopia or in greyscale, and about red and green channels merged in one picture.

## Colours in templates

The example figures in the gallery are linked to their palettes, so applying another palette to one recolours it (see [Templates and examples](10-templates.md)).

## Colours inside scientific objects

The colour pickers for an object's own settings (a plasmid feature, a protein domain, the brush of a well plate) also list your palette's swatches, marked **Palette (copies)**. Choosing one copies its colour into the setting; it is not linked. These colours mean something (a condition, a kind of feature), so changing a swatch or applying a palette leaves them as they are.
