import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createPage, createPanel, createRect, frame } from '@/core/model/factory';
import type { Figure, Page } from '@/core/model/types';
import { loadTestFonts } from '@/test/fonts';

import {
  type ClipboardItemCtor,
  COPY_DPI,
  SELECTION_PAD,
  copyDpi,
  copyPixelSize,
  copyScope,
  copySvgText,
  writeToClipboard,
} from './clipboardImage';
import { buildTorture } from './fixtures/torture';

beforeAll(loadTestFonts);

const a = createRect(frame(10, 20, 30, 40));
const b = createRect(frame(100, 100, 50, 50));

function setup(children = [a, b] as Page['layers'][number]['children']): {
  fig: Figure;
  page: Page;
} {
  const fig = buildTorture();
  const p0 = createPage();
  const layer = p0.layers[0];
  if (!layer) throw new Error('no layer');
  const page: Page = { ...p0, layers: [{ ...layer, children }] };
  return { fig: { ...fig, doc: { ...fig.doc, pages: [page] } }, page };
}

describe('copy scope', () => {
  it('is the whole page, with its credit footer, when nothing is selected', () => {
    const { page } = setup();
    const s = copyScope(page, []);
    expect(s.kind).toBe('page');
    expect(s.page).toBe(page);
    expect(s.footer).toBe(true);
    expect(s.crop).toBeUndefined();
  });

  it('is only the selected objects, cropped to their padded bounds', () => {
    const { page } = setup();
    const s = copyScope(page, [a.id]);
    expect(s.kind).toBe('selection');
    expect(s.page.layers[0]?.children.map((o) => o.id)).toEqual([a.id]);
    expect(s.crop).toEqual({
      x: 10 - SELECTION_PAD,
      y: 20 - SELECTION_PAD,
      w: 30 + 2 * SELECTION_PAD,
      h: 40 + 2 * SELECTION_PAD,
    });
    expect(s.footer).toBe(false);
  });

  it('keeps a nested selected object inside its container, and falls back for stale ids', () => {
    const panel = { ...createPanel(frame(0, 0, 200, 200)), children: [a, b] };
    const { page } = setup([panel]);
    const s = copyScope(page, [b.id]);
    const [kept] = s.page.layers[0]?.children ?? [];
    expect(kept?.type === 'panel' && kept.children.map((o) => o.id)).toEqual([b.id]);
    expect(copyScope(page, ['gone' as never]).kind).toBe('page');
  });

  it('renders only the selection into the SVG text', () => {
    const { fig, page } = setup();
    const all = copySvgText(fig, copyScope(page, []), '0.0.0');
    const one = copySvgText(fig, copyScope(page, [a.id]), '0.0.0');
    expect(one).toContain('<svg');
    expect(one).not.toBe(all);
    expect(one).toContain('viewBox="7 17 36 46"');
  });
});

describe('copy resolution', () => {
  it('is 300 dpi', () => {
    const { fig, page } = setup();
    expect(copyDpi(fig, copyScope(page, []))).toBe(COPY_DPI);
    const s = copyScope(page, [a.id]);
    expect(copyPixelSize(fig, s)).toEqual({
      w: Math.round((36 * 300) / 72),
      h: Math.round((46 * 300) / 72),
    });
  });
});

describe('writeToClipboard', () => {
  const png = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }));
  const svg = () => new Blob(['<svg/>'], { type: 'text/plain' });
  class Item {
    constructor(readonly types: Record<string, Promise<Blob>>) {}
  }

  it('writes PNG and SVG text in one item', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    expect(await writeToClipboard(png(), svg, { write }, Item as ClipboardItemCtor)).toBe(
      'png+svg',
    );
    const item = (write.mock.calls[0]?.[0] as Item[])[0]!;
    expect(Object.keys(item.types)).toEqual(['image/png', 'text/plain']);
  });

  it('falls back to the PNG alone when the second type is refused', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('type')).mockResolvedValueOnce(undefined);
    expect(await writeToClipboard(png(), svg, { write }, Item as ClipboardItemCtor)).toBe('png');
    const item = (write.mock.calls[1]?.[0] as Item[])[0]!;
    expect(Object.keys(item.types)).toEqual(['image/png']);
  });

  it('reports an unavailable clipboard, and throws a failed drawing once', async () => {
    expect(await writeToClipboard(png(), svg, undefined, Item as ClipboardItemCtor)).toBe(
      'unavailable',
    );
    expect(await writeToClipboard(png(), svg, { write: vi.fn() }, undefined)).toBe('unavailable');
    const write = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      writeToClipboard(
        Promise.reject(new Error('draw')),
        svg,
        { write },
        Item as ClipboardItemCtor,
      ),
    ).rejects.toThrow('draw');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
