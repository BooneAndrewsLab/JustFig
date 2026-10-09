# SVG fixture for label alignment (note 15, issue 33): labels of several lines drawn as glyph
# outlines (svg.fonttype 'path', the default), one start-anchored run per line: three-line x tick
# labels and two-line axis titles (centred), two-line y tick labels of a horizontal bar chart
# (right-aligned), a left-aligned two-line title and annotation, and a legend.
# Made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-multiline.py src/io/svg/fixtures/matplotlib-multiline.svg
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt

matplotlib.rcParams["svg.hashsalt"] = "x"
fig, (ax, bx) = plt.subplots(1, 2, figsize=(6, 2.8))
groups = ["WT\nday 1\nrep A", "mutant\nday 1\nrep A", "WT\nday 14\nrep B"]
ax.bar(groups, [3, 5, 4], color="#4c72b0", label="mean")
ax.plot(groups, [3.4, 5.6, 4.3], "o", color="#dd8452", ms=3, label="replicate")
ax.set_xlabel("Genotype and\ntime point")
ax.set_ylabel("Relative\nsignal")
ax.set_title("Treated cells\nn = 3", loc="left")
ax.text(1.6, 5.4, "left aligned\nnote", ha="left")
ax.set_ylim(0, 7)
ax.legend(loc="upper left", frameon=True)
bx.barh(["control\nsiRNA", "knockdown\nA", "B"], [2, 3, 1], color="#55a868")
bx.set_xlabel("Fold change")
fig.tight_layout()
fig.savefig(sys.argv[1], metadata={"Date": None})
