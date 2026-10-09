# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 39): two subplots joined by lines drawn
# across the gap between them (`ConnectionPatch` from a zoomed region to its close-up).
# Made with matplotlib 3.10:
#   python scripts/svg-fixtures/matplotlib-connected.py src/io/svg/fixtures/matplotlib-connected.svg
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import ConnectionPatch, Rectangle

matplotlib.rcParams["svg.hashsalt"] = "x"
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["font.size"] = 7
fig, (a, b) = plt.subplots(1, 2, figsize=(4.8, 2.4))
fig.subplots_adjust(left=0.1, right=0.97, bottom=0.18, top=0.9, wspace=0.3)
x = np.linspace(0, 10, 200)
y = np.sin(x) * np.exp(-x / 6)
a.plot(x, y)
a.set_xlabel("Time (h)")
a.set_ylabel("Signal")
a.add_patch(Rectangle((2, -0.6), 2, 1.3, fill=False, lw=0.8))
# Only the zoomed part: lines are not cut to their axes' clip on import.
z = (x >= 2) & (x <= 4)
b.plot(x[z], y[z])
b.set_xlim(2, 4)
b.set_ylim(-0.6, 0.7)
b.set_xlabel("Time (h)")
for ya, yb in ((0.7, 1), (-0.6, 0)):
    fig.add_artist(
        ConnectionPatch((4, ya), (0, yb), "data", "axes fraction", axesA=a, axesB=b, lw=0.8)
    )
fig.savefig(sys.argv[1], metadata={"Date": None})
