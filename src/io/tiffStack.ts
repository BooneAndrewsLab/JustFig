/**
 * Reading a TIFF the way the importer needs it (note 43, issue 65): which
 * pages make the picture (or the channels of a stack), their pixels, and the
 * pixel size the file states. Runs in the PNG worker (`export/pngWorker.ts`),
 * or on the thread where there are no workers.
 */
import { calibrationOf, omePage, parseImageJ, parseOme } from './tiffCalibration';
import { type TiffImage, decodePage, parseTiff, withImageJPages } from './tiffDecode';

/** What the importer gets: one picture, or the channels of a stack (all grey). */
export interface DecodedTiff {
  readonly images: readonly TiffImage[];
  readonly channels: boolean;
  /** µm per pixel, when the file states it. */
  readonly pixelSize?: number;
  readonly warnings: readonly string[];
}

/** One sample of every pixel of an interleaved picture, as a picture of its own. */
function sampleOf(img: TiffImage, c: number): TiffImage {
  const n = img.width * img.height;
  const out = img.bits === 16 ? new Uint16Array(n) : new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = img.data[i * img.channels + c] ?? 0;
  return { ...img, channels: 1, data: out };
}

/** Reads the pictures an import takes from a TIFF. Throws `TiffError` for what cannot be read. */
export function readTiffForImport(bytes: Uint8Array): DecodedTiff {
  let file = parseTiff(bytes);
  const first = file.pages[0];
  if (!first) throw new Error('unreachable');
  const ij = parseImageJ(first.meta.description);
  const ome = parseOme(first.meta.description);
  if (ij?.images !== undefined) file = withImageJPages(file, ij.images);
  const warnings: string[] = [];
  const cal = calibrationOf(first.meta);
  if (cal?.notSquare === true)
    warnings.push('The pixels are not square; the pixel size is the horizontal one.');
  const done = (images: TiffImage[], channels: boolean): DecodedTiff => ({
    images,
    channels,
    warnings,
    ...(cal ? { pixelSize: cal.pixelSize } : {}),
  });

  const nc = ij?.channels ?? ome?.sizeC ?? 1;
  if (nc > 1) {
    // RGB samples standing for channels: one page, each sample a channel.
    if (first.channels === 3 && nc === 3 && file.pages.length === 1) {
      const rgb = decodePage(file, 0);
      return done(
        [0, 1, 2].map((c) => sampleOf(rgb, c)),
        true,
      );
    }
    const slices = ij ? (ij.slices ?? 1) * (ij.frames ?? 1) : ome ? ome.sizeZ * ome.sizeT : 1;
    const wanted = Array.from({ length: nc }, (_, c) => (ome ? omePage(ome, c) : c));
    if (wanted.every((p) => file.pages[p]?.channels === 1)) {
      const images = wanted.map((p) => decodePage(file, p));
      const [a] = images;
      if (
        a &&
        images.every((i) => i.width === a.width && i.height === a.height && i.bits === a.bits)
      ) {
        if (slices > 1)
          warnings.push('Only the first slice or time point of each channel was imported.');
        return done(images, true);
      }
    }
    warnings.push(
      `The description says ${String(nc)} channels but the pages do not match it; the first page was imported.`,
    );
  } else if (file.pages.length > 1)
    warnings.push(`This TIFF has ${String(file.pages.length)} pages; only the first was imported.`);
  return done([decodePage(file, 0)], false);
}
