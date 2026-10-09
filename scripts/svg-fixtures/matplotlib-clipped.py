# Pictures under SVG clip paths (issue 36), made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-clipped.py src/io/svg/fixtures
# Left: an `interpolation='none'` imshow zoomed in with the axis limits; matplotlib writes the
# whole image under the axes' rectangular clip path. Right: an image clipped to a circle.
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams["svg.hashsalt"] = "x"
matplotlib.rcParams["svg.fonttype"] = "none"
out = sys.argv[1]

y, x = np.mgrid[-2:2:40j, -2:2:40j]
z = np.sin(3 * x) * np.cos(2 * y) + 0.3 * x
fig, (a, b) = plt.subplots(1, 2, figsize=(4.4, 2.2))
a.imshow(z, cmap="viridis", interpolation="none", extent=(-2, 2, -2, 2))
a.set_xlim(-1, 1.5)
a.set_ylim(-0.5, 1.5)
a.set_title("Zoomed")
im = b.imshow(z, cmap="magma", interpolation="none", extent=(-2, 2, -2, 2))
circle = mpatches.Circle((0, 0), 1.6, transform=b.transData, facecolor="none")
im.set_clip_path(circle)
b.set_title("Round")
fig.tight_layout()
fig.savefig(f"{out}/matplotlib-clipped.svg", dpi=100, metadata={"Date": None})
