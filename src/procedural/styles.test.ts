/** Styles (note 58): the generic `style` param, the look helpers and "Apply this style to all". */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects } from '@/core/model/tree';
import type { Procedural } from '@/core/model/types';

import { applyStyle, createProcedural, stylesOf } from './edits';
import { INK, LOOKS, PAPER, STYLE_IDS, circle, lookOf, primPoints, rect, wobble } from './prims';
import { allKinds, getKind, resolveProcedural } from './registry';
import { STYLE_KEY } from './types';

const kind = (k: string) => {
  const found = getKind(k);
  if (!found) throw new Error(k);
  return found;
};

describe('the style param', () => {
  it('is the first field of exactly the kinds that list styles, flat by default', () => {
    for (const k of allKinds()) {
      const f = k.fields.find((x) => x.key === STYLE_KEY);
      if ((k.styles ?? []).length === 0) {
        expect(f, k.kind).toBeUndefined();
        continue;
      }
      expect(k.fields[0], k.kind).toBe(f);
      expect(f?.type === 'enum' && f.default).toBe('flat');
      expect(f?.type === 'enum' && f.options.map((o) => o.value)).toEqual(stylesOf(k));
    }
  });

  it('gives cell, bacterium, petri dish, well plate and gel line art and cartoon', () => {
    for (const k of ['cell', 'bacterium', 'petriDish', 'wellPlate', 'gel'])
      expect(stylesOf(kind(k))).toEqual(['flat', 'line-art', 'cartoon']);
  });

  it('decodes an object saved before styles as flat, with no version bump', () => {
    const k = kind('petriDish');
    const old = { kind: 'petriDish', kindVersion: k.version, params: { pattern: 'streak' } };
    expect(resolveProcedural(old)?.params[STYLE_KEY]).toBe('flat');
    const odd = { ...old, params: { pattern: 'streak', style: 'oil-painting' } };
    expect(resolveProcedural(odd)?.params[STYLE_KEY]).toBe('flat');
  });

  it('every style has a look, in menu order with flat first', () => {
    expect(STYLE_IDS[0]).toBe('flat');
    for (const id of STYLE_IDS) expect(LOOKS[id].label.length).toBeGreaterThan(0);
  });
});

describe('lookOf', () => {
  const part = { fill: '#c3b1e1', stroke: '#8a6fb0', sw: 0.5 };

  it('leaves every part as drawn in flat (and for an unknown style)', () => {
    for (const look of [lookOf('flat', 1), lookOf(undefined, 1), lookOf('nope', 1)]) {
      expect(look.body(part)).toBe(part);
      expect(look.detail(part)).toBe(part);
      expect(look.mark(part)).toBe(part);
      expect(look.line(part)).toBe(part);
      expect(look.parts(12)).toBe(12);
      const s = circle(10, 10, 5);
      expect(look.organic(s, 3)).toBe(s);
      expect(look.highlight(10, 10, 5, 5, '#ffffff')).toEqual([]);
    }
  });

  it('draws line art in one ink on paper', () => {
    const look = lookOf('line-art', 1);
    expect(look.body(part)).toMatchObject({ fill: PAPER, stroke: INK, sw: 1 });
    expect(look.line({ stroke: '#ff0000', sw: 5 })).toMatchObject({ stroke: INK, sw: 1.2 });
    expect(look.text('#336699')).toBe(INK);
    // Data colours become greys that keep their order of lightness.
    const grey = (hex: string) => {
      const m = /^#(..)(..)(..)$/.exec(hex);
      expect(m?.[1]).toBe(m?.[2]);
      expect(m?.[2]).toBe(m?.[3]);
      return parseInt(m?.[1] ?? '0', 16);
    };
    const light = grey(look.mark({ fill: '#f0e442' }).fill ?? '');
    const dark = grey(look.mark({ fill: '#0072b2' }).fill ?? '');
    expect(light).toBeGreaterThan(dark);
  });

  it('spreads a plate map over distinct ink tints', () => {
    const tone = lookOf('line-art', 1).marks(['#999999', '#56b4e9', '#d55e00', '#56b4e9']);
    const tints = new Set(['#999999', '#56b4e9', '#d55e00'].map(tone));
    expect(tints.size).toBe(3);
    expect(tone('#d55e00')).toBe(INK);
  });

  it('draws cartoon with bolder outlines, fewer bigger parts and a highlight', () => {
    const look = lookOf('cartoon', 1);
    const b = look.body(part);
    expect(b.sw).toBeGreaterThan(part.sw);
    expect(b.stroke).not.toBe(part.stroke);
    expect(look.parts(12)).toBeLessThan(12);
    expect(look.parts(1)).toBe(1);
    expect(look.parts(0)).toBe(0);
    expect(look.bigger).toBeGreaterThan(1);
    expect(look.highlight(50, 50, 20, 10, '#fdebd3')).toHaveLength(1);
  });
});

describe('wobble', () => {
  it('stays inside the exact shape’s bounds and leaves open or tiny ones alone', () => {
    for (const s of [circle(50, 40, 30), rect(10, 10, 80, 40, 6), rect(0, 0, 200, 3)]) {
      const w = wobble(s, 0.05, 7);
      const bound = (x: typeof s) => {
        const pts = [...primPoints({ kind: 'path', subs: [x], fill: null, stroke: null, sw: 0 })];
        return {
          x0: Math.min(...pts.map((q) => q.x)),
          y0: Math.min(...pts.map((q) => q.y)),
          x1: Math.max(...pts.map((q) => q.x)),
          y1: Math.max(...pts.map((q) => q.y)),
        };
      };
      const a = bound(s);
      const b = bound(w);
      expect(b.x0).toBeGreaterThanOrEqual(a.x0 - 1e-9);
      expect(b.y0).toBeGreaterThanOrEqual(a.y0 - 1e-9);
      expect(b.x1).toBeLessThanOrEqual(a.x1 + 1e-9);
      expect(b.y1).toBeLessThanOrEqual(a.y1 + 1e-9);
    }
    const tiny = circle(0, 0, 0.4);
    expect(wobble(tiny, 0.05, 1)).toBe(tiny);
    const open = {
      t: 'poly' as const,
      nodes: [
        { x: 0, y: 0 },
        { x: 9, y: 9 },
      ],
      closed: false,
    };
    expect(wobble(open, 0.05, 1)).toBe(open);
  });

  it('is pure: one seed, one shape', () => {
    expect(wobble(circle(5, 5, 4), 0.05, 3)).toEqual(wobble(circle(5, 5, 4), 0.05, 3));
  });
});

describe('applyStyle', () => {
  it('styles every selected object that can be drawn that way, as one named edit', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const objs = [
      createProcedural(kind('cell'), { x: 100, y: 100 }),
      createProcedural(kind('gel'), { x: 300, y: 100 }),
      createProcedural(kind('timeline'), { x: 300, y: 300 }),
    ];
    const fig = addObjects(page.id, objs).apply({ doc, assets: {} });
    const e = applyStyle(page.id, objs, 'cartoon');
    expect(e.label).toBe('Apply style Cartoon');
    const after = [...docObjects(e.apply(fig).doc)] as Procedural[];
    const style = (k: string) =>
      (after.find((o) => o.kind === k)?.params as Record<string, unknown>)[STYLE_KEY];
    expect(style('cell')).toBe('cartoon');
    expect(style('gel')).toBe('cartoon');
    expect(style('timeline')).toBeUndefined();
    expect(() => applyStyle(page.id, objs.slice(2), 'cartoon')).toThrow();
  });
});
