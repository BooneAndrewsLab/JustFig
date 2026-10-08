# Clip shapes and shadings (issue 25), made with matplotlib 3.11:
#   python -I scripts/pdf-fixtures/shading.py src/io/pdf/fixtures
# (-I: matplotlib.py next to this script would shadow the library)
# A polar plot clips its line and fill to the circle of the plot area; a Gouraud pcolormesh is
# written as a mesh shading (type 4) under the axes' rectangular clip.
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
fig = plt.figure(figsize=(4.8, 2.4))
ax = fig.add_subplot(1, 2, 1, projection="polar")
th = np.linspace(0, 2 * np.pi, 61)
r = 1 + 0.5 * np.sin(3 * th)
ax.plot(th, r * 1.2, color="#d55e00")  # the petals run past the rim: cut by the circle
ax.fill(th, r, color="#0072b2", alpha=0.4)
ax.set_rmax(1.3)
ax.set_title("Rose")
ax = fig.add_subplot(1, 2, 2)
x, y = np.meshgrid(np.linspace(0, 1, 6), np.linspace(0, 1, 5))
ax.pcolormesh(x, y, np.sin(3 * x) + y, shading="gouraud", cmap="viridis")
ax.set_xlim(0, 0.9)  # the mesh runs past the right edge: cut by the axes
ax.set_title("Gouraud")
fig.tight_layout()
fig.savefig(f"{out}/matplotlib-shading.pdf", metadata={"CreationDate": None})
