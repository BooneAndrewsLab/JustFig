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

/**
 * Items in reading order: rows top to bottom, then left to right. An item
 * joins the current row when its top is within `tolerance(first)` of the
 * row's first (topmost) item's top.
 */
export function inReadingOrder<T>(
  items: readonly T[],
  box: (t: T) => { readonly x: number; readonly y: number; readonly h: number },
  tolerance: (first: T) => number = () => ROW_TOLERANCE,
): T[] {
  const sorted = [...items].sort((a, b) => box(a).y - box(b).y || box(a).x - box(b).x);
  const rows: T[][] = [];
  for (const t of sorted) {
    const row = rows[rows.length - 1];
    const first = row?.[0];
    if (row && first !== undefined && box(t).y - box(first).y <= tolerance(first)) row.push(t);
    else rows.push([t]);
  }
  return rows.flatMap((r) => r.sort((a, b) => box(a).x - box(b).x));
}

/** Panels in reading order. */
export function readingOrder(panels: readonly Panel[]): Panel[] {
  return inReadingOrder(panels, (p) => p.frame);
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
