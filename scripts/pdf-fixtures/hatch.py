# Hatched fills (issue 37), made with matplotlib 3.11:
#   python -I scripts/pdf-fixtures/hatch.py src/io/pdf/fixtures
# (-I: matplotlib.py next to this script would shadow the library)
# Bars told apart by hatching for black-and-white printing, and a hatched band between two lines:
# matplotlib writes each hatch as a tiling pattern (a 72 pt cell of lines, over the face colour).
import os
import sys
import matplotlib
matplotlib.use("pdf")
import matplotlib.pyplot as plt
import numpy as np
out = sys.argv[1]
os.environ["SOURCE_DATE_EPOCH"] = "0"
matplotlib.rcParams["pdf.compression"] = 6
matplotlib.rcParams["pdf.fonttype"] = 42
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(4.8, 2.4))
for x, (h, face) in enumerate([("//", "white"), ("xx", "#e69f00"), ("..", "white"), ("\\\\", "#56b4e9")]):
    ax1.bar(x, [3, 5, 2, 4][x], color=face, edgecolor="black", hatch=h)
ax1.set_title("Hatched bars")
t = np.linspace(0, 1, 30)
ax2.fill_between(t, np.sin(3 * t), np.sin(3 * t) + 0.5, facecolor="none", edgecolor="#009e73", hatch="//")
ax2.set_title("Hatched band")
fig.tight_layout()
fig.savefig(f"{out}/matplotlib-hatch.pdf", metadata={"CreationDate": None})
