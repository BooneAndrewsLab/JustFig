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
- **Known limits.** Selection boxes and `objBounds` are the frame, so the selection outline,
  align/distribute and grid layout ignore the hanging labels; an app that does not know the kind
  draws its snapshot, which is clipped to the frame and so shows no labels. Unevenly spaced lanes
  (a gap in the comb) need two label objects or plain text.
