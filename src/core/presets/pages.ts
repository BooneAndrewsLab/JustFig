/**
 * Page size presets (note 02). Journal column widths come from each
 * journal's author guidelines (checked 2026-10); heights are the usual
 * maximum figure depth where one is published, else a 4:3-ish default the
 * user changes. All values in mm.
 */
import { mmToPt } from '../units';

export interface PagePreset {
  readonly id: string;
  readonly label: string;
  readonly group: 'Paper' | 'Journal' | 'Screen';
  readonly wMm: number;
  readonly hMm: number;
}

export const PAGE_PRESETS: readonly PagePreset[] = [
  { id: 'a4', label: 'A4 portrait', group: 'Paper', wMm: 210, hMm: 297 },
  { id: 'a4-landscape', label: 'A4 landscape', group: 'Paper', wMm: 297, hMm: 210 },
  { id: 'letter', label: 'US Letter portrait', group: 'Paper', wMm: 215.9, hMm: 279.4 },
  { id: 'nature-1', label: 'Nature, 1 column (89 mm)', group: 'Journal', wMm: 89, hMm: 89 },
  { id: 'nature-2', label: 'Nature, 2 columns (183 mm)', group: 'Journal', wMm: 183, hMm: 140 },
  { id: 'cell-1', label: 'Cell, 1 column (85 mm)', group: 'Journal', wMm: 85, hMm: 85 },
  { id: 'cell-2', label: 'Cell, full width (174 mm)', group: 'Journal', wMm: 174, hMm: 130 },
  { id: 'science-1', label: 'Science, 1 column (57 mm)', group: 'Journal', wMm: 57, hMm: 57 },
  { id: 'science-2', label: 'Science, 2 columns (121 mm)', group: 'Journal', wMm: 121, hMm: 100 },
  { id: 'science-3', label: 'Science, 3 columns (184 mm)', group: 'Journal', wMm: 184, hMm: 140 },
  { id: 'pnas-1', label: 'PNAS, 1 column (87 mm)', group: 'Journal', wMm: 87, hMm: 87 },
  { id: 'pnas-2', label: 'PNAS, 2 columns (178 mm)', group: 'Journal', wMm: 178, hMm: 130 },
  { id: 'plos', label: 'PLOS, full width (190.5 mm)', group: 'Journal', wMm: 190.5, hMm: 140 },
  { id: 'elife-1', label: 'eLife, 1 column (85 mm)', group: 'Journal', wMm: 85, hMm: 85 },
  { id: 'elife-2', label: 'eLife, 2 columns (178 mm)', group: 'Journal', wMm: 178, hMm: 130 },
  { id: 'slide-16-9', label: 'Slide 16:9 (254 × 142.9 mm)', group: 'Screen', wMm: 254, hMm: 142.9 },
];

export const DEFAULT_PRESET = 'nature-2';

export function presetSize(id: string): { w: number; h: number; preset: string } | null {
  const p = PAGE_PRESETS.find((x) => x.id === id);
  return p ? { w: mmToPt(p.wMm), h: mmToPt(p.hMm), preset: p.id } : null;
}
