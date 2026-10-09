# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 34): a wide panel above two rows of
# two, with one colour bar shared by the right-hand column (`fig.colorbar(m, ax=[c, e])`), so the
# bar lies across two rows and inside the wide panel's width.
# Made with matplotlib 3.10:
#   python scripts/svg-fixtures/matplotlib-shared-colorbar.py src/io/svg/fixtures/matplotlib-shared-colorbar.svg
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
fig, axs = plt.subplot_mosaic("AA;BC;DE", figsize=(4.8, 4.2))
fig.subplots_adjust(left=0.12, right=0.97, bottom=0.1, top=0.94, wspace=0.35, hspace=0.45)
x = np.linspace(0, 10, 40)
axs["A"].plot(x, np.sin(x))
axs["A"].set_ylabel("Signal")
axs["A"].set_title("A")
for k, ph in (("B", 0.0), ("D", 1.0)):
    axs[k].plot(x, np.cos(x + ph))
    axs[k].set_ylabel("Response")
axs["D"].set_xlabel("Time (h)")
z = np.outer(np.sin(np.linspace(0, 3, 6)), np.cos(np.linspace(0, 3, 8)))
for k in ("C", "E"):
    m = axs[k].pcolormesh(z, cmap="viridis", vmin=-1, vmax=1)
axs["E"].set_xlabel("Column")
cb = fig.colorbar(m, ax=[axs["C"], axs["E"]], label="Level")
cb.solids.set_rasterized(False)  # vector cells: an embedded image is dropped on import
fig.savefig(sys.argv[1], metadata={"Date": None})
