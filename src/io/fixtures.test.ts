import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, readJfig, writeJfig } from './jfig';

// Every schema version ships a frozen file (note 02). These are never
// regenerated: a newer app must keep opening them through MIGRATIONS.
const FROZEN = [1, 2];

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
