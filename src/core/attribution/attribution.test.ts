/**
 * Attribution for a figure mixing three sources (plan Phase 2, definition of
 * done): house icons and Health Icons (CC0), and Bioicons under CC BY 3.0
 * (Servier, recoloured once), CC BY 4.0, MIT and BSD, from the committed
 * fixture library. The credit line is snapshotted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND } from '@/brand';
import { HttpIconLibrary } from '@/icons/library';

import { createDoc, createPage, frame, hex } from '../model/factory';
import type { Id } from '../model/ids';
import type { Asset, Assets, Doc, Icon, Paint } from '../model/types';
import {
  creditLine,
  docCreditItems,
  needsModifiedNote,
  pageCreditItems,
  recolouredAssets,
} from './attribution';

const root = join(process.cwd(), 'src', 'icons', 'fixtures', 'lib');
const lib = new HttpIconLibrary('lib/', (url) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(readFileSync(join(root, url.slice(4)), 'utf8')),
  }),
);

let n = 0;
const icon = (asset: string, slots: Record<string, Paint> = {}): Icon => ({
  id: `o${String((n += 1))}` as Id,
  type: 'icon',
  name: asset,
  frame: frame(0, 0, 10, 10),
  opacity: 1,
  asset,
  slots,
  lockAspect: true,
});

async function figure(
  uses: readonly { id: string; slots?: Record<string, Paint> }[],
): Promise<{ doc: Doc; assets: Assets }> {
  const assets: Record<string, Asset> = {};
  const objs: Icon[] = [];
  for (const u of uses) {
    const entry = await lib.byId(u.id);
    if (!entry) throw new Error(u.id);
    const { hash, asset } = await lib.asset(entry);
    assets[hash] = asset;
    objs.push(icon(hash, u.slots));
  }
  const page = createPage();
  const layer = page.layers[0]!;
  const doc = createDoc();
  return {
    doc: { ...doc, pages: [{ ...page, layers: [{ ...layer, children: objs }] }] },
    assets,
  };
}

describe('attribution for a figure mixing three sources', () => {
  it('credits each source, author and licence, and marks recoloured CC BY icons modified', async () => {
    const fig = await figure([
      { id: 'test-tube' },
      { id: 'petri-dish', slots: { s1: hex('#d55e00') } },
      { id: 'hi-dna' },
      { id: 'bi-erythrocyte-5', slots: { s1: hex('#0072b2') } },
      { id: 'bi-chlamydomonas-2' },
      { id: 'bi-aortic-dissection' },
      { id: 'bi-pytorch' },
    ]);
    const items = docCreditItems(fig.doc, fig.assets);
    expect(new Set(items.map((i) => i.source))).toEqual(
      new Set(['House icons', 'Health Icons', 'Bioicons']),
    );
    // The house icons' author is the app's contributors; masked so the name lives in brand.ts only.
    const line = creditLine(items, 'App').replaceAll(BRAND.name, '<app>');
    expect(line).toMatchInlineSnapshot(
      `"Created with App. Icons: Bioicons: Facebook (BSD-3-Clause), Kathryn Kananen (MIT), Margot Riggi (CC BY 4.0), Servier (CC BY 3.0, modified); Health Icons: Resolve to Save Lives (CC0); House icons: <app> contributors (CC0)."`,
    );
    // CC0 icons never say "modified", even when recoloured (petri dish).
    expect(line).not.toMatch(/CC0, modified/);
  });

  it('says "some modified" when only some uses of an icon are recoloured', async () => {
    const fig = await figure([
      { id: 'bi-erythrocyte-5' },
      { id: 'bi-erythrocyte-5', slots: { s1: hex('#0072b2') } },
    ]);
    expect(creditLine(docCreditItems(fig.doc, fig.assets), 'App')).toBe(
      'Created with App. Icons: Bioicons: Servier (CC BY 3.0, some modified).',
    );
    const page = fig.doc.pages[0]!;
    expect(pageCreditItems(page, fig.assets)[0]?.modified).toBe('some');
  });

  it('flags share-alike icons', async () => {
    const fig = await figure([{ id: 'bi-epithelial-cell' }]);
    const items = docCreditItems(fig.doc, fig.assets);
    expect(items[0]?.shareAlike).toBe(true);
    expect(creditLine(items, 'App')).toContain('(CC BY-SA 4.0)');
  });
});

describe('helpers', () => {
  it('knows which licences need a modification note', () => {
    expect(['CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'].every(needsModifiedNote)).toBe(true);
    expect(['CC0-1.0', 'MIT', 'BSD-3-Clause'].some(needsModifiedNote)).toBe(false);
  });

  it('counts recoloured uses per asset', () => {
    const r = recolouredAssets([icon('a'), icon('a', { s1: hex('#000000') }), icon('b')]);
    expect([...r]).toEqual([['a', 'some']]);
  });
});
