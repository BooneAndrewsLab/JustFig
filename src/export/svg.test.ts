import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

import { readJfig, writeJfig } from '@/io/jfig';
import { loadTestFonts } from '@/test/fonts';

import { buildTorture } from './fixtures/torture';
import { exportSvg } from './svg';

const UPDATE = process.env['UPDATE_GOLDEN'] === '1';
const here = (f: string) => new URL(`./fixtures/${f}`, import.meta.url);
const APP = { name: 'fixture', version: '0.0.0' };

/** Compares with a checked-in golden file; UPDATE_GOLDEN=1 rewrites it. */
function golden(file: string, actual: string): void {
  if (UPDATE || !existsSync(here(file))) writeFileSync(here(file), actual);
  expect(actual).toBe(readFileSync(here(file), 'utf8'));
}

beforeAll(loadTestFonts);

describe('torture fixture', () => {
  it('is checked in exactly as buildTorture makes it', () => {
    golden('torture.jfig', writeJfig(buildTorture(), APP));
  });

  it('reads back to the same figure', () => {
    const fig = buildTorture();
    expect(readJfig(writeJfig(fig, APP)).doc).toEqual(fig.doc);
  });
});

describe('SVG export', () => {
  const fig = () => buildTorture();
  const page = () => {
    const p = fig().doc.pages[0];
    if (!p) throw new Error('no page');
    return p;
  };

  it('matches the golden SVG with editable text', () => {
    golden(
      'torture.text.svg',
      exportSvg(fig(), page(), { textMode: 'text', footer: true, background: true }, '0.0.0'),
    );
  });

  it('matches the golden SVG with outlined text', () => {
    golden(
      'torture.outline.svg',
      exportSvg(fig(), page(), { textMode: 'outline', footer: true, background: true }, '0.0.0'),
    );
  });

  it('is deterministic', () => {
    const opts = { textMode: 'text', footer: true, background: true } as const;
    expect(exportSvg(fig(), page(), opts, '1')).toBe(exportSvg(fig(), page(), opts, '1'));
  });
});
