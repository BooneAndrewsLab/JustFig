// @vitest-environment jsdom
/**
 * Big pictures (notes 29, 30): their stand-ins on screen and in exports. The
 * renderer only swaps the href; PDF gets every pixel through a blob URL; a
 * raster gets a copy at the pixels the picture covers. (PNG and JPEG
 * pictures jsPDF does not have to take: pdfImages.test.ts.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDoc, createRect } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Image, Obj } from '@/core/model/types';
import { type ImageHref, objectToNode, pageToNode, renderCtx } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';

import { pdfPictures } from './pdf';
import { bandBox } from './raster';
import { RESAMPLE_MIN_CHARS, STRIP_CHARS, rasterPlan, stripRows, stripsWithin } from './resample';
import { exportRoot } from './svg';

const picture = (data: string, w = 5000, h = 4000, mime = 'image/png') => ({
  kind: 'image' as const,
  mime,
  dataBase64: data,
  meta: { name: 'm.png', width: w, height: h },
});
const FRAME = { x: 10, y: 10, w: 100, h: 80, rotation: 0 };
const BIG = 'QUJD'.repeat(RESAMPLE_MIN_CHARS / 4 + 1);

function image(asset: string, w = 100, h = 80, extra: Partial<Image> = {}): Image {
  return {
    id: newId('o'),
    type: 'image',
    asset,
    frame: { x: 10, y: 10, w, h, rotation: 0 },
    opacity: 1,
    ...extra,
  };
}

function figure(objects: Image[], assets: Figure['assets']): Figure {
  const doc = createDoc();
  const [page] = doc.pages;
  const [layer] = page?.layers ?? [];
  if (!page || !layer) throw new Error('no page');
  const p = { ...page, layers: [{ ...layer, children: objects }] };
  return { doc: { ...doc, pages: [p] }, assets };
}
const page0 = (f: Figure) => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the renderer with an ImageHref', () => {
  const f = figure([image('big')], { big: picture('QUJD') });
  const svg = (imageHref?: ImageHref) =>
    nodeToSvgString(
      pageToNode(page0(f), f.doc, f.assets, { textMode: 'outline', screen: true, imageHref }),
    );

  it('draws the asset itself without one, the stand-in with one, a grey box while it is pending', () => {
    expect(svg()).toContain('xlink:href="data:image/png;base64,QUJD"');
    expect(svg(() => 'blob:x/1')).toContain('xlink:href="blob:x/1"');
    const pending = svg(() => null);
    expect(pending).not.toContain('<image');
    expect(pending).toContain('fill="#e4e7eb"');
    expect(svg(() => undefined)).toContain('data:image/png;base64,QUJD');
  });
});

describe('pdfPictures (PDF), pictures jsPDF has to take', () => {
  it('leaves small pictures as data URIs and gives big ones blob URLs with the format', async () => {
    const create = vi.fn(() => 'blob:test/abc');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create }));
    const big = 'QUJD'.repeat(1_100_000);
    const f = figure([image('small'), image('big')], {
      small: picture('QUJD'),
      big: picture(big, 5000, 4000, 'image/jpeg'),
    });
    const { href, urls, stubs } = await pdfPictures(f, [page0(f)]);
    expect(stubs.size).toBe(0);
    expect(urls).toEqual(['blob:test/abc']);
    expect(href?.('small', picture('QUJD'), FRAME)).toBeUndefined();
    expect(href?.('big', picture(big), FRAME)).toBe('blob:test/abc#.jpeg');
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.size).toBe(3_300_000);
    expect(blob.type).toBe('image/jpeg');
    // Every pixel, but the long data URI never enters the SVG text.
    const text = nodeToSvgString(
      exportRoot(f, page0(f), {
        textMode: 'outline',
        footer: false,
        background: true,
        imageHref: href,
      }).node,
    );
    expect(text).toContain('xlink:href="blob:test/abc#.jpeg"');
    expect(text).not.toContain(big.slice(0, 1000));
  });

  it('has nothing to do for a page of small pictures', async () => {
    const f = figure([image('small')], { small: picture('QUJD') });
    expect(await pdfPictures(f, [page0(f)])).toEqual({
      href: undefined,
      stubs: new Map(),
      urls: [],
    });
  });
});

describe('rasterPlan (PNG, TIFF, thumbnails)', () => {
  const k = 150 / 72;
  const sizes = (f: Figure) =>
    rasterPlan(f, page0(f), k).map(({ hash, w, h, resample }) => ({ hash, w, h, resample }));

  it('redraws a big picture at the pixels it covers', () => {
    const f = figure([image('big', 100, 80)], { big: picture(BIG) });
    expect(sizes(f)).toEqual([{ hash: 'big', w: 209, h: 167, resample: true }]);
  });

  it('takes the largest of several uses, and skips hidden ones', () => {
    const f = figure(
      [image('big', 100, 80), image('big', 300, 40), image('big', 2000, 2000, { hidden: true })],
      { big: picture(BIG) },
    );
    expect(sizes(f)).toEqual([{ hash: 'big', w: 625, h: 167, resample: true }]);
  });

  it('leaves small pictures alone and keeps every pixel of one the raster enlarges', () => {
    const f = figure([image('small', 100, 80), image('few', 100, 80)], {
      small: picture('QUJD'),
      few: picture(BIG, 150, 100),
    });
    expect(sizes(f)).toEqual([{ hash: 'few', w: 150, h: 100, resample: false }]);
  });

  it('never enlarges one side while shrinking the other', () => {
    const f = figure([image('tall', 100, 80)], { tall: picture(BIG, 100, 4000) });
    expect(sizes(f)).toEqual([{ hash: 'tall', w: 100, h: 167, resample: true }]);
  });

  it('redraws the crop a cropped picture draws', () => {
    const f = figure(
      [image('big', 100, 80, { crop: { x: 0, y: 0, w: 2500, h: 2000 }, cropped: 'cut' })],
      { big: picture(BIG), cut: picture(BIG, 2500, 2000) },
    );
    expect(sizes(f)).toEqual([{ hash: 'cut', w: 209, h: 167, resample: true }]);
  });

  it('overlaps strips by two output pixels at the smallest use', () => {
    // 1.67 output pixels per row: 2 rows; the 40 pt use has 0.5 per row: 5 rows (4.008 rounded up).
    const one = figure([image('few', 100, 80)], { few: picture(BIG, 150, 100) });
    expect(rasterPlan(one, page0(one), k)[0]?.overlap).toBe(2);
    const two = figure([image('big', 100, 80), image('big', 300, 40)], { big: picture(BIG) });
    expect(rasterPlan(two, page0(two), k)[0]?.overlap).toBe(5);
    // A tiny copy of a huge picture is capped.
    const tiny = figure([image('big', 5000, 4000), image('big', 1, 1)], { big: picture(BIG) });
    expect(rasterPlan(tiny, page0(tiny), k)[0]?.overlap).toBe(64);
  });
});

describe('strips (note 32)', () => {
  const strips = {
    height: 400,
    strips: [0, 100, 200, 300].map((y) => ({
      y,
      rows: y === 300 ? 100 : 102,
      href: `data:s${String(y)}`,
    })),
  };

  it('aims each strip at STRIP_CHARS, never under the overlap', () => {
    expect(stripRows(5000, 1, 2)).toBe(Math.floor(STRIP_CHARS / 5000));
    expect(stripRows(5000, 4, 2)).toBe(12);
    expect(stripRows(1_000_000, 4, 3)).toBe(3);
    expect(stripRows(1_000_000, 4, 0)).toBe(1);
    expect(stripRows(10, 0, 1)).toBeGreaterThan(1000);
  });

  it('are drawn by the renderer edge to edge in the picture box, in order', () => {
    const f = figure([image('big', 100, 80)], { big: picture(BIG) });
    const svg = nodeToSvgString(
      pageToNode(page0(f), f.doc, f.assets, {
        textMode: 'outline',
        screen: false,
        imageHref: () => strips,
      }),
    );
    expect(svg).not.toContain(BIG.slice(0, 1000));
    const images = [...svg.matchAll(/<image ([^>]*)\/>/g)].map((m) => m[1] ?? '');
    expect(images).toHaveLength(4);
    expect(images[0]).toContain('y="0" width="100" height="20.4"');
    expect(images[1]).toContain('y="20" width="100" height="20.4"');
    expect(images[3]).toContain('y="60" width="100" height="20"');
    expect(images[3]).toContain('xlink:href="data:s300"');
  });

  it('a band keeps only the strips that reach into it, rotated frames too', () => {
    const frame = { x: 0, y: 100, w: 100, h: 80, rotation: 0 };
    const ys = (box: { x: number; y: number; w: number; h: number }, f = frame) =>
      stripsWithin(strips, f, box).strips.map((s) => s.y);
    expect(ys({ x: 0, y: 0, w: 500, h: 50 })).toEqual([]);
    expect(ys({ x: 0, y: 0, w: 500, h: 125 })).toEqual([0, 100]); // the first reaches 120.4
    expect(ys({ x: 0, y: 150, w: 500, h: 100 })).toEqual([200, 300]);
    expect(ys({ x: 0, y: 0, w: 500, h: 500 })).toEqual([0, 100, 200, 300]);
    // Upside down, the first strip is at the bottom.
    expect(ys({ x: 0, y: 165, w: 500, h: 100 }, { ...frame, rotation: 180 })).toEqual([0]);
    // A quarter turn: every strip spans the frame's height on the page.
    expect(ys({ x: 0, y: 100, w: 500, h: 1 }, { ...frame, rotation: 90 })).toEqual([
      0, 100, 200, 300,
    ]);
  });

  it('bandBox is the band in page coordinates with a few pixels to spare', () => {
    const b = bandBox({ x: 10, y: 20, width: 100 }, 2, 40, 60);
    expect(b).toEqual({ x: 8, y: 38, w: 104, h: 34 });
  });
});

describe('the memo and the hook', () => {
  it('redraws only objects that draw a picture when the hook changes', () => {
    const pic = image('big');
    const rect = createRect(FRAME);
    const child = image('big');
    const group = { ...image('big'), type: 'group', children: [child] } as unknown as Obj;
    const f = figure([pic], { big: picture('QUJD') });
    const ctx = (imageHref?: ImageHref) =>
      renderCtx(page0(f), f.doc, f.assets, { textMode: 'outline', screen: false, imageHref });
    const [none, blob] = [ctx(), ctx(() => 'blob:a')];
    // Drawn first without a hook: a hook later still changes what a picture draws.
    expect(nodeToSvgString(objectToNode(pic, none) ?? '')).toContain('base64,QUJD');
    expect(nodeToSvgString(objectToNode(pic, blob) ?? '')).toContain('blob:a');
    expect(objectToNode(rect, blob)).toBe(objectToNode(rect, none));
    // A group holding a picture depends on the hook, memo hit inside or not.
    objectToNode(child, blob);
    expect(nodeToSvgString(objectToNode(group, blob) ?? '')).toContain('blob:a');
    expect(nodeToSvgString(objectToNode(group, none) ?? '')).toContain('base64,QUJD');
  });
});
