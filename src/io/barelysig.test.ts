/**
 * BarelySig import (note 05): the frozen fixture is the real SVG BarelySig
 * 1.0.0 exports "with data" (its own `svgMeta` + `exportSvg`, run on the
 * graph from its recipe tests), so this is BarelySig's actual format.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects } from '@/core/model/tree';
import type { Embedded, Figure } from '@/core/model/types';
import { objectToNode, renderCtx } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { BSIG_FORMAT, isBarelySigSvg, readBarelySigSvg, recipeFile } from './barelysig';
import { readFragment, readJfig, writeFragment, writeJfig } from './jfig';

beforeAll(loadTestFonts);

const SVG = readFileSync(new URL('./fixtures/barelysig-figure2.svg', import.meta.url), 'utf8');
const FRAGMENT_URL = new URL('./fixtures/barelysig-figure2.fragment.json', import.meta.url);

const place = async (): Promise<Figure & { obj: Embedded }> => {
  const imp = await readBarelySigSvg(SVG, 'figure2.svg', { x: 200, y: 150 });
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const fig = addObjects(page.id, [imp.obj], imp.assets).apply({ doc, assets: {} });
  return { ...fig, obj: imp.obj };
};

describe('BarelySig figures', () => {
  it('are recognised by their metadata', () => {
    expect(isBarelySigSvg(SVG)).toBe(true);
    expect(isBarelySigSvg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(false);
  });

  it('import as an embedded object at their exact physical size, keeping the recipe', async () => {
    const { obj } = await place();
    expect(obj.type).toBe('embedded');
    expect(obj.name).toBe('Figure 2');
    // width="70mm" height="60mm"
    expect(obj.frame.w).toBeCloseTo((70 * 72) / 25.4, 2);
    expect(obj.frame.h).toBeCloseTo((60 * 72) / 25.4, 2);
    expect(obj.source.app).toBe('BarelySig');
    expect(obj.source.format).toBe(BSIG_FORMAT);
    const recipe = obj.source.payload as {
      format: string;
      project: { graphs: { title: string }[] };
    };
    expect(recipe.format).toBe('barelysig');
    expect(recipe.project.graphs[0]?.title).toBe('Figure 2');
  });

  it('draw from the snapshot, save and reopen with the recipe unchanged', async () => {
    const fig = await place();
    const page = fig.doc.pages[0];
    if (!page) throw new Error('no page');
    const ctx = renderCtx(page, fig.doc, fig.assets, { textMode: 'text', screen: false });
    const node = objectToNode(fig.obj, ctx);
    const svg = node ? nodeToSvgString(node) : '';
    // Drawn from the graph (its bars and labels), not a placeholder.
    expect(svg).toContain('WT');
    expect(svg).toContain('<rect');
    const back = readJfig(writeJfig(fig, { name: 'test', version: '0' }));
    const again = [...docObjects(back.doc)].find((o) => o.type === 'embedded');
    expect(again?.type === 'embedded' && again.source.payload).toEqual(fig.obj.source.payload);
  });

  it('give back the .bsig that reopens the graph in BarelySig', async () => {
    const { obj } = await place();
    const text = recipeFile(obj);
    expect(text).not.toBeNull();
    const original = readFileSync(
      new URL('./fixtures/barelysig-figure2.recipe.json', import.meta.url),
      'utf8',
    );
    expect(JSON.parse(text ?? '')).toEqual(JSON.parse(original));
  });

  it('refuse a figure exported without its data, saying why', async () => {
    const without = SVG.replace(/<barelysig:recipe[\s\S]*?<\/barelysig:recipe>/, '');
    expect(isBarelySigSvg(without)).toBe(true);
    await expect(readBarelySigSvg(without, 'x.svg', { x: 0, y: 0 })).rejects.toThrow(
      'without its data',
    );
  });

  it('travel as a fragment (the frozen form a BarelySig copy command would write)', async () => {
    const { obj, assets } = await place();
    const written = writeFragment({ objects: [obj], assets });
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(FRAGMENT_URL, written);
    const frozen = readFragment(readFileSync(FRAGMENT_URL, 'utf8'));
    if (!frozen) throw new Error('not a fragment');
    const e = frozen.objects[0];
    expect(e?.type).toBe('embedded');
    if (e?.type !== 'embedded') return;
    expect(e.source.payload).toEqual(obj.source.payload);
    expect(frozen.assets[e.snapshot]?.kind).toBe('svgImport');
  });
});
