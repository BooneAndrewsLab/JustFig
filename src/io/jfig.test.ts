import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Obj } from '@/core/model/types';
import { ASSETS, docArb, objArb } from '@/test/modelArbitraries';

import type { JsonObject } from './decode';
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

  it('reads levels on a picture and rejects an empty range', () => {
    const doc = createDoc();
    const hash = Object.keys(ASSETS)[0] ?? '';
    const pic = (levels: unknown) =>
      writeJfig(
        {
          doc: {
            ...doc,
            pages: doc.pages.map((p) => ({
              ...p,
              layers: p.layers.map((l) => ({
                ...l,
                children: [
                  {
                    id: newId('o'),
                    type: 'image',
                    asset: hash,
                    frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
                    opacity: 1,
                    levels,
                  } as Obj,
                ],
              })),
            })),
          },
          assets: ASSETS,
        },
        APP,
      );
    const good = { min: 10, max: 200, invert: true, base: hash };
    expect(() => readJfig(pic(good))).not.toThrow();
    expect(() => readJfig(pic({ ...good, min: 200 }))).toThrow(/min < max/);
    expect(() => readJfig(pic({ ...good, invert: 1 }))).toThrow(/invert/);
  });

  it('keeps a "__proto__" key in raw params as data', () => {
    const params = JSON.parse('{"__proto__": "", "a": {"__proto__": 1}}') as unknown;
    const base = createDoc();
    const page = base.pages[0];
    const layer = page?.layers[0];
    if (!page || !layer) throw new Error('no layer');
    const obj: Obj = {
      id: newId('o'),
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

  it('checks review notes in a file (note 24)', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const ok = {
      id: 'n_1',
      page: page.id,
      at: { x: 1, y: 2 },
      text: 'hi',
      author: '',
      time: 1,
      replies: [],
    };
    const file = (notes: unknown[]) => {
      const raw = JSON.parse(writeJfig({ doc, assets: {} }, APP)) as {
        document: { notes: unknown[] };
      };
      raw.document.notes = notes;
      return JSON.stringify(raw);
    };
    expect(readJfig(file([ok])).doc.notes).toEqual([ok]);
    expect(() => readJfig(file([{ ...ok, page: 'pg_gone' }]))).toThrow(
      /notes\[0\]\.page: no such page/,
    );
    expect(() => readJfig(file([{ ...ok, text: 'x'.repeat(10_001) }]))).toThrow(/longer than/);
    expect(() => readJfig(file([{ ...ok, author: 7 }]))).toThrow(/notes\[0\]\.author/);
    expect(() => readJfig(file([{ ...ok, replies: [{ id: 'n_2', text: 'r' }] }]))).toThrow(
      /replies\[0\]/,
    );
    // A schema 1 file has no notes and opens with none.
    const v1 = JSON.parse(file([])) as Record<string, unknown> & { document: object };
    const { notes: _n, ...rest } = v1.document as { notes: unknown };
    expect(readJfig(JSON.stringify({ ...v1, schemaVersion: 1, document: rest })).doc.notes).toEqual(
      [],
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

  it('migrates schema 2 arrow bindings to { id } in figures and fragments (issue 98)', () => {
    const arrow = (bind: JsonObject) => ({
      id: 'o_0000000000000009',
      type: 'arrow',
      frame: { x: 0, y: 0, w: 10, h: 0, rotation: 0 },
      opacity: 1,
      nodes: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      start: { kind: 'none', size: 4 },
      end: { kind: 'triangle', size: 4 },
      style: {
        fill: null,
        stroke: { hex: '#000000' },
        strokeWidth: 1,
        cap: 'round',
        join: 'round',
      },
      bind,
    });
    const frag = readFragment(
      JSON.stringify({
        format: 'justfig-fragment',
        schemaVersion: 2,
        objects: [arrow({ start: 'o_0000000000000001', end: 'o_0000000000000002' })],
        assets: {},
      }),
    );
    const a = frag?.objects[0];
    expect(a?.type === 'arrow' ? a.bind : null).toEqual({
      start: { id: 'o_0000000000000001' },
      end: { id: 'o_0000000000000002' },
    });
    const v2 = migrate({
      format: FORMAT,
      schemaVersion: 2,
      document: { pages: [{ layers: [{ children: [arrow({ end: 'o_0000000000000002' })] }] }] },
    });
    expect(v2['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(JSON.stringify(v2)).toContain('"bind":{"end":{"id":"o_0000000000000002"}}');
    // A schema 3 site that is not one of the five is refused.
    expect(() =>
      readFragment(
        JSON.stringify({
          format: 'justfig-fragment',
          schemaVersion: 3,
          objects: [arrow({ end: { id: 'o_0000000000000002', site: 'corner' } })],
          assets: {},
        }),
      ),
    ).toThrow(/site/);
    // Schema 4 routing (issue 99): a route that is not one of the three, or a negative mid, is refused.
    const routed = (extra: Record<string, unknown>) => () =>
      readFragment(
        JSON.stringify({
          format: 'justfig-fragment',
          schemaVersion: 4,
          objects: [{ ...arrow({}), ...extra }],
          assets: {},
        }),
      );
    expect(routed({ route: 'zigzag' })).toThrow(/route/);
    expect(routed({ route: 'elbow', mid: -1 })).toThrow(/mid/);
    const ok = routed({ route: 'elbow', mid: 0.5, firstLeg: 'vertical' })()?.objects[0];
    expect(ok).toMatchObject({ route: 'elbow', mid: 0.5, firstLeg: 'vertical' });
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

  describe('paste errors say which object failed and why (issue 79)', () => {
    const rect = (id: string) => ({
      id,
      type: 'rect',
      frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      opacity: 1,
      rx: 0,
      style: {
        fill: { hex: '#ff0000' },
        stroke: null,
        strokeWidth: 1,
        cap: 'butt',
        join: 'miter',
      },
    });
    const message = (objects: unknown, assets: unknown = {}): string => {
      const text = JSON.stringify({
        format: 'justfig-fragment',
        schemaVersion: 1,
        objects,
        assets,
      });
      try {
        readFragment(text);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(JfigError);
        return (e as Error).message;
      }
      throw new Error('expected the fragment to be refused');
    };

    it('names the index, type, id and the failing property', () => {
      const bad = { ...rect('r2'), frame: { x: 'left', y: 0, w: 10, h: 10, rotation: 0 } };
      expect(message([rect('r1'), bad])).toBe(
        'Cannot paste: objects[1] (rect, id "r2") is damaged at property "frame.x": expected a finite number.',
      );
    });

    it('names a nested child, a bad colour and a missing field', () => {
      const style = { ...rect('c').style, fill: { hex: 'red' } };
      const group = {
        id: 'g',
        type: 'group',
        frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
        opacity: 1,
        children: [{ ...rect('c'), style }],
      };
      expect(message([group])).toContain(
        'objects[0] (group, id "g") is damaged at property "children[0].style.fill.hex": expected a colour like #1a2b3c',
      );
      const { rx: _rx, ...noRx } = rect('r');
      expect(message([noRx])).toContain('at property "rx": expected a finite number');
    });

    it('copes with non-objects and reports the kind of a procedural object', () => {
      expect(message([7])).toContain(
        'objects[0] is damaged at the object itself: expected an object',
      );
      expect(message([{ id: 'p', type: 'procedural', kind: 'gel' }])).toContain(
        'objects[0] (procedural/gel, id "p")',
      );
      expect(message({})).toContain('The pasted fragment is damaged');
    });
  });
});
