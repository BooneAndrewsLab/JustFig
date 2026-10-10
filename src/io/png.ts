/**
 * PNG in the browser without a library (issue 24): pictures inside imported
 * PDF plots arrive from pdf.js as pixels and are stored as PNG assets. The
 * image data is compressed with the platform's `CompressionStream`
 * ('deflate' is the zlib format PNG wants), rows filtered with the usual
 * minimum-sum heuristic (or synchronously with fflate). Also decodes plain
 * 8-bit PNGs (issue 36), and reads the header of a PNG or JPEG to tell
 * whether it can have see-through pixels, and a PNG's alpha channel to tell
 * whether it has any (issue 35: matplotlib writes RGBA even for a heatmap).
 */
import { unzlibSync, zlibSync } from 'fflate';

/** Pixels, rows top first, 8 bits per channel: 3 (RGB) or 4 (RGBA) channels. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
  readonly data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** |v| of a byte difference read as signed (the minimum-sum score), without branches. */
const score = (v: number): number => {
  const s = (v << 24) >> 24;
  const m = s >> 31;
  return (s ^ m) - m;
};

/* eslint-disable @typescript-eslint/no-non-null-assertion -- the hot loops of a big PNG:
   every index is inside the row, and `?? 0` costs a fifth of the time. */

/**
 * Filters one scanline into `out` at `at`: the filter type byte, then the
 * filtered bytes. Picks the filter whose bytes sum smallest (as signed, first
 * on a tie), from one pass that scores all five and a second that writes the
 * winner (issue 60, note 33: five trial rows per scanline were most of the
 * time of a big PNG). `up` is the row above, all zeros for the first.
 */
export function filterRow(
  row: Uint8Array,
  up: Uint8Array,
  bpp: number,
  out: Uint8Array,
  at: number,
): void {
  const n = row.length;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  // The first pixel has nothing to its left (a = c = 0).
  for (let i = 0; i < bpp; i++) {
    const x = row[i]!;
    const b = up[i]!;
    s0 += score(x);
    s1 += score(x);
    s2 += score(x - b);
    s3 += score(x - (b >> 1));
    s4 += score(x - b);
  }
  for (let i = bpp; i < n; i++) {
    const x = row[i]!;
    const a = row[i - bpp]!;
    const b = up[i]!;
    const c = up[i - bpp]!;
    s0 += score(x);
    s1 += score(x - a);
    s2 += score(x - b);
    s3 += score(x - ((a + b) >> 1));
    s4 += score(x - paeth(a, b, c));
  }
  let best = 0;
  let sum = s0;
  if (s1 < sum) {
    best = 1;
    sum = s1;
  }
  if (s2 < sum) {
    best = 2;
    sum = s2;
  }
  if (s3 < sum) {
    best = 3;
    sum = s3;
  }
  if (s4 < sum) best = 4;
  out[at] = best;
  const o = at + 1;
  switch (best) {
    case 0:
      out.set(row, o);
      return;
    case 1:
      out.set(row.subarray(0, bpp), o);
      for (let i = bpp; i < n; i++) out[o + i] = row[i]! - row[i - bpp]!;
      return;
    case 2:
      for (let i = 0; i < n; i++) out[o + i] = row[i]! - up[i]!;
      return;
    case 3:
      for (let i = 0; i < bpp; i++) out[o + i] = row[i]! - (up[i]! >> 1);
      for (let i = bpp; i < n; i++) out[o + i] = row[i]! - ((row[i - bpp]! + up[i]!) >> 1);
      return;
    default:
      for (let i = 0; i < bpp; i++) out[o + i] = row[i]! - up[i]!;
      for (let i = bpp; i < n; i++)
        out[o + i] = row[i]! - paeth(row[i - bpp]!, up[i]!, up[i - bpp]!);
  }
}

/* eslint-enable @typescript-eslint/no-non-null-assertion */

