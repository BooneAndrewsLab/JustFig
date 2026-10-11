# Fonts

Arimo, Tinos and Cousine from ChromeOS croscore fonts 1.31.0
(`croscorefonts-1.31.0.tar.bz2`), Apache License 2.0 (`LICENSE-Apache-2.0.txt`).

Subset with fontTools `pyftsubset` to Basic Latin, Latin-1, Latin Extended-A,
Greek, general punctuation, super/subscripts, letterlike symbols, arrows,
math operators and geometric shapes, no layout features, no hinting:

    pyftsubset X.ttf --unicodes="U+0020-007E,U+00A0-017F,U+0391-03C9,U+03D1,U+03D5,U+03D6,U+2010-2027,U+2030-2033,U+2070-209F,U+2190-21FF,U+2200-22FF,U+2100-214F,U+25A0-25FF" --layout-features='' --no-hinting

The TTFs are read by opentype.js (text layout and outlining) and embedded by
jsPDF in PDF exports, and served as web fonts for the on-screen canvas.

## UI font: Archivo

`archivo-ui.woff2` sets the editor's chrome only (`src/ui/theme.css`, note 51); figure text
never uses it. Archivo, by the Archivo Project Authors, SIL Open Font License 1.1
(`LICENSE-OFL-1.1-Archivo.txt`), from https://github.com/Omnibus-Type/Archivo. The file is
copied unchanged from BarelySig (`public/fonts/archivo-ui.woff2`, built there by
`scripts/make-ui-font.py`): one variable font, weight axis trimmed to 380–720, width pinned
at 100, subset to Latin, Latin-1, Latin Extended-A and the interface's punctuation. Glyphs
outside the subset fall back to the system font.
