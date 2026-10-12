/** Styles (note 58): the generic `style` param, the look helpers and "Apply this style to all". */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects } from '@/core/model/tree';
import type { Procedural } from '@/core/model/types';

import { applyStyle, createProcedural, stylesOf } from './edits';
import { nodeToSvgString } from '@/render/svgNode';
import { primNodes } from '@/render/procedural';

import {
  INK,
  LOOKS,
  PAPER,
  STYLE_IDS,
  circle,
  glowRings,
  lookOf,
  pathPrim,
  primPoints,
  rect,
  shrink,
  wobble,
} from './prims';
import { primObjects } from './shapes';
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

  it('gives each drawn kind the styles that suit it, in menu order', () => {
    const micro = ['fluorescence', 'em', 'brightfield'];
    const base = ['flat', 'line-art', 'cartoon', 'textbook'];
    expect(stylesOf(kind('cell'))).toEqual([...base, ...micro]);
    expect(stylesOf(kind('bacterium'))).toEqual([...base, ...micro]);
    expect(stylesOf(kind('wellPlate'))).toEqual(base);
    expect(stylesOf(kind('petriDish'))).toEqual([...base, 'photo']);
    expect(stylesOf(kind('gel'))).toEqual([...base, 'photo']);
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

describe('textbook, micrographs and photo (#93)', () => {
  const part = { fill: '#c3b1e1', stroke: '#8a6fb0', sw: 0.5 };
  const cellBody = [circle(50, 50, 30)];

  it('draws exactly one primitive per part in flat, line art and cartoon', () => {
    for (const id of ['flat', 'line-art', 'cartoon', 'photo']) {
      const look = lookOf(id, 1);
      expect(look.paint('body', cellBody, part)).toEqual(pathPrim(cellBody, look.body(part)));
      expect(look.ground(100, 100)).toEqual([]);
      expect(look.tones(cellBody, '#ffffff')).toEqual([]);
    }
  });

  it('shades textbook parts with tone bands under a double outline', () => {
    const prims = lookOf('textbook', 1).paint('body', cellBody, part);
    const fills = prims.filter((p) => p.fill !== null).map((p) => p.fill);
    expect(new Set(fills).size).toBe(3);
    const strokes = prims.filter((p) => p.stroke !== null);
    expect(strokes).toHaveLength(2);
    expect(strokes[1]?.sw).toBeLessThan(strokes[0]?.sw ?? 0);
    // A square-cornered box gets no bands (they would read as a patch).
    const box = lookOf('textbook', 1).paint('body', [rect(0, 0, 80, 40)], part);
    expect(box.filter((p) => p.fill !== null)).toHaveLength(1);
  });

  it('draws fluorescence on black: a glowing stained edge, DNA in DAPI blue', () => {
    const look = lookOf('fluorescence', 1);
    expect(look.ground(100, 80)[0]?.fill).toBe(LOOKS.fluorescence.ground);
    const cell = look.paint('body', cellBody, part);
    const glow = cell.filter((p) => p.alpha !== undefined);
    expect(glow.length).toBe(3);
    // Widest and faintest first.
    expect(glow[0]?.sw).toBeGreaterThan(glow[2]?.sw ?? 0);
    expect(glow[0]?.alpha).toBeLessThan(glow[2]?.alpha ?? 1);
    const nucleus = look.paint('body', cellBody, part, true);
    expect(nucleus.at(-1)?.fill).toBe(LOOKS.fluorescence.dna);
    expect(look.text('#000000')).not.toBe('#000000');
  });

  it('draws EM in greys and brightfield nearly the ground', () => {
    const grey = lookOf('em', 1).paint('body', cellBody, part);
    for (const p of grey)
      for (const c of [p.fill, p.stroke]) if (c) expect(c.slice(1, 3)).toBe(c.slice(3, 5));
    const bf = lookOf('brightfield', 1).paint('organelle', cellBody, part);
    expect(bf.some((p) => p.alpha !== undefined && p.stroke === PAPER)).toBe(true);
  });

  it('keeps glow and bands bounded on thousands of parts', () => {
    const many = Array.from({ length: 1000 }, (_, i) => circle(i, 5, 1));
    for (const id of ['textbook', 'fluorescence', 'brightfield'])
      expect(lookOf(id, 1).paint('body', many, part)).toHaveLength(1);
  });

  it('shrinks a part inside itself', () => {
    const s = circle(50, 40, 30);
    const k = shrink(s, 0.5, -0.6, -0.6);
    expect(k.t === 'circle' && k.r).toBe(15);
    if (k.t === 'circle')
      expect(Math.hypot(k.cx - 50, k.cy - 40) + k.r).toBeLessThanOrEqual(30 + 1e-9);
  });

  it('exports translucency as plain fill/stroke opacity, and converts it to object opacity', () => {
    const rings = glowRings([circle(5, 5, 3)], '#ff0000', 1, 2, 1);
    const svg = primNodes(rings, 'text', [])
      .map((n) => nodeToSvgString(n))
      .join('');
    expect(svg).toContain('stroke-opacity=');
    expect(svg).not.toMatch(/ opacity=|filter|gradient/);
    expect(primObjects(rings).every((o) => o.opacity < 1)).toBe(true);
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
