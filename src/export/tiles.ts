/**
 * Tiled raster export (issue 16, note 03): a page larger than one canvas can
 * hold is drawn as full-width bands, each under the canvas cap, and the PNG and
 * TIFF writers take the rows band by band. Pure planning, no DOM.
 */

/** Safari's practical canvas cap (~16.7 Mpx): the most one band may hold. */
export const MAX_PIXELS = 16_777_216;
/** The longest side a canvas may have (Chromium and Firefox stop near 32767). */
export const MAX_SIDE = 32_767;
/** The most pixels one export may have in all: the compressed output must fit in memory. */
export const MAX_TOTAL_PIXELS = 400_000_000;

export interface Band {
  readonly y0: number;
  readonly rows: number;
}

/** Bands of full width and equal height (the last may be shorter), each at most `maxPixels`. */
export function planBands(w: number, h: number, maxPixels: number = MAX_PIXELS): Band[] {
  const per = Math.min(Math.floor(maxPixels / w), MAX_SIDE);
  if (per < 1) throw new RangeError('The image is wider than one band can be.');
  const n = Math.ceil(h / per);
  const rows = Math.ceil(h / n); // even bands rather than one thin one at the end
  const out: Band[] = [];
  for (let y0 = 0; y0 < h; y0 += rows) out.push({ y0, rows: Math.min(rows, h - y0) });
  return out;
}

/** Why an export of this size cannot be made, or null. */
export function rasterLimit(w: number, h: number): 'width' | 'total' | null {
  if (w > MAX_SIDE) return 'width';
  return w * h > MAX_TOTAL_PIXELS ? 'total' : null;
}

/** The highest DPI at which a page of w × h pixels at 72 dpi stays within the limits. */
export function maxDpiForSize(w72: number, h72: number): number {
  return Math.floor(72 * Math.min(MAX_SIDE / w72, Math.sqrt(MAX_TOTAL_PIXELS / (w72 * h72))));
}
