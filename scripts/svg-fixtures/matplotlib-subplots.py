# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 32): a 2 × 2 grid of subplots with
# their own axis titles, one with a colour bar, one with a single-entry legend and no frame.
# Made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-subplots.py src/io/svg/fixtures/matplotlib-subplots.svg
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams["svg.hashsalt"] = "x"
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["font.size"] = 7
fig, axs = plt.subplots(2, 2, figsize=(4.8, 3.6))
x = np.linspace(0, 10, 40)
a, b, c, d = axs.flat
a.plot(x, np.sin(x), label="sin")
a.legend(frameon=False, loc="lower left")
a.set_xlabel("Time (h)")
a.set_ylabel("Signal")
a.set_title("A")
b.bar(["ctrl", "drug"], [3, 5], color=["#0072B2", "#D55E00"])
b.set_ylabel("Count")
b.set_title("B")
c.scatter(x[::3], np.cos(x[::3]), s=6)
c.set_xlabel("Dose (mg)")
c.set_ylabel("Response")
z = np.outer(np.sin(np.linspace(0, 3, 6)), np.cos(np.linspace(0, 3, 8)))
m = d.pcolormesh(z, cmap="viridis")
d.set_xlabel("Column")
cb = fig.colorbar(m, ax=d, label="Level")
cb.solids.set_rasterized(False)  # vector cells: an embedded image is dropped on import
fig.tight_layout()
fig.savefig(sys.argv[1], metadata={"Date": None})
