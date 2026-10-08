/**
 * Which bundled font draws text inside an imported SVG (note 14). Plots
 * name the font they were made with (DejaVu Sans, Arial, Helvetica,
 * Liberation Sans, Times…); we only have Arimo, Tinos and Cousine, which
 * are metric-compatible with Arial, Times New Roman and Courier New. The
 * stored asset keeps the plot's own names; this mapping is applied when the
 * asset is rendered (`render/importedText.ts`), so it can change without
 * migrating figures, and a later restyle (issue 11) edits the names.
 *
 * Pure and table-driven: no font loading, so import-time measuring
 * (`plotCleanup.ts`) uses the same answer as rendering.
 */
import type { FontId } from '@/core/model/types';

/** Monospace families (checked first: "DejaVu Sans Mono" is mono, not sans). */
const MONO =
  /\bmono|monospace|courier|cousine|consolas|menlo|monaco|typewriter|fixed|\bcode\b|lucida console/;
/** Serif families; anything naming "sans" is not one. */
const SERIF =
  /^serif$|times|tinos|roman|georgia|garamond|palatino|book antiqua|cambria|baskerville|bookman|charter|\bstix|^cm(r|mi|ex|sy)\d*$|computer modern(?! sans)|\bserif\b/;

/** One family name, unquoted and lower-case. */
const clean = (name: string): string =>
  name
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .toLowerCase();

/** The families of a `font-family` value, in order. */
export function familyList(value: string): string[] {
  return value
    .split(',')
    .map(clean)
    .filter((f) => f !== '');
}

/** The bundled font for one family name. */
export function fontForFamily(name: string): FontId {
  const f = clean(name);
  if (MONO.test(f)) return 'cousine';
  if (SERIF.test(f) && !f.includes('sans')) return 'tinos';
  return 'arimo';
}

/**
 * The bundled font for a `font-family` value: its first family decides
 * (that is the font the plot was drawn with; the rest are the author's
 * fallbacks). Unset or empty is Arimo: a browser would use its default
 * serif, but plots that leave the family unset are drawn in sans.
 */
export function bundledFont(value: string | undefined): FontId {
  const first = familyList(value ?? '')[0];
  return first === undefined ? 'arimo' : fontForFamily(first);
}

/** `font-weight` that the bundled fonts draw bold: bold, bolder, 600–900. */
export const isBold = (weight: string | undefined): boolean =>
  /^\s*(bold|bolder|[6-9]00)\s*$/i.test(weight ?? '');

/** `font-style` that the bundled fonts draw italic: italic or oblique. */
export const isItalic = (style: string | undefined): boolean =>
  /^\s*(italic|oblique)/i.test(style ?? '');
