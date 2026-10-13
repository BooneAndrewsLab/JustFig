import { describe, expect, it } from 'vitest';
import { decodeParams } from './params';
import type { Prim } from './prims';
import { getKind, slotHexes } from './registry';

const units = (prims: readonly Prim[]): number =>
  prims.reduce((n, p) => n + (p.kind === 'path' ? p.subs.length : 1), 0);

// Issue #101: wrinkled colonies in a dense spot grid rendered 50004 units (bound 50000). The
// wrinkle/filament budget now accounts for everything else drawn, so the bound holds by construction.
describe('petriDish render bound', () => {
  const k = getKind('petriDish');
  if (!k) throw new Error('petriDish is not registered');
  const render = (raw: object) => {
    const p = decodeParams(k.fields, { style: 'flat', ...raw });
    return k.render(k.fix ? k.fix(p) : p, { w: 1, h: 1, slots: slotHexes(k, {}, []) });
  };

  it('keeps the reported wrinkled spot grid under 50000 units', () => {
    const prims = render({
      pattern: 'spots',
      count: 1420,
      spotRows: 8,
      spotCols: 3,
      morphology: 'wrinkled',
      size: 0.5,
      seed: 0,
    });
    expect(units(prims)).toBeLessThanOrEqual(50_000);
  });

  it.each(['wrinkled', 'filamentous'])('keeps the densest %s plates bounded', (morphology) => {
    for (const pattern of ['spots', 'random', 'grid', 'streak'])
      for (const plate of ['round', 'rect'])
        expect(
          units(
            render({
              pattern,
              plate,
              count: 1536,
              spotRows: 8,
              spotCols: 8,
              size: 0.1,
              morphology,
            }),
          ),
          `${pattern} ${plate}`,
        ).toBeLessThanOrEqual(50_000);
  });
});
