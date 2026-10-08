# PDF fixtures for src/io/pdf (note 13), made with matplotlib 3.11:
#   python scripts/pdf-fixtures/matplotlib.py src/io/pdf/fixtures
import sys
import matplotlib
matplotlib.use("pdf")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np
out = sys.argv[1]
matplotlib.rcParams["pdf.compression"] = 6
matplotlib.rcParams["svg.hashsalt"] = "x"
import os
os.environ["SOURCE_DATE_EPOCH"] = "0"
def lines(fonttype):
    matplotlib.rcParams["pdf.fonttype"] = fonttype
    fig, ax = plt.subplots(figsize=(3.2, 2.4))
    x = np.linspace(0, 10, 40)
    ax.plot(x, np.sin(x), "-o", ms=3, label="sin")
    ax.plot(x, np.cos(x) * 1.6, "--", label="cos")
    ax.set_ylim(-1.2, 1.2)  # cos runs outside: clipped by the axes
    ax.set_xlabel("Time (s)")
    ax.set_ylabel(r"Signal $\mu$V")
    ax.set_title("Two waves")
    ax.legend(loc="upper right", fontsize=7)
    fig.tight_layout()
    return fig
f = lines(3); f.savefig(f"{out}/matplotlib-type3.pdf", metadata={"CreationDate": None}); plt.close(f)
f = lines(42); f.savefig(f"{out}/matplotlib-truetype.pdf", metadata={"CreationDate": None}); plt.close(f)
matplotlib.rcParams["pdf.fonttype"] = 42
with PdfPages(f"{out}/matplotlib-pages.pdf", metadata={"CreationDate": None}) as pp:
    fig, ax = plt.subplots(figsize=(2.4, 2))
    ax.bar(["A", "B", "C"], [3, 5, 2], color=["#0072b2", "#e69f00", "#009e73"])
    ax.set_ylabel("Count")
    fig.tight_layout(); pp.savefig(fig); plt.close(fig)
    fig, ax = plt.subplots(figsize=(2.4, 2))
    ax.imshow(np.arange(16).reshape(4, 4), cmap="viridis")
    ax.set_title("Heatmap")
    fig.tight_layout(); pp.savefig(fig); plt.close(fig)
