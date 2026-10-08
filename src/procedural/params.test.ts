import { describe, expect, it } from 'vitest';

import { parseBands } from './kinds/gel';
import { featureColour, plasmidMap } from './kinds/plasmid';
import { decodeTableBytes, MAX_TABLE_BYTES } from './tableFile';
import { wellsFromTable } from './kinds/wellPlate';
import { decodeParams } from './params';
import { getKind, resolveProcedural } from './registry';

describe('params decoder', () => {
  const k = plasmidMap;

  it('repairs anything into valid params without throwing', () => {
    for (const raw of [null, 42, 'x', [], { length: 'many' }, { features: 'none' }]) {
      const p = decodeParams(k.fields, raw);
      expect(typeof p['length']).toBe('number');
      expect(Array.isArray(p['features'])).toBe(true);
    }
  });

  it('clamps numbers, rounds ints, checks enums and colours', () => {
    const p = decodeParams(k.fields, {
      length: 1e12,
      ring: -5,
      topology: 'helical',
      features: [{ name: 7, start: '12', end: 20.6, strand: '-1', color: '#ABC' }, 'junk'],
    });
    expect(p['length']).toBe(100_000_000);
    expect(p['ring']).toBe(2);
    expect(p['topology']).toBe('circular');
    expect(p['features']).toEqual([
      { name: '7', start: 12, end: 21, strand: -1, type: 'misc_feature', color: '#aabbcc' },
      { name: 'feature', start: 1, end: 100, strand: 1, type: 'misc_feature', color: '' },
    ]);
  });

  it('caps lists', () => {
    const many = Array.from({ length: 900 }, (_, i) => ({
      name: `f${String(i)}`,
      start: 1,
      end: 2,
    }));
    const p = decodeParams(k.fields, { features: many });
    expect((p['features'] as unknown[]).length).toBe(500);
  });

  it('keeps feature colours, else picks one by type (and is safe on odd types)', () => {
    expect(featureColour({ color: '#123456', type: 'CDS' })).toBe('#123456');
    expect(featureColour({ color: '', type: 'CDS' })).toBe('#0072b2');
    expect(featureColour({ color: '', type: '__proto__' })).toBe('#7b8794');
  });

  it('treats unknown and newer kinds as unknown, and migrates older ones', () => {
    expect(resolveProcedural({ kind: 'nope', kindVersion: 1, params: {} })).toBeNull();
    expect(resolveProcedural({ kind: 'plasmidMap', kindVersion: 99, params: {} })).toBeNull();
    expect(resolveProcedural({ kind: 'plasmidMap', kindVersion: 1, params: {} })?.kind).toBe(
      getKind('plasmidMap'),
    );
  });
});

describe('well plate paste', () => {
  it('maps hex as is, numbers to a ramp, words to categories, skipping header row and column', () => {
    const t = '\t1\t2\t3\nA\t#ff0000\t\tx\nB\t1\t2\ty\n';
    const r = wellsFromTable(t, 8, 12);
    expect(r.wells['A1']).toBe('#ff0000');
    expect(r.wells['A2']).toBeUndefined();
    expect(r.categories.map((c) => c.value)).toEqual(['x', '1', '2', 'y']);
  });

  it('uses a ramp when every value is a number', () => {
    const r = wellsFromTable('0,5,10\n', 8, 12);
    expect(r.range).toEqual({ min: 0, max: 10 });
    expect(r.wells['A1']).toBe('#fde725');
    expect(r.wells['A3']).toBe('#440154');
  });

  it('ignores cells outside the plate', () => {
    const r = wellsFromTable('1\t2\t3\t4\n5\t6\t7\t8\n9\t9\t9\t9', 2, 3);
    expect(Object.keys(r.wells).sort()).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  });
});

describe('gel bands', () => {
  it('reads sizes, kb and intensities', () => {
    expect(parseBands('3000, 1.5kb:0.4; 800bp junk')).toEqual([
      { bp: 3000, i: 1 },
      { bp: 1500, i: 0.4 },
      { bp: 800, i: 1 },
    ]);
  });
});

describe('plasmid map label threshold', () => {
  const k = plasmidMap;
  const labels = (raw: unknown, size = 300): string[] =>
    k
      .render(decodeParams(k.fields, raw) as never, { w: size, h: size, slots: {} })
      .flatMap((p) => (p.kind === 'text' ? [p.text] : []));
  const base = {
    name: '',
    length: 1000,
    showLength: false,
    showTicks: false,
    features: [
      { name: 'big', start: 1, end: 400, strand: 1, type: 'CDS', color: '' },
      { name: 'tiny', start: 500, end: 504, strand: 1, type: 'CDS', color: '' },
      { name: 'wrap', start: 990, end: 20, strand: 1, type: 'CDS', color: '' },
    ],
  };

  it('defaults to 1% and drops labels of shorter features only', () => {
    expect(decodeParams(k.fields, {})['minLabelPct']).toBe(1);
    const t = labels(base);
    expect(t).toContain('big');
    expect(t).toContain('wrap');
    expect(t).not.toContain('tiny');
  });

  it('is a parameter: 0 labels everything, a high value hides more', () => {
    expect(labels({ ...base, minLabelPct: 0 })).toContain('tiny');
    expect(labels({ ...base, minLabelPct: 10 })).not.toContain('wrap');
    expect(labels({ ...base, minLabelPct: 10 })).toContain('big');
  });

  it('old documents without the param get the default', () => {
    const { minLabelPct: _m, ...old } = { ...base, minLabelPct: 5 };
    expect(decodeParams(k.fields, old)['minLabelPct']).toBe(1);
  });
});

describe('table files', () => {
  it('parses a BOM, CRLF and quoted fields like a paste', () => {
    const r = wellsFromTable('\uFEFF"a, b",c\r\n"say ""hi""",c\r\n', 2, 2);
    expect(Object.keys(r.wells)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(r.categories.map((c) => c.value)).toEqual(['a, b', 'c', 'say "hi"']);
  });

  it('decodes bytes, refusing big, binary or wrongly named files', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(decodeTableBytes(enc('\uFEFF1,2'), 'x.csv')).toEqual({ ok: true, text: '1,2' });
    expect(decodeTableBytes(Uint8Array.from([0xff, 0xfe, 0x31, 0x00]), 'x.TSV')).toEqual({
      ok: true,
      text: '1',
    });
    expect(decodeTableBytes(enc('1'), 'x.xlsx').ok).toBe(false);
    expect(decodeTableBytes(Uint8Array.from([0x31, 0, 0x32]), 'x.csv').ok).toBe(false);
    expect(decodeTableBytes(Uint8Array.from([0xc3, 0x28]), 'x.csv').ok).toBe(false);
    expect(decodeTableBytes(new Uint8Array(MAX_TABLE_BYTES + 1), 'x.csv').ok).toBe(false);
  });
});
