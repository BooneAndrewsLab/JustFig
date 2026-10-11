/** Icons to line art (note 58, issue 94), against the committed fixture icon library. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { creditLine, docCreditItems } from '@/core/attribution/attribution';
import { History } from '@/core/history/history';
import { createDoc, createPage, frame } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { pageObjects } from '@/core/model/tree';
import type { Asset, Figure, Icon, Obj } from '@/core/model/types';
import { HttpIconLibrary } from '@/icons/library';

import { LINE_ART_INK, hasLineArtIcons, iconLineArt } from './recolor';

const root = join(process.cwd(), 'src', 'icons', 'fixtures', 'lib');
const lib = new HttpIconLibrary('lib/', (url) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(readFileSync(join(root, url.slice(4)), 'utf8')),
  }),
);

async function figure(ids: readonly string[]): Promise<Figure> {
  const assets: Record<string, Asset> = {};
  const objs: Icon[] = [];
  for (const [i, id] of ids.entries()) {
    const entry = await lib.byId(id);
    if (!entry) throw new Error(id);
    const { hash, asset } = await lib.asset(entry);
    assets[hash] = asset;
    objs.push({
      id: `o${String(i)}` as Id,
      type: 'icon',
      name: id,
      frame: frame(i * 20, 0, 10, 10),
      opacity: 1,
      asset: hash,
      slots: {},
      lockAspect: true,
    });
  }
  const page = createPage();
  const layer = page.layers[0]!;
  const doc = createDoc();
  return {
    doc: { ...doc, pages: [{ ...page, layers: [{ ...layer, children: objs }] }] },
    assets,
  };
}

const icons = (f: Figure): Icon[] =>
  [...pageObjects(f.doc.pages[0]!)].filter((o: Obj): o is Icon => o.type === 'icon');
const idsOf = (f: Figure): Id[] => icons(f).map((o) => o.id);
const pageId = (f: Figure): Id => f.doc.pages[0]!.id;

describe('iconLineArt', () => {
  it('turns fills white and the outline slot ink, as plain hex', async () => {
    const f = await figure(['petri-dish']);
    const out = iconLineArt(pageId(f), idsOf(f)).apply(f);
    expect(icons(out)[0]?.slots).toEqual({
      s1: { hex: '#ffffff' },
      s2: { hex: '#ffffff' },
      outline: { hex: LINE_ART_INK },
    });
  });

  it('leaves icons without an outline slot and whole-icon colours alone', async () => {
    const f = await figure(['bi-epithelial-cell', 'bi-iga-immunoglobulin', 'hi-dna']);
    expect(hasLineArtIcons(f, icons(f))).toBe(false);
    const out = iconLineArt(pageId(f), idsOf(f)).apply(f);
    expect(icons(out).every((o) => Object.keys(o.slots).length === 0)).toBe(true);
  });

  it('credits a CC BY icon as modified, and not a CC0 one', async () => {
    const f = await figure(['bi-erythrocyte-5', 'petri-dish']);
    expect(creditLine(docCreditItems(f.doc, f.assets), 'App')).not.toMatch(/modified/);
    const out = iconLineArt(pageId(f), idsOf(f)).apply(f);
    const after = creditLine(docCreditItems(out.doc, out.assets), 'App');
    expect(after).toContain('CC BY 3.0, modified');
    expect(after).not.toContain('CC0, modified');
  });

  it('only touches the chosen icons, and is one named undo step', async () => {
    const f = await figure(['mouse', 'petri-dish']);
    const edit = iconLineArt(pageId(f), [idsOf(f)[0]!]);
    const h = History.create(f).push(edit.apply(f), edit.label);
    expect(icons(h.present)[0]?.slots['outline']).toEqual({ hex: LINE_ART_INK });
    expect(icons(h.present)[1]?.slots).toEqual({});
    expect(h.undoLabel).toBe('Icons to line art');
    expect(icons(h.undo().present).every((o) => Object.keys(o.slots).length === 0)).toBe(true);
  });
});
