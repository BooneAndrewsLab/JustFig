/**
 * The fragment guide page (docs/guide/18-fragment-format.md, issue 79) is for tool authors, so
 * it must not drift: its example pastes, and every object type, procedural kind and param the
 * app knows is on it.
 */
import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import { BRAND } from '@/brand';
import { allKinds } from '@/procedural/registry';
import type { ScalarField } from '@/procedural/types';

import { readFragment } from './jfig';

const PAGE = readFileSync(
  new URL('../../docs/guide/18-fragment-format.md', import.meta.url),
  'utf8',
);
const SCHEMA_TEXT = readFileSync(
  new URL('../../public/schema/fragment.schema.json', import.meta.url),
  'utf8',
);
const SCHEMA = JSON.parse(SCHEMA_TEXT) as {
  $defs: Record<string, { properties?: { type?: { const?: string } } }>;
};

/** The text of the `### \`kind\`` section. */
function section(kind: string): string {
  const start = PAGE.indexOf(`### \`${kind}\``);
  expect(start, `a section for ${kind}`).toBeGreaterThanOrEqual(0);
  const next = PAGE.indexOf('\n## ', start);
  const sub = PAGE.indexOf('\n### ', start + 4);
  const end = [sub, next].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? PAGE.length;
  return PAGE.slice(start, end);
}

function scalarFacts(f: ScalarField): string[] {
  switch (f.type) {
    case 'number':
    case 'int':
      return [`${String(f.min)} to ${String(f.max)}`];
    case 'enum':
      return f.options.map((o) => `\`${String(o.value)}\``);
    case 'bool':
    case 'text':
    case 'color':
      return [];
  }
}

describe('the fragment guide page', () => {
  it('lists every object type', () => {
    const types = Object.values(SCHEMA.$defs)
      .map((d) => d.properties?.type?.const)
      .filter((t): t is string => t !== undefined);
    expect(types.length).toBeGreaterThanOrEqual(11);
    for (const t of types) expect(PAGE, t).toContain(`| \`${t}\``);
  });

  it('lists every procedural kind with its version, fields, ranges and options', () => {
    for (const k of allKinds()) {
      const s = section(k.kind);
      expect(s, k.kind).toContain(`\`kindVersion\` ${String(k.version)}.`);
      for (const f of k.fields) {
        expect(s, `${k.kind}.${f.key}`).toContain(`- \`${f.key}\`:`);
        const line = s.split('\n').find((l) => l.startsWith(`- \`${f.key}\`:`)) ?? '';
        if (f.type === 'list') {
          for (const i of f.item) {
            expect(line, `${k.kind}.${f.key}.${i.key}`).toContain(`\`${i.key}\``);
            for (const x of scalarFacts(i))
              expect(line, `${k.kind}.${f.key}.${i.key}`).toContain(x);
          }
          expect(line, `${k.kind}.${f.key}`).toContain(
            `${String(f.min)} to ${String(f.max)} items`,
          );
        } else if (f.type !== 'wellMap') {
          for (const x of scalarFacts(f)) expect(line, `${k.kind}.${f.key}`).toContain(x);
        }
      }
    }
  });

  it('has a minimal example that validates against the schema and pastes as a rectangle and a text', () => {
    const blocks = [...PAGE.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
    const example = blocks.find((b) => b.includes('"rect"'));
    expect(example).toBeDefined();
    const validate = new Ajv2020({ strict: false }).compile(JSON.parse(SCHEMA_TEXT) as object);
    const data: unknown = JSON.parse(example ?? '');
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    const frag = readFragment(example ?? '');
    expect(frag?.objects.map((o) => o.type)).toEqual(['rect', 'text']);
  });

  it('names the schema file and the units, and the schema does not name the app', () => {
    expect(PAGE).toContain('schema/fragment.schema.json');
    expect(PAGE).toContain('points');
    expect(PAGE).toContain('{"hex"');
    expect(PAGE).toContain('{"swatch"');
    expect(SCHEMA_TEXT).not.toContain(BRAND.name);
  });
});
