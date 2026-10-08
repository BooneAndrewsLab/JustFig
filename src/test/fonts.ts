/** Loads the real TTFs from public/fonts for tests that lay out text. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadFonts } from '@/core/text/fonts';

export async function loadTestFonts(): Promise<void> {
  await loadFonts((file) => {
    const b = readFileSync(join(process.cwd(), 'public', 'fonts', file));
    return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });
}
