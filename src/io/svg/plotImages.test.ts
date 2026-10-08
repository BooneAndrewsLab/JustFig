/**
 * Pictures inside imported SVG plots (issue 24): taken out of the plot with
 * their placement, and what the plot drew under them cut where they are.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { walkNodes } from '@/render/svgNode';

import { importSvgText } from '../import';
import { base64, encodePng } from '../png';
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

  it('keeps what lies under a see-through picture, and only a frame of a covered background', async () => {
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
    expect(all.some((n) => n.attrs['stroke'] === '#ff0000')).toBe(true);
    // Under the see-through picture: holed (its stroke stays, on its own element).
    expect(all.filter((n) => n.attrs['fill-rule'] === 'evenodd')).toHaveLength(1);
    // Under the opaque one, exactly its size: only the outline is left.
    expect(
      all.filter((n) => n.attrs['fill'] === 'none' && n.attrs['stroke'] === '#000000'),
    ).toHaveLength(2);
    // `xMidYMid meet`: the square picture is drawn 20 × 20, centred.
    const [a, b] = (r.pictures ?? []).map((p) => p.frame);
    expect(b && a && [b.x - a.x, b.y - a.y, b.w, b.h]).toEqual([45, 0, 15, 15]);
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
