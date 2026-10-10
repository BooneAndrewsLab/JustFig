/**
 * Page size presets (note 02). Journal column widths come from each
 * journal's author guidelines (checked 2026-10); heights are the usual
 * maximum figure depth where one is published, else a 4:3-ish default the
 * user changes. All values in mm. `maxHMm` (maximum figure depth) is set
 * only where an official page was checked (2026-10): Nature 170 (leaves
 * room for the legend; research-figure-guide.nature.com), PLOS 222.25
 * (8.75 in, 2625 px at 300 dpi; journals.plos.org figures page), Cell 200
 * (6.5 x 8 in; "We recommend that figures be a maximum of 6.5 x 8 in (16.5 x 20 cm)",
 * www.cell.com/information-for-authors/figure-guidelines, a recommendation for
 * production files, checked 2026-10-10). Science states no maximum height (only
 * widths of 5.7, 12.1 and 18.4 cm; www.science.org/content/page/instructions-
 * preparing-initial-manuscript and ...-revised-manuscript, checked 2026-10-10),
 * so none is set. PNAS 225 ("Recommended max height: 54 picas / 9" / 22.5 cm",
 * www.pnas.org/pb-assets/authors/digitalart-1675347574760.pdf, checked
 * 2026-10-10; 9 in is 228.6 mm, we take the smaller 22.5 cm).
 */
import { mmToPt } from '../units';

export interface PagePreset {
  readonly id: string;
  readonly label: string;
  readonly group: 'Paper' | 'Journal' | 'Screen';
  readonly wMm: number;
  readonly hMm: number;
  /** The journal a Journal preset's column width belongs to (export checks, note 03). */
  readonly journal?: string;
  /**
   * The journal's published maximum figure height in mm, where its author
   * guidelines give one and it has been verified (export checks, note 03).
   * Same value on each of a journal's presets.
   */
  readonly maxHMm?: number;
}

export const PAGE_PRESETS: readonly PagePreset[] = [
  { id: 'a4', label: 'A4 portrait', group: 'Paper', wMm: 210, hMm: 297 },
  { id: 'a4-landscape', label: 'A4 landscape', group: 'Paper', wMm: 297, hMm: 210 },
  { id: 'letter', label: 'US Letter portrait', group: 'Paper', wMm: 215.9, hMm: 279.4 },
  {
    id: 'nature-1',
    label: 'Nature, 1 column (89 mm)',
    group: 'Journal',
    wMm: 89,
    hMm: 89,
    journal: 'Nature',
    maxHMm: 170,
  },
  {
    id: 'nature-2',
    label: 'Nature, 2 columns (183 mm)',
    group: 'Journal',
    wMm: 183,
    hMm: 140,
    journal: 'Nature',
    maxHMm: 170,
  },
  {
    id: 'cell-1',
    label: 'Cell, 1 column (85 mm)',
    group: 'Journal',
    wMm: 85,
    hMm: 85,
    journal: 'Cell',
    maxHMm: 200,
  },
  {
    id: 'cell-2',
    label: 'Cell, full width (174 mm)',
    group: 'Journal',
    wMm: 174,
    hMm: 130,
    journal: 'Cell',
    maxHMm: 200,
  },
  {
    id: 'science-1',
    label: 'Science, 1 column (57 mm)',
    group: 'Journal',
    wMm: 57,
    hMm: 57,
    journal: 'Science',
  },
  {
    id: 'science-2',
    label: 'Science, 2 columns (121 mm)',
    group: 'Journal',
    wMm: 121,
    hMm: 100,
    journal: 'Science',
  },
  {
    id: 'science-3',
    label: 'Science, 3 columns (184 mm)',
    group: 'Journal',
    wMm: 184,
    hMm: 140,
    journal: 'Science',
  },
  {
    id: 'pnas-1',
    label: 'PNAS, 1 column (87 mm)',
    group: 'Journal',
    wMm: 87,
    hMm: 87,
    journal: 'PNAS',
    maxHMm: 225,
  },
  {
    id: 'pnas-2',
    label: 'PNAS, 2 columns (178 mm)',
    group: 'Journal',
    wMm: 178,
    hMm: 130,
    journal: 'PNAS',
    maxHMm: 225,
  },
  {
    id: 'plos',
    label: 'PLOS, full width (190.5 mm)',
    group: 'Journal',
    wMm: 190.5,
    hMm: 140,
    journal: 'PLOS',
    maxHMm: 222.25,
  },
  {
    id: 'elife-1',
    label: 'eLife, 1 column (85 mm)',
    group: 'Journal',
    wMm: 85,
    hMm: 85,
    journal: 'eLife',
  },
  {
    id: 'elife-2',
    label: 'eLife, 2 columns (178 mm)',
    group: 'Journal',
    wMm: 178,
    hMm: 130,
    journal: 'eLife',
  },
  { id: 'slide-16-9', label: 'Slide 16:9 (254 × 142.9 mm)', group: 'Screen', wMm: 254, hMm: 142.9 },
];

/** Journals with column-width presets, in list order. */
export const JOURNALS: readonly string[] = [
  ...new Set(PAGE_PRESETS.flatMap((p) => (p.journal === undefined ? [] : [p.journal]))),
];

/** A journal's column-width presets, narrowest first. */
export const journalColumns = (journal: string): PagePreset[] =>
  PAGE_PRESETS.filter((p) => p.journal === journal).sort((a, b) => a.wMm - b.wMm);

/** A journal's published maximum figure height in mm, or null when none is set. */
export const journalMaxHeightMm = (journal: string): number | null =>
  PAGE_PRESETS.find((p) => p.journal === journal && p.maxHMm !== undefined)?.maxHMm ?? null;

export const DEFAULT_PRESET = 'nature-2';

export function presetSize(id: string): { w: number; h: number; preset: string } | null {
  const p = PAGE_PRESETS.find((x) => x.id === id);
  return p ? { w: mmToPt(p.wMm), h: mmToPt(p.hMm), preset: p.id } : null;
}
