/**
 * Pictures inside imported SVG plots (issue 24): taken out of the plot with
 * their placement, and what the plot drew under them cut where they are;
 * cut to their SVG clip paths (issue 36).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { walkNodes } from '@/render/svgNode';

import { importSvgText } from '../import';
import { base64, decodePng, encodePng, encodePngSync, fromBase64, hasClearPixels } from '../png';
import { sanitizeSvg } from './sanitize';

/** 8 × 8 RGB: opaque. */
const OPAQUE =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR42mNgKNoERM/mMwARChunBBYhMBu3BB3sAABJt1UhTDnhuAAAAABJRU5ErkJggg==';
const href = (b64: string) => `data:image/png;base64,${b64}`;
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 80">${body}</svg>`;
const nodes = (s: string) => {
  const r = importSvgText(s, 'p.svg');
  const tree = sanitizeSvg(r.asset.kind === 'svgImport' ? r.asset.svg : '').root;
  return { r, all: [...walkNodes(tree)].slice(1) };
};

describe('plot pictures', () => {
  it('takes an opaque picture out, holes the background around it and drops what it hides', () => {
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#eeeeee"/>' +
          '<path d="M20 20L30 30" stroke="#ff0000"/>' +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(OPAQUE)}"/>` +
          '<path d="M20 25L30 35" stroke="#0000ff"/>',
      ),
    );
    expect(r.warnings).toEqual([]);
    expect(r.pictures?.map((p) => p.frame)).toEqual([
      { x: 7.5, y: 7.5, w: 30, h: 30, rotation: 0 },
    ]);
    expect(r.pictures?.[0]?.asset).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(all.some((n) => n.tag === 'image')).toBe(false);
    // The grey background: a ring around the picture.
    const ring = all.find((n) => n.attrs['fill'] === '#eeeeee');
    expect(ring?.attrs['fill-rule']).toBe('evenodd');
    expect(String(ring?.attrs['d']).match(/M/g)).toHaveLength(2);
    // The red line was under the picture (gone), the blue one over it (kept).
    expect(all.some((n) => n.attrs['stroke'] === '#ff0000')).toBe(false);
    expect(all.some((n) => n.attrs['stroke'] === '#0000ff')).toBe(true);
  });

  it('moves what lies under a see-through picture to its backdrop (issue 35)', async () => {
    const rgba = base64(
      await encodePng({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
    );
    const { r, all } = nodes(
      svg(
        '<rect x="10" y="10" width="40" height="40" fill="#ffffff" stroke="#000000"/>' +
          '<path d="M20 20L30 30" stroke="#ff0000"/>' +
          `<image x="10" y="10" width="40" height="40" xlink:href="${href(rgba)}"/>` +
          '<rect x="70" y="10" width="20" height="20" fill="#ffffff" stroke="#000000"/>' +
          `<image x="60" y="10" width="40" height="20" xlink:href="${href(OPAQUE)}"/>`,
      ),
    );
    // Under the see-through picture: in its backdrop, out of the plot.
    expect(all.some((n) => n.attrs['stroke'] === '#ff0000')).toBe(false);
    const back = r.pictures?.[0]?.backdrop;
    expect(back?.frame).toEqual(r.pictures?.[0] && { ...r.pictures[0].frame, rotation: 0 });
    const under = [...walkNodes(sanitizeSvg(back?.asset.svg ?? '').root)].slice(1);
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['rect', '#ffffff', 'none'],
      // (a whole shape under it, copied as it was: the fill a straight line never shows)
      ['path', '#000000', '#ff0000'],
    ]);
    expect(r.pictures?.[1]?.backdrop).toBeUndefined();
    // Under both, exactly their size: only the outlines are left.
    expect(all.filter((n) => n.attrs['fill-rule'] === 'evenodd')).toHaveLength(0);
    expect(
      all.filter((n) => n.attrs['fill'] === 'none' && n.attrs['stroke'] === '#000000'),
    ).toHaveLength(2);
    // `xMidYMid meet`: the square picture is drawn 20 × 20, centred.
    const [a, b] = (r.pictures ?? []).map((p) => p.frame);
    expect(b && a && [b.x - a.x, b.y - a.y, b.w, b.h]).toEqual([45, 0, 15, 15]);
  });

  it('gives a see-through picture on a grey panel a backdrop of the panel and the grid', async () => {
    const rgba = base64(
      await encodePng({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
    );
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#ebebeb"/>' +
          '<path d="M0 30L100 30" stroke="#ffffff" fill="none"/>' +
          '<path d="M0 30Q50 0 100 30" stroke="#00ff00" fill="none"/>' +
          `<image x="20" y="20" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>` +
          '<path d="M0 40L100 40" stroke="#0000ff"/>',
      ),
    );
    const pic = r.pictures?.[0];
    expect(pic?.backdrop?.frame).toEqual(pic && { ...pic.frame, rotation: 0 });
    const under = [...walkNodes(sanitizeSvg(pic?.backdrop?.asset.svg ?? '').root)].slice(1);
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['rect', '#ebebeb', 'none'],
      ['path', 'none', '#ffffff'],
    ]);
    expect(under[1]?.attrs['d']).toBe('M20 30L60 30');
    // In the plot: the panel holed, the grid line cut, the curve and the line drawn after kept.
    expect(all.find((n) => n.attrs['fill'] === '#ebebeb')?.attrs['fill-rule']).toBe('evenodd');
    expect(all.find((n) => n.attrs['stroke'] === '#ffffff')?.attrs['d']).toBe(
      'M0 30L20 30M60 30L100 30',
    );
    expect(all.some((n) => n.attrs['stroke'] === '#00ff00')).toBe(true);
    expect(all.some((n) => n.attrs['stroke'] === '#0000ff')).toBe(true);
  });

  it('counts a PNG whose alpha is all opaque as opaque', async () => {
    const data = new Uint8Array(64).fill(255);
    data[3] = 254;
    const clear = await encodePng({ width: 4, height: 4, channels: 4, data });
    const full = await encodePng({
      width: 4,
      height: 4,
      channels: 4,
      data: new Uint8Array(64).fill(255),
    });
    expect(hasClearPixels(clear)).toBe(true);
    expect(hasClearPixels(full)).toBe(false);
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#eeeeee"/>' +
          `<image x="0" y="0" width="100" height="80" preserveAspectRatio="none" xlink:href="${href(base64(full))}"/>`,
      ),
    );
    expect(r.pictures?.[0]?.backdrop).toBeUndefined();
    expect(all.some((n) => n.attrs['fill'] === '#eeeeee')).toBe(false);
  });

  it('drops a linked picture and places a mirrored one with a flip', () => {
    const { r } = nodes(
      svg(
        '<rect width="100" height="80" fill="#eeeeee"/>' +
          '<image href="https://example.org/a.png" width="10" height="10"/>' +
          `<image transform="scale(1 -1) translate(0 -80)" x="0" y="0" width="20" height="10" preserveAspectRatio="none" href="${href(OPAQUE)}"/>`,
      ),
    );
    expect(r.warnings).toEqual(['Removed a picture linked from outside the file.']);
    expect(r.pictures?.[0]?.frame).toEqual({
      x: 0,
      y: 52.5,
      w: 15,
      h: 7.5,
      rotation: 0,
      flipY: true,
    });
  });

  it('matplotlib SVG: the heatmap, the rasterized layer and the colour bar', () => {
    const imp = importSvgText(
      readFileSync(new URL('./fixtures/matplotlib-images.svg', import.meta.url), 'utf8'),
      'matplotlib-images.svg',
    );
    expect(imp.warnings).toEqual([]);
    const pics = imp.pictures ?? [];
    expect(pics.map((p) => [p.asset.meta.width, p.asset.meta.height])).toEqual([
      [126, 126],
      [163, 116],
      [5, 100],
    ]);
    // matplotlib stores its rows bottom first and mirrors them back.
    for (const p of pics) {
      expect(p.frame.flipY).toBe(true);
      expect(p.frame.x + p.frame.w).toBeLessThan(imp.w);
    }
    expect(pics[0]?.asset.meta.name).toBe('matplotlib-images.svg (picture 1)');
  });
});

