# 31 PDF pictures as they are

Issue #58, after note 30: PDF export of the perf figure's 20 Mpx picture
still took about 7 s in both browsers.

## Where the time went

svg2pdf reads the picture (blob URL, note 30) into a binary string one byte
at a time, `btoa`s it into a data URI, loads that into an `<img>` for its
size, and hands it to jsPDF's `addImage`. jsPDF decodes the PNG (CRC checks,
unfiltering every row) and deflates the pixels again in JavaScript. A PDF
can read a PNG's compressed data as it is: `/FlateDecode` with
`/DecodeParms << /Predictor 15 /Colors n /BitsPerComponent 8 /Columns w >>`
is exactly a non-interlaced PNG's IDAT stream; a JPEG is `/DCTDecode`.

## What changed

`src/export/pdfImages.ts` (`pdfImage`) turns a picture's bytes into an image
XObject record:

- an 8-bit, non-interlaced grey or RGB PNG with no `tRNS` chunk: its IDAT
  bytes unchanged (several IDAT chunks joined);
- a JPEG with one or three 8-bit components: its bytes unchanged;
- any other 8-bit, non-interlaced PNG (palette, grey + alpha, RGBA, `tRNS`):
  decoded once (`decodePng`), colour and alpha split, each row behind PNG
  filter 2 (Up), deflated on the platform's `CompressionStream`; alpha
  becomes an `/SMask` only when some pixel is not opaque (canvas PNGs are RGBA
  even when opaque);
- anything else (16 bits, interlaced, CMYK JPEG, other formats): null, and
  the picture goes through svg2pdf and jsPDF as before (blob URL when big).

The SVG is still the one renderer's (`nodeToSvgString`); only the href of
a prepared picture changes, through `RenderCtx.imageHref` as in note 30.
`pdfPictures` (`src/export/pdf.ts`) gives each prepared picture a 1 x 1 PNG
stand-in data URI (a different colour each, since svg2pdf rebuilds the URI
from the bytes). svg2pdf parses and places it as any picture: transform,
opacity, z-order. Pictures are drawn with `preserveAspectRatio="none"`, so
its 1 x 1 viewBox maps onto the frame like the real pixels would. On the
jsPDF instance, `addImage` is wrapped: a stand-in's URI becomes a call with
a marker and the format `PREPARED`, whose processor (registered on
`jsPDF.API`, as jsPDF's own PNG and JPEG support are) returns the prepared
record; jsPDF's `putImage` writes it as the XObject, soft mask included,
without touching the data. The alias makes a picture used twice (or on two
pages) one XObject.

Two string conversions were also slow: `String.fromCharCode(...chunk)` with
32 k arguments (1 s for 16 MB; `apply` on 8 k, 0.2 s), and `fromBase64`'s
byte loop (0.6 s in Firefox for 21 M characters; `Uint8Array.fromBase64`
where the browser has it, 30 ms).

## Numbers (perf spec, 20 Mpx grey PNG, headless)

|            | Chromium before | Chromium after | Firefox before | Firefox after |
| ---------- | --------------- | -------------- | -------------- | ------------- |
| PDF export | 7.7 s           | 1.5 - 1.8 s    | 6.7 s          | 1.8 - 1.9 s   |
| SVG export | 1.4 s           | 1.3 - 1.6 s    | 1.6 s          | 1.5 - 1.6 s   |

SVG export (the same download, no PDF work) is the floor of what the spec
measures, so the PDF now costs a fraction of a second on top. The PDF budget
goes from 30 s to 15 s like the others (note 29).

## Tests

`src/export/pdfImages.test.ts`: an RGB PNG's IDAT is in the PDF byte for
byte with the right `/DecodeParms`; split IDAT chunks are joined; an RGBA
PNG's colour and soft mask inflate and unfilter back to its pixels; an
opaque RGBA PNG has no mask; 16-bit, interlaced and CMYK pictures are left
to jsPDF; a picture used twice is one XObject drawn twice, the translucent
use with its ExtGState. The spike test (note 03) and the perf spec still
pass. Checked by eye with `pdftoppm` (rotated, translucent and see-through
pictures) and `qpdf --check`.

## Not done

Firefox PNG/TIFF at a resolution where a big picture keeps all its pixels
(note 30, "Known limits") is issue #59: the rasteriser's SVG can only take
`data:` URIs, and drawing pictures between SVG layers breaks group opacity.
