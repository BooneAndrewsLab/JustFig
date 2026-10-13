import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { pageObjects } from '@/core/model/tree';

import { SCHEMA_VERSION, readJfig, writeJfig } from './jfig';

// Every schema version ships a frozen file (note 02). These are never
// regenerated: a newer app must keep opening them through MIGRATIONS.
const FROZEN = [1, 2, 3, 4];

describe('frozen figure files', () => {
  it('has one for every schema version', () => {
    expect(FROZEN).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1));
  });

  it('brings schema 1 files up with no review notes, and keeps schema 2 notes (note 24)', () => {
    const read = (v: number) =>
      readJfig(readFileSync(new URL(`./fixtures/v${String(v)}.jfig`, import.meta.url), 'utf8'));
    expect(read(1).doc.notes).toEqual([]);
    const notes = read(2).doc.notes;
    expect(notes.map((n) => n.text)).toEqual([
      'Make this label bigger?\nIt is hard to read at 50%.',
      'Leave room here for the <legend> & scale bar.',
    ]);
    expect(notes[0]).toMatchObject({ object: 'o_000000000000001a', resolved: true, author: 'PI' });
    expect(notes[0]?.replies.map((r) => r.text)).toEqual(['Done, 9 pt now.']);
    expect(notes[1]).not.toHaveProperty('object');
  });

  it('keeps schema 3 connection sites (issue 98, note 06)', () => {
    const fig = readJfig(readFileSync(new URL('./fixtures/v3.jfig', import.meta.url), 'utf8'));
    const arrows = fig.doc.pages
      .flatMap((p) => [...pageObjects(p)])
      .filter((o) => o.type === 'arrow' && o.bind !== undefined);
    expect(arrows.map((a) => (a.type === 'arrow' ? a.bind : undefined))).toEqual([
      { start: { id: 'o_0000000000000000', site: 'right' }, end: { id: 'o_0000000000000003' } },
      { end: { id: 'o_0000000000000002', site: 'center' } },
    ]);
  });

  it('keeps schema 4 arrow routing (issue 99, note 06), and schema 3 arrows stay straight', () => {
    const routes = (v: number) =>
      readJfig(readFileSync(new URL(`./fixtures/v${String(v)}.jfig`, import.meta.url), 'utf8'))
        .doc.pages.flatMap((p) => [...pageObjects(p)])
        .flatMap((o) =>
          o.type === 'arrow' && o.route !== undefined
            ? [{ route: o.route, mid: o.mid, firstLeg: o.firstLeg }]
            : [],
        );
    expect(routes(3)).toEqual([]);
    expect(routes(4)).toEqual([
      { route: 'curve', mid: undefined, firstLeg: undefined },
      { route: 'elbow', mid: 0.25, firstLeg: 'vertical' },
    ]);
  });

  for (const v of FROZEN) {
    it(`opens the schema ${String(v)} file`, () => {
      const text = readFileSync(new URL(`./fixtures/v${String(v)}.jfig`, import.meta.url), 'utf8');
      const fig = readJfig(text);
      expect(fig.doc.pages.length).toBeGreaterThan(0);
      // While it is the current schema, it also writes back byte for byte.
      if (v === SCHEMA_VERSION) expect(writeJfig(fig, fig.app)).toBe(text);
    });
  }
});
