"""TIFF writer oracle (libtiff via Pillow): decodes TIFFs written next to
their raw RGBA pixels (`<n>.tif` + `<n>.raw`, as written by a test run
with TIFF_ORACLE_DIR set) and fails on any pixel difference.

    TIFF_ORACLE_DIR=/tmp/tiffs npx vitest run src/export/tiff
    python3 scripts/oracle/check_tiff_roundtrip.py /tmp/tiffs
"""
import pathlib
import sys

from PIL import Image


def main() -> int:
    d = pathlib.Path(sys.argv[1])
    bad = 0
    tifs = sorted(d.glob("*.tif"))
    for tif in tifs:
        raw = tif.with_suffix(".raw").read_bytes()
        with Image.open(tif) as im:
            if im.convert("RGBA").tobytes() != raw:
                bad += 1
                print(f"mismatch: {tif.name}", file=sys.stderr)
    print(f"{len(tifs)} TIFFs checked, {bad} mismatches")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
