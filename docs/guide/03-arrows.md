# Arrows

Arrows are made for pathway diagrams: choose the head at each end, bend them, and attach them to objects so they follow when you move things.

## Drawing an arrow

Choose the Arrow tool (key A) and drag from the tail to the head, or click to place the tail and then each further point (double-click or Enter finishes, Esc finishes with the points so far, or cancels if only the tail is placed). The head goes on the last point. Hold Shift to snap the angle to 45°. An arrow has a triangle head at its end by default.

An arrow made with the Pen or Line tool is a plain path, not an arrow. Use the Arrow tool for anything that needs a head.

## Heads

Select the arrow and open the Inspector's **Arrow** section. **Start** and **End** each offer:

- None
- Triangle
- Open
- Stealth
- Bar (inhibition ⊣), for "inhibits" or "represses"
- Circle
- Diamond

**Head size** sets the size of both heads. The line itself is styled in the Style section: **Stroke**, **Width (pt)** and **Dash**.

## Curved arrows

A straight arrow with two end points has a **Curve %** field in the Arrow section. A positive number bends it one way, a negative number the other, and 0 makes it straight again.

## Elbow and curved routes

The Arrow section's **Route** list sets how the arrow runs between its ends:

- **Straight**: the arrow keeps the points you drew (the default).
- **Elbow**: right-angle corners only, like a flowchart connector. The arrow leaves each attached end straight out of the side it is attached to, turns once when the two sides are at right angles, makes a Z when they face each other, and loops round in a U when both face the same way. It keeps clear of the two objects it joins (not of other objects).
- **Curve**: one smooth curve that leaves and enters each end straight out of its side.

An elbow or curved arrow redraws itself whenever an end or an attached object moves, so its middle points are not dragged by hand: a selected one shows handles on its two ends only. An end on an object's outline (not on a connection point) uses the side facing the other end. A free end, or one on the centre point, has no side; the arrow picks a direction from where the other end is. When neither end has a side, **First leg** chooses whether the elbow starts **horizontal** or **vertical** (**automatic** takes the longer direction).

An elbow with a middle segment (a Z, a U, or a longer route) shows a diamond handle in the middle of it. Drag it to slide the segment sideways; for a U it sets how far out the loop goes. The position is kept as a fraction of the distance between the ends, so it stays in proportion when you move the objects. Double-click the handle, or press **Reset middle**, to put it back. The **Middle %** field sets the same thing from the keyboard. An elbow with a single corner has no handle.

Setting the route back to **Straight** keeps the points as they are now, so an elbow becomes an ordinary arrow with corners that you can edit point by point.

## Attaching arrows to objects

An arrow can be attached at either end to a shape, icon, text, image or any other object on the page, except a panel or another arrow. Attached arrows follow the object when you move, resize, rotate, align or nudge it.

To attach:

- **Press** the Arrow tool on an object to attach the tail to it.
- **Release** on an object to attach the head to it.

While you drag, the object under the pointer is outlined to show where the end will attach, and its **connection points** appear as small dots: the middle of each side (top, right, bottom, left) and the centre. Bring the pointer within a few pixels of a dot and it fills in; the end snaps to it and stays fixed there. Anywhere else on the object, the end slides: it sits just outside the object's outline, on the line towards the other end, and moves round the outline as things move.

An end on a connection point keeps to that point when you move, resize, rotate or flip the object: the "right" point turns with the object, so a rotated box still has the arrow leaving the same side. A connection point is a little outside its side (or exactly at the centre).

To see or remove an attachment, select the arrow. The Arrow section shows "Start attached to …" and "End attached to …", a list of where on the object that end attaches (**outline** for a sliding end, or **top**, **right**, **bottom**, **left**, **centre**) and a **Detach** button for each end. Choosing another entry in the list moves the end there. After detaching, the arrow stays where it is but no longer follows.

**Dragging an end point** of a selected arrow moves just that end. While you drag, the object under the pointer is outlined with its connection points; release on a point to attach the end there, elsewhere on the object to attach it sliding, and in empty space the end stays detached.

**Dragging the arrow itself** detaches any end that you move away. Moving the arrow together with the objects it is attached to (select them all and drag) keeps it attached.

Other things to know:

- If you delete the object or convert it to shapes, the arrow stays but is detached.
- Copying an arrow along with its objects keeps the copy attached to the copies, at the same connection points. Copying the arrow alone gives a free arrow.
- Undo restores the arrow and its attachment together.
