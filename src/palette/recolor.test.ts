import { describe, expect, it } from 'vitest';

import { resolvePaint } from '@/core/color/color';
import { addObjects, updateObjects } from '@/core/edits/edits';
import { createDoc, createRect, defaultRun, createText, frame, hex } from '@/core/model/factory';
import { asId } from '@/core/model/ids';
import { pageObjects } from '@/core/model/tree';
import type { Figure, Obj } from '@/core/model/types';
import { createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';

import { PALETTES, isNeutral, paletteById } from './palettes';
import {
  addSwatch,
  applyPalette,
  bakedSwatches,
  docColours,
  linkColours,
  linkState,
  removeSwatch,
  setSwatch,
  unlinkColours,
} from './recolor';

function figure(): Figure {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const plate = getKind('wellPlate');
  if (!plate) throw new Error('no well plate');
  const objs: Obj[] = [
    createRect(frame(0, 0, 10, 10), {
      fill: hex('#e69f00'),
      stroke: hex('#1f2933'),
      strokeWidth: 1,
      cap: 'round',
      join: 'round',
    }),
    createRect(frame(20, 0, 10, 10), {
      fill: hex('#56b4e9'),
      stroke: null,
      strokeWidth: 1,
      cap: 'round',
      join: 'round',
    }),
    createText(0, 40, [[defaultRun('IL-6', { color: hex('#e69f00') })]]),
    createProcedural(plate, { x: 100, y: 100 }),
  ];
  return addObjects(page.id, objs).apply({ doc, assets: {} });
}

const colours = (f: Figure): string[] => {
  const page = f.doc.pages[0];
  if (!page) return [];
  const out: string[] = [];
  for (const o of pageObjects(page)) {
    if (o.type === 'rect' && o.style.fill) out.push(resolvePaint(o.style.fill, f.doc.palette));
    if (o.type === 'text')
      out.push(resolvePaint(o.runs[0]?.[0]?.color ?? hex('#000'), f.doc.palette));
  }
  return out;
};

describe('palettes and swatch-linked recolouring (note 07)', () => {
  it('lists colourblind-safe palettes with valid, distinct, colourful colours', () => {
    expect(PALETTES.filter((p) => p.colourblindSafe).length).toBeGreaterThanOrEqual(5);
    for (const p of PALETTES) {
      expect(new Set(p.colours).size).toBe(p.colours.length);
      for (const c of p.colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    const oi = paletteById('okabe-ito');
    expect(oi?.colours.some(isNeutral)).toBe(false);
    expect(isNeutral('#1f2933')).toBe(true);
    expect(isNeutral('#ffffff')).toBe(true);
    expect(isNeutral('#e69f00')).toBe(false);
  });

  it('links each distinct colour to one swatch without changing the look', () => {
    const f = figure();
    const before = colours(f);
    const linked = linkColours().apply(f);
    expect(colours(linked)).toEqual(before);
    const hexes = linked.doc.palette.map((s) => s.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(hexes).toContain('#e69f00');
    // The well plate's default slot colours are linked too.
    const plate = [...pageObjects(linked.doc.pages[0] ?? f.doc.pages[0]!)].find(
      (o) => o.type === 'procedural',
    );
    expect(plate?.type === 'procedural' && Object.keys(plate.slots).length).toBeGreaterThan(0);
    expect(docColours(linked.doc)).toEqual(docColours(f.doc));
  });

  it('counts fixed colours and linked uses, which can both be present', () => {
    const f = figure();
    const before = linkState(f.doc);
    expect(before.linked).toBe(0);
    expect(before.fixed).toBeGreaterThan(0);
    const linked = linkColours().apply(f);
    expect(linkState(linked.doc).fixed).toBe(0);
    const page = linked.doc.pages[0];
    const rect = page && [...pageObjects(page)].find((o) => o.type === 'rect');
    if (!rect) throw new Error('no rect');
    const mixed = updateObjects(page.id, [rect.id], 'Fill', (o) =>
      o.type === 'rect' ? { ...o, style: { ...o.style, fill: hex('#123456') } } : o,
    ).apply(linked);
    const state = linkState(mixed.doc);
    expect(state.fixed).toBe(1);
    expect(state.linked).toBeGreaterThan(0);
    expect(linkState(unlinkColours().apply(mixed).doc).linked).toBe(0);
  });

  it('changing a swatch recolours every linked use', () => {
    const linked = linkColours().apply(figure());
    const orange = linked.doc.palette.find((s) => s.hex === '#e69f00');
    if (!orange) throw new Error('no swatch');
    const next = setSwatch(orange.id, '#123456').apply(linked);
    expect(colours(next)).toEqual(['#123456', '#56b4e9', '#123456']);
  });

  it('applying a palette recolours the colourful swatches and keeps neutrals', () => {
    const tol = paletteById('tol-bright');
    if (!tol) throw new Error('no palette');
    const next = applyPalette(tol).apply(figure());
    const used = colours(next);
    expect(used[0]).not.toBe('#e69f00');
    expect(tol.colours).toContain(used[0]);
    expect(used[0]).toBe(used[2]);
    // The dark outline stays dark.
    expect(next.doc.palette.some((s) => s.hex === '#1f2933')).toBe(true);
  });

  it('removing a swatch keeps its colour fixed; unlinking keeps the look', () => {
    const linked = linkColours().apply(figure());
    const orange = linked.doc.palette.find((s) => s.hex === '#e69f00');
    if (!orange) throw new Error('no swatch');
    const removed = removeSwatch(orange.id).apply(linked);
    expect(colours(removed)).toEqual(colours(linked));
    expect(removed.doc.palette.find((s) => s.id === orange.id)).toBeUndefined();
    const plain = unlinkColours().apply(linked);
    expect(colours(plain)).toEqual(colours(linked));
    expect(addSwatch('#abcdef').apply(plain).doc.palette.length).toBe(
      linked.doc.palette.length + 1,
    );
  });

  it('gives a blank figure the palette as swatches', () => {
    const oi = paletteById('okabe-ito');
    if (!oi) throw new Error('no palette');
    const f: Figure = { doc: createDoc(), assets: {} };
    const next = applyPalette(oi).apply(f);
    expect(next.doc.palette.map((s) => s.hex)).toEqual(expect.arrayContaining([...oi.colours]));
  });
});

describe('bakedSwatches', () => {
  it('replaces swatch links by their colours, in groups too, leaving fixed colours', () => {
    const palette = [{ id: 'sw_a', name: 'A', hex: '#123456' }];
    const linked = createRect(frame(0, 0, 1, 1), {
      fill: { swatch: 'sw_a' },
      stroke: hex('#abcdef'),
      strokeWidth: 1,
      cap: 'round',
      join: 'round',
    });
    const text = createText(0, 0, [[defaultRun('x', { color: { swatch: 'sw_a' } })]]);
    const group: Obj = {
      id: asId('o_g'),
      type: 'group',
      frame: frame(0, 0, 1, 1),
      opacity: 1,
      children: [text],
    };
    const [r, g] = bakedSwatches([linked, group], palette);
    expect(r).toMatchObject({ style: { fill: { hex: '#123456' }, stroke: { hex: '#abcdef' } } });
    const inner = g?.type === 'group' ? g.children[0] : undefined;
    expect(inner?.type === 'text' ? inner.runs[0]?.[0]?.color : null).toEqual({ hex: '#123456' });
  });
});
