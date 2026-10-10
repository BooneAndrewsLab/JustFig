/**
 * Every procedural kind (note 04): golden SVGs of its defaults and of a
 * few telling variants, and the property that any valid params give a
 * finite, bounded render.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';

import { nodeToSvgString } from '@/render/svgNode';
import { primNodes } from '@/render/procedural';
import { loadTestFonts } from '@/test/fonts';
import { paramsArb, pathArb, sizeArb } from '@/test/procArbitraries';

import { createProcedural } from './edits';
import { decodeParams, defaultParams } from './params';
import { type Prim, primPoints } from './prims';
import { allKinds, slotHexes } from './registry';
import { primObjects } from './shapes';
import type { Params, ProceduralKind } from './types';
import { GOLDEN_CASES } from './goldenCases';

const UPDATE = process.env['UPDATE_GOLDEN'] === '1';
const here = (f: string) => new URL(`./__golden__/${f}`, import.meta.url);

function golden(file: string, actual: string): void {
  if (UPDATE || !existsSync(here(file))) writeFileSync(here(file), actual);
  expect(actual).toBe(readFileSync(here(file), 'utf8'));
}

beforeAll(loadTestFonts);

const fixed = (k: ProceduralKind, p: Params) => (k.fix ? k.fix(p) : p);

function renderSvg(k: ProceduralKind, over: Partial<Params>, size?: { w: number; h: number }) {
  const o = createProcedural(k, { x: 0, y: 0 }, over);
  const w = size?.w ?? o.frame.w;
  const h = size?.h ?? o.frame.h;
  const prims = k.render(fixed(k, decodeParams(k.fields, o.params)), {
    w,
    h,
    ...(o.path ? { path: o.path } : {}),
    slots: slotHexes(k, {}, []),
  });
  const body = primNodes(prims, 'text', [])
    .map((n) => nodeToSvgString(n))
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(w)} ${String(h)}">\n${body}\n</svg>\n`;
}

function primsFinite(prims: readonly Prim[]): boolean {
  for (const p of prims) {
    if (p.kind === 'text' && !(Number.isFinite(p.size) && p.size > 0)) return false;
    if (p.kind === 'path' && !Number.isFinite(p.sw)) return false;
    for (const q of primPoints(p)) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
  }
  return true;
}

/**
 * No NaN or Infinity in the serialised SVG. Text content is the user's own
 * words (a label may legitimately read "NaN", issue #62), so only markup is
 * checked, with the characters between tags dropped.
 */
function svgNumbersClean(prims: readonly Prim[]): boolean {
  const svg = primNodes(prims, 'text', [])
    .map((n) => nodeToSvgString(n))
    .join('');
  return !/NaN|Infinity/.test(svg.replace(/>[^<]*</g, '><'));
}

const units = (prims: readonly Prim[]): number =>
  prims.reduce((n, p) => n + (p.kind === 'path' ? p.subs.length : 1), 0);

describe.each(allKinds().map((k) => [k.kind, k] as const))('%s', (_name, k) => {
  it('has golden SVGs', () => {
    const cases = { default: {}, ...(GOLDEN_CASES[k.kind] ?? {}) };
    for (const [name, over] of Object.entries(cases))
      golden(`${k.kind}-${name}.svg`, renderSvg(k, over));
  });

  it('decodes its own defaults to themselves', () => {
    const d = fixed(k, defaultParams(k.fields));
    expect(fixed(k, decodeParams(k.fields, JSON.parse(JSON.stringify(d))))).toEqual(d);
  });

  it('draws any valid params finitely, inside its frame (plus its stated reach)', () => {
    const arb = sizeArb.chain(({ w, h }) =>
      fc.record({
        w: fc.constant(w),
        h: fc.constant(h),
        raw: paramsArb(k.fields),
        path: k.usesPath ? pathArb(w, h) : fc.constant(undefined),
      }),
    );
    // A failure names the kind; fast-check adds seed, path and counterexample (issue #62).
    const run = (): void => {
      fc.assert(
        fc.property(arb, ({ w, h, raw, path }) => {
          const p = fixed(k, decodeParams(k.fields, raw));
          // Valid params decode to themselves (the decoder only repairs).
          expect(fixed(k, decodeParams(k.fields, p))).toEqual(p);
          const prims = k.render(p, {
            w,
            h,
            ...(path ? { path } : {}),
            slots: slotHexes(k, {}, []),
          });
          expect(primsFinite(prims)).toBe(true);
          expect(units(prims)).toBeLessThanOrEqual(50_000);
          const pad = (k.overhang ? k.overhang(p) : 0) + 1e-4 * Math.max(w, h) + 1e-6;
          for (const pr of prims)
            for (const q of primPoints(pr)) {
              expect(q.x).toBeGreaterThanOrEqual(-pad);
              expect(q.y).toBeGreaterThanOrEqual(-pad);
              expect(q.x).toBeLessThanOrEqual(w + pad);
              expect(q.y).toBeLessThanOrEqual(h + pad);
            }
          expect(svgNumbersClean(prims)).toBe(true);
        }),
        { numRuns: Number(process.env['PROC_RUNS'] ?? 40) },
      );
    };
    try {
      run();
    } catch (e) {
      throw new Error(
        `kind "${k.kind}" failed the bounded-render property:\n${String(e instanceof Error ? e.message : e)}`,
        { cause: e },
      );
    }
  });

  it('converts to shapes with the same colours', () => {
    const o = createProcedural(k, { x: 0, y: 0 });
    const prims = k.render(fixed(k, decodeParams(k.fields, o.params)), {
      w: o.frame.w,
      h: o.frame.h,
      ...(o.path ? { path: o.path } : {}),
      slots: slotHexes(k, {}, []),
    });
    const objs = primObjects(prims);
    expect(objs.length).toBeGreaterThan(0);
    const colours = new Set<string>();
    for (const pr of prims) if (pr.kind === 'path' && pr.fill) colours.add(pr.fill);
    const got = new Set<string>();
    for (const ob of objs)
      if ('style' in ob && ob.style.fill && 'hex' in ob.style.fill) got.add(ob.style.fill.hex);
    for (const c of colours) expect(got).toContain(c);
  });
});

describe('svgNumbersClean', () => {
  it('lets a label read "NaN" but still catches a NaN coordinate (issue #62)', () => {
    const text = (t: string, x: number): Prim => ({
      kind: 'text',
      text: t,
      x,
      y: 0,
      size: 4,
      color: '#000000',
      anchor: 'start',
      baseline: 'alphabetic',
    });
    expect(svgNumbersClean([text('NaN', 0)])).toBe(true);
    expect(svgNumbersClean([text('Infinity', 0)])).toBe(true);
    expect(svgNumbersClean([text('ok', Number.NaN)])).toBe(false);
  });
});
