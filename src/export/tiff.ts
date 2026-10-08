/**
 * Our own baseline TIFF writer (note 03): 8-bit RGB or RGBA, LZW with the
 * horizontal-differencing predictor, strips of about 64 KB, and
 * XResolution/YResolution with ResolutionUnit = inch so ImageJ, Fiji and
 * journal systems read the DPI. UTIF writes uncompressed only, which made
 * a 600 dpi figure ~86 MB; this is what PNG-sized TIFFs need.
 * The LZW encoder follows libtiff's (`tif_lzw.c`): MSB-first codes, Clear
 * at the start of each strip, width growing when the next free code passes
 * the current maximum, and a Clear when the table fills.
 */

interface Entry {
  tag: number;
  type: 2 | 3 | 4 | 5;
  count: number;
  values: number[] | string;
}

const CLEAR = 256;
const EOI = 257;
const FIRST = 258;
const MAX_CODE = 4095;

class BitWriter {
  private buf = new Uint8Array(1024);
  private len = 0;
  private acc = 0;
  private bits = 0;

  write(code: number, width: number): void {
    this.acc = (this.acc << width) | code;
    this.bits += width;
    while (this.bits >= 8) {
      this.bits -= 8;
      this.push((this.acc >>> this.bits) & 0xff);
    }
    this.acc &= (1 << this.bits) - 1;
  }

  private push(b: number): void {
    if (this.len === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.len++] = b;
  }

  finish(): Uint8Array {
    if (this.bits > 0) this.push((this.acc << (8 - this.bits)) & 0xff);
    this.bits = 0;
    return this.buf.slice(0, this.len);
  }
}

/** TIFF-flavoured LZW of one strip. */
export function lzwEncode(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  let width = 9;
  let maxcode = 511;
  let free = FIRST;
  const table = new Map<number, number>();
  out.write(CLEAR, width);
  if (data.length === 0) {
    out.write(EOI, width);
    return out.finish();
  }
  const grow = (): void => {
    if (free === MAX_CODE - 1) {
      out.write(CLEAR, width);
      table.clear();
      width = 9;
      maxcode = 511;
      free = FIRST;
    } else if (free > maxcode) {
      width += 1;
      maxcode = (1 << width) - 1;
    }
  };
  let ent = data[0] ?? 0;
  for (let i = 1; i < data.length; i += 1) {
    const c = data[i] ?? 0;
    const key = (ent << 8) | c;
    const hit = table.get(key);
    if (hit !== undefined) {
      ent = hit;
      continue;
    }
    out.write(ent, width);
    ent = c;
    table.set(key, free);
    free += 1;
    grow();
  }
  out.write(ent, width);
  free += 1;
  grow();
  out.write(EOI, width);
  return out.finish();
}

export interface TiffOptions {
  readonly width: number;
  readonly height: number;
  /** Pixels per inch, written as X/YResolution with unit inch. */
  readonly dpi: number;
  /** Keep the alpha channel (RGBA, unassociated); otherwise RGB. */
  readonly alpha: boolean;
  readonly software?: string;
}

