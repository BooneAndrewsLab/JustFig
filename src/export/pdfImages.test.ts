// @vitest-environment jsdom
/**
 * Pictures into the PDF without jsPDF's decoder (issue 58, note 31): a PNG's
 * IDAT and a JPEG's bytes go in unchanged; other 8-bit PNGs are decoded once
 * into colour and a soft mask. Checked in the written PDF with pdf-lib.
 */
import { inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFNumber,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Image } from '@/core/model/types';
import { base64, encodePngSync, type Pixels } from '@/io/png';
import { stubDom } from '@/test/domStubs';
import { loadTestFonts } from '@/test/fonts';

import { exportPdf } from './pdf';
import { jpegPassthrough, pdfImage, pngPassthrough } from './pdfImages';

beforeAll(async () => {
  stubDom();
  await loadTestFonts();
});

function pixels(width: number, height: number, channels: 3 | 4, alpha = 255): Pixels {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 5)) & 0xff;
  if (channels === 4)
    for (let p = 0; p < width * height; p++) data[p * 4 + 3] = p === 0 ? alpha : 255;
  return { width, height, channels, data };
}

/** The IDAT body of a PNG with one IDAT chunk (right after IHDR). */
const idatOf = (png: Uint8Array): Uint8Array => {
  const len = new DataView(png.buffer, png.byteOffset).getUint32(33);
  return png.subarray(41, 41 + len);
};

/** Undoes PNG filter 2 (Up), the only one `pdfImage` writes; checks every row says so. */
function unUp(raw: Uint8Array, stride: number, height: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(2);
    for (let i = 0; i < stride; i++)
      out[y * stride + i] =
        ((raw[y * (stride + 1) + 1 + i] ?? 0) + (y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0)) &
        0xff;
  }
  return out;
}

/** A PNG header with the given depth, colour type and interlace (enough for the checks). */
function header(depth: number, colourType: number, interlace = 0): Uint8Array {
  const png = encodePngSync(pixels(2, 2, 3));
  const out = png.slice();
  out[24] = depth;
  out[25] = colourType;
  out[28] = interlace;
  return out;
}

/** A minimal JPEG prefix: SOI, APP0, SOF0 with `components`. */
function jpeg(components: number, w = 640, h = 480): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    8 + 3 * components,
    8,
    h >> 8,
    h & 0xff,
    w >> 8,
    w & 0xff,
    components,
    ...Array.from({ length: components * 3 }, () => 1),
    0xff,
    0xd9,
  ]);
}

