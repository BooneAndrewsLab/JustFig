import { beforeAll, describe, expect, it } from 'vitest';

import {
  createDoc,
  createPage,
  createPanel,
  createPath,
  createRect,
  createText,
  defaultRun,
  frame,
  hex,
} from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import type { Asset, Figure, Obj, Page } from '@/core/model/types';
import { PAGE_PRESETS, presetSize } from '@/core/presets/pages';
import { fitText } from '@/core/text/layout';
import { mmToPt } from '@/core/units';
import { loadTestFonts } from '@/test/fonts';

import {
  type CheckWarning,
  checkJournalHeight,
  checkJournalWidth,
  checkLevels,
  checkOverlap,
  checkPage,
  dataUriPixels,
  journalScale,
  minTextFor,
} from './checks';

beforeAll(loadTestFonts);

function fig(children: readonly Obj[], assets: Figure['assets'] = {}, preset = 'nature-2') {
  const p0 = createPage('Page 1', preset);
  const layer = p0.layers[0];
  if (!layer) throw new Error('no layer');
  const page: Page = { ...p0, layers: [{ ...layer, children }] };
  const doc = { ...createDoc(), pages: [page] };
  return { figure: { doc, assets } as Figure, page };
}

const text = (x: number, y: number, s: string, size = 8) =>
  fitText(createText(x, y, [[defaultRun(s, { size })]]));

const rules = (ws: readonly CheckWarning[], rule: CheckWarning['rule']) =>
  ws.filter((w) => w.rule === rule);

/** The first 24 bytes of a PNG: enough for its size. */
function pngHeader(w: number, h: number): string {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b.toString('base64');
}

const imageAsset = (w: number, h: number): Asset => ({
  kind: 'image',
  mime: 'image/png',
  dataBase64: pngHeader(w, h),
  meta: { name: 'x.png', width: w, height: h },
});

const svgAsset = (svg: string): Asset => ({
  kind: 'svgImport',
  svg,
  meta: { name: 'plot.svg', width: 100, height: 100 },
});

const image = (id: string, asset: string, w: number, h: number): Obj => ({
  id: id as Id,
  type: 'image',
  frame: frame(10, 10, w, h),
  opacity: 1,
  asset,
});

describe('text size', () => {
  it('warns about small text and selects it, not about text at the limit', () => {
    const small = text(10, 10, 'tiny', 4);
    const ok = text(10, 60, 'fine', 6);
    const { figure, page } = fig([small, ok]);
    const ws = rules(checkPage(figure, page, { journal: null }), 'text-size');
    expect(ws.map((w) => w.ids)).toEqual([[small.id]]);
    expect(ws[0]?.message).toContain('4 pt');
  });

  it('measures text inside a scaled imported SVG at its drawn size', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<text x="10" y="50" font-size="20">Hi</text></svg>';
    // 100 user units in 20 pt: 20 × 0.2 = 4 pt.
    const { figure, page } = fig([image('plot', 'h1', 20, 20)], { h1: svgAsset(svg) });
    const ws = rules(checkPage(figure, page, { journal: null }), 'text-size');
    expect(ws.map((w) => w.ids)).toEqual([['plot']]);
    expect(ws[0]?.message).toContain('4 pt');
    // At 40 pt it is drawn at 8 pt: fine.
    const big = fig([image('plot', 'h1', 40, 40)], { h1: svgAsset(svg) });
    expect(rules(checkPage(big.figure, big.page, { journal: null }), 'text-size')).toEqual([]);
  });

  it('uses the journal minimum and the journal shrink factor', () => {
    expect(minTextFor('Nature')).toBe(5);
    expect(minTextFor(null)).toBe(6);
    const t = text(10, 10, 'five', 5.5);
    const { figure, page } = fig([t]);
    expect(rules(checkPage(figure, page, { journal: 'Nature' }), 'text-size')).toEqual([]);
    expect(rules(checkPage(figure, page, { journal: 'Cell' }), 'text-size')).toHaveLength(1);
  });
});

