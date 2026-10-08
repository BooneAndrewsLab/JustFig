# SVG fixture for src/io/svg/glyphText.ts (note 12): a log-log plot whose labels are
# matplotlib mathtext drawn as glyph outlines (svg.fonttype 'path', the default).
# Made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-log.py src/io/svg/fixtures/matplotlib-log.svg
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams["svg.hashsalt"] = "x"
fig, ax = plt.subplots(figsize=(3.2, 2.4))
x = np.logspace(0, 4, 30)
ax.loglog(x, 3 * x**1.5, "-o", ms=3)
ax.set_xlabel(r"Dose ($\mu$M)")
ax.set_ylabel(r"Signal $\times 10^{3}$")
ax.set_title(r"$\alpha_{1}$ response, $\Delta = -2$")
ax.text(2, 1e5, r"$\frac{1}{2}$")  # a fraction: stays outlines
fig.tight_layout()
fig.savefig(sys.argv[1], metadata={"Date": None})
