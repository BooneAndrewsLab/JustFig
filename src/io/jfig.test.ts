import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createDoc } from '@/core/model/factory';
import type { Obj } from '@/core/model/types';
import { ASSETS, docArb, objArb } from '@/test/modelArbitraries';

import {
  FORMAT,
  JfigError,
  SCHEMA_VERSION,
  migrate,
  readFragment,
  readJfig,
  writeFragment,
  writeJfig,
} from './jfig';

const APP = { name: 'test', version: '0.0.0' };

describe('.jfig codec', () => {
  it('round-trips any valid document exactly', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const text = writeJfig({ doc, assets: ASSETS }, APP);
        const back = readJfig(text);
        expect(back.doc).toEqual(doc);
        // Deterministic: writing what was read gives the same bytes.
        expect(writeJfig(back, APP)).toBe(text);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps a "__proto__" key in raw params as data', () => {
    const params = JSON.parse('{"__proto__": "", "a": {"__proto__": 1}}') as unknown;
    const base = createDoc();
    const page = base.pages[0];
    const layer = page?.layers[0];
    if (!page || !layer) throw new Error('no layer');
    const obj: Obj = {
      id: 'o_0000000000000001',
      type: 'procedural',
      frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      opacity: 1,
      kind: 'x',
      kindVersion: 1,
      params,
      slots: {},
    };
    const doc = { ...base, pages: [{ ...page, layers: [{ ...layer, children: [obj] }] }] };
    const back = readJfig(writeJfig({ doc, assets: ASSETS }, APP));
    expect(back.doc).toEqual(doc);
    const got = back.doc.pages[0]?.layers[0]?.children[0];
    expect(Object.keys((got as { params: object }).params)).toEqual(['__proto__', 'a']);
  });

  it('writes the format id and schema first, and drops unused assets', () => {
    const text = writeJfig({ doc: createDoc(), assets: ASSETS }, APP);
    expect(text.indexOf('"format"')).toBeLessThan(text.indexOf('"schemaVersion"'));
    const raw = JSON.parse(text) as { format: string; schemaVersion: number; assets: object };
    expect(raw.format).toBe(FORMAT);
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    expect(raw.assets).toEqual({});
  });

  it('refuses a file from a newer app, saying so', () => {
    const text = writeJfig({ doc: createDoc(), assets: {} }, APP).replace(
      `"schemaVersion": ${String(SCHEMA_VERSION)}`,
      `"schemaVersion": ${String(SCHEMA_VERSION + 1)}`,
    );
    expect(() => readJfig(text)).toThrow(/newer version/);
  });

  it('names the damaged field', () => {
    const text = writeJfig({ doc: createDoc(), assets: {} }, APP).replace('"opacity"', '"x"');
    const good = JSON.parse(writeJfig({ doc: createDoc(), assets: {} }, APP)) as {
      document: { pages: { size: { w: unknown } }[] };
    };
    const page = good.document.pages[0];
    if (page) page.size.w = 'wide';
    expect(() => readJfig(JSON.stringify(good))).toThrow(/document\.pages\[0\]\.size\.w/);
    expect(() => readJfig('nope')).toThrow(JfigError);
    expect(() => readJfig(text.replace(FORMAT, 'other'))).toThrow(/not a figure file/);
  });

  it('refuses a document that uses a missing asset', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const text = writeJfig({ doc, assets: ASSETS }, APP);
        const raw = JSON.parse(text) as { assets: Record<string, unknown> };
        const used = Object.keys(raw.assets);
        if (used.length === 0) return;
        raw.assets = {};
        expect(() => readJfig(JSON.stringify(raw))).toThrow(/missing asset/);
      }),
      { numRuns: 50 },
    );
  });

  it('runs migrations in order from the file version', () => {
    const steps = [
      (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      (d: Record<string, unknown>) => ({ ...d, b: 2 }),
    ];
    expect(migrate({ schemaVersion: 1 }, steps)).toEqual({ schemaVersion: 3, a: 1, b: 2 });
    expect(migrate({ schemaVersion: 2 }, steps)).toEqual({ schemaVersion: 3, b: 2 });
  });

  it('round-trips fragments and ignores clipboard text that is not one', () => {
    fc.assert(
      fc.property(fc.array(objArb, { maxLength: 4 }), (objects) => {
        const back = readFragment(writeFragment({ objects, assets: ASSETS }));
        expect(back?.objects).toEqual(objects);
      }),
      { numRuns: 100 },
    );
    expect(readFragment('hello')).toBeNull();
    expect(readFragment('{"format":"other"}')).toBeNull();
  });
});
