# See-through pictures that are turned or overlap (issue 40), as SVG, made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-see-through.py src/io/svg/fixtures
# Left: an RGBA picture of soft dots (clear around them) turned by 30 degrees over a grey panel
# with a white grid. Right: two such pictures, the second overlapping the first. Their clear
# pixels must show the panel and the grid (drawn before them: zorder 1 puts them over it), and
# the grid lines must not cross their dots.
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.transforms import Affine2D

matplotlib.rcParams["svg.hashsalt"] = "x"
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["image.composite_image"] = False
out = sys.argv[1]

rng = np.random.default_rng(40)


def dots(rgb, n=40, count=30):
    cx = rng.uniform(3, n - 3, count)
    cy = rng.uniform(3, n - 3, count)
    j, i = np.mgrid[0:n, 0:n]
    d = np.min(np.hypot(i[..., None] - cx, j[..., None] - cy), axis=-1)
    img = np.zeros((n, n, 4))
    img[..., :3] = rgb
    img[..., 3] = np.clip(1 - d / 2.5, 0, 1)
    return img


fig, (a, b) = plt.subplots(1, 2, figsize=(5, 2.4))
for ax in (a, b):
    ax.set_facecolor("#ebebeb")
    ax.grid(True, color="white", linewidth=1)
    ax.set_axisbelow(True)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
im = a.imshow(dots((0, 0.45, 0.7)), extent=(3, 7, 3, 7), interpolation="none", zorder=1)
im.set_transform(Affine2D().rotate_deg_around(5, 5, 30) + a.transData)
a.set_title("Turned")
b.imshow(dots((0, 0.45, 0.7)), extent=(1, 6, 1, 6), interpolation="none", zorder=1)
b.imshow(dots((0.8, 0.3, 0)), extent=(4, 9, 4, 9), interpolation="none", zorder=1)
b.set_xlim(0, 10)
b.set_ylim(0, 10)
b.set_title("Overlapping")
fig.tight_layout()
fig.savefig(os.path.join(out, "matplotlib-see-through.svg"), metadata={"Date": None})
