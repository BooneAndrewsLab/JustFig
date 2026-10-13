# Drawing and editing shapes

The tool palette lists the tools. Hover over a tool to see its name and key. After you draw one object the tool goes back to Select, so each press of a tool makes one thing.

## The tools

| Tool        | What it does                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Select      | Click an object to select it, drag to move it, drag on empty space to draw a selection box.                    |
| Pan         | Drag to move the view. Holding Space does the same with any tool.                                              |
| Rectangle   | Drag to draw. A plain click makes a 60 × 40 pt rectangle.                                                      |
| Ellipse     | Drag to draw. A plain click makes a 50 × 50 pt circle.                                                         |
| Line        | Drag from one end to the other, or click to place points. Attaches to objects like an arrow.                   |
| Pen         | Click corners, or press and drag to pull out a smooth curve. See below.                                        |
| Arrow       | Drag from the tail to the head. See [Arrows](03-arrows.md).                                                    |
| Text        | Click to type, or drag to set a width. See [Text](04-text.md).                                                 |
| Panel       | Drag to draw a lettered panel. A plain click makes a 200 × 150 pt panel. See [Arranging](05-arranging.md).     |
| Review note | Click an object to pin a note to it, or an empty spot to pin it there. See [Review notes](16-review-notes.md). |

The default keys are V, H, R, E, L, P, A, T, F and N. You can change them on the guide's Change shortcuts page.

New shapes get a fill and an outline in the default colours. Change them in the Style section of the Inspector.

## Modifier keys while drawing

- **Shift** with Rectangle or Ellipse makes a square or a circle.
- **Click to place points.** With Line or Arrow, a click without dragging places the first point; each further click adds a point, with a preview segment following the pointer. **Double-click** or press **Enter** to finish; **Esc** (or choosing another tool) finishes with the points placed so far, or cancels if only one is placed. A drag still draws a single segment.
- **Shift** with Line or Arrow snaps the angle to multiples of 45°.

## Selecting and moving

Click an object to select it. Drag it to move it. Hold Shift while dragging to move only straight across or straight up and down. The arrow keys nudge the selection by 1 pt, and Shift with an arrow key by 10 pt.

A click on something that sits on a panel selects that object. A click on the panel's empty area selects the panel itself. Locked objects can be selected but not dragged (see [Arranging](05-arranging.md)).

## Handles: resize and rotate

A selected object has a box with eight square handles and a round rotate handle above it. When it draws past that box, as lane labels over a gel photo do, a dashed outline also shows everything it draws; the handles stay on the box itself.

- Drag a **square handle** to resize. Corner handles change width and height together. Icons and images always keep their proportions; for anything else hold **Shift** to keep them. An imported plot keeps its text and line sizes while only its axes and data grow or shrink ([Import](11-import-and-other-apps.md)), unless you switch that off in the Inspector.
- Drag the **round handle** to rotate. Hold **Shift** to turn in 15° steps.
- For exact values, type into **X**, **Y**, **W**, **H** and **Rotate °** in the Inspector. The **Opacity %** field fades the object.
- **Flip H** and **Flip V** in the Inspector mirror the object.

Resizing a line, arrow or path rescales its points, so its line width stays the same.

## Snapping and smart guides

While you move or resize, the edges and centres of the selection snap to the edges and centres of other objects and of the page. Orange guide lines show what it has lined up with. Snapping works within a few pixels of the line. An object that draws past its frame, such as a gel with lane labels, snaps by everything it draws, labels included.

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

## Editing points

**Straight lines, arrows and polylines** need no mode: select one and every point shows a round handle in place of the box and rotate handles. **Drag a handle** to move that point; hold **Shift** to snap its angle to 45° from the neighbouring point. Dragging the line itself moves all of it, and a drag is one step in Undo. To rotate or scale a line or arrow, use the Inspector's fields. Drag a line's or an arrow's end over an object to attach it on release (a tag by the pointer says where: a side, the centre or the outline; hold **Alt** for the outline); release on empty canvas and it stays detached. A click without dragging on an attached end's handle lists where it can attach instead (see [Arrows](03-arrows.md)).

For anything else, and for curves, use the point-editing mode below.

You can reshape a path, line or arrow after drawing it, and the path that a membrane, a DNA helix or a row of receptors follows. **Double-click** it, select it and press **Enter**, or choose **Edit points** in the Inspector. Its points appear as squares (round for a smooth point), with the curve handles of smooth points as dots on thin lines. The point you work on is filled in, and a line at the bottom of the canvas says which point it is and where.

- **Drag a point** to move it. Its handles move with it.
- **Drag a handle** to bend the curve. On a smooth point the other handle turns with it, so the curve stays smooth.
- **Click on the line** between two points to add a point there. The shape does not change until you move it.
- **Delete** or **Backspace** removes the current point, or the current handle. A path always keeps at least two points.
- **S** makes the current point smooth or a corner. A new smooth point gets handles along the line between its neighbours.
- **Escape**, a click on empty canvas, or another tool ends point editing.

Each drag is one step in Undo. A point moves exactly under the pointer even when the path is rotated or flipped.

From the keyboard: **Tab** and **Shift+Tab** go to the next or previous point, including handles. The **arrow keys** move the current point by 1 pt, and with **Shift** by 10 pt. **I** adds a point halfway to the next one. You can change I and S on the guide's Change shortcuts page. **Edit points** in the Inspector moves the focus to the canvas, so these keys work from there.

An arrow or line attached to a closed path follows its outline when you move the path's points. Dragging the attached end point of an arrow detaches it, as dragging the whole arrow does.

## Style

Select a shape and use the Inspector's Style section for **Fill** (rectangles, ellipses and closed paths), **Stroke**, **Width (pt)**, **Dash** (Solid, Dashed or Dotted) and, for a rectangle, **Corner (pt)**. Each colour control offers the figure's palette swatches, a set of colourblind-safe quick colours and "none" (see [Colours and palettes](09-colours.md)).
