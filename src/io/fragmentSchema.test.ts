import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import { allKinds } from '@/procedural/registry';
import { defaultParams } from '@/procedural/params';

import { writeFragment } from './jfig';

function generateFragmentSchema(): string {
  return execFileSync(process.execPath, ['scripts/schema/generate.ts', '--stdout'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

// The JSON Schema for fragments (note 05) is generated from `FragmentFile` in jfig.ts and from
// every procedural kind's `fields`. The committed copy is served with the app and is what
// sibling apps and generators reference.
const COMMITTED = readFileSync(
  new URL('../../public/schema/fragment.schema.json', import.meta.url),
  'utf8',
);
const FIXTURES = ['plasmidpop-pbr322.fragment.json', 'barelysig-figure2.fragment.json'];

const validate = new Ajv2020({ strict: false }).compile(JSON.parse(COMMITTED) as object);

const proc = (kind: string, version: number, params: unknown): unknown => ({
  format: 'justfig-fragment',
  schemaVersion: 1,
  objects: [
    {
      id: 'p',
      type: 'procedural',
      kind,
      kindVersion: version,
      frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      opacity: 1,
      slots: {},
      params,
    },
  ],
  assets: {},
});

describe('fragment JSON Schema', () => {
  it('is up to date (run `npm run schema`)', { timeout: 60_000 }, () => {
    expect(COMMITTED).toBe(generateFragmentSchema());
  });

  it('is JSON Schema draft 2020-12', () => {
    expect((JSON.parse(COMMITTED) as { $schema: string }).$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
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

  describe('procedural params, generated from each kind`s fields', () => {
    for (const k of allKinds()) {
      it(`${k.kind}: the default params validate`, () => {
        const data = proc(k.kind, k.version, defaultParams(k.fields));
        expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
      });
    }

    it('rejects params of the wrong type or range for a known kind and version', () => {
      const plasmid = allKinds().find((k) => k.kind === 'plasmidMap');
      expect(plasmid).toBeDefined();
      const ok = defaultParams(plasmid?.fields ?? []);
      expect(validate(proc('plasmidMap', plasmid?.version ?? 1, ok))).toBe(true);
      expect(validate(proc('plasmidMap', plasmid?.version ?? 1, { ...ok, length: 'long' }))).toBe(
        false,
      );
      expect(validate(proc('plasmidMap', plasmid?.version ?? 1, { ...ok, length: 0 }))).toBe(false);
      expect(validate(proc('plasmidMap', plasmid?.version ?? 1, { ...ok, topology: 'knot' }))).toBe(
        false,
      );
    });

    it('leaves unknown kinds, older versions and extra keys alone', () => {
      expect(validate(proc('futureKind', 9, { anything: [1, 2] }))).toBe(true);
      expect(validate(proc('plasmidMap', 0, { length: 'old shape' }))).toBe(true);
      const plasmid = allKinds().find((k) => k.kind === 'plasmidMap');
      const ok = defaultParams(plasmid?.fields ?? []);
      expect(validate(proc('plasmidMap', plasmid?.version ?? 1, { ...ok, extra: true }))).toBe(
        true,
      );
    });
  });
});
