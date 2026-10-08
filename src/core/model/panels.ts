/**
 * Panel labels (note 02): `autoLabel` panels are lettered in reading order
 * — rows top to bottom (panels whose tops are within a tolerance share a
 * row), then left to right — in the document's label format.
 */
import type { Id } from './ids';
import { pageObjects } from './tree';
import type { Page, Panel, PanelLabelFormat } from './types';

/** Tops closer than this (points, ~5 mm) count as one row. */
export const ROW_TOLERANCE = 14;

export function letter(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function formatLabel(i: number, format: PanelLabelFormat): string {
  const L = letter(i);
  const l = L.toLowerCase();
  switch (format) {
    case 'A':
      return L;
    case 'a':
      return l;
    case '(a)':
      return `(${l})`;
    case '(A)':
      return `(${L})`;
    case 'a)':
      return `${l})`;
  }
}

/** Panels in reading order. */
export function readingOrder(panels: readonly Panel[]): Panel[] {
  const sorted = [...panels].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  const rows: Panel[][] = [];
  for (const p of sorted) {
    const row = rows[rows.length - 1];
    const top = row?.[0]?.frame.y;
    if (row && top !== undefined && p.frame.y - top <= ROW_TOLERANCE) row.push(p);
    else rows.push([p]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.frame.x - b.frame.x));
}

/** Label of every panel on the page: auto ones lettered, fixed ones as written. */
export function panelLabels(page: Page, format: PanelLabelFormat): Map<Id, string> {
  const panels = [...pageObjects(page)].filter((o): o is Panel => o.type === 'panel');
  const out = new Map<Id, string>();
  let i = 0;
  for (const p of readingOrder(panels)) {
    if (p.autoLabel) {
      out.set(p.id, formatLabel(i, format));
      i += 1;
    } else out.set(p.id, p.label);
  }
  return out;
}
