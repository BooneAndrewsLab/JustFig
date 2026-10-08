import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BRAND } from './brand';

// Branding rule (note 01): the display name lives in brand.ts only, so a
// rename is a one-line change. The format id `justfig` (lower case) is
// deliberately separate and permanent, so the check is case-sensitive.
const root = new URL('..', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const TEXT = /\.(ts|tsx|css|html|json|webmanifest|svg|md)$/;

describe('brand', () => {
  it('names the app nowhere but brand.ts', () => {
    const files = [
      ...walk(join(root, 'src')),
      join(root, 'index.html'),
      ...readdirSync(join(root, 'public'))
        .filter((f) => f.startsWith('manifest'))
        .map((f) => join(root, 'public', f)),
    ].filter((f) => TEXT.test(f));
    const offenders = files
      .map((f) => relative(root, f))
      .filter((f) => f !== 'src/brand.ts' && f !== 'src/brand.test.ts')
      .filter((f) => readFileSync(join(root, f), 'utf8').includes(BRAND.name));
    expect(offenders).toEqual([]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(BRAND)).toBe(true);
  });
});
