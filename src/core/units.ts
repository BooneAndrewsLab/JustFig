/** Units (note 02): the model is in points; the UI shows mm or inches. */
export type Unit = 'mm' | 'in' | 'pt';

export const PT_PER_IN = 72;
export const MM_PER_IN = 25.4;

export const mmToPt = (mm: number): number => (mm / MM_PER_IN) * PT_PER_IN;
export const ptToMm = (pt: number): number => (pt / PT_PER_IN) * MM_PER_IN;

export function toUnit(pt: number, unit: Unit): number {
  if (unit === 'pt') return pt;
  return unit === 'mm' ? ptToMm(pt) : pt / PT_PER_IN;
}

export function fromUnit(v: number, unit: Unit): number {
  if (unit === 'pt') return v;
  return unit === 'mm' ? mmToPt(v) : v * PT_PER_IN;
}

/** A length for display: mm to 1 decimal, inches to 2, points to 1. */
export function formatLength(pt: number, unit: Unit): string {
  const v = toUnit(pt, unit);
  const digits = unit === 'in' ? 2 : 1;
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
}
