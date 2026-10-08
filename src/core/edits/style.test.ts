/**
 * Text and line styles across a selection, inside imported plots too
 * (note 16): copy-on-write plot assets, roles, the reference, one step.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { importSvgText } from '@/io/import';
import { readJfig, writeJfig } from '@/io/jfig';
import { loadTestFonts } from '@/test/fonts';

import {
  createDoc,
  createPanel,
  createRect,
  createText,
  defaultRun,
  frame,
} from '../model/factory';
import type { Id } from '../model/ids';
import { findObj } from '../model/tree';
import type { Figure, Image, Obj, Page } from '../model/types';
import { addObjects } from './edits';
import { currentStyle, matchStyles, plotOf, setStyles, styleSample } from './style';

beforeAll(loadTestFonts);

const fixture = (name: string) =>
  importSvgText(
    readFileSync(new URL(`../../io/svg/fixtures/${name}.svg`, import.meta.url), 'utf8'),
    `${name}.svg`,
  );

let n = 0;
function image(hash: string, w: number, h: number, x = 0): Image {
  n += 1;
  return {
    id: `img${String(n)}` as Id,
    type: 'image',
    frame: frame(x, 0, w, h),
    opacity: 1,
    asset: hash,
  };
}

function setup(objs: (fig: Figure) => readonly Obj[]): { fig: Figure; page: Page } {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const mpl = fixture('matplotlib-paths');
  const gg = fixture('r-svglite');
  let fig: Figure = { doc, assets: {} };
  fig = addObjects(page.id, objs(fig), { [mpl.hash]: mpl.asset, [gg.hash]: gg.asset }).apply(fig);
  return { fig, page };
}

const MPL = fixture('matplotlib-paths');
const GG = fixture('r-svglite');

const get = (f: Figure, page: Page, id: Id): Obj => {
  const p = f.doc.pages.find((x) => x.id === page.id);
  const o = p ? findObj(p, id) : undefined;
  if (!o) throw new Error('missing');
  return o;
};

describe('setStyles', () => {
  it('sets plot tick labels to 7 pt Tinos in every selected plot, sized in page points', () => {
    // The same plot at two sizes (one shares the asset with an unselected copy), and ggplot.
    const a = image(MPL.hash, MPL.w, MPL.h);
    const b = image(MPL.hash, MPL.w * 2, MPL.h * 2, 300);
    const c = image(MPL.hash, MPL.w, MPL.h, 600);
    const d = image(GG.hash, GG.w, GG.h);
    const { fig, page } = setup(() => [a, b, c, d]);
    const e = setStyles(page.id, [a, b, d], { font: 'tinos', size: 7, textTarget: 'tick' }, 'Font');
    const next = e.apply(fig);
    for (const o of [a, b, d]) {
      const got = get(next, page, o.id);
      const plot = got.type === 'image' ? plotOf(got, next.assets) : null;
      if (!plot) throw new Error('no plot');
      for (const t of plot.parts.texts) {
        if (t.role === 'tick') {
          expect(t.font).toBe('tinos');
          expect(t.size * plot.k).toBeCloseTo(7, 2);
        } else expect(t.font).not.toBe('tinos');
      }
    }
    // Copy-on-write: a and b differ in size so differ in asset; c (unselected) keeps the original.
    const ha = (get(next, page, a.id) as Image).asset;
    const hb = (get(next, page, b.id) as Image).asset;
    expect(ha).not.toBe(MPL.hash);
    expect(hb).not.toBe(ha);
    expect((get(next, page, c.id) as Image).asset).toBe(MPL.hash);
    expect(next.assets[MPL.hash]).toBeDefined();
    // ggplot's original is no longer used and is dropped; the new one keeps its meta.
    expect(next.assets[GG.hash]).toBeUndefined();
    const hd = (get(next, page, d.id) as Image).asset;
    expect(next.assets[hd]?.kind).toBe('svgImport');
    expect(next.assets[hd] && 'meta' in next.assets[hd] ? next.assets[hd].meta : null).toEqual(
      GG.asset.kind === 'svgImport' ? GG.asset.meta : null,
    );
    // The figure saves and reads back with the restyled asset.
    const back = readJfig(writeJfig(next, { name: 'test', version: '0' }));
    expect(back.assets[hd]).toEqual(next.assets[hd]);
  });

  it('line widths by role; text objects and shapes change only for "all"', () => {
    const a = image(MPL.hash, MPL.w, MPL.h);
    const t = createText(0, 200, [[defaultRun('hello')]]);
    const r = createRect(frame(0, 300, 20, 20));
    const { fig, page } = setup(() => [a, t, r]);
    const sel = [a, t, r];
    const axes = setStyles(
      page.id,
      sel,
      { lineWidth: 0.25, lineTarget: 'tick' },
      'Line width',
    ).apply(fig);
    expect((get(axes, page, r.id) as Extract<Obj, { type: 'rect' }>).style.strokeWidth).toBe(1);
    const p = plotOf(get(axes, page, a.id), axes.assets);
    const widths = (role: string) =>
      p?.parts.strokes
        .filter((s) => s.role === role)
        .map((s) => Math.round(s.width * p.k * 100) / 100);
    expect(new Set(widths('tick'))).toEqual(new Set([0.25]));
    expect(new Set(widths('axis'))).not.toEqual(new Set([0.25]));
    const all = setStyles(page.id, sel, { lineWidth: 2, size: 9, font: 'cousine' }, 'Style').apply(
      fig,
    );
    expect((get(all, page, r.id) as Extract<Obj, { type: 'rect' }>).style.strokeWidth).toBe(2);
    const run = (get(all, page, t.id) as Extract<Obj, { type: 'text' }>).runs[0]?.[0];
    expect(run).toMatchObject({ font: 'cousine', size: 9 });
    expect(
      currentStyle(
        sel.map((o) => get(all, page, o.id)),
        all.assets,
        'all',
        'all',
      ),
    ).toEqual({
      text: { font: 'cousine', size: 9 },
      line: 2,
    });
    const tickOnly = setStyles(page.id, sel, { size: 5, textTarget: 'tick' }, 'Font size').apply(
      fig,
    );
    expect((get(tickOnly, page, t.id) as Extract<Obj, { type: 'text' }>).runs[0]?.[0]?.size).toBe(
      10,
    );
  });

  it('reaches plots inside panels and skips locked objects', () => {
    const a = image(MPL.hash, MPL.w, MPL.h);
    const b: Image = { ...image(GG.hash, GG.w, GG.h), locked: true };
    const panel = { ...createPanel(frame(0, 0, 400, 400)), children: [a] };
    const { fig, page } = setup(() => [panel, b]);
    const next = setStyles(page.id, [panel, b], { size: 6 }, 'Font size').apply(fig);
    expect((get(next, page, a.id) as Image).asset).not.toBe(MPL.hash);
    expect((get(next, page, b.id) as Image).asset).toBe(GG.hash);
  });
});

describe('matchStyles', () => {
  it('gives each plot the reference plot’s styles role by role, in one edit', () => {
    const ref = image(GG.hash, GG.w, GG.h);
    const target = image(MPL.hash, MPL.w * 1.5, MPL.h * 1.5, 300);
    const { fig, page } = setup(() => [ref, target]);
    const s = styleSample(ref, fig.assets);
    expect(s.textByRole.tick?.font).toBe('arimo');
    expect(s.textByRole.tick?.size).not.toBe(s.textByRole.label?.size);
    const e = matchStyles(page.id, [ref, target]);
    expect(e.label).toBe('Match text and lines');
    const next = e.apply(fig);
    expect((get(next, page, ref.id) as Image).asset).toBe(GG.hash);
    const t = styleSample(get(next, page, target.id), next.assets);
    expect(t.textByRole).toEqual(s.textByRole);
    expect(t.lineByRole.tick).toBe(s.lineByRole.tick);
    expect(t.lineByRole.axis).toBe(s.lineByRole.axis);
    expect(t.lineByRole.data).toBe(s.lineByRole.data);
  });

  it('from a text object or a shape: their font, size and width', () => {
    const t = createText(0, 200, [[defaultRun('ref', { font: 'tinos', size: 7 })]]);
    const r = {
      ...createRect(frame(0, 300, 20, 20)),
      style: { ...createRect(frame(0, 0, 1, 1)).style, strokeWidth: 0.5 },
    };
    const a = image(MPL.hash, MPL.w, MPL.h);
    const other = createText(0, 250, [[defaultRun('x')]]);
    const { fig, page } = setup(() => [t, r, a, other]);
    const byText = matchStyles(page.id, [t, a, other, r]).apply(fig);
    const p = plotOf(get(byText, page, a.id), byText.assets);
    expect(
      p?.parts.texts.every((x) => x.font === 'tinos' && Math.abs(x.size * p.k - 7) < 0.01),
    ).toBe(true);
    expect(
      (get(byText, page, other.id) as Extract<Obj, { type: 'text' }>).runs[0]?.[0],
    ).toMatchObject({
      font: 'tinos',
      size: 7,
    });
    // A text reference has no line width: shapes and plot strokes keep theirs.
    expect((get(byText, page, r.id) as Extract<Obj, { type: 'rect' }>).style.strokeWidth).toBe(0.5);
    const byRect = matchStyles(page.id, [r, a]).apply(fig);
    const q = plotOf(get(byRect, page, a.id), byRect.assets);
    expect(q?.parts.strokes.every((x) => Math.abs(x.width * q.k - 0.5) < 0.01)).toBe(true);
    expect(q?.parts.texts.map((x) => x.size)).toEqual(
      plotOf(a, fig.assets)?.parts.texts.map((x) => x.size),
    );
  });
});
