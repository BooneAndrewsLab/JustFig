/**
 * fast-check arbitraries from a procedural kind's fields: every value they
 * make is valid params for that kind, so "any valid params give a finite,
 * bounded render" can be property-tested for every kind alike.
 */
import fc from 'fast-check';

import type { PathNode } from '@/core/model/types';
import type { Field, Item, ParamValue, Params, ScalarField } from '@/procedural/types';
import { rowLabel } from '@/procedural/kinds/util';

const hex = fc.stringMatching(/^#[0-9a-f]{6}$/);

function scalarArb(f: ScalarField): fc.Arbitrary<ParamValue> {
  switch (f.type) {
    case 'number':
      return fc.double({ min: f.min, max: f.max, noNaN: true, noDefaultInfinity: true });
    case 'int':
      return fc.integer({ min: Math.ceil(f.min), max: Math.floor(f.max) });
    case 'enum':
      return fc.constantFrom(...f.options.map((o) => o.value));
    case 'bool':
      return fc.boolean();
    case 'text':
      return fc.string({ maxLength: Math.min(f.maxLength, 24) });
    case 'color':
      return f.auto === true ? fc.oneof(hex, fc.constant('')) : hex;
  }
}

function itemArb(fields: readonly ScalarField[]): fc.Arbitrary<Item> {
  const rec: Record<string, fc.Arbitrary<ParamValue>> = {};
  for (const f of fields) rec[f.key] = scalarArb(f);
  return fc.record(rec) as fc.Arbitrary<Item>;
}

function fieldArb(f: Field): fc.Arbitrary<ParamValue> {
  if (f.type === 'list')
    return fc.array(itemArb(f.item), { minLength: f.min, maxLength: Math.min(f.max, 12) });
  if (f.type === 'wellMap')
    return fc
      .array(fc.tuple(fc.integer({ min: 0, max: 31 }), fc.integer({ min: 1, max: 48 }), hex), {
        maxLength: 40,
      })
      .map((cells) => {
        const out: Record<string, string> = {};
        for (const [r, c, h] of cells) out[`${rowLabel(r)}${String(c)}`] = h;
        return out;
      });
  return scalarArb(f);
}

export function paramsArb(fields: readonly Field[]): fc.Arbitrary<Params> {
  const rec: Record<string, fc.Arbitrary<ParamValue>> = {};
  for (const f of fields) rec[f.key] = fieldArb(f);
  return fc.record(rec);
}

export const sizeArb = fc.record({
  w: fc.double({ min: 1, max: 2000, noNaN: true }),
  h: fc.double({ min: 1, max: 2000, noNaN: true }),
});

/** A path inside a w × h box (handles too, so the curve stays in it). */
export function pathArb(w: number, h: number): fc.Arbitrary<PathNode[]> {
  const pt = fc.record({
    x: fc.double({ min: 0, max: w, noNaN: true }),
    y: fc.double({ min: 0, max: h, noNaN: true }),
  });
  const node = fc
    .tuple(pt, fc.option(pt, { nil: undefined }), fc.option(pt, { nil: undefined }))
    .map(([p, i, o]): PathNode => ({ ...p, ...(i ? { in: i } : {}), ...(o ? { out: o } : {}) }));
  return fc.array(node, { minLength: 2, maxLength: 6 });
}