describe('stroke width', () => {
  it('warns about hairlines, also inside groups, and ignores unstroked shapes', () => {
    const thin = createRect(frame(10, 10, 50, 50), {
      fill: null,
      stroke: hex('#000000'),
      strokeWidth: 0.1,
      cap: 'butt',
      join: 'miter',
    });
    const none = createRect(frame(80, 10, 50, 50), {
      fill: hex('#ff0000'),
      stroke: null,
      strokeWidth: 0.05,
      cap: 'butt',
      join: 'miter',
    });
    const line = createPath(
      [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
      false,
    );
    const { figure, page } = fig([thin, none, line]);
    const ws = rules(checkPage(figure, page, { journal: null }), 'stroke-width');
    expect(ws.map((w) => w.ids)).toEqual([[thin.id]]);
    expect(ws[0]?.message).toContain('0.1 pt');
  });

  it('measures strokes inside a scaled imported SVG, inherited from a group', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g stroke="#000" stroke-width="1"><path d="M0 0L100 100"/></g></svg>';
    // Scaled by 0.2: 0.2 pt.
    const { figure, page } = fig([image('p', 'h', 20, 20)], { h: svgAsset(svg) });
    expect(
      rules(checkPage(figure, page, { journal: null }), 'stroke-width').map((w) => w.ids),
    ).toEqual([['p']]);
  });
});

describe('image resolution', () => {
  it('reads the pixel size of a PNG data URI', () => {
    expect(dataUriPixels(`data:image/png;base64,${pngHeader(640, 480)}`)).toEqual({
      w: 640,
      h: 480,
    });
    expect(dataUriPixels('data:image/png;base64,AAAA')).toBeNull();
    expect(dataUriPixels('https://example.org/x.png')).toBeNull();
  });

  it('warns when a picture is under the target dpi at its placed size', () => {
    // 300 px over 2 in (144 pt) = 150 dpi; over 1 in = 300 dpi.
    const { figure, page } = fig([image('lo', 'a', 144, 144), image('ok', 'b', 72, 72)], {
      a: imageAsset(300, 300),
      b: imageAsset(300, 300),
    });
    const ws = rules(checkPage(figure, page, { journal: null }), 'image-dpi');
    expect(ws.map((w) => w.ids)).toEqual([['lo']]);
    expect(ws[0]?.message).toContain('150 dpi');
  });

  it('takes the lower of the two axes for a stretched picture', () => {
    const { figure, page } = fig([image('s', 'a', 72, 144)], { a: imageAsset(300, 300) });
    expect(rules(checkPage(figure, page, { journal: null }), 'image-dpi')).toHaveLength(1);
  });
});

