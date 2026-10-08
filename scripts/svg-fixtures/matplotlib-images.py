# Plots with embedded pictures (issue 24), as PDF and SVG, made with matplotlib 3.11:
#   python scripts/svg-fixtures/matplotlib-images.py src/io/pdf/fixtures src/io/svg/fixtures
# Left: an interpolated imshow (a picture, not blocks) with a contour drawn over it and a
# colour bar. Right: a scatter layer rasterized at 100 dpi (transparent around the dots) on a
# grid, with a vector line on top.
import os
import sys

os.environ["SOURCE_DATE_EPOCH"] = "0"
import matplotlib

matplotlib.use("pdf")
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams["pdf.fonttype"] = 42
matplotlib.rcParams["pdf.compression"] = 9
matplotlib.rcParams["svg.hashsalt"] = "x"
matplotlib.rcParams["svg.fonttype"] = "none"
pdf_out, svg_out = sys.argv[1], sys.argv[2]

rng = np.random.default_rng(24)
fig, (a, b) = plt.subplots(1, 2, figsize=(5, 2.2))
y, x = np.mgrid[-2:2:12j, -2:2:12j]
z = np.exp(-(x**2 + y**2)) + 0.5 * np.exp(-((x - 1) ** 2 + (y + 1) ** 2) * 3)
im = a.imshow(z, cmap="magma", interpolation="bilinear", extent=(-2, 2, -2, 2))
a.contour(x, y, z, levels=[0.5], colors="white", linewidths=0.8)
a.set_title("Field")
fig.colorbar(im, ax=a, shrink=0.8)
pts = rng.normal(size=(400, 2))
b.scatter(pts[:, 0], pts[:, 1], s=6, alpha=0.6, color="#0072b2", rasterized=True)
b.plot([-3, 3], [-3, 3], color="#d55e00", lw=1)
b.grid(True, lw=0.4)
b.set_axisbelow(True)
b.set_title("Cells")
b.set_xlabel("PC1")
fig.tight_layout()
fig.savefig(f"{pdf_out}/matplotlib-images.pdf", dpi=100, metadata={"CreationDate": None})
fig.savefig(f"{svg_out}/matplotlib-images.svg", dpi=100, metadata={"Date": None})