describe('pdfImage', () => {
  it('passes an RGB PNG through as its IDAT bytes, with the PNG predictors', async () => {
    const png = encodePngSync(pixels(33, 17, 3));
    const img = await pdfImage(png);
    expect(img).toMatchObject({ width: 33, height: 17, colorSpace: 'DeviceRGB', colors: 3 });
    expect(img?.filter).toBe('FlateDecode');
    expect(img?.sMask).toBeUndefined();
    expect(img && Array.from(img.data)).toEqual(Array.from(idatOf(png)));
  });

  it('joins several IDAT chunks', () => {
    const png = encodePngSync(pixels(8, 8, 3));
    const idat = idatOf(png);
    const half = Math.floor(idat.length / 2);
    const split = (body: Uint8Array) => {
      const c = new Uint8Array(12 + body.length);
      new DataView(c.buffer).setUint32(0, body.length);
      c.set([0x49, 0x44, 0x41, 0x54], 4);
      c.set(body, 8);
      return c;
    };
    const parts = [png.subarray(0, 33), split(idat.subarray(0, half)), split(idat.subarray(half))];
    const iend = png.subarray(41 + idat.length + 4);
    const joined = new Uint8Array([...parts.flatMap((p) => Array.from(p)), ...iend]);
    expect(Array.from(pngPassthrough(joined)?.data ?? [])).toEqual(Array.from(idat));
  });

  it('passes a grey PNG through with one colour', () => {
    const img = pngPassthrough(header(8, 0));
    expect(img).toMatchObject({ colorSpace: 'DeviceGray', colors: 1 });
  });

  it('decodes an RGBA PNG into colour and a soft mask that decode back to its pixels', async () => {
    const px = pixels(19, 11, 4, 40);
    const img = await pdfImage(encodePngSync(px));
    expect(img).toMatchObject({ width: 19, height: 11, colorSpace: 'DeviceRGB', colors: 3 });
    if (!img?.sMask) throw new Error('no soft mask');
    const colour = unUp(inflateSync(img.data), 19 * 3, 11);
    const alpha = unUp(inflateSync(img.sMask), 19, 11);
    for (let p = 0; p < 19 * 11; p++) {
      expect([colour[p * 3], colour[p * 3 + 1], colour[p * 3 + 2], alpha[p]]).toEqual(
        Array.from(px.data.subarray(p * 4, p * 4 + 4)),
      );
    }
  });

  it('drops the soft mask of an RGBA PNG with no see-through pixel', async () => {
    const img = await pdfImage(encodePngSync(pixels(5, 5, 4)));
    expect(img?.sMask).toBeUndefined();
    expect(img?.colorSpace).toBe('DeviceRGB');
  });

  it('leaves 16-bit and interlaced PNGs to jsPDF', async () => {
    expect(pngPassthrough(header(16, 2))).toBeNull();
    expect(pngPassthrough(header(8, 2, 1))).toBeNull();
    expect(await pdfImage(header(16, 2))).toBeNull();
    expect(await pdfImage(header(8, 6, 1))).toBeNull();
  });

  it('passes a grey or colour JPEG through as is, and leaves CMYK to jsPDF', () => {
    const j = jpeg(3);
    expect(jpegPassthrough(j)).toEqual({
      width: 640,
      height: 480,
      colorSpace: 'DeviceRGB',
      filter: 'DCTDecode',
      data: j,
    });
    expect(jpegPassthrough(jpeg(1))?.colorSpace).toBe('DeviceGray');
    expect(jpegPassthrough(jpeg(4))).toBeNull();
    expect(jpegPassthrough(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

function image(asset: string, x: number, opacity = 1): Image {
  return {
    id: newId('o'),
    type: 'image',
    asset,
    frame: { x, y: 20, w: 100, h: 60, rotation: 0 },
    opacity,
  };
}

function figure(objects: Image[], assets: Figure['assets']): Figure {
  const doc = createDoc();
  const [page] = doc.pages;
  const [layer] = page?.layers ?? [];
  if (!page || !layer) throw new Error('no page');
  return {
    doc: { ...doc, pages: [{ ...page, layers: [{ ...layer, children: objects }] }] },
    assets,
  };
}

const asset = (png: Uint8Array, w: number, h: number) => ({
  kind: 'image' as const,
  mime: 'image/png',
  dataBase64: base64(png),
  meta: { name: 'p.png', width: w, height: h },
});

function imageStreams(pdf: PDFDocument): PDFRawStream[] {
  const out: PDFRawStream[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects())
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
      out.push(obj);
  return out;
}

const num = (d: PDFDict, key: string): number | undefined =>
  (d.get(PDFName.of(key)) as PDFNumber | undefined)?.asNumber();

describe('exportPdf with pictures', () => {
  it('embeds a PNG IDAT unchanged, once for two uses, and a soft mask for alpha', async () => {
    const rgb = encodePngSync(pixels(40, 24, 3));
    const rgba = encodePngSync(pixels(30, 18, 4, 0));
    const f = figure([image('rgb', 10), image('rgb', 150, 0.5), image('rgba', 300)], {
      rgb: asset(rgb, 40, 24),
      rgba: asset(rgba, 30, 18),
    });
    const bytes = await exportPdf(
      f,
      f.doc.pages,
      { textMode: 'outline', footer: false, background: true },
      '0.0.0',
    );
    const pdf = await PDFDocument.load(bytes);
    const images = imageStreams(pdf);
    // rgb once, rgba's colour and its soft mask.
    expect(images).toHaveLength(3);

    const passed = images.find((s) => num(s.dict, 'Width') === 40);
    if (!passed) throw new Error('no 40 px image');
    expect(Buffer.from(passed.contents).equals(Buffer.from(idatOf(rgb)))).toBe(true);
    expect(passed.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
    expect(passed.dict.get(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceRGB'));
    const parms = passed.dict.get(PDFName.of('DecodeParms'));
    if (!(parms instanceof PDFDict)) throw new Error('no DecodeParms');
    expect([num(parms, 'Predictor'), num(parms, 'Colors'), num(parms, 'Columns')]).toEqual([
      15, 3, 40,
    ]);
    // Inflated with its predictors, it is the picture's pixels.
    const raw = inflateSync(passed.contents);
    expect(raw.length).toBe(24 * (40 * 3 + 1));

    const masked = images.find(
      (s) => num(s.dict, 'Width') === 30 && s.dict.get(PDFName.of('SMask')) instanceof PDFRef,
    );
    expect(masked).toBeDefined();

    // Drawn three times, at the frames' sizes; the 1 x 1 stand-in never reaches the PDF.
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toMatch(/\/Width 1\s/);
    const page = pdf.getPage(0).node.Contents();
    const content =
      page instanceof PDFRawStream ? inflateSync(page.contents).toString('latin1') : '';
    expect(content.match(/\/I\d+ Do/g)).toHaveLength(3);
    // The half-transparent use keeps its opacity (an ExtGState set around it).
    expect(content).toMatch(/\/GS\d+ gs/);
    expect(images.every((s) => !(s.dict.get(PDFName.of('Filter')) instanceof PDFArray))).toBe(true);
  });
});
