import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';

import { createPage, createPanel, createRect, frame } from '@/core/model/factory';
import { buildTorture } from './fixtures/torture';
import type { Figure, Page } from '@/core/model/types';
import { loadTestFonts } from '@/test/fonts';

import { exportPanelsZip, panelCrops, panelFileName } from './panels';

beforeAll(loadTestFonts);

function withChildren(children: Figure['doc']['pages'][number]['layers'][number]['children']): {
  fig: Figure;
  page: Page;
} {
  const fig = buildTorture();
  const page0 = createPage();
  const layer = page0.layers[0];
  if (!layer) throw new Error('no layer');
  const page: Page = { ...page0, layers: [{ ...layer, children }] };
  return { fig: { ...fig, doc: { ...fig.doc, pages: [page] } }, page };
}

describe('panel export', () => {
  const b = createPanel(frame(200, 0, 100, 80));
  const a = createPanel(frame(10, 0, 120, 80));
  // Straddles panel A's right edge.
  const rect = createRect(frame(100, 20, 150, 20));

  it('crops to the panels in reading order and names them by label', () => {
    const { page } = withChildren([b, a]);
    const crops = panelCrops(page, 'A');
    expect(crops.map((c) => c.name)).toEqual(['A', 'B']);
    expect(crops[0]?.box).toEqual({ x: 10, y: 0, w: 120, h: 80 });
    expect(panelFileName('figure1', crops[1]!, 'svg')).toBe('figure1_B.svg');
    expect(panelFileName('figure1', crops[1]!, 'tiff')).toBe('figure1_B.tif');
  });

  it('makes labels file-safe and unique, and has none for a page without panels', () => {
    const p1 = { ...createPanel(frame(0, 0, 10, 10)), autoLabel: false, label: '(a)' };
    const p2 = { ...createPanel(frame(20, 0, 10, 10)), autoLabel: false, label: 'a/' };
    const p3 = { ...createPanel(frame(40, 0, 10, 10)), autoLabel: false, label: '' };
    const { page } = withChildren([p1, p2, p3]);
    expect(panelCrops(page, 'A').map((c) => c.name)).toEqual(['a', 'a-2', 'panel3']);
    expect(panelCrops(withChildren([rect]).page, 'A')).toEqual([]);
  });

  it('zips one cropped SVG per panel', async () => {
    const { fig, page } = withChildren([a, b, rect]);
    const zip = await exportPanelsZip(
      fig,
      page,
      'figure1',
      {
        format: 'svg',
        textMode: 'outline',
        footer: true,
        background: true,
        dpi: 300,
        transparent: false,
      },
      '0.0.0',
    );
    const files = unzipSync(zip);
    const names = Object.keys(files).sort();
    expect(names.filter((n) => n.endsWith('.svg'))).toEqual(['figure1_A.svg', 'figure1_B.svg']);
    const dec = new TextDecoder();
    const svgA = dec.decode(files['figure1_A.svg']);
    expect(svgA).toContain('viewBox="10 0 120 80"');
    expect(svgA).toContain('<rect'); // the straddling rectangle is still drawn, cut by the viewBox
    expect(dec.decode(files['figure1_B.svg'])).toContain('viewBox="200 0 100 80"');
    expect(svgA).not.toMatch(/clipPath|<mask|<filter/);
  });

  it('refuses a page without panels', async () => {
    const { fig, page } = withChildren([rect]);
    await expect(
      exportPanelsZip(
        fig,
        page,
        'f',
        {
          format: 'svg',
          textMode: 'outline',
          footer: false,
          background: true,
          dpi: 300,
          transparent: false,
        },
        '0',
      ),
    ).rejects.toThrow(/no panels/);
  });
});
