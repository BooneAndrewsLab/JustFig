# 43 TIFF import: micrographs with their calibration

Issue #65 (`LANDSCAPE.md`, 2026-10-10 pass). Micrographs leave the microscope and ImageJ as TIFF, often
16-bit, often several channels, carrying the pixel size. Import took PNG and JPEG only, the scale bar
(note 19) wanted the pixel size typed, and Levels (note 27) worked on 8 bits.

## The reader (`io/tiffDecode.ts`, our own, no library)

Small and strict. Little and big endian; compression none, LZW (TIFF flavour, early change) and Deflate
(8 and 32946, `fflate`'s `unzlibSync`); 8 and 16 bits; PhotometricInterpretation 0 (WhiteIsZero, inverted),
1 and 2; chunky and planar; strips and tiles; predictor 2; the IFD chain, skipping reduced-resolution
copies. Extra samples (alpha) are dropped. It refuses, with a message that says what it found: JPEG in TIFF
(and every other compression: PackBits, CCITT, JPEG 2000, Zstandard, LZMA), palette, CMYK, YCbCr, Lab, float
and signed samples, other bit depths, differing depths per channel, reversed bit order, BigTIFF, anything
over 300 Mpx, and damaged or cut-short data (an LZW code outside the table, a short strip). Rejecting is
the policy: a wrong guess at a pixel value would be silently wrong in a paper. `utif` stays a dev
dependency of the e2e torture spec only.

It runs in the PNG worker (note 33): `servePngWriter` answers a stateless `decodeTiff` request (no `start`)
with the decoded images moved back, `decodeTiffInWorker` is the main-thread side and reads on the thread
where there are no workers (unit tests). Decoding is pure on bytes (`readTiffForImport`), tested directly.

ImageJ keeps a stack as one IFD with every picture's bytes after the first one's and `images=N` in the
description; `withImageJPages` makes up the pages (uncompressed, untiled, chunky only, and only when the
bytes are all there).

## Calibration (`io/tiffCalibration.ts`)

The pixel size in µm, first that applies: OME-XML `PhysicalSizeX` with its unit (default µm; a regex on the
first `<Pixels>`, no XML parser, as the worker has none); ImageJ's `unit=` (micron, um, µm, nm, mm, cm, m,
Å, inch, also the escaped `µm`) with XResolution, which ImageJ stores as pixels per unit; then the
resolution tags in centimetres, or in inches unless the value is a default no instrument means (1, 72, 96,
150, 300, 600 dpi). `unit=pixel` or a result outside the scale bar's own range (0.0001 to 1000 µm/px) is no
calibration. Pixels whose vertical size differs from the horizontal by over 1 % warn, and the horizontal
size is used.

Stored as `UserAssetMeta.pixelSize` (µm per pixel) on the picture's asset. Rejected: `Image.pixelSize` or a
field on the scale bar's group (note 19 rejected a model field for it; an asset's meta is where the
intrinsic size already lives, and a bake that makes a new asset (levels, merge) copies it with one line:
`calibrated` in `io/levels.ts`, the merge in `ChannelsDialog`). `addScaleBar` reads it from `o.asset` and
sets the bar's `pixelSize`; a crop does not change it (pixels keep their size), `imageWidth` still follows
the crop (note 20). The Inspector's Image section shows it.

## 16 bits

A 16-bit grey picture is two assets. The **source** is a 16-bit grey PNG (`encodeGreyPng` /
`decodeGrey16Png` in `io/png.ts`: colour type 0, depth 16, Paeth rows, deflate by `CompressionStream`),
about the size of the TIFF's own LZW; it is `Image.levels.base`, so it is saved (`objectAssets`), and never
drawn: a browser would show it as 8 bits. The **shown** asset is an 8-bit grey PNG baked from it. 8-bit grey
TIFFs are stored as 8-bit grey PNGs the same way (not RGB: a third of the bytes).

