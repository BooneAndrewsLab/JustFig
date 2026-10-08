/**
 * PNG in the browser without a library (issue 24): pictures inside imported
 * PDF plots arrive from pdf.js as pixels and are stored as PNG assets. The
 * image data is compressed with the platform's `CompressionStream`
 * ('deflate' is the zlib format PNG wants), rows filtered with the usual
 * minimum-sum heuristic. Also reads the header of a PNG or JPEG to tell
 * whether it can have see-through pixels.
 */

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

/** The filtered scanlines: each row gets the filter whose bytes sum smallest (as signed). */
export function filterRows(px: Pixels): Uint8Array {
  const { width, height, channels: bpp, data } = px;
  const stride = width * bpp;
  const out = new Uint8Array(height * (stride + 1));
  const trial = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = trial[f] ?? new Uint8Array(stride);
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = row[i] ?? 0;
        const a = i >= bpp ? (row[i - bpp] ?? 0) : 0;
        const b = up ? (up[i] ?? 0) : 0;
        const c = up && i >= bpp ? (up[i - bpp] ?? 0) : 0;
        const pred =
          f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (x - pred) & 0xff;
        t[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[y * (stride + 1)] = best;
    out.set(trial[best] ?? row, y * (stride + 1) + 1);
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Pixels as PNG bytes (RGB or RGBA, 8 bits). */
export async function encodePng(px: Pixels): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const v = new DataView(header.buffer);
  v.setUint32(0, px.width);
  v.setUint32(4, px.height);
  header[8] = 8;
  header[9] = px.channels === 4 ? 6 : 2;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', await deflate(filterRows(px))),
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

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
