/**
 * Our own TIFF reader (note 43, issue 65), small on purpose: baseline TIFF in
 * either byte order, uncompressed, LZW and Deflate, 8 and 16 bits, grey and
 * RGB (chunky or planar), strips or tiles, predictor 2, several pages. Anything
 * else is refused with a message that says what it is. Pure on bytes, so it
 * runs in the PNG worker (note 33) and in unit tests alike.
 */
import { unzlibSync } from 'fflate';

export class TiffError extends Error {
  override readonly name = 'TiffError';
}

/** What the file says about a page besides its pixels. */
export interface TiffMeta {
  readonly description?: string;
  readonly software?: string;
  readonly xResolution?: number;
  readonly yResolution?: number;
  /** TIFF ResolutionUnit: 1 none, 2 inch, 3 centimetre (default 2). */
  readonly resolutionUnit: number;
}

/** A page as the file describes it; `decodePage` reads its pixels. */
export interface TiffPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly bits: 8 | 16;
  /** Channels of the picture: 1 (grey) or 3 (RGB); extra samples (alpha) are dropped. */
  readonly channels: 1 | 3;
  /** Samples per pixel in the file. */
  readonly samples: number;
  readonly planar: boolean;
  readonly meta: TiffMeta;
}

/** One decoded page: interleaved samples, rows top first, 0 = black. */
export interface TiffImage {
  readonly width: number;
  readonly height: number;
  readonly bits: 8 | 16;
  readonly channels: 1 | 3;
  readonly data: Uint8Array | Uint16Array;
  readonly meta: TiffMeta;
}

interface PageTags {
  compression: number;
  photometric: number;
  predictor: number;
  rowsPerStrip: number;
  offsets: number[];
  counts: number[];
  tileWidth: number;
  tileHeight: number;
  /** First image of an ImageJ stack kept in one IFD: bytes between pictures. */
  shift: number;
}

export interface TiffFile {
  readonly bytes: Uint8Array;
  readonly littleEndian: boolean;
  /** Full-resolution pages in file order (reduced-resolution thumbnails skipped). */
  readonly pages: readonly TiffPage[];
  /** @internal */
  readonly tags: readonly PageTags[];
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  16: 8,
};

interface Entry {
  readonly type: number;
  readonly count: number;
  /** Where the values start. */
  readonly at: number;
}

const COMPRESSION: Record<number, string> = {
  2: 'CCITT',
  3: 'CCITT fax',
  4: 'CCITT fax',
  6: 'old-style JPEG',
  7: 'JPEG',
  32773: 'PackBits',
  34712: 'JPEG 2000',
  34925: 'LZMA',
  50000: 'Zstandard',
  34887: 'LERC',
  50001: 'WebP',
};

const PHOTOMETRIC: Record<number, string> = {
  3: 'palette (indexed colour)',
  4: 'transparency mask',
  5: 'CMYK',
  6: 'YCbCr',
  8: 'CIELab',
  9: 'CIELab',
  10: 'CIELab',
  32803: 'colour-filter-array (raw)',
};

