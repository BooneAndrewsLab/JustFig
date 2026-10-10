/**
 * A minimal TIFF writer for tests (note 43): builds the files `tiffDecode.ts` has
 * to read, in either byte order, with every compression, depth, layout and
 * predictor it supports, so each case is a few lines. Not a product writer.
 */
import { zlibSync } from 'fflate';

import { lzwEncode } from '@/export/tiff';

export interface TiffPageSpec {
  readonly width: number;
  readonly height: number;
  readonly bits: 8 | 16;
  /** Samples per pixel in the file (1 grey, 3 RGB, 4 RGBA). */
  readonly samples: number;
  /** Interleaved sample values, rows top first. */
  readonly values: ArrayLike<number>;
  readonly photometric?: number;
  /** 1 none, 5 LZW, 8 or 32946 Deflate; others to test refusals. */
  readonly compression?: number;
  readonly predictor?: 1 | 2;
  readonly planar?: boolean;
  readonly tile?: { readonly w: number; readonly h: number };
  readonly rowsPerStrip?: number;
  readonly description?: string;
  readonly xResolution?: number;
  readonly yResolution?: number;
  readonly resolutionUnit?: number;
  readonly sampleFormat?: number;
  readonly thumbnail?: boolean;
}

export interface TiffSpec {
  readonly pages: readonly TiffPageSpec[];
  readonly littleEndian?: boolean;
  /** ImageJ style: one IFD, every page's bytes after it (uncompressed pages only). */
  readonly imageJStack?: boolean;
}

