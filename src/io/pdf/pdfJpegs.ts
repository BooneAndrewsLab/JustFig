/**
 * The JPEG photos inside a PDF (issue 36, note 13). pdf.js hands every image
 * over as decoded pixels, and a photo stored as PNG is several times larger
 * than the PDF's JPEG, against a storage cap shared by all figures (note 02).
 * An image XObject is a stream, and streams never sit inside object streams,
 * so every image's dictionary is plain text in the file: found by its
 * `/Subtype /Image`, read for its size and filter. A picture whose image
 * was a JPEG is stored as JPEG: the PDF's own bytes when it is the whole
 * image and the file has no other image of its size, else re-encoded.
 */
import { imageSize } from '../png';

/** By `${width}x${height}`: the PDF's JPEG of that size, or null when it cannot be used as is. */
export type PdfJpegs = ReadonlyMap<string, Uint8Array | null>;

export const sizeKey = (w: number, h: number): string => `${String(w)}x${String(h)}`;

/** How far before `/Subtype /Image` its dictionary may start, and after it its stream. */
const REACH = 4096;

const INT = (dict: string, key: string): number | null => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\b(?!\\s+\\d+\\s+R)`).exec(dict);
  return m ? Number(m[1]) : null;
};

/** The JPEG images of a PDF by pixel size (see `PdfJpegs`). */
export function findJpegs(bytes: Uint8Array): PdfJpegs {
  const text = new TextDecoder('latin1').decode(bytes);
  const counts = new Map<string, number>();
  const jpegs = new Map<string, Uint8Array | null>();
  for (const hit of text.matchAll(/\/Subtype\s*\/Image\b/g)) {
    const at = hit.index;
    const start = text.lastIndexOf(' obj', at);
    const end = text.indexOf('stream', at);
    if (start < 0 || end < 0 || at - start > REACH || end - at > REACH) continue;
    const dict = text.slice(start, end);
    const w = INT(dict, 'Width');
    const h = INT(dict, 'Height');
    if (w === null || h === null) continue;
    const key = sizeKey(w, h);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!/\/Filter\s*(?:\/DCTDecode|\[\s*\/DCTDecode\s*\])/.test(dict)) continue;
    // The stream's bytes, as is: a plain RGB or grey JPEG without a mask or decode array.
    let data: Uint8Array | null = null;
    if (!/\/(?:SMask|Mask|Decode|ImageMask)\b/.test(dict)) {
      let from = end + 'stream'.length;
      if (text[from] === '\r') from++;
      if (text[from] === '\n') from++;
      const length = INT(dict, 'Length');
      const stop = length !== null ? from + length : text.indexOf('endstream', from);
      let last = Math.min(stop, bytes.length) - 1;
      // The data ends at the JPEG's end-of-image marker (any EOL after it is not data).
      while (last > from && !(bytes[last - 1] === 0xff && bytes[last] === 0xd9)) last--;
      const jpeg = stop > from && last > from ? bytes.subarray(from, last + 1) : null;
      const size = jpeg ? imageSize(jpeg) : null;
      if (jpeg && size?.width === w && size.height === h && [1, 3].includes(components(jpeg)))
        data = jpeg.slice();
    }
    jpegs.set(key, data);
  }
  // Another image of the same size makes the match ambiguous: re-encode instead.
  for (const key of jpegs.keys()) if ((counts.get(key) ?? 0) > 1) jpegs.set(key, null);
  return jpegs;
}

/** The number of colour components in a JPEG's frame header (0 when unread). */
function components(bytes: Uint8Array): number {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return 0;
    const marker = bytes[i + 1] ?? 0;
    const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return bytes[i + 9] ?? 0;
    i += 2 + len;
  }
  return 0;
}
