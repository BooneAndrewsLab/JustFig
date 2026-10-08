import { describe, expect, it } from 'vitest';

import { imageSize, importRaster, importSvgText } from './import';

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR42mNgKNoERM/mMwARChunBBYhMBu3BB3sAABJt1UhTDnhuAAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
// SOI, APP0 (len 16), SOF0 with height 3, width 5.
const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0,
  0, 11, 8, 0, 3, 0, 5, 1, 1, 0x11, 0, 0xff, 0xd9,
]);

describe('import', () => {
  it('reads PNG and JPEG sizes', () => {
    expect(imageSize(PNG)).toEqual({ mime: 'image/png', width: 8, height: 8 });
    expect(imageSize(JPEG)).toEqual({ mime: 'image/jpeg', width: 5, height: 3 });
    expect(imageSize(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it('embeds a raster with its size in points', () => {
    const r = importRaster(PNG, 'a.png');
    expect(r.asset.kind).toBe('image');
    expect([r.w, r.h]).toEqual([6, 6]);
  });

  it('sanitises an SVG: scripts, handlers and external refs are gone, styles become attributes', () => {
    const r = importSvgText(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" onload="alert(1)"><style>.k{fill:red}</style>' +
        '<script>alert(2)</script><image href="http://x/y.png"/><foreignObject><div/></foreignObject>' +
        '<rect class="k" width="10" height="10" onclick="x()"/><use href="https://x/#a"/></svg>',
      'x.svg',
    );
    const svg = r.asset.kind === 'svgImport' ? r.asset.svg : '';
    expect(svg).not.toMatch(/script|onload|onclick|foreignObject|<image|http:\/\/x|https:\/\/x/);
    expect(svg).toContain('fill="#ff0000"');
    expect(r.warnings.length).toBeGreaterThan(0);
    // Cropped to the 10×10 drawing (note 12), in points.
    expect([r.w, r.h]).toEqual([7.5, 7.5]);
  });
});