/** Reads the structure of a TIFF: its pages and what each says about itself. */
export function parseTiff(bytes: Uint8Array): TiffFile {
  if (bytes.length < 8) throw new TiffError('This is not a TIFF file.');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d))
    throw new TiffError('This is not a TIFF file.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = v.getUint16(2, little);
  if (magic === 43) throw new TiffError('BigTIFF files (over 4 GB) cannot be imported.');
  if (magic !== 42) throw new TiffError('This is not a TIFF file.');
  const u16 = (o: number): number => {
    if (o < 0 || o + 2 > bytes.length) throw new TiffError('This TIFF is damaged (cut short).');
    return v.getUint16(o, little);
  };
  const u32 = (o: number): number => {
    if (o < 0 || o + 4 > bytes.length) throw new TiffError('This TIFF is damaged (cut short).');
    return v.getUint32(o, little);
  };

  const num = (e: Entry, i: number): number => {
    const o = e.at + i * (TYPE_SIZE[e.type] ?? 1);
    switch (e.type) {
      case 1:
      case 2:
      case 6:
      case 7:
        return bytes[o] ?? 0;
      case 3:
        return u16(o);
      case 8:
        return (u16(o) << 16) >> 16;
      case 4:
        return u32(o);
      case 9:
        return u32(o) | 0;
      case 5: {
        const d = u32(o + 4);
        return d === 0 ? 0 : u32(o) / d;
      }
      case 16:
        return u32(o) + u32(o + 4) * 4294967296;
      default:
        throw new TiffError('This TIFF stores a tag in a form that cannot be read.');
    }
  };
  const nums = (e: Entry | undefined): number[] =>
    e ? Array.from({ length: e.count }, (_, i) => num(e, i)) : [];
  const text = (e: Entry | undefined): string | undefined => {
    if (e?.type !== 2) return undefined;
    let end = e.count;
    while (end > 0 && bytes[e.at + end - 1] === 0) end--;
    return new TextDecoder('utf-8').decode(bytes.subarray(e.at, e.at + end));
  };

  const pages: TiffPage[] = [];
  const tags: PageTags[] = [];
  const seen = new Set<number>();
  for (let ifd = u32(4); ifd !== 0;) {
    if (seen.has(ifd) || pages.length + seen.size > 100000)
      throw new TiffError('This TIFF is damaged (its pages loop).');
    seen.add(ifd);
    const n = u16(ifd);
    const entries = new Map<number, Entry>();
    for (let i = 0; i < n; i++) {
      const o = ifd + 2 + i * 12;
      const type = u16(o + 2);
      const count = u32(o + 4);
      const size = (TYPE_SIZE[type] ?? 1) * count;
      entries.set(u16(o), { type, count, at: size <= 4 ? o + 8 : u32(o + 8) });
    }
    const next = u32(ifd + 2 + n * 12);
    const one = (tag: number, fallback: number): number => {
      const e = entries.get(tag);
      return e && e.count > 0 ? num(e, 0) : fallback;
    };
    const index = pages.length;
    if ((one(254, 0) & 1) !== 0) {
      ifd = next;
      continue; // a reduced-resolution copy
    }
    const width = one(256, 0);
    const height = one(257, 0);
    if (width < 1 || height < 1) throw new TiffError('This TIFF page has no size.');
    if (width * height > 300e6)
      throw new TiffError(`This TIFF is too large to open (${String(width)} x ${String(height)}).`);
    const samples = one(277, 1);
    const photometric = one(262, 1);
    const compression = one(259, 1);
    const planar = one(284, 1) === 2;
    const formats = nums(entries.get(339));
    if (formats.some((f) => f === 3))
      throw new TiffError('Floating-point TIFFs cannot be imported. Save it as 8 or 16-bit.');
    if (formats.some((f) => f === 2))
      throw new TiffError('Signed-integer TIFFs cannot be imported. Save it as 8 or 16-bit.');
    if (formats.some((f) => f === 4))
      throw new TiffError('This TIFF has samples of an unknown kind and cannot be imported.');
    const bitsList = nums(entries.get(258));
    const bits = bitsList[0] ?? 1;
    if (bitsList.some((b) => b !== bits))
      throw new TiffError('TIFFs with different bit depths per channel cannot be imported.');
    if (bits !== 8 && bits !== 16)
      throw new TiffError(
        `Only 8 and 16-bit TIFFs can be imported (this one has ${String(bits)}-bit samples).`,
      );
    const photoName = PHOTOMETRIC[photometric];
    if (photoName !== undefined)
      throw new TiffError(`TIFFs with ${photoName} colour cannot be imported. Use grey or RGB.`);
    if (photometric !== 0 && photometric !== 1 && photometric !== 2)
      throw new TiffError(`This TIFF's colour model (${String(photometric)}) is not supported.`);
    const channels = photometric === 2 ? 3 : 1;
    if (samples < channels)
      throw new TiffError('This TIFF has fewer samples per pixel than its colour model needs.');
    if (compression !== 1 && compression !== 5 && compression !== 8 && compression !== 32946) {
      const name = COMPRESSION[compression];
      throw new TiffError(
        `${name === undefined ? `Compression ${String(compression)}` : `${name} compression`} cannot be imported. Save the TIFF uncompressed, or with LZW or Deflate.`,
      );
    }
    const predictor = one(317, 1);
    if (predictor !== 1 && predictor !== 2)
      throw new TiffError('TIFFs with a floating-point predictor cannot be imported.');
    if (one(266, 1) !== 1) throw new TiffError('TIFFs with reversed bit order cannot be imported.');

    const tiled = entries.has(322);
    const offsets = nums(entries.get(tiled ? 324 : 273));
    const counts = nums(entries.get(tiled ? 325 : 279));
    if (offsets.length === 0) throw new TiffError('This TIFF page holds no image data.');
    const rowsPerStrip = Math.min(height, Math.max(1, one(278, height)));
    const tileWidth = tiled ? one(322, 0) : 0;
    const tileHeight = tiled ? one(323, 0) : 0;
    if (tiled && (tileWidth < 1 || tileHeight < 1))
      throw new TiffError('This TIFF has tiles of no size.');
    const per = tiled
      ? Math.ceil(width / tileWidth) * Math.ceil(height / tileHeight)
      : Math.ceil(height / rowsPerStrip);
    if (offsets.length < per * (planar ? samples : 1))
      throw new TiffError('This TIFF is damaged (strips or tiles are missing).');
    const desc = text(entries.get(270));
    const sw = text(entries.get(305));
    const xr = entries.get(282);
    const yr = entries.get(283);
    const meta: TiffMeta = {
      ...(desc === undefined ? {} : { description: desc }),
      ...(sw === undefined ? {} : { software: sw }),
      ...(xr ? { xResolution: num(xr, 0) } : {}),
      ...(yr ? { yResolution: num(yr, 0) } : {}),
      resolutionUnit: one(296, 2),
    };
    pages.push({
      index,
      width,
      height,
      bits,
      channels,
      samples,
      planar,
      meta,
    });
    tags.push({
      compression,
      photometric,
      predictor,
      rowsPerStrip,
      offsets,
      counts,
      tileWidth,
      tileHeight,
      shift: 0,
    });
    ifd = next;
  }
  if (pages.length === 0) throw new TiffError('This TIFF holds no pictures.');
  return { bytes, littleEndian: little, pages, tags };
}

