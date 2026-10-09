# Writes src/io/pdf/fixtures/photo.pdf (issue 36): a figure panel with JPEG photos, as
# pdfTeX, Illustrator or Inkscape embed them (DCTDecode, the JPEG's own bytes).
#   python scripts/pdf-fixtures/photo.py src/io/pdf/fixtures
# Left: a synthetic micrograph (240 x 180 pixels) placed whole, with a frame, scale bar
# and label. Right: a second photo (160 x 120) under a clip that cuts it.
# Needs numpy and Pillow; the PDF is written by hand so the image streams stay JPEG.
import io
import sys

import numpy as np
from PIL import Image

out = sys.argv[1]
rng = np.random.default_rng(36)


def micrograph(w, h, cells):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    img = np.zeros((h, w, 3))
    for _ in range(cells):
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(6, 18)
        d = np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r))
        img += d[..., None] * rng.uniform(0.2, 1, 3)
    img += rng.normal(0, 0.06, img.shape)  # sensor noise: what makes photos big as PNG
    img = np.clip(img / img.max(), 0, 1) * 255
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8)).save(buf, "JPEG", quality=80)
    return buf.getvalue()


im1 = micrograph(240, 180, 40)
im2 = micrograph(160, 120, 20)
content = b"""q 150 0 0 112.5 20 60 cm /Im1 Do Q
0 0 0 RG 1 w 20 60 150 112.5 re S
2 w 30 50 m 70 50 l S
BT /F1 9 Tf 30 38 Td (10 um) Tj ET
q 200 60 120 90 re W n 160 0 0 120 190 50 cm /Im2 Do Q
BT /F1 9 Tf 200 38 Td (Detail) Tj ET
"""


def image(data, w, h):
    head = b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB " % (w, h)
    return head + b"/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % len(data) + data + b"\nendstream"


objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 340 190] /Contents 4 0 R "
    b"/Resources << /Font << /F1 7 0 R >> /XObject << /Im1 5 0 R /Im2 6 0 R >> >> >>",
    b"<< /Length %d >>\nstream\n" % len(content) + content + b"endstream",
    image(im1, 240, 180),
    image(im2, 160, 120),
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
offsets = []
for i, body in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf += b"%d 0 obj\n" % i + body + b"\nendobj\n"
xref = len(pdf)
pdf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
pdf += b"".join(b"%010d 00000 n \n" % o for o in offsets)
pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
open(f"{out}/photo.pdf", "wb").write(pdf)
