/**
 * Pictures as PDF image XObjects without jsPDF's decoder (issue 58, note 31).
 * jsPDF decodes every PNG (CRC checks, unfiltering) and deflates its pixels
 * again in JavaScript, and svg2pdf hands it the bytes as a byte-by-byte
 * binary string and a `btoa` data URI first: about 7 s for a 20 Mpx picture.
 * A PDF reads a PNG's own compressed data (`/FlateDecode` with the PNG
 * predictors) and a JPEG's (`/DCTDecode`), so most pictures go in as they are:
 *
 * - an 8-bit, non-interlaced grey or RGB PNG with no transparency chunk:
 *   its IDAT bytes, unchanged;
 * - a JPEG with one or three 8-bit components: its bytes, unchanged;
 * - any other 8-bit, non-interlaced PNG (palette, alpha, transparency chunk):
 *   decoded once, colour and alpha (as a soft mask, only when some pixel is
 *   not opaque) deflated on the platform's `CompressionStream`.
 *
 * Anything else (16 bits, interlaced, other formats) returns null and goes
 * through svg2pdf and jsPDF as before.
 */
import { decodePng, deflate } from '@/io/png';

export interface PdfImage {
  readonly width: number;
  readonly height: number;
  readonly colorSpace: 'DeviceGray' | 'DeviceRGB';
  readonly filter: 'FlateDecode' | 'DCTDecode';
  /** For `/FlateDecode`: PNG predictors, the colour channels per pixel. */
  readonly colors?: 1 | 3;
  readonly data: Uint8Array;
  /** Alpha, one byte per pixel, PNG-filtered and deflated like `data`. */
  readonly sMask?: Uint8Array;
}

const isPng = (b: Uint8Array): boolean =>
  b.length > 33 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The IDAT stream of a PNG a PDF can read as it is, or null. */
export function pngPassthrough(bytes: Uint8Array): PdfImage | null {
  if (!isPng(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getUint32(16);
  const height = v.getUint32(20);
  const depth = bytes[24];
  const colourType = bytes[25];
  const interlaced = bytes[28] !== 0;
  if (depth !== 8 || interlaced || (colourType !== 0 && colourType !== 2)) return null;
  if (width === 0 || height === 0) return null;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= bytes.length;) {
    const len = v.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (i + 12 + len > bytes.length) return null;
    if (type === 'tRNS') return null;
    if (type === 'IDAT') idat.push(bytes.subarray(i + 8, i + 8 + len));
    if (type === 'IEND') break;
    i += 12 + len;
  }
  if (idat.length === 0) return null;
  const colors = colourType === 0 ? 1 : 3;
  return {
    width,
    height,
    colorSpace: colors === 1 ? 'DeviceGray' : 'DeviceRGB',
    filter: 'FlateDecode',
    colors,
    data: idat.length === 1 && idat[0] ? idat[0] : concat(idat),
  };
}

/** A JPEG a PDF can read as it is (8-bit grey or YCbCr/RGB), or null. */
export function jpegPassthrough(bytes: Uint8Array): PdfImage | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    const len = v.getUint16(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const precision = bytes[i + 4];
      const height = v.getUint16(i + 5);
      const width = v.getUint16(i + 7);
      const components = bytes[i + 9];
      // Four components are CMYK or YCCK, often Adobe-inverted: leave those to jsPDF.
      if (precision !== 8 || (components !== 1 && components !== 3)) return null;
      if (width === 0 || height === 0) return null;
      return {
        width,
        height,
        colorSpace: components === 1 ? 'DeviceGray' : 'DeviceRGB',
        filter: 'DCTDecode',
        data: bytes,
      };
    }
    i += 2 + len;
  }
  return null;
}

/** Rows of `channels` bytes per pixel, each behind PNG filter 2 (Up). */
function upFiltered(
  plane: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    const r = y * stride;
    out[o] = 2;
    if (y === 0) out.set(plane.subarray(0, stride), o + 1);
    else
      for (let i = 0; i < stride; i++)
        out[o + 1 + i] = ((plane[r + i] ?? 0) - (plane[r - stride + i] ?? 0)) & 0xff;
  }
  return out;
}

/** Any other 8-bit, non-interlaced PNG: decoded once, colour and alpha deflated natively. */
async function pngDecoded(bytes: Uint8Array): Promise<PdfImage | null> {
  const px = decodePng(bytes);
  if (!px) return null;
  const { width, height, channels, data } = px;
  const n = width * height;
  let colour = data;
  let alpha: Uint8Array | null = null;
  if (channels === 4) {
    colour = new Uint8Array(n * 3);
    const a = new Uint8Array(n);
    let opaque = true;
    for (let p = 0; p < n; p++) {
      colour[p * 3] = data[p * 4] ?? 0;
      colour[p * 3 + 1] = data[p * 4 + 1] ?? 0;
      colour[p * 3 + 2] = data[p * 4 + 2] ?? 0;
      const v = data[p * 4 + 3] ?? 255;
      a[p] = v;
      if (v !== 255) opaque = false;
    }
    if (!opaque) alpha = a;
  }
  const [c, m] = await Promise.all([
    deflate(upFiltered(colour, width, height, 3)),
    alpha ? deflate(upFiltered(alpha, width, height, 1)) : Promise.resolve(null),
  ]);
  return {
    width,
    height,
    colorSpace: 'DeviceRGB',
    filter: 'FlateDecode',
    colors: 3,
    data: c,
    ...(m ? { sMask: m } : {}),
  };
}

/** The picture as a PDF image, or null when jsPDF has to take it. */
export async function pdfImage(bytes: Uint8Array): Promise<PdfImage | null> {
  if (isPng(bytes)) return pngPassthrough(bytes) ?? (await pngDecoded(bytes));
  return jpegPassthrough(bytes);
}

/** `/DecodeParms` of a `/FlateDecode` image with `colors` channels (or its soft mask, 1). */
export const decodeParms = (colors: number, width: number): string =>
  `/Predictor 15 /Colors ${String(colors)} /BitsPerComponent 8 /Columns ${String(width)}`;
