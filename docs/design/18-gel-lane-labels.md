# 18 Labelling lanes on a gel photo

Issue 13 (after the parade Inkscape extensions): the procedural gel (note 04) labels its own
drawn lanes, but most gels in a paper are photos. People need a row of lane labels over N evenly
spaced lanes of a picture, ladder sizes down one side, and labels that move with the picture.

- **A procedural kind, `gelLabels`, not new UI.** Lanes (a list of labels), the first and last
  lane centres (percent of the width; the rest evenly spaced), a label angle (level, 45°, 90°),
  ladder sizes (a list of label + height in percent from the top), their side, ticks, and a text
  size in points. The Inspector, decoder, test arbitraries and Objects-shelf entry all come from
  `fields`, as for every kind; it can also be placed from the shelf by hand.
- **The frame is the picture's box; the labels hang outside it** (the kind's `overhang`, which
  the bounded-render property test enforces). Lane and size positions are fractions of the
  frame, so any resize of the frame keeps each label on the same place on the photo, and a
  procedural resize only changes the frame, so text keeps its point size (journals' minimum).
  Rejected: a frame that includes the label band and size column, as the drawn gel does. The
  margins are either in points (then a resize moves the lane area off the photo by
  `(s − 1) × margin`) or fractions (then changing them shifts the lanes under a fixed frame).
- **Following the picture is a group** (the existing mechanism), not a new binding. **Label gel
  lanes**, a button in the Inspector's Image section (PNG/JPEG only), runs one named edit,
  `labelGelImage`: a `gelLabels` object on the picture's frame (rotation kept, flips dropped so
  text stays readable) and a group of the two at the picture's place, one undo step. The labels
  are selected so lane names can be typed at once. Rejected: binding like arrows (note 06), which
  would need a model field, a `.jfig` schema bump and reconcile code for what a group already
  does; and auto-detecting lanes from the pixels (guesswork on smeared or tilted gels; the two
  percentages are quick to set by eye).
- **Hanging labels count where they show** (issue 44, for every kind that draws past its frame,
  not just this one). `objBounds` stays the frame: it is the geometry that resizing, binding and
  the Inspector's X/Y/W/H work on, and handles on a box that includes fixed-size text would make a
  resize drag miss. `drawnBounds` (`src/procedural/bounds.ts`) is the frame plus the box of the
  kind's primitives (text measured with our layout, strokes padded), turned with the frame and
  unioned through groups. Align, distribute and Arrange in grid take it as their `boxOf` (core
  edits default to `objBounds` and do not import procedural code; the UI passes it). The canvas
  draws a dashed outline of it when the selection draws past its handles' box. Grid layout fits
  the drawn box into the cell: labels keep their point size, so a scaled object's drawn box misses
  by (1 − scale) × the labels' reach; a few more uniform steps from where it landed close that to
  under 0.01 pt, keeping the photo's aspect ratio. The snapshot's viewBox covers the drawn box
  (note 04), so an app without the kind shows the labels too.
- **Uneven lanes** (a gap in the comb): each lane has a `shift`, percent of the width off its even
  place, clamped to the picture. A new item field with a default, so no `version` bump (note 04:
  old documents decode to 0). Rejected: a lane-position list replacing first/last (one gap would
  mean typing every lane), and a "gap after lane N" field (combs with several gaps).
- **Known limits.** Clicking the hanging labels does not select the object (its hit area is the
  frame), and snapping still uses frames.
