# Arranging objects, layers, pages and panels

## Selecting

- **Click** an object to select it. Click empty space to select nothing.
- **Shift+click** adds an object to the selection, or removes it if it is already selected.
- **Drag a box** on empty space with the Select tool to select everything it fully encloses. Hold Shift while you start the box to add to the current selection.
- **Select everything on the page** with Ctrl+A. Hidden and locked objects are left out.
- **Escape** returns to the Select tool, and a second press selects nothing.

The Layers panel can also select: click an object's name there (Shift adds to the selection).

## Copy, paste, duplicate and delete

Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste. Ctrl+D duplicates the selection, 10 pt down and to the right. **Delete** or Backspace removes it. All of them can be undone.

A paste of something copied from this figure lands next to the original. Something copied from another figure, or from PlasmidPop, lands in the middle of what you can see.

## Align and distribute

With a selection, the Inspector's first section (named after the object, or "3 objects") has a row of alignment buttons: align left, centres, right, top, middles and bottom.

- With **two or more** objects they line up to the edges of the selection as a whole.
- With **one** object they align it to the page, which is a quick way to centre something.
- With **three or more**, two more buttons appear: **Distribute horizontally** and **Distribute vertically** space the objects evenly.

For exact placement type values into **X**, **Y**, **W** and **H**.

## Group and ungroup

Select two or more objects and choose **Group (Ctrl+G)** in the Inspector, or press Ctrl+G. The group moves, resizes and rotates as one. **Ungroup** (Ctrl+Shift+G) releases them. The objects must be in the same layer, or all in the same panel.

## Front and back

Objects stack in the order they were made. **Front** and **Back** in the Inspector, and the keys `]` (bring to front), Shift+`]` (bring forward one step), `[` (send to back) and Shift+`[` (send backward one step) change the order.

## The Layers panel

The Layers panel under the Inspector lists the page's layers, top layer first, with the objects in each.

- Click the small triangle next to a group or panel to open it.
- The dot button **hides** an object or layer; the lock button **locks** it. A hidden object is not drawn on the canvas or exported. A locked object cannot be dragged, and a locked layer cannot be clicked on the canvas.
- **+ Layer** adds a layer. New objects go onto the highest layer that is visible and unlocked.
- On a layer, the up and down arrow buttons raise and lower it, and the **✕** deletes it with its objects (after a confirmation; undo brings it back). You cannot delete the only layer.
- Double-click a layer's name to rename it.

Layers are handy for keeping a background drawing out of the way: lock it, and clicks go through to the objects above.

## Pages

A figure can have several pages, for example one per figure in a paper. The Pages bar is under the canvas.

- Click a tab to go to a page.
- **Rename**, or double-click a tab, or press **F2** on it, to rename the page.
- With a tab focused, the **← and → arrow keys** move to the previous or next page.
- **+** adds a page the same size as the current one.
- **Delete page** (shown when there is more than one) removes the page after a confirmation; undo brings it back.

Each page is exported on its own, except that a PDF can include all pages (see [Exporting](12-export.md)).

## Panels and their labels

A panel is a framed area for one part of a multi-panel figure, with a letter in its corner. Draw one with the Panel tool (key F), or start from a template (see [Templates and examples](10-templates.md)).

- Objects whose centre lies inside a panel belong to it. Move the panel and they move with it. Drag an object out of the panel to release it.
- Labels are lettered **automatically** in reading order: rows from top to bottom, then left to right within a row. Rearrange the panels and the letters follow.
- To use your own label, select the panel, switch off **Automatic label** in the Panel section and type into **Label**. You can also turn off **Show label** or **Show border**.

Set the look of all panel labels in the Inspector's Figure section (click an empty part of the page to see it): **Panel labels** chooses the style (A, a, (a), (A) or a)), **Size (pt)** the size and **Bold** the weight.
