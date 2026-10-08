/** Variants each kind's golden SVGs cover, besides its defaults (kinds.test.ts). */
import type { Params } from './types';

export const GOLDEN_CASES: Readonly<Record<string, Readonly<Record<string, Partial<Params>>>>> = {
  wellPlate: {
    '24-square': { format: '24', shape: 'square', wells: { A1: '#e69f00', D6: '#0072b2' } },
    '48-plain': { format: '48', showLabels: false, outline: false, wells: { F8: '#0072b2' } },
    '6-painted': { format: '6', wells: { A1: '#d55e00', B3: '#009e73' } },
  },
};
