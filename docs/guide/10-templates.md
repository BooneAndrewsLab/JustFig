# Templates and examples

**Templates…** in the top bar opens the Templates and examples dialog. It has three tabs: Templates, Examples and My presets. Templates and examples have each with cards that show a live preview. Choosing a template or example starts a new figure from it in a new tab; your current figure stays open in its tab.

## Templates

Templates are empty layouts to fill in: panels sized for a journal column, lettered automatically.

| Template                  | What you get                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| Four panels, two columns  | A 2 × 2 grid of lettered panels on a Nature double-column page (183 mm). |
| Three panels in a row     | Three lettered panels across a Cell full-width page (174 mm).            |
| Single column, two panels | Two stacked panels on a one-column page (89 mm).                         |

Drop icons, objects and text onto the panels. Anything whose centre is inside a panel moves with it, and the letters follow the panels if you rearrange them (see [Arranging](05-arranging.md)). Change the page size at any time in the Inspector's Page section.

## Examples

Examples are finished figures to take apart. Their colours are linked to the palette, so applying another palette recolours them (see [Colours and palettes](09-colours.md)).

| Example                  | What it shows                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signalling pathway       | A ligand, receptor, kinase cascade and transcription factor, with an inhibitor, on a membrane. The arrows are attached, so they stay connected as you move things, and the inhibitor ends in a bar head. |
| Experimental workflow    | Culture, treatment in a 96-well plate and read-out, joined by attached arrows. It uses a Petri dish and a Well plate object.                                                                             |
| Cloning and verification | A plasmid map and a diagnostic gel in two lettered panels.                                                                                                                                               |

Try moving a box in the signalling pathway and watch its arrows follow. Select a plate or gel to see how its settings work (see [Scientific objects](08-objects.md)).

## My presets

A preset is a piece of a figure you made and want again: a labelled cell, a legend, a row of tubes with their arrows. Select the objects and choose **Save as preset…** in the Inspector. The Save as preset dialog asks for a name; the preset is kept in this browser, with copies of the icons and pictures it uses and their licence details, so credit lines still work wherever you place it.

The **My presets** tab of the gallery shows your presets, newest first. Choosing one adds it to the current page, in the middle of the view, as one step you can undo. It does not start a new figure. Colours linked to palette swatches are saved as fixed colours, so a preset looks the same in any figure. Arrows attached to objects inside the preset stay attached; arrows attached to objects left out are detached.

Each preset has **Rename**, **Export** and **Delete** buttons. Delete asks first (Delete this preset?). This browser keeps up to 100 presets; when it is full, delete some before saving more. Nothing is dropped on its own.

To share presets with your lab, use **Export all presets** (or Export on one preset). That downloads a `.jfigpresets` file. Someone else opens the gallery's My presets tab and chooses **Import presets…** to add the file's presets to theirs. Presets they already have, with the same name and content, are skipped. A file that is damaged or is not a presets file is refused, and nothing is added.

## Save as template source (for contributors)

The built-in templates and examples are code in the repository. To add one without writing it by hand, draw it in the app, open **Templates…** and choose **Save as template source…**. The Save as template source dialog turns the selected objects (or, with nothing selected, the whole current page) into the TypeScript of a gallery entry. Give it a title, an id (lowercase words joined by hyphens), a description and a kind, then **Copy source** or **Download .ts file**. Save the file in `src/gallery/`, add the entry to `GALLERY` in `gallery.ts` and run `npm run check`. The entry keeps the objects, palette, page size and any icons or pictures they use, and arrows stay attached. Nothing about the figure is sent anywhere.
