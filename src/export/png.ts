/**
 * PNG chunks (note 03, ported from BarelySig src/graphs/png.ts): the physical resolution (`pHYs`) and text chunks
 * (`tEXt`, `iTXt`), inserted into a PNG a canvas made, and read back
 * from one. Pure byte handling.
 */

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
