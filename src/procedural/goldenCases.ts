/** Variants each kind's golden SVGs cover, besides its defaults (kinds.test.ts). */
import type { Params } from './types';

export const GOLDEN_CASES: Readonly<Record<string, Readonly<Record<string, Partial<Params>>>>> = {
  wellPlate: {
    '24-square': { format: '24', shape: 'square', wells: { A1: '#e69f00', D6: '#0072b2' } },
    '48-plain': { format: '48', showLabels: false, outline: false, wells: { F8: '#0072b2' } },
    '6-painted': { format: '6', wells: { A1: '#d55e00', B3: '#009e73' } },
  },
  bilayer: {
    vesicle: { closed: true, tails: 'wavy' },
  },
  helix: {
    rna: { molecule: 'rna', perTurn: 8 },
  },
  receptors: {
    gpcr: { protein: 'gpcr', side: 'in' },
    channel: { protein: 'channel', membrane: false },
    antibody: { protein: 'antibody' },
  },
  plasmidMap: {
    linear: { topology: 'linear', name: 'pLinear', length: 6000 },
    origin: {
      length: 4000,
      features: [
        { name: 'across ori', start: 3800, end: 200, strand: 1, type: 'CDS', color: '' },
        { name: 'rev', start: 1000, end: 1600, strand: -1, type: 'promoter', color: '#cc79a7' },
      ],
    },
  },
  proteinDomains: {
    shapes: {
      length: 300,
      domains: [
        { name: 'A', start: 10, end: 80, color: '#56b4e9', shape: 'ellipse' },
        { name: 'B', start: 100, end: 200, color: '#d55e00', shape: 'hexagon' },
      ],
      showScale: false,
    },
  },
  petriDish: {
    streak: { pattern: 'streak' },
    spots: { pattern: 'spots', count: 40 },
    grid: { pattern: 'grid', count: 96, variation: 0 },
    lawn: { pattern: 'lawn', lid: false },
  },
  gel: {
    inverted: { look: 'inverted', ladder: '100bp' },
  },
  cell: {
    irregular: { shape: 'irregular', er: false, mitochondria: 10, seed: 11 },
  },
};
