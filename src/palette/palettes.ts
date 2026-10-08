/**
 * Built-in palettes (note 07). The colourblind-safe ones are marked; the
 * UI warns when a figure uses one that is not. Sources: Okabe & Ito
 * (2008); Paul Tol's qualitative schemes (personal.sron.nl/~pault, 2021);
 * the IBM Design Library accessible palette; viridis and cividis
 * (matplotlib), sampled at six even steps.
 */
import { parseHex, rgbToOklch } from '@/core/color/color';

export interface BuiltInPalette {
  readonly id: string;
  readonly name: string;
  readonly kind: 'qualitative' | 'sequential';
  readonly colourblindSafe: boolean;
  readonly colours: readonly string[];
}

export const PALETTES: readonly BuiltInPalette[] = [
  {
    id: 'okabe-ito',
    name: 'Okabe-Ito',
    kind: 'qualitative',
    colourblindSafe: true,
    colours: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
  },
  {
    id: 'tol-bright',
    name: 'Tol bright',
    kind: 'qualitative',
    colourblindSafe: true,
    colours: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377'],
  },
  {
    id: 'tol-muted',
    name: 'Tol muted',
    kind: 'qualitative',
    colourblindSafe: true,
    colours: [
      '#cc6677',
      '#332288',
      '#ddcc77',
      '#117733',
      '#88ccee',
      '#882255',
      '#44aa99',
      '#999933',
      '#aa4499',
    ],
  },
  {
    id: 'tol-vibrant',
    name: 'Tol vibrant',
    kind: 'qualitative',
    colourblindSafe: true,
    colours: ['#ee7733', '#0077bb', '#33bbee', '#ee3377', '#cc3311', '#009988'],
  },
  {
    id: 'ibm',
    name: 'IBM accessible',
    kind: 'qualitative',
    colourblindSafe: true,
    colours: ['#648fff', '#785ef0', '#dc267f', '#fe6100', '#ffb000'],
  },
  {
    id: 'viridis',
    name: 'Viridis',
    kind: 'sequential',
    colourblindSafe: true,
    colours: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  },
  {
    id: 'cividis',
    name: 'Cividis',
    kind: 'sequential',
    colourblindSafe: true,
    colours: ['#00204d', '#31446b', '#666970', '#958f78', '#cbba69', '#ffea46'],
  },
  {
    id: 'pastel',
    name: 'Soft pastels',
    kind: 'qualitative',
    colourblindSafe: false,
    colours: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc'],
  },
  {
    id: 'classic',
    name: 'Classic (not colourblind-safe)',
    kind: 'qualitative',
    colourblindSafe: false,
    colours: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'],
  },
];

export const paletteById = (id: string): BuiltInPalette | undefined =>
  PALETTES.find((p) => p.id === id);

/** Near-black, near-white and greys: outlines, text and backgrounds a palette change leaves alone. */
export function isNeutral(hex: string): boolean {
  const c = parseHex(hex);
  if (!c) return false;
  return rgbToOklch(c).c < 0.035;
}
