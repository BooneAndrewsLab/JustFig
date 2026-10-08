import { describe, expect, it } from 'vitest';

import {
  iTXt,
  iTXtPlain,
  pHYs,
  pngCrc32,
  readChunks,
  readCompressedText,
  readDpi,
  readText,
  tEXt,
  withChunks,
} from './png';

// A valid 1×1 white PNG.
const TINY = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function crcOk(png: Uint8Array): boolean {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  while (at < png.length) {
    const len = view.getUint32(at);
    const crc = view.getUint32(at + 8 + len);
    if (pngCrc32(png.subarray(at + 4, at + 8 + len)) !== crc) return false;
    at += 12 + len;
  }
  return true;
}

describe('PNG chunks', () => {
  it('computes the standard CRC-32', () => {
    expect(pngCrc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    expect(crcOk(TINY)).toBe(true);
  });

  it('records the DPI and text, right after the header, readable back', () => {
    const out = withChunks(TINY, [
      pHYs(600),
      tEXt('Software', 'BarelySig 0.5.0'),
      iTXtPlain('Description', 'Made with BarelySig — µ ± ≥'),
    ]);
    expect(crcOk(out)).toBe(true);
    expect(readChunks(out).map((c) => c.type)).toEqual([
      'IHDR',
      'pHYs',
      'tEXt',
      'iTXt',
      'IDAT',
      'IEND',
    ]);
    expect(readDpi(out)).toBe(600);
    expect(readText(out, 'Software')).toBe('BarelySig 0.5.0');
    expect(readText(out, 'Description')).toBe('Made with BarelySig — µ ± ≥');
    expect(readText(out, 'Missing')).toBeNull();
  });

  it('replaces an earlier resolution rather than adding a second', () => {
    const twice = withChunks(withChunks(TINY, [pHYs(300)]), [pHYs(600)]);
    expect(readChunks(twice).filter((c) => c.type === 'pHYs')).toHaveLength(1);
    expect(readDpi(twice)).toBe(600);
  });

  it('carries compressed text, returned still compressed', () => {
    const bytes = Uint8Array.of(120, 156, 1, 2, 3);
    const out = withChunks(TINY, [iTXt('barelysig-recipe', bytes, true)]);
    expect(readCompressedText(out, 'barelysig-recipe')).toEqual(bytes);
  });

  it('refuses a file that is not a PNG', () => {
    expect(() => readChunks(new TextEncoder().encode('<svg/>'))).toThrow('not a PNG');
  });
});
