# Using JustFig from the keyboard

JustFig is designed so that most of it works without a mouse, and so that a screen reader can follow what is happening. Drawing freehand on the canvas still needs a pointer. This page lists what the keyboard can do. The keys themselves are in [the shortcuts page](13-keyboard-shortcuts.md).

## Moving around

- **Tab** and **Shift+Tab** move through the top bar, the figure tab strip, the icon panel, the tools, the Inspector, the Layers panel and the Pages bar. Every button and field is reachable and has a name a screen reader can read.
- The tools are buttons that say whether they are pressed. You can also switch tool by key (V, R, E, L, P, A, T, F, H).
- The figure tab strip is a list of tabs: Tab reaches the tab in front, the arrow keys, Home and End move between figures, and Delete closes one. A screen reader reads each tab's title and whether it is unsaved. Alt+1 to Alt+9 bring a tab forward from anywhere.
- Dialogs trap focus: Tab stays inside until you close them with **Escape** or a button, and focus then returns to where you were.
- The status line at the bottom announces what is selected, and messages such as "Credit line copied."

## Making a figure without drawing

1. Press **Tab** to the Icons panel and press **Enter** on an icon, or on a tile of the Scientific objects shelf, to place it in the middle of the view.
2. Type exact **X**, **Y**, **W**, **H** and **Rotate °** values in the Inspector, or nudge with the arrow keys (1 pt, or 10 pt with Shift).
3. Start from a template (**Templates…**) for a ready-made layout of lettered panels.
4. Change colours, fonts and sizes in the Inspector. Every choice is a normal list, box or button.

## Selecting

- Select an object by name in the **Layers** panel with Enter. Hold Shift while pressing to add to the selection.
- Ctrl+A selects everything on the page.
- Escape clears the selection.
- Use the **hide** and **lock** buttons in the Layers panel to take objects out of the way.

## Editing

- Edit a selected text with **Edit text** in the Inspector. Inside the editor, Ctrl+B, Ctrl+I, Ctrl+= and Ctrl+Shift+= set bold, italic, subscript and superscript, and Escape finishes.
- Align, distribute, group, ungroup, flip and change order with the Inspector's buttons and the keys Ctrl+G, Ctrl+Shift+G, `]` and `[`.
- Arrows are attached or detached with the arrow's section in the Inspector; the **Detach** buttons are ordinary buttons. Creating a new attachment needs the pointer.
- A path, line or arrow can be reshaped point by point: select it, then **Edit points** in the Inspector (or Enter on the canvas). Tab moves between points, the arrow keys move the current one, and a line at the bottom of the canvas, read out by screen readers, says which point it is and where. See [Editing points](02-drawing.md#editing-points).
- Ctrl+Z and Ctrl+Y undo and redo. The tooltip of each button names the change.

## Review notes

The Notes panel lists every note. Tab to a note and press Enter to open it; **↑** and **↓** move between notes. **+ Note** starts a note on the selected object, or in the middle of the page when nothing is selected, and puts you in its text box; Ctrl+Enter adds it and Escape cancels. See [Review notes](16-review-notes.md).

## Pages

With a page tab focused, **←** and **→** move to the previous and next page and **F2** renames it. The **+**, **Rename** and **Delete page** buttons work with Enter.

## The well-map editor

A plate's well grid is fully keyboard-operable. Tab to it, move with the arrow keys, **Space** or **Enter** paints, **Delete** clears and Shift with an arrow paints as you move. A screen reader announces each well and its colour. You can also paste a layout from a spreadsheet (see [Scientific objects](08-objects.md)).

## Colour and vision

- **Preview as** in the Palette section shows the figure as seen with deuteranopia, protanopia, tritanopia or in greyscale.
- Colourblind-safe palettes are marked in the palette list (see [Colours and palettes](09-colours.md)).

## Changing the keys

If a shortcut clashes with your screen reader or keyboard layout, change it in **Shortcuts…**. Shortcuts are tied to the physical key, so they do not depend on the layout.
