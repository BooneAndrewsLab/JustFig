# SVG fixture for label alignment (note 15, issue 38): labels that change colour, drawn as glyph
# outlines (svg.fonttype 'path', the default). A title of three runs in three colours ("rainbow
# text": each run its own text, chained with annotate as in matplotlib's gallery) centred over the
# left axes; a two-line title over the right axes whose second line is grey (two texts, both
# centred); three-line group labels under the right axes' ticks with the last line grey; a legend
# whose entries take their line's colour (labelcolor="linecolor"), which stays apart and at start.
# Made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-colour-runs.py src/io/svg/fixtures/matplotlib-colour-runs.svg
# The same plot as a PDF (pass a .pdf path) imports alike.
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

out = sys.argv[1]
matplotlib.use("pdf" if out.endswith(".pdf") else "svg")
import matplotlib.pyplot as plt
from matplotlib.transforms import offset_copy

matplotlib.rcParams["svg.hashsalt"] = "x"
fig, (ax, bx) = plt.subplots(1, 2, figsize=(6, 2.6))
ax.plot([0, 1, 2, 3], [1, 3, 2, 4], color="#4c72b0", label="wild type")
ax.plot([0, 1, 2, 3], [2, 2.5, 3.5, 3], color="#dd8452", label="mutant")
ax.set_xlabel("Time (h)")
ax.legend(loc="upper left", labelcolor="linecolor", frameon=False)
# Rainbow title: runs chained end to end, then the chain moved to centre over the axes.
runs = [("Wild type", "#4c72b0"), (" vs ", "black"), ("mutant", "#dd8452")]
first = ax.text(0, 1.04, runs[0][0], color=runs[0][1], transform=ax.transAxes, fontsize=11)
texts = [first]
for s, c in runs[1:]:
    texts.append(
        ax.annotate(s, xycoords=texts[-1], xy=(1, 0), va="bottom", color=c, fontsize=11)
    )
fig.tight_layout(w_pad=3)
r = fig._get_renderer()
x0 = texts[0].get_window_extent(r).x0
x1 = texts[-1].get_window_extent(r).x1
box = ax.get_window_extent(r)
shift = (box.width - (x1 - x0)) / 2 * 72 / fig.dpi
first.set_transform(offset_copy(ax.transAxes, fig, x=shift, units="points"))
bx.plot([0, 0, 0, 1, 1, 1], [2, 2.4, 1.7, 3, 3.3, 2.6], "o", color="#55a868", ms=4)
bx.set_xlim(-0.6, 1.6)
# Three-line group labels under the ticks (one text per line), the sample size in grey: only the
# first line is near its tick.
bx.set_xticks([0, 1], ["", ""])
under = bx.get_xaxis_transform()
for i, lines in enumerate([("control", "siRNA", "n = 12"), ("knockdown", "A", "n = 9")]):
    for k, s in enumerate(lines):
        at = offset_copy(under, fig, y=-12 * k, units="points")
        grey = {"color": "#808080"} if k == 2 else {}
        bx.text(i, -0.1, s, ha="center", va="baseline", transform=at, **grey)
bx.text(0.5, 1.13, "Viability", ha="center", transform=bx.transAxes)
bx.text(0.5, 1.03, "48 h, n = 3", ha="center", color="#808080", transform=bx.transAxes)
fig.savefig(out, metadata={"Date": None} if out.endswith(".svg") else {"CreationDate": None})