/** A TIFF file from canvas RGBA pixels (row-major, 4 bytes per pixel). */
export function encodeTiff(rgba: Uint8Array | Uint8ClampedArray, opts: TiffOptions): Uint8Array {
  const { width: w, height: h } = opts;
  if (rgba.length !== w * h * 4) throw new RangeError('pixel data does not match the size');
  const spp = opts.alpha ? 4 : 3;
  const rowBytes = w * spp;
  const rowsPerStrip = Math.max(1, Math.min(h, Math.floor(65536 / Math.max(1, rowBytes))));
  const strips: Uint8Array[] = [];
  for (let y0 = 0; y0 < h; y0 += rowsPerStrip) {
    const rows = Math.min(rowsPerStrip, h - y0);
    const raw = new Uint8Array(rows * rowBytes);
    for (let r = 0; r < rows; r += 1) {
      const src = (y0 + r) * w * 4;
      const dst = r * rowBytes;
      for (let x = 0; x < w; x += 1)
        for (let s = 0; s < spp; s += 1) raw[dst + x * spp + s] = rgba[src + x * 4 + s] ?? 0;
      // Predictor 2: each sample minus the same sample of the pixel to its left.
      for (let x = w - 1; x > 0; x -= 1)
        for (let s = 0; s < spp; s += 1) {
          const i = dst + x * spp + s;
          raw[i] = ((raw[i] ?? 0) - (raw[i - spp] ?? 0)) & 0xff;
        }
    }
    const lzw = lzwEncode(raw);
    // UTIF (and readers built on it, e.g. Photopea) takes a strip whose
    // compressed length equals its raw length for uncompressed data. A zero
    // byte after EOI is ignored by LZW decoders and avoids the collision.
    strips.push(lzw.length === raw.length ? Uint8Array.from([...lzw, 0]) : lzw);
  }

  const software = `${opts.software ?? 'TIFF writer'}\0`;
  const res = [Math.round(opts.dpi * 1000), 1000];
  const entries: Entry[] = [
    { tag: 256, type: 4, count: 1, values: [w] },
    { tag: 257, type: 4, count: 1, values: [h] },
    { tag: 258, type: 3, count: spp, values: Array<number>(spp).fill(8) },
    { tag: 259, type: 3, count: 1, values: [5] },
    { tag: 262, type: 3, count: 1, values: [2] },
    { tag: 273, type: 4, count: strips.length, values: [] },
    { tag: 277, type: 3, count: 1, values: [spp] },
    { tag: 278, type: 4, count: 1, values: [rowsPerStrip] },
    { tag: 279, type: 4, count: strips.length, values: strips.map((s) => s.length) },
    { tag: 282, type: 5, count: 1, values: res },
    { tag: 283, type: 5, count: 1, values: res },
    { tag: 284, type: 3, count: 1, values: [1] },
    { tag: 296, type: 3, count: 1, values: [2] },
    { tag: 305, type: 2, count: software.length, values: software },
    { tag: 317, type: 3, count: 1, values: [2] },
    ...(opts.alpha ? [{ tag: 338, type: 3 as const, count: 1, values: [2] }] : []),
  ];
  const size = (e: Entry) => e.count * (e.type === 3 ? 2 : e.type === 5 ? 8 : e.type === 2 ? 1 : 4);
  const ifdSize = 2 + entries.length * 12 + 4;
  let extra = 8 + ifdSize;
  const extraAt = new Map<number, number>();
  for (const e of entries) {
    if (size(e) > 4) {
      extraAt.set(e.tag, extra);
      extra += size(e) + (size(e) % 2);
    }
  }
  let dataAt = extra;
  const stripOffsets = strips.map((s) => {
    const at = dataAt;
    dataAt += s.length;
    return at;
  });
  const offsetsEntry = entries.find((e) => e.tag === 273);
  if (offsetsEntry) offsetsEntry.values = stripOffsets;

  const out = new Uint8Array(dataAt);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]); // "II*\0", little-endian
  v.setUint32(4, 8, true);
  v.setUint16(8, entries.length, true);
  const put = (e: Entry, at: number) => {
    if (typeof e.values === 'string') {
      for (let i = 0; i < e.values.length; i += 1) out[at + i] = e.values.charCodeAt(i) & 0x7f;
      return;
    }
    e.values.forEach((x, i) => {
      if (e.type === 3) v.setUint16(at + i * 2, x, true);
      else v.setUint32(at + i * 4, x, true);
    });
  };
  entries.forEach((e, i) => {
    const at = 10 + i * 12;
    v.setUint16(at, e.tag, true);
    v.setUint16(at + 2, e.type, true);
    v.setUint32(at + 4, e.count, true);
    const ext = extraAt.get(e.tag);
    if (ext === undefined) put(e, at + 8);
    else {
      v.setUint32(at + 8, ext, true);
      put(e, ext);
    }
  });
  v.setUint32(10 + entries.length * 12, 0, true);
  strips.forEach((s, i) => {
    out.set(s, stripOffsets[i] ?? 0);
  });
  return out;
}