describe('clipped plot pictures (issue 36)', () => {
  /** 10 × 10 RGB, each pixel's red its column × 20 and green its row × 20. */
  const grid = base64(
    encodePngSync({
      width: 10,
      height: 10,
      channels: 3,
      data: Uint8Array.from({ length: 300 }, (_, i) =>
        i % 3 === 0 ? (Math.floor(i / 3) % 10) * 20 : i % 3 === 1 ? Math.floor(i / 30) * 20 : 0,
      ),
    }),
  );
  const pixelsOf = (p: { asset: { kind: string } } | undefined) => {
    const a = p?.asset as { dataBase64?: string } | undefined;
    return decodePng(fromBase64(a?.dataBase64 ?? ''));
  };
  // A tick at the origin keeps the plot's crop from moving it.
  const clipped = (clip: string, inner: string) =>
    svg(
      `<defs><clipPath id="c">${clip}</clipPath></defs>${inner}<path d="M0 0L1 1" stroke="#000000"/>`,
    );

  it('crops a picture to a rectangular clip on its group, to whole pixels', () => {
    const { r } = nodes(
      clipped(
        '<rect x="20" y="30" width="50" height="40"/>',
        `<g clip-path="url(#c)"><image width="100" height="100" preserveAspectRatio="none" xlink:href="${href(grid)}"/></g>`,
      ),
    );
    expect(r.warnings).toEqual([]);
    const pic = r.pictures?.[0];
    expect([pic?.asset.meta.width, pic?.asset.meta.height]).toEqual([5, 4]);
    expect(pic?.frame).toEqual({ x: 15, y: 22.5, w: 37.5, h: 30, rotation: 0 });
    const px = pixelsOf(pic);
    // The first pixel left is column 2, row 3 of the original.
    expect([px?.data[0], px?.data[1]]).toEqual([40, 60]);
    expect(px?.channels).toBe(3);
  });

  it('maps a clip through the transforms between its group and the picture', () => {
    const { r } = nodes(
      clipped(
        '<rect x="20" y="0" width="30" height="80"/>',
        `<g transform="translate(-10 0)" clip-path="url(#c)"><g transform="scale(2)">` +
          `<image width="50" height="40" preserveAspectRatio="none" xlink:href="${href(grid)}"/></g></g>`,
      ),
    );
    // Clip x 20..50 in the outer group's space is 10..40 on the page: picture columns 1..4.
    const pic = r.pictures?.[0];
    expect([pic?.asset.meta.width, pic?.asset.meta.height]).toEqual([3, 10]);
    expect(pic?.frame.x).toBeCloseTo(7.5);
    expect(pic?.frame.w).toBeCloseTo(22.5);
  });

  it('makes the pixels outside a circular clip see-through and gives the picture a backdrop', () => {
    const { r } = nodes(
      clipped(
        '<circle cx="50" cy="50" r="40"/>',
        '<rect width="100" height="80" fill="#eeeeee"/>' +
          `<image width="100" height="100" preserveAspectRatio="none" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    const pic = r.pictures?.[0];
    const px = pixelsOf(pic);
    expect([px?.width, px?.height, px?.channels]).toEqual([10, 10, 4]);
    expect(px?.data[3]).toBe(0); // corner: outside the circle
    expect(px?.data[(5 * 10 + 5) * 4 + 3]).toBe(255); // centre: inside
    expect(pic?.backdrop).toBeDefined();
  });

  it('drops a picture its clip leaves nothing of, and keeps one wholly inside unchanged', () => {
    const out = nodes(
      clipped(
        '<rect x="200" y="0" width="10" height="10"/>',
        `<rect width="100" height="80" fill="#eeeeee"/><image width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    expect(out.r.pictures ?? []).toEqual([]);
    const inside = nodes(
      clipped(
        '<rect x="0" y="0" width="50" height="50"/>',
        `<image x="5" y="5" width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    const a = inside.r.pictures?.[0]?.asset as { dataBase64?: string } | undefined;
    expect(a?.dataBase64).toBe(grid);
  });

  it('places a clipped JPEG, or a picture under an unreadable clip, whole with a warning', () => {
    // The smallest JPEG header imageSize reads: SOI, then SOF0 (8 bit, 2 × 2).
    const jpeg = base64(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 2, 0, 2, 1, 1, 0x11, 0, 0xff, 0xd9]),
    );
    const j = nodes(
      clipped(
        '<rect x="0" y="0" width="5" height="5"/>',
        `<image width="10" height="10" clip-path="url(#c)" xlink:href="data:image/jpeg;base64,${jpeg}"/>`,
      ),
    );
    expect(j.r.warnings).toEqual([
      'A clipped picture in a format that cannot be cut here was placed whole.',
    ]);
    expect(j.r.pictures?.[0]?.frame.w).toBe(7.5);
    const t = nodes(
      clipped(
        '<text x="0" y="10">A</text>',
        `<image width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    expect(t.r.warnings).toEqual([
      'A picture clipped to a shape that could not be read was placed whole.',
    ]);
  });

  it('matplotlib SVG: a zoomed heatmap cut to its axes, a heatmap cut to a circle', () => {
    const imp = importSvgText(
      readFileSync(new URL('./fixtures/matplotlib-clipped.svg', import.meta.url), 'utf8'),
      'matplotlib-clipped.svg',
    );
    expect(imp.warnings).toEqual([]);
    const [zoomed, round] = imp.pictures ?? [];
    // 26 × 21 pixels written under a 25 × 20 pixel axes box: one column and row cut.
    expect([zoomed?.asset.meta.width, zoomed?.asset.meta.height]).toEqual([25, 20]);
    // The axes box (42.08, 32.62, 114.1 × 91.28 px) at 0.75 pt per px, less the crop's origin.
    expect(zoomed?.frame.w).toBeCloseTo(114.097 * 0.75, 2);
    expect(zoomed?.frame.h).toBeCloseTo(91.2775 * 0.75, 2);
    expect(zoomed?.backdrop).toBeUndefined();
    const px = pixelsOf(round);
    expect(px?.channels).toBe(4);
    expect(px?.data[3]).toBe(0);
    expect(round?.backdrop).toBeDefined();
  });
});
