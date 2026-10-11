/** Backbone presets (note 58, issue #88): the checked coordinates stay consistent. */
import { describe, expect, it } from 'vitest';

import { PBR322_FEATURES, PBR322_LENGTH, PUC19_FEATURES, PUC19_LENGTH } from './plasmidBackbones';

const span = (f: { start: number; end: number }) => f.end - f.start + 1;

describe('plasmid backbones', () => {
  it.each([
    ['pUC19', PUC19_FEATURES, PUC19_LENGTH],
    ['pBR322', PBR322_FEATURES, PBR322_LENGTH],
  ] as const)('%s features lie inside the sequence', (_n, feats, len) => {
    for (const f of feats) {
      expect(f.start, f.name).toBeGreaterThanOrEqual(1);
      expect(f.end, f.name).toBeLessThanOrEqual(len);
      expect(f.end, f.name).toBeGreaterThanOrEqual(f.start);
    }
  });

  it('has the verified lengths of the known parts', () => {
    const by = (feats: typeof PUC19_FEATURES, n: string) => {
      const f = feats.find((x) => x.name === n);
      if (!f) throw new Error(n);
      return span(f);
    };
    // bla is 286 codons + stop; ori is the 589 bp pMB1 origin; tet 396 codons + stop; rop 63 + stop.
    expect(by(PUC19_FEATURES, 'AmpR')).toBe(861);
    expect(by(PBR322_FEATURES, 'AmpR')).toBe(861);
    expect(by(PUC19_FEATURES, 'ori')).toBe(589);
    expect(by(PBR322_FEATURES, 'ori')).toBe(589);
    expect(by(PBR322_FEATURES, 'TetR')).toBe(1191);
    expect(by(PBR322_FEATURES, 'rop')).toBe(192);
  });
});
