/**
 * PNG chunks (note 03, ported from BarelySig src/graphs/png.ts): the physical resolution (`pHYs`) and text chunks
 * (`tEXt`, `iTXt`), inserted into a PNG a canvas made, and read back
 * from one. Pure byte handling.
 */

import { filterRow } from '@/io/png';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

export interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
}

export function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([latin1(type), data]);
  return concat([u32(data.length), typed, u32(crc32(typed))]);
}

/** The chunks of a PNG, in order. Throws on a file that isn't one. */
export function readChunks(png: Uint8Array): Chunk[] {
  if (!SIGNATURE.every((b, i) => png[i] === b)) throw new Error('not a PNG file');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  let at = 8;
  while (at + 12 <= png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

/** Physical resolution: pixels per metre on both axes. */
export function pHYs(dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  return chunk('pHYs', concat([u32(ppm), u32(ppm), Uint8Array.of(1)]));
}

/** A Latin-1 text chunk (keywords such as Software, Title, Description). */
export const tEXt = (keyword: string, text: string): Uint8Array =>
  chunk('tEXt', concat([latin1(keyword), Uint8Array.of(0), latin1(text)]));

/** An international text chunk, UTF-8, optionally zlib-compressed (bytes given already compressed). */
export function iTXt(keyword: string, text: Uint8Array, compressed: boolean): Uint8Array {
  return chunk(
    'iTXt',
    concat([latin1(keyword), Uint8Array.of(0, compressed ? 1 : 0, 0, 0, 0), text]),
  );
}

export const iTXtPlain = (keyword: string, text: string): Uint8Array =>
  iTXt(keyword, utf8(text), false);

/** Inserts chunks right after IHDR (so readers find them before the image data); drops any old pHYs. */
export function withChunks(png: Uint8Array, extra: readonly Uint8Array[]): Uint8Array {
  const chunks = readChunks(png);
  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)];
  for (const c of chunks) {
    if (c.type === 'pHYs' && extra.some((e) => latin1('pHYs').every((b, i) => e[4 + i] === b)))
      continue;
    parts.push(chunk(c.type, c.data));
    if (c.type === 'IHDR') parts.push(...extra);
  }
  return concat(parts);
}

/** The text of a `tEXt` or uncompressed `iTXt` chunk with this keyword, or null. */
export function readText(png: Uint8Array, keyword: string): string | null {
  for (const c of readChunks(png)) {
    const nul = c.data.indexOf(0);
    if (nul < 0 || String.fromCharCode(...c.data.subarray(0, nul)) !== keyword) continue;
    if (c.type === 'tEXt') return String.fromCharCode(...c.data.subarray(nul + 1));
    if (c.type === 'iTXt' && c.data[nul + 1] === 0) {
      const rest = c.data.subarray(nul + 3);
      const lang = rest.indexOf(0);
      const translated = rest.indexOf(0, lang + 1);
      return new TextDecoder().decode(rest.subarray(translated + 1));
    }
  }
  return null;
}

/** The raw bytes of a compressed `iTXt` chunk with this keyword (still compressed), or null. */
export function readCompressedText(png: Uint8Array, keyword: string): Uint8Array | null {
  for (const c of readChunks(png)) {
    if (c.type !== 'iTXt') continue;
    const nul = c.data.indexOf(0);
    if (
      nul < 0 ||
      String.fromCharCode(...c.data.subarray(0, nul)) !== keyword ||
      c.data[nul + 1] !== 1
    )
      continue;
    const rest = c.data.subarray(nul + 3);
    const lang = rest.indexOf(0);
    const translated = rest.indexOf(0, lang + 1);
    return rest.subarray(translated + 1);
  }
  return null;
}

/** DPI recorded in a PNG's pHYs chunk, or null. */
export function readDpi(png: Uint8Array): number | null {
  const c = readChunks(png).find((x) => x.type === 'pHYs');
  if (c?.data[8] !== 1) return null;
  return Math.round(new DataView(c.data.buffer, c.data.byteOffset, 9).getUint32(0) * 0.0254);
}

export const pngCrc32 = crc32;

/** The RGB bytes of RGBA pixels (alpha dropped). */
function rgbaToRgb(rgba: Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n * 3);
  for (let p = 0, i = 0, o = 0; p < n; p += 1, i += 4, o += 3) {
    out[o] = rgba[i] ?? 0;
    out[o + 1] = rgba[i + 1] ?? 0;
    out[o + 2] = rgba[i + 2] ?? 0;
  }
  return out;
}

export interface PngStreamOptions {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  /** Keep the alpha channel (RGBA); otherwise RGB. */
  readonly alpha: boolean;
  readonly software?: string;
}

/**
 * A PNG written from bands of canvas RGBA rows pushed top to bottom (issue 16):
 * each band is filtered (against the row above it, so band edges do not show)
 * and fed to a streaming deflate; only the compressed data is kept.
 */
export class PngWriter {
  private readonly channels: 3 | 4;
  private readonly idat: Uint8Array[] = [];
  // The platform's deflate: fflate's streaming Deflate writes invalid data for some tiny inputs.
  private readonly z = new CompressionStream('deflate');
  private readonly writer = this.z.writable.getWriter();
  private readonly drained: Promise<void>;
  /** The row above the next band: zeros above the first. */
  private readonly prev: Uint8Array;
  private rowsIn = 0;

  constructor(private readonly opts: PngStreamOptions) {
    this.channels = opts.alpha ? 4 : 3;
    this.prev = new Uint8Array(opts.width * this.channels);
    this.drained = (async () => {
      const reader = this.z.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > 0) this.idat.push(chunk('IDAT', value));
      }
    })();
  }

  /** The next rows, RGBA, 4 bytes per pixel, as many as the data holds. */
  async push(rgba: Uint8Array | Uint8ClampedArray): Promise<void> {
    const { width: w, height: h } = this.opts;
    if (rgba.length % (w * 4) !== 0) throw new RangeError('pixel data does not match the size');
    const rows = rgba.length / (w * 4);
    if (this.rowsIn + rows > h) throw new RangeError('more rows than the image has');
    if (rows === 0) return;
    const ch = this.channels;
    const stride = w * ch;
    const px =
      rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
    // RGBA rows are filtered where they are; RGB ones lose their alpha first.
    const data = ch === 4 ? px : rgbaToRgb(px);
    const filtered = new Uint8Array(rows * (stride + 1));
    for (let r = 0; r < rows; r += 1)
      filterRow(
        data.subarray(r * stride, (r + 1) * stride),
        r > 0 ? data.subarray((r - 1) * stride, r * stride) : this.prev,
        ch,
        filtered,
        r * (stride + 1),
      );
    // The band's last row is the next band's row above (so band edges do not show).
    this.prev.set(data.subarray((rows - 1) * stride, rows * stride));
    await this.writer.write(filtered);
    this.rowsIn += rows;
  }

  async finish(): Promise<Uint8Array> {
    if (this.rowsIn !== this.opts.height)
      throw new RangeError('pixel data does not match the size');
    await this.writer.close();
    await this.drained;
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, this.opts.width);
    v.setUint32(4, this.opts.height);
    ihdr[8] = 8;
    ihdr[9] = this.opts.alpha ? 6 : 2;
    return concat([
      Uint8Array.from(SIGNATURE),
      chunk('IHDR', ihdr),
      pHYs(this.opts.dpi),
      tEXt('Software', this.opts.software ?? 'PNG writer'),
      ...this.idat,
      chunk('IEND', new Uint8Array(0)),
    ]);
  }
}
