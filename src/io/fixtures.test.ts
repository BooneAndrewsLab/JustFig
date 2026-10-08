import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, readJfig, writeJfig } from './jfig';

// Every schema version ships a frozen file (note 02). These are never
// regenerated: a newer app must keep opening them through MIGRATIONS.
const FROZEN = [1];

describe('frozen figure files', () => {
  it('has one for every schema version', () => {
    expect(FROZEN).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1));
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