/** The filtered scanlines: each row gets the filter whose bytes sum smallest (as signed). */
export function filterRows(px: Pixels): Uint8Array {
  const { width, height, channels: bpp, data } = px;
  const stride = width * bpp;
  const out = new Uint8Array(height * (stride + 1));
  const zeros = new Uint8Array(stride);
  for (let y = 0; y < height; y++)
    filterRow(
      data.subarray(y * stride, (y + 1) * stride),
      y > 0 ? data.subarray((y - 1) * stride, y * stride) : zeros,
      bpp,
      out,
      y * (stride + 1),
    );
  return out;
}

/** zlib-format deflate on the platform's `CompressionStream`. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // Written straight to the stream (not through a Blob, whose `stream()` jsdom lacks); not
  // awaited, as the write only settles once the output is being read.
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>);
  void writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function assemble(px: Pixels, idat: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const v = new DataView(header.buffer);
  v.setUint32(0, px.width);
  v.setUint32(4, px.height);
  header[8] = 8;
  header[9] = px.channels === 4 ? 6 : 2;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Pixels as PNG bytes (RGB or RGBA, 8 bits). */
export async function encodePng(px: Pixels): Promise<Uint8Array> {
  return assemble(px, await deflate(filterRows(px)));
}

/** The same, synchronously (fflate): for pictures cut inside SVG import (issue 36). */
export function encodePngSync(px: Pixels): Uint8Array {
  return assemble(px, zlibSync(filterRows(px), { level: 6 }));
}

/**
 * Whether a PNG or JPEG cannot have see-through pixels: a JPEG, or a PNG
 * without an alpha channel or a transparency chunk. False when unsure.
 */
export function isOpaqueImage(bytes: Uint8Array): boolean {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes.length < 33 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return false;
  const colourType = bytes[25];
  if (colourType !== 0 && colourType !== 2 && colourType !== 3) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 8; i + 8 <= bytes.length;) {
    const len = v.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (type === 'tRNS') return false;
    if (type === 'IDAT' || type === 'IEND') return true;
    i += 12 + len;
  }
  return false;
}

interface PngParts {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colourType: number;
  readonly interlaced: boolean;
  /** The inflated, still filtered scanlines. */
  readonly raw: Uint8Array;
  readonly palette: Uint8Array | null;
  readonly transparency: Uint8Array | null;
}

/** A PNG's header, palette, transparency and inflated data; null when it cannot be read. */
function readPng(bytes: Uint8Array): PngParts | null {
  if (bytes.length < 33 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  for (let i = 8; i + 8 <= bytes.length;) {
    const len = v.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const body = bytes.subarray(i + 8, i + 8 + len);
    if (type === 'IDAT') parts.push(body);
    if (type === 'PLTE') palette = body;
    if (type === 'tRNS') transparency = body;
    if (type === 'IEND') break;
    i += 12 + len;
  }
  try {
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    return {
      width: v.getUint32(16),
      height: v.getUint32(20),
      depth: bytes[24] ?? 0,
      colourType: bytes[25] ?? 0,
      interlaced: bytes[28] !== 0,
      raw: unzlibSync(all),
      palette,
      transparency,
    };
  } catch {
    return null;
  }
}

/**
 * Undoes the row filters, calling `row` with each unfiltered row (reused
 * between calls); stops early when it returns false. False when the data
 * is short.
 */
function eachRow(
  raw: Uint8Array,
  height: number,
  stride: number,
  bpp: number,
  row: (r: Uint8Array, y: number) => boolean,
): boolean {
  if (raw.length < height * (stride + 1)) return false;
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const x = src[i] ?? 0;
      const a = i >= bpp ? (cur[i - bpp] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
      const pred =
        f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      cur[i] = (x + pred) & 0xff;
    }
    if (!row(cur, y)) return true;
    [prev, cur] = [cur, prev];
  }
  return true;
}

/**
 * Whether a non-interlaced PNG with an alpha channel (8 or 16 bits) has a
 * pixel that is not fully opaque; true when unsure (another kind, a
 * transparency chunk, damaged data), false for a JPEG or a PNG without alpha.
 */
