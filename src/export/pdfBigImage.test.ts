// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { externaliseBigImages } from './pdf';

// svg2pdf's data-URI regex overflows the stack at about 12 MB, so a 20 Mpx
// picture hung the PDF export (note 29): big pictures go in as blob URLs.
function svgWith(href: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="${href}" width="1" height="1"/></svg>`,
    'image/svg+xml',
  );
  return doc.documentElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('externaliseBigImages', () => {
  it('leaves small pictures as data URIs and turns big ones into blob URLs with the format', () => {
    const create = vi.fn(() => 'blob:test/abc');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create }));
    const small = `data:image/png;base64,${'QUJD'.repeat(10)}`;
    const big = `data:image/jpeg;base64,${'QUJD'.repeat(1_100_000)}`;

    const a = svgWith(small);
    expect(externaliseBigImages(a)).toEqual([]);
    expect(a.querySelector('image')?.getAttribute('xlink:href')).toBe(small);

    const b = svgWith(big);
    expect(externaliseBigImages(b)).toEqual(['blob:test/abc']);
    expect(b.querySelector('image')?.getAttribute('xlink:href')).toBe('blob:test/abc#.jpeg');
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.size).toBe(3_300_000);
    expect(blob.type).toBe('image/jpeg');
  });
});
