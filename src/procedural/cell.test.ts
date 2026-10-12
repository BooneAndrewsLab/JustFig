/** The cell kind's version 2 (note 58): old cells migrate unchanged; cell types replace each other. */
import { describe, expect, it } from 'vitest';

import { createProcedural } from './edits';
import { bacterium } from './kinds/bacterium';
import { cell } from './kinds/cell';
import { defaultParams } from './params';
import { presetsOf } from './presets';
import { type PathPrim, circle, part, pathPrim } from './prims';
import { resolveProcedural, slotHexes } from './registry';
import { convertToShapes, partObjects } from './shapes';

/** Version 1's params, as a saved figure holds them. */
const V1 = {
  shape: 'irregular',
  nucleus: true,
  nucleolus: false,
  er: true,
  golgi: true,
  mitochondria: 9,
  lysosomes: 2,
  vesicles: 12,
  membrane: 1.5,
  seed: 42,
};

describe('cell version 2', () => {
  it('migrates a version 1 cell: its params kept, the new parts off', () => {
    const r = resolveProcedural({ kind: 'cell', kindVersion: 1, params: V1 });
    expect(r?.params).toEqual({
      ...V1,
      // Styles (note 58) need no version bump: an old cell reads as flat.
      style: 'flat',
      wall: 0,
      vacuole: 0,
      chloroplasts: 0,
      bud: 0,
      microvilli: 0,
      division: 'none',
      apoptotic: false,
    });
  });

  it('draws a migrated cell as version 1 did (the new parts add nothing)', () => {
    const r = resolveProcedural({ kind: 'cell', kindVersion: 1, params: V1 });
    if (!r) throw new Error('unresolved');
    const input = { w: 220, h: 160, slots: slotHexes(cell, {}, []) };
    const prims = cell.render(r.params, input);
    // Version 1 drew: outline, ER, nucleus, Golgi, mitochondria, cristae, lysosomes, vesicles.
    expect(prims).toHaveLength(8);
  });

  it('keeps defaults that draw the version 1 animal cell', () => {
    const d = defaultParams(cell.fields);
    expect(d).toMatchObject({ wall: 0, vacuole: 0, bud: 0, microvilli: 0, division: 'none' });
  });
});

describe.each([cell, bacterium].map((k) => [k.kind, k] as const))('%s types', (_name, k) => {
  it('each name the same keys, so choosing one replaces the previous type', () => {
    const keys = presetsOf(k).map((p) => Object.keys(p.params ?? {}).sort());
    const all = [...new Set(keys.flat())].sort();
    for (const [i, ks] of keys.entries()) expect(ks, presetsOf(k)[i]?.id).toEqual(all);
  });
});

describe('Convert to shapes names the parts', () => {
  const names = (objs: readonly { name?: string }[]) => objs.map((o) => o.name ?? '');

  it('keeps each run of one part together as a group of that name, or names the one shape', () => {
    const dot = (x: number): PathPrim[] => pathPrim([circle(x, 0, 1)], { fill: '#000000' });
    const prims = [
      ...part('Nucleus', dot(0)),
      ...part('Mitochondria', dot(1)),
      ...part('Mitochondria', dot(2)),
      ...dot(3),
      ...part('Mitochondria', dot(4)),
    ];
    const objs = partObjects(prims);
    expect(names(objs)).toEqual(['Nucleus', 'Mitochondria', '', 'Mitochondria']);
    expect(objs.map((o) => o.type)).toEqual(['ellipse', 'group', 'ellipse', 'ellipse']);
    const g = objs[1];
    if (g?.type !== 'group') throw new Error('not a group');
    expect(g.children).toHaveLength(2);
    expect(g.frame).toMatchObject({ x: 0, y: -1, w: 3, h: 2 });
  });

  it('a converted cell holds its options by name, in drawing order', () => {
    const o = createProcedural(cell, { x: 10, y: 20 }, { nucleolus: true, chloroplasts: 3 });
    const g = convertToShapes(o, []);
    if (g?.type !== 'group') throw new Error('not a group');
    expect(g.name).toBe('Cell');
    expect(names(g.children)).toEqual([
      'Cytoplasm',
      'ER',
      'Nucleus',
      'Nucleolus',
      'Golgi',
      'Mitochondria',
      'Lysosomes',
      'Vesicles',
      'Chloroplasts',
    ]);
    // The parts sit where the cell drew them: inside its frame.
    for (const c of g.children) {
      expect(c.frame.x).toBeGreaterThanOrEqual(o.frame.x - 1);
      expect(c.frame.y).toBeGreaterThanOrEqual(o.frame.y - 1);
    }
  });
});