/**
 * ImageJ keeps a stack as one IFD followed by every picture's bytes, back to
 * back, with `images=N` in the description: the pages after the first are made
 * up here (uncompressed, one strip or tile set each, a fixed distance apart).
 */
export function withImageJPages(file: TiffFile, images: number): TiffFile {
  const first = file.pages[0];
  const t = file.tags[0];
  if (!first || !t || file.pages.length !== 1 || images < 2) return file;
  if (t.compression !== 1 || t.tileWidth > 0 || first.planar) return file;
  const size = first.width * first.height * first.samples * (first.bits / 8);
  const last = (t.offsets.at(-1) ?? 0) + (t.counts.at(-1) ?? 0);
  const start = t.offsets[0] ?? 0;
  if (start + size * images > file.bytes.length || last > start + size) return file;
  const pages: TiffPage[] = [];
  const tags: PageTags[] = [];
  for (let i = 0; i < images; i++) {
    pages.push({ ...first, index: i });
    tags.push({ ...t, shift: i * size });
  }
  return { ...file, pages, tags };
}

/** TIFF-flavoured LZW (MSB-first codes, one early-change step) of one strip or tile. */
export function lzwDecode(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  const prefix = new Uint16Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const len = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) {
    suffix[i] = i;
    first[i] = i;
    len[i] = 1;
  }
  let next = 258;
  let width = 9;
  let acc = 0;
  let bits = 0;
  let ip = 0;
  let op = 0;
  let prev = -1;
  while (op < outLen) {
    while (bits < width) {
      if (ip >= src.length) throw new TiffError('This TIFF is damaged (LZW data is cut short).');
      acc = (acc << 8) | (src[ip++] ?? 0);
      bits += 8;
    }
    const code = (acc >>> (bits - width)) & ((1 << width) - 1);
    bits -= width;
    acc &= (1 << bits) - 1;
    if (code === 257) break;
    if (code === 256) {
      next = 258;
      width = 9;
      prev = -1;
      continue;
    }
    if (prev === -1) {
      if (code > 255) throw new TiffError('This TIFF is damaged (bad LZW code).');
      out[op++] = code;
      prev = code;
      continue;
    }
    if (code > next || (code === next && next >= 4096))
      throw new TiffError('This TIFF is damaged (bad LZW code).');
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = code < next ? (first[code] ?? 0) : (first[prev] ?? 0);
      first[next] = first[prev] ?? 0;
      len[next] = (len[prev] ?? 0) + 1;
      next++;
      if (next === 511) width = 10;
      else if (next === 1023) width = 11;
      else if (next === 2047) width = 12;
    }
    const n = len[code] ?? 0;
    if (op + n > outLen) throw new TiffError('This TIFF is damaged (LZW data is too long).');
    for (let c = code, i = op + n - 1; i >= op; i--) {
      out[i] = suffix[c] ?? 0;
      c = prefix[c] ?? 0;
    }
    op += n;
    prev = code;
  }
  if (op < outLen) throw new TiffError('This TIFF is damaged (LZW data is short).');
  return out;
}

