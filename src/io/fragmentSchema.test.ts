import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { writeFragment } from './jfig';

function generateFragmentSchema(): string {
  return execFileSync(process.execPath, ['scripts/schema/generate.ts', '--stdout'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

// The JSON Schema for fragments (note 05) is generated from `FragmentFile` in jfig.ts.
// The committed copy is what PlasmidPop and BarelySig reference.
const COMMITTED = readFileSync(
  new URL('../../schemas/fragment.schema.json', import.meta.url),
  'utf8',
);
const FIXTURES = ['plasmidpop-pbr322.fragment.json', 'barelysig-figure2.fragment.json'];

const validate = new Ajv({ strict: false }).compile(JSON.parse(COMMITTED) as object);

describe('fragment JSON Schema', () => {
  it('is up to date (run `npm run schema`)', { timeout: 60_000 }, () => {
    expect(COMMITTED).toBe(generateFragmentSchema());
  });

  for (const name of FIXTURES) {
    it(`accepts the frozen fixture ${name}`, () => {
      const data: unknown = JSON.parse(
        readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
      );
      expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    });
  }

  it('accepts what writeFragment writes', () => {
    const data: unknown = JSON.parse(writeFragment({ objects: [], assets: {} }));
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects a wrong format id and a malformed object', () => {
    expect(validate({ format: 'x', schemaVersion: 1, objects: [], assets: {} })).toBe(false);
    expect(
      validate({ format: 'justfig-fragment', schemaVersion: 1, objects: [{ id: 1 }], assets: {} }),
    ).toBe(false);
  });
});