export function hasClearPixels(bytes: Uint8Array): boolean {
  if (isOpaqueImage(bytes)) return false;
  const png = readPng(bytes);
  if (!png) return true;
  const { width, height, depth, colourType } = png;
  if ((colourType !== 4 && colourType !== 6) || (depth !== 8 && depth !== 16) || png.interlaced)
    return true;
  if (png.transparency) return true;
  const bpp = ((colourType === 6 ? 4 : 2) * depth) / 8;
  const alpha = (colourType === 6 ? 3 : 1) * (depth / 8);
  let clear = false;
  const read = eachRow(png.raw, height, width * bpp, bpp, (row) => {
    for (let i = alpha; i < row.length; i += bpp)
      if (row[i] !== 255 || (depth === 16 && row[i + 1] !== 255)) {
        clear = true;
        return false;
      }
    return true;
  });
  return !read || clear;
}

/**
 * A PNG's pixels (issue 36: a picture cut to an SVG clip path): 8-bit grey,
 * RGB, palette, grey + alpha or RGBA, not interlaced, as RGB or RGBA (with
 * alpha when it has an alpha channel or a transparency chunk). Null for any
 * other kind, or damaged data.
 */
export function decodePng(bytes: Uint8Array): Pixels | null {
  const png = readPng(bytes);
  if (png?.depth !== 8 || png.interlaced) return null;
  const { width, height, colourType, palette } = png;
  const trns = png.transparency;
  const inCh = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colourType];
  if (inCh === undefined || width === 0 || height === 0) return null;
  if (colourType === 3 && !palette) return null;
  const channels = colourType === 4 || colourType === 6 || trns ? 4 : 3;
  const data = new Uint8Array(width * height * channels);
  // A grey or RGB transparency chunk names one colour (16-bit samples) that is clear.
  const keyed = colourType === 0 || colourType === 2;
  const key = Array.from({ length: 3 }, (_, k) =>
    keyed ? (trns?.[(colourType === 0 ? 0 : k) * 2 + 1] ?? -1) : -1,
  );
  const ok = eachRow(png.raw, height, width * inCh, inCh, (row, y) => {
    for (let x = 0; x < width; x++) {
      const i = x * inCh;
      const o = (y * width + x) * channels;
      let r: number, g: number, b: number;
      let a = 255;
      if (colourType === 3) {
        const p = row[i] ?? 0;
        r = palette?.[p * 3] ?? 0;
        g = palette?.[p * 3 + 1] ?? 0;
        b = palette?.[p * 3 + 2] ?? 0;
        a = trns?.[p] ?? 255;
      } else if (colourType === 0 || colourType === 4) {
        r = g = b = row[i] ?? 0;
        if (colourType === 4) a = row[i + 1] ?? 255;
        else if (r === key[0]) a = 0;
      } else {
        r = row[i] ?? 0;
        g = row[i + 1] ?? 0;
        b = row[i + 2] ?? 0;
        if (colourType === 6) a = row[i + 3] ?? 255;
        else if (r === key[0] && g === key[1] && b === key[2]) a = 0;
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      if (channels === 4) data[o + 3] = a;
    }
    return true;
  });
  return ok ? { width, height, channels, data } : null;
}

export function imageSize(
  bytes: Uint8Array,
): { mime: 'image/png' | 'image/jpeg'; width: number; height: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { mime: 'image/png', width: v.getUint32(16), height: v.getUint32(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1] ?? 0;
      const len = v.getUint16(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { mime: 'image/jpeg', height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Base64 of bytes, in pieces (spreading a large array overflows the stack). */
export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Bytes of base64: natively where the browser can (30 ms for 21 M characters, the loop 0.6 s). */
export function fromBase64(s: string): Uint8Array {
  const native = (Uint8Array as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  if (native) return native.call(Uint8Array, s);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
