# Drawing and editing shapes

The tool palette lists the tools. Hover over a tool to see its name and key. After you draw one object the tool goes back to Select, so each press of a tool makes one thing.

## The tools

| Tool      | What it does                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Select    | Click an object to select it, drag to move it, drag on empty space to draw a selection box.                |
| Pan       | Drag to move the view. Holding Space does the same with any tool.                                          |
| Rectangle | Drag to draw. A plain click makes a 60 × 40 pt rectangle.                                                  |
| Ellipse   | Drag to draw. A plain click makes a 50 × 50 pt circle.                                                     |
| Line      | Drag from one end to the other. A plain click makes a 60 pt line.                                          |
| Pen       | Click corners, or press and drag to pull out a smooth curve. See below.                                    |
| Arrow     | Drag from the tail to the head. See [Arrows](03-arrows.md).                                                |
| Text      | Click to type, or drag to set a width. See [Text](04-text.md).                                             |
| Panel     | Drag to draw a lettered panel. A plain click makes a 200 × 150 pt panel. See [Arranging](05-arranging.md). |

The default keys are V, H, R, E, L, P, A, T and F. You can change them in Shortcuts….

New shapes get a fill and an outline in the default colours. Change them in the Style section of the Inspector.

## Modifier keys while drawing

- **Shift** with Rectangle or Ellipse makes a square or a circle.
- **Shift** with Line or Arrow snaps the angle to multiples of 45°.

## Selecting and moving

Click an object to select it. Drag it to move it. Hold Shift while dragging to move only straight across or straight up and down. The arrow keys nudge the selection by 1 pt, and Shift with an arrow key by 10 pt.

A click on something that sits on a panel selects that object. A click on the panel's empty area selects the panel itself. Locked objects can be selected but not dragged (see [Arranging](05-arranging.md)).

## Handles: resize and rotate

A selected object has a box with eight square handles and a round rotate handle above it.

- Drag a **square handle** to resize. Corner handles change width and height together. Icons and images always keep their proportions; for anything else hold **Shift** to keep them.
- Drag the **round handle** to rotate. Hold **Shift** to turn in 15° steps.
- For exact values, type into **X**, **Y**, **W**, **H** and **Rotate °** in the Inspector. The **Opacity %** field fades the object.
- **Flip H** and **Flip V** in the Inspector mirror the object.

Resizing a line, arrow or path rescales its points, so its line width stays the same.

## Snapping and smart guides

While you move or resize, the edges and centres of the selection snap to the edges and centres of other objects and of the page. Orange guide lines show what it has lined up with. Snapping works within a few pixels of the line.

Turn snapping off with **Snap to objects and page** in the Figure section of the Inspector (click an empty part of the page to see it).

## The pen

Use the pen for freehand curves and outlines.

1. Click to place a **corner** point.
2. Press and drag to place a **smooth** point and pull out its curve handles.
3. Keep clicking to add points. A faint preview line follows the pointer.
4. To finish an open path, press **Enter** or double-click.
5. To make a closed shape, click on the first point again.
6. Press **Escape** to throw the path away.

A closed path has a fill; an open path is just a line. Both are edited in the Style section like any other shape. A drawn open path can also be turned into a membrane, a DNA helix or a row of receptors (see [Scientific objects](08-objects.md)).

## Style

Select a shape and use the Inspector's Style section for **Fill** (rectangles, ellipses and closed paths), **Stroke**, **Width (pt)**, **Dash** (Solid, Dashed or Dotted) and, for a rectangle, **Corner (pt)**. Each colour control offers the figure's palette swatches, a set of colourblind-safe quick colours and "none" (see [Colours and palettes](09-colours.md)).