class Bytes {
  buf = new Uint8Array(1 << 16);
  len = 0;
  constructor(readonly little: boolean) {}
  private grow(n: number): void {
    if (this.len + n <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    b.set(this.buf);
    this.buf = b;
  }
  put(b: Uint8Array): number {
    this.grow(b.length);
    this.buf.set(b, this.len);
    const at = this.len;
    this.len += b.length;
    return at;
  }
  u16(v: number, at = this.len, advance = true): void {
    this.grow(2);
    new DataView(this.buf.buffer).setUint16(at, v, this.little);
    if (advance) this.len = Math.max(this.len, at + 2);
  }
  u32(v: number, at = this.len, advance = true): void {
    this.grow(4);
    new DataView(this.buf.buffer).setUint32(at, v, this.little);
    if (advance) this.len = Math.max(this.len, at + 4);
  }
  align(): void {
    if (this.len % 2 === 1) this.put(new Uint8Array(1));
  }
}

/** Samples of a chunk to file bytes in the given byte order. */
function sampleBytes(values: number[], bits: 8 | 16, little: boolean): Uint8Array {
  if (bits === 8) return Uint8Array.from(values);
  const out = new Uint8Array(values.length * 2);
  const v = new DataView(out.buffer);
  values.forEach((x, i) => {
    v.setUint16(i * 2, x, little);
  });
  return out;
}

export function writeTiff(spec: TiffSpec): Uint8Array {
  const little = spec.littleEndian ?? true;
  const out = new Bytes(little);
  out.put(new Uint8Array([little ? 0x49 : 0x4d, little ? 0x49 : 0x4d]));
  out.u16(42);
  out.u32(0); // first IFD, patched
  let link = 4;
  const pages = spec.imageJStack ? spec.pages.slice(0, 1) : spec.pages;

  for (const p of pages) {
    const comp = p.compression ?? 1;
    const pred = p.predictor ?? 1;
    const planes = p.planar ? p.samples : 1;
    const cs = p.planar ? 1 : p.samples;
    const tw = p.tile?.w ?? p.width;
    const th = p.tile?.h ?? p.rowsPerStrip ?? p.height;
    const across = p.tile ? Math.ceil(p.width / tw) : 1;
    const down = Math.ceil(p.height / th);
    const offsets: number[] = [];
    const counts: number[] = [];
    const pageValues = Array.from(p.values, Number);
    out.align();
    for (let plane = 0; plane < planes; plane++)
      for (let cy = 0; cy < down; cy++)
        for (let cx = 0; cx < across; cx++) {
          // The chunk's samples, padded to the whole tile, rows top first.
          const rows = p.tile ? th : Math.min(th, p.height - cy * th);
          const s: number[] = [];
          for (let r = 0; r < rows; r++)
            for (let x = 0; x < tw; x++) {
              const gy = cy * th + r;
              const gx = cx * tw + x;
              for (let c = 0; c < cs; c++) {
                const inside = gy < p.height && gx < p.width;
                s.push(
                  inside
                    ? (pageValues[(gy * p.width + gx) * p.samples + (p.planar ? plane : c)] ?? 0)
                    : 0,
                );
              }
            }
          if (pred === 2) {
            const row = tw * cs;
            const mask = p.bits === 8 ? 0xff : 0xffff;
            for (let r = 0; r < rows; r++)
              for (let i = (r + 1) * row - 1; i >= r * row + cs; i--)
                s[i] = ((s[i] ?? 0) - (s[i - cs] ?? 0)) & mask;
          }
          let bytes = sampleBytes(s, p.bits, little);
          if (comp === 5) bytes = lzwEncode(bytes);
          else if (comp === 8 || comp === 32946) bytes = zlibSync(bytes);
          offsets.push(out.put(bytes));
          counts.push(bytes.length);
        }
    // ImageJ: the other pictures' bytes follow the first one's, with no IFD of their own.
    if (spec.imageJStack)
      for (let k = 1; k < spec.pages.length; k++)
        out.put(sampleBytes(Array.from(spec.pages[k]?.values ?? [], Number), p.bits, little));

    // IFD entries: [tag, type, values]
    type Val = number | string;
    const entries: [number, number, Val[]][] = [
      [256, 4, [p.width]],
      [257, 4, [p.height]],
      [258, 3, Array<number>(p.samples).fill(p.bits)],
      [259, 3, [comp]],
      [262, 3, [p.photometric ?? (p.samples >= 3 ? 2 : 1)]],
      [277, 3, [p.samples]],
      [284, 3, [p.planar ? 2 : 1]],
    ];
    if (p.thumbnail) entries.push([254, 4, [1]]);
    if (p.tile) {
      entries.push([322, 4, [tw]], [323, 4, [th]], [324, 4, offsets], [325, 4, counts]);
    } else {
      entries.push([273, 4, offsets], [278, 4, [th]], [279, 4, counts]);
    }
    if (pred !== 1) entries.push([317, 3, [pred]]);
    if (p.description !== undefined) entries.push([270, 2, [p.description]]);
    if (p.xResolution !== undefined) entries.push([282, 5, [p.xResolution]]);
    if (p.yResolution !== undefined) entries.push([283, 5, [p.yResolution]]);
    if (p.resolutionUnit !== undefined) entries.push([296, 3, [p.resolutionUnit]]);
    if (p.sampleFormat !== undefined)
      entries.push([339, 3, Array<number>(p.samples).fill(p.sampleFormat)]);
    entries.sort((a, b) => a[0] - b[0]);

    const size = (type: number): number => ({ 2: 1, 3: 2, 4: 4, 5: 8 })[type] ?? 1;
    // Out-of-line values first, so the IFD can point at them.
    const where = new Map<number, number>();
    out.align();
    for (const [tag, type, vals] of entries) {
      const n = type === 2 ? new TextEncoder().encode(String(vals[0])).length + 1 : vals.length;
      if (n * size(type) <= 4) continue;
      out.align();
      where.set(tag, out.len);
      if (type === 2) out.put(new Uint8Array([...new TextEncoder().encode(String(vals[0])), 0]));
      else
        for (const v of vals) {
          if (type === 3) out.u16(Number(v));
          else if (type === 4) out.u32(Number(v));
          else {
            out.u32(Math.round(Number(v) * 1000));
            out.u32(1000);
          }
        }
    }
    out.align();
    const ifd = out.len;
    out.u32(ifd, link);
    out.u16(entries.length);
    for (const [tag, type, vals] of entries) {
      const text = type === 2 ? [...new TextEncoder().encode(String(vals[0])), 0] : null;
      const n = text ? text.length : vals.length;
      out.u16(tag);
      out.u16(type);
      out.u32(n);
      const off = where.get(tag);
      if (off !== undefined) out.u32(off);
      else {
        const at = out.len;
        out.put(new Uint8Array(4));
        if (text) text.forEach((b, i) => (out.buf[at + i] = b));
        else
          vals.forEach((v, i) => {
            if (type === 3) out.u16(Number(v), at + i * 2, false);
            else out.u32(Number(v), at + i * 4, false);
          });
      }
    }
    link = out.len;
    out.u32(0); // next IFD, patched by the next page
  }
  return out.buf.slice(0, out.len);
}
