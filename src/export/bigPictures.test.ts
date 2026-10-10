// @vitest-environment jsdom
/**
 * Big pictures (notes 29, 30): their stand-ins on screen and in exports. The
 * renderer only swaps the href; PDF gets every pixel through a blob URL; a
 * raster gets a copy at the pixels the picture covers. (PNG and JPEG
 * pictures jsPDF does not have to take: pdfImages.test.ts.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Image } from '@/core/model/types';
import { type ImageHref, pageToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';

import { pdfPictures } from './pdf';
import { RESAMPLE_MIN_CHARS, resamplePlan } from './resample';
import { exportRoot } from './svg';

const picture = (data: string, w = 5000, h = 4000, mime = 'image/png') => ({
  kind: 'image' as const,
  mime,
  dataBase64: data,
  meta: { name: 'm.png', width: w, height: h },
});
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
    expect(href?.('small', picture('QUJD'))).toBeUndefined();
    expect(href?.('big', picture(big))).toBe('blob:test/abc#.jpeg');
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

describe('resamplePlan (PNG, TIFF, thumbnails)', () => {
  const k = 150 / 72;

  it('redraws a big picture at the pixels it covers', () => {
    const f = figure([image('big', 100, 80)], { big: picture(BIG) });
    expect(resamplePlan(f, page0(f), k)).toEqual([{ hash: 'big', w: 209, h: 167 }]);
  });

  it('takes the largest of several uses, and skips hidden ones', () => {
    const f = figure(
      [image('big', 100, 80), image('big', 300, 40), image('big', 2000, 2000, { hidden: true })],
      { big: picture(BIG) },
    );
    expect(resamplePlan(f, page0(f), k)).toEqual([{ hash: 'big', w: 625, h: 167 }]);
  });

  it('leaves small pictures and pictures the raster enlarges alone', () => {
    const f = figure([image('small', 100, 80), image('few', 100, 80)], {
      small: picture('QUJD'),
      few: picture(BIG, 150, 100),
    });
    expect(resamplePlan(f, page0(f), k)).toEqual([]);
  });

  it('never enlarges one side while shrinking the other', () => {
    const f = figure([image('tall', 100, 80)], { tall: picture(BIG, 100, 4000) });
    expect(resamplePlan(f, page0(f), k)).toEqual([{ hash: 'tall', w: 100, h: 167 }]);
  });

  it('redraws the crop a cropped picture draws', () => {
    const f = figure(
      [image('big', 100, 80, { crop: { x: 0, y: 0, w: 2500, h: 2000 }, cropped: 'cut' })],
      { big: picture(BIG), cut: picture(BIG, 2500, 2000) },
    );
    expect(resamplePlan(f, page0(f), k)).toEqual([{ hash: 'cut', w: 209, h: 167 }]);
  });
});
