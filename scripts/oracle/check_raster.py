"""Optional Python oracle (as PlasmidPop's scripts/oracle/): Pillow reads
exported TIFF and PNG files and reports size, mode, DPI and compression.

    python3 scripts/oracle/check_raster.py figure.tiff figure.png [--dpi 300]

Exits non-zero when a file cannot be read or its DPI differs from --dpi.
"""
import argparse
import sys

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--dpi", type=float)
    args = ap.parse_args()
    ok = True
    for path in args.files:
        with Image.open(path) as im:
            im.load()
            dpi = im.info.get("dpi")
            print(f"{path}: {im.format} {im.size[0]}x{im.size[1]} {im.mode} dpi={dpi} "
                  f"compression={im.info.get('compression')}")
            if args.dpi is not None and (dpi is None or abs(dpi[0] - args.dpi) > 0.5):
                print(f"  expected {args.dpi} dpi", file=sys.stderr)
                ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