function chunkBytes(
  file: TiffFile,
  t: PageTags,
  i: number,
  expected: number,
  shift: number,
): Uint8Array {
  const off = (t.offsets[i] ?? 0) + shift;
  const count = t.counts[i] ?? (t.compression === 1 ? expected : file.bytes.length - off);
  if (off < 0 || off + Math.min(count, expected) > file.bytes.length)
    throw new TiffError('This TIFF is damaged (cut short).');
  const raw = file.bytes.subarray(off, off + count);
  let out: Uint8Array;
  if (t.compression === 1) out = raw;
  else if (t.compression === 5) out = lzwDecode(raw, expected);
  else {
    try {
      out = unzlibSync(raw);
    } catch {
      throw new TiffError('This TIFF is damaged (its Deflate data cannot be read).');
    }
  }
  if (out.length < expected) throw new TiffError('This TIFF is damaged (a strip is short).');
  return out;
}

/** Decodes one page to interleaved samples. */
export function decodePage(file: TiffFile, index: number): TiffImage {
  const page = file.pages[index];
  const t = file.tags[index];
  if (!page || !t) throw new TiffError('That TIFF page does not exist.');
  const { width: w, height: h, bits, samples, channels } = page;
  const wide = bits === 16;
  const bytesPer = wide ? 2 : 1;
  const planes = page.planar ? samples : 1;
  const cs = page.planar ? 1 : samples;
  const out = wide ? new Uint16Array(w * h * channels) : new Uint8Array(w * h * channels);
  const tiled = t.tileWidth > 0;
  const cw = tiled ? t.tileWidth : w;
  const ch = tiled ? t.tileHeight : t.rowsPerStrip;
  const across = tiled ? Math.ceil(w / cw) : 1;
  const down = Math.ceil(h / ch);
  const little = file.littleEndian;
  const shift = t.shift;

  for (let plane = 0; plane < planes; plane++) {
    if (page.planar && plane >= channels) break; // alpha plane: not wanted
    for (let cy = 0; cy < down; cy++)
      for (let cx = 0; cx < across; cx++) {
        const x0 = cx * cw;
        const y0 = cy * ch;
        // A tile is stored whole, padded; the last strip holds only its rows.
        const rows = tiled ? ch : Math.min(ch, h - y0);
        const n = rows * cw * cs;
        const raw = chunkBytes(
          file,
          t,
          plane * across * down + cy * across + cx,
          n * bytesPer,
          shift,
        );
        let s: Uint8Array | Uint16Array;
        if (wide) {
          const a = new Uint16Array(n);
          if (little)
            for (let i = 0, j = 0; i < n; i++, j += 2)
              a[i] = (raw[j] ?? 0) | ((raw[j + 1] ?? 0) << 8);
          else
            for (let i = 0, j = 0; i < n; i++, j += 2)
              a[i] = ((raw[j] ?? 0) << 8) | (raw[j + 1] ?? 0);
          s = a;
        } else s = t.predictor === 2 ? raw.slice(0, n) : raw;
        if (t.predictor === 2) {
          const row = cw * cs;
          for (let r = 0; r < rows; r++)
            for (let i = r * row + cs; i < (r + 1) * row; i++)
              s[i] = ((s[i] ?? 0) + (s[i - cs] ?? 0)) & (wide ? 0xffff : 0xff);
        }
        const rw = Math.min(cw, w - x0);
        const rr = Math.min(rows, h - y0);
        for (let r = 0; r < rr; r++)
          for (let x = 0; x < rw; x++) {
            const o = ((y0 + r) * w + x0 + x) * channels;
            const i = (r * cw + x) * cs;
            if (page.planar) out[o + plane] = s[i] ?? 0;
            else for (let c = 0; c < channels; c++) out[o + c] = s[i + c] ?? 0;
          }
      }
  }
  if (t.photometric === 0) {
    const top = wide ? 65535 : 255;
    for (let i = 0; i < out.length; i++) out[i] = top - (out[i] ?? 0);
  }
  return { width: w, height: h, bits, channels, data: out, meta: page.meta };
}

/** Every page, decoded: the plain reading of a TIFF (tests, small files). */
export function decodeTiff(bytes: Uint8Array): TiffImage[] {
  const file = parseTiff(bytes);
  return file.pages.map((p) => decodePage(file, p.index));
}

export const isTiff = (b: Uint8Array): boolean =>
  b.length > 8 &&
  ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a) ||
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2b && b[3] === 0) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2b));