describe('journal width', () => {
  const sized = (wMm: number): Page => {
    const p = createPage();
    return { ...p, size: { w: mmToPt(wMm), h: 200 } };
  };

  it('is quiet for a page that fits a column, or with no journal', () => {
    expect(checkJournalWidth(sized(89), 'Nature')).toEqual([]);
    expect(checkJournalWidth(sized(183), 'Nature')).toEqual([]);
    expect(checkJournalWidth(sized(120), 'Nature')).toEqual([]);
    expect(checkJournalWidth(sized(400), null)).toEqual([]);
  });

  it('warns about a page just over a column', () => {
    const ws = checkJournalWidth(sized(95), 'Nature');
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain('1 column (89 mm)');
    expect(ws[0]?.ids).toEqual([]);
  });

  it('warns about a page wider than the widest column, and scales the other checks', () => {
    const page = sized(366);
    expect(journalScale(page, 'Nature')).toBeCloseTo(0.5, 5);
    expect(checkJournalWidth(page, 'Nature')[0]?.message).toContain('50%');
    // 8 pt text halves to 4 pt.
    const t = text(10, 10, 'shrunk', 8);
    const { figure, page: p } = fig([t]);
    const wide = { ...p, size: page.size };
    const f2 = { ...figure, doc: { ...figure.doc, pages: [wide] } };
    const ws = rules(checkPage(f2, wide, { journal: 'Nature' }), 'text-size');
    expect(ws.map((w) => w.ids)).toEqual([[t.id]]);
    expect(ws[0]?.message).toContain('after the journal shrinks it');
  });

  it('matches every journal preset width exactly', () => {
    for (const id of ['nature-1', 'cell-2', 'science-3', 'pnas-1', 'plos', 'elife-2']) {
      const s = presetSize(id);
      if (!s) throw new Error(id);
      const p = { ...createPage(), size: s };
      const journal = id.startsWith('nature')
        ? 'Nature'
        : id.startsWith('cell')
          ? 'Cell'
          : id.startsWith('science')
            ? 'Science'
            : id.startsWith('pnas')
              ? 'PNAS'
              : id.startsWith('plos')
                ? 'PLOS'
                : 'eLife';
      expect(checkJournalWidth(p, journal), id).toEqual([]);
    }
  });
});

describe('journal height', () => {
  const sized = (wMm: number, hMm: number): Page => ({
    ...createPage(),
    size: { w: mmToPt(wMm), h: mmToPt(hMm) },
  });

  it('is quiet at or under the maximum, with no journal, or with no published maximum', () => {
    expect(checkJournalHeight(sized(183, 170), 'Nature')).toEqual([]);
    expect(checkJournalHeight(sized(89, 100), 'Nature')).toEqual([]);
    expect(checkJournalHeight(sized(183, 900), null)).toEqual([]);
    expect(checkJournalHeight(sized(178, 900), 'eLife')).toEqual([]);
  });

  it('warns for a page just over the maximum', () => {
    const ws = checkJournalHeight(sized(183, 171), 'Nature');
    expect(ws).toHaveLength(1);
    expect(ws[0]?.rule).toBe('journal-height');
    expect(ws[0]?.message).toContain('170 mm');
  });

  it('measures at the journal shrink scale', () => {
    // 366 mm wide shrinks to 50%: 340 mm tall is 170 mm, at the limit; 344 is 172.
    expect(checkJournalHeight(sized(366, 340), 'Nature')).toEqual([]);
    expect(checkJournalHeight(sized(366, 344), 'Nature')).toHaveLength(1);
  });

  it('every preset is under its own journal maximum, and a journal has one maximum', () => {
    for (const p of PAGE_PRESETS) {
      if (p.maxHMm !== undefined) expect(p.hMm, p.id).toBeLessThanOrEqual(p.maxHMm);
      if (p.journal === undefined) continue;
      const maxes = new Set(
        PAGE_PRESETS.filter((q) => q.journal === p.journal).map((q) => q.maxHMm),
      );
      expect(maxes.size, p.journal).toBe(1);
    }
  });
});