`UserAssetMeta.peak` (1-65535, the brightest sample) marks a 16-bit source. Levels sliders keep their 0-255
units but span **0 to `peak`**: black is `min/255 x peak`, full is `max/255 x peak` (`levelsTable16`,
`levels16To8`), linear between, then invert. Spanning 0-65535 would leave a 12-bit camera's 4095 levels a
sixteenth of the slider; spanning the data keeps 255 steps over what is there. The import starts at 0-255 over
that range, so the first view is the brightest value at white. Nothing is lost: the base holds every sample,
and Levels re-bake from it, never compounding (note 27). The whole-picture rule stands.

Consequences wired in:

- `needsBake(src, levels)`: a 16-bit source is baked even for the identity, since its PNG is never shown.
  `setLevels` keeps an identity that comes with a baked picture instead of resetting to `base` (it used to
  put `base` back as `asset`, which here would draw the 16-bit PNG); the Inspector and Same levels use it.
- `bakeLevels` on a 16-bit source decodes the grey16 PNG and writes the 8-bit result; the pixel size is
  copied to it.
- `channelIntensities` of a 16-bit asset scales the samples to 0-255 over `peak`, so a Merge channels of
  16-bit channels starts from the full range (its display ranges stay 8-bit, note 21).
- Export is untouched: the renderer draws `asset` (or `cropped`), always 8-bit PNG, the same path as
  `Image.cropped` (note 20).
- 16-bit **colour** is scaled to 8-bit at import, with a warning; there is no 16-bit RGB source.

## Stacks

`readTiffForImport` decides what the pages are. A description that says channels (ImageJ `channels=N`, OME
`SizeC`) with N > 1 gives the grey pages of the first slice and time point: ImageJ order is channel-fastest;
OME uses its `DimensionOrder` (`omePage`). Three-channel RGB samples (planar or chunky) whose description says
`channels=3` become three grey channels. Slices or frames beyond the first are left out with a warning; so
are the pages of a multi-page TIFF without such a description (the first page is imported and the file
says how many it had). A description that does not match the pages falls back to the first page, warning.

`Imported.channelStack` carries one picture per channel (each its own 16-bit source and calibration);
`placeImport` puts them in a row with an 8 pt gap, all selected, and the session asks `App` to open Merge
channels (`ui/state/channelsRequest.ts`: the dialog reads its channels from the selection). The first
channel's pixel size goes to the merge.

## Schema

`pixelSize` and `peak` are optional fields on an asset's meta read by the hand decoder (`pixelSize > 0`,
`peak` 1-65535), so as for `crop`, `channels` and `levels` there is no schema bump: a file without them
reads unchanged, and an older app reading a newer file still draws the 8-bit asset (it ignores both). The
round trip is tested; the fragment JSON Schema is regenerated. No migration, no frozen fixture.

## Tests

`src/test/tiffWriter.ts` is a small TIFF writer for tests (both byte orders; none, LZW, Deflate; predictor;
strips, tiles, planar; description and resolution tags; thumbnails; ImageJ one-IFD stacks).
`io/tiffDecode.test.ts` reads the full matrix (335 cases) and every rejection; `tiffStack.test.ts` the
calibrations (ImageJ, OME, resolution tags) and the stack rules; `tiffImport.test.ts` the pipeline (16-bit
kept whole, levels from the chosen points, scale bar calibrated, stack as channels, `.jfig` round trip);
`png.test.ts` the grey PNGs against pngjs; `export/pngEncoder.test.ts` the worker protocol. The e2e imports a
generated TIFF and checks a scale bar placed on it.

## Known limits

- First slice and time point only; no z-projection; a multi-page TIFF that is not a channel stack gives its
  first page.
- No orientation tag (rotated TIFFs show as stored), no ICC profile, no alpha, no PackBits.
- A very large 16-bit picture keeps two PNGs in the figure (source and view); the storage cap (note 02)
  counts both.
- Same levels across 16-bit pictures copies slider positions, which are fractions of each picture's own
  brightest value; pictures to be compared should share a range, which the export check (note 37) cannot
  tell from the sliders.
