#!/usr/bin/env sh
# Regenerates public/icons/*.png from the app-icon SVGs in design/logo/
# (design/logo/README.md). Requires rsvg-convert (librsvg). Run from the repo root.
set -eu
rsvg-convert -w 192 -h 192 -o public/icons/icon-192.png design/logo/justfig-app-icon.svg
rsvg-convert -w 512 -h 512 -o public/icons/icon-512.png design/logo/justfig-app-icon.svg
# Maskable: the mark sits inside the central 80 % safe zone.
rsvg-convert -w 512 -h 512 -o public/icons/icon-maskable-512.png design/logo/justfig-app-icon-maskable.svg