describe('overlap', () => {
  it('warns about text over text, once per pair, selecting both', () => {
    const a = text(10, 10, 'Overlapping', 10);
    const b = text(20, 12, 'Words', 10);
    const { figure, page } = fig([a, b]);
    const ws = checkOverlap(figure, page);
    expect(ws.map((w) => w.ids)).toEqual([[a.id, b.id]]);
  });

  it('lets stacked lines with touching leading pass, and ignores text over shapes', () => {
    const a = text(10, 10, 'Line one', 10);
    // Directly under it, closer than the line box with leading (12 pt) but clear of the ink.
    const b = text(10, 21, 'Line two', 10);
    const box = createRect(frame(0, 0, 200, 60));
    const { figure, page } = fig([box, a, b]);
    expect(checkOverlap(figure, page)).toEqual([]);
  });

  it('warns about text crossing a panel edge, not text inside or outside it', () => {
    const panel = { ...createPanel(frame(100, 100, 100, 100)), showLabel: false };
    const inside = text(120, 120, 'in', 10);
    const outside = text(300, 120, 'out', 10);
    const crossing = text(180, 150, 'crossing the edge', 10);
    const { figure, page } = fig([panel, inside, outside, crossing]);
    const ws = checkOverlap(figure, page);
    expect(ws.map((w) => w.ids)).toEqual([[crossing.id]]);
    expect(ws[0]?.message).toContain('panel');
  });

  it('checks panel labels: over text, and outside their own panel', () => {
    const panel = createPanel(frame(100, 100, 100, 100));
    const onLabel = text(102, 102, 'title', 10);
    const { figure, page } = fig([panel, onLabel]);
    const ws = checkOverlap(figure, page);
    expect(ws.some((w) => w.ids.includes(panel.id) && w.ids.includes(onLabel.id))).toBe(true);
    const out = { ...figure.doc.panelLabelStyle, offset: { x: -20, y: -20 } };
    const f2 = { ...figure, doc: { ...figure.doc, panelLabelStyle: out } };
    const alone = fig([panel]);
    const f3 = { ...alone.figure, doc: { ...alone.figure.doc, panelLabelStyle: out } };
    expect(checkOverlap(f3, alone.page).map((w) => w.ids)).toEqual([[panel.id]]);
    expect(checkOverlap(f2, page).length).toBeGreaterThan(0);
  });

  it('warns about text off the page, and skips hidden text', () => {
    const off = text(-20, 10, 'off the edge', 10);
    const hidden = { ...text(-20, 40, 'hidden', 10), hidden: true };
    const { figure, page } = fig([off, hidden]);
    expect(checkOverlap(figure, page).map((w) => w.ids)).toEqual([[off.id]]);
  });
});

describe('checkPage', () => {
  it('finds nothing on a clean page', () => {
    const { figure, page } = fig([text(10, 10, 'Hello', 8), createRect(frame(10, 40, 50, 50))]);
    expect(checkPage(figure, page, { journal: 'Nature' })).toEqual([]);
  });

  it('ignores hidden layers and the hit areas of the screen render', () => {
    const t = text(10, 10, 'tiny', 3);
    const { figure, page } = fig([t]);
    const layer = page.layers[0];
    if (!layer) throw new Error('no layer');
    const off = { ...page, layers: [{ ...layer, visible: false }] };
    expect(checkPage(figure, off, { journal: null })).toEqual([]);
  });
});

describe('levels in a panel (note 37)', () => {
  const pic = (id: string, min?: number): Obj => ({
    ...image(id, 'a', 20, 20),
    ...(min === undefined ? {} : { levels: { min, max: 255, invert: false, base: 'a' } }),
  });
  const panelOf = (kids: Obj[]): Obj => ({ ...createPanel(frame(0, 0, 200, 100)), children: kids });

  it('warns once per panel whose pictures differ, selecting those pictures', () => {
    const { figure, page } = fig([panelOf([pic('p1', 10), pic('p2')])]);
    const ws = rules(checkPage(figure, page, { journal: null }), 'image-levels');
    expect(ws).toHaveLength(1);
    expect(ws[0]?.ids).toEqual(['p1', 'p2']);
    expect(ws[0]?.message).toMatch(/panel A/);
  });

  it('passes pictures with the same levels, a lone picture and pictures in different panels', () => {
    const same = fig([panelOf([pic('p1', 10), pic('p2', 10)])]);
    expect(checkLevels(same.figure, same.page)).toEqual([]);
    const lone = fig([panelOf([pic('p1', 10)])]);
    expect(checkLevels(lone.figure, lone.page)).toEqual([]);
    const apart = fig([panelOf([pic('p1', 10)]), panelOf([pic('p2')])]);
    expect(checkLevels(apart.figure, apart.page)).toEqual([]);
  });
});
