import { BRAND } from '@/brand';
import { WORDMARK_ACCENT, WORDMARK_INK, WORDMARK_WIDTH } from './logoWordmark';

/**
 * The lockup: the "j" mark (legend-swatch dot, hooked stem) standing in for
 * the first letter of the outlined "ustfig" wordmark (design/logo/README.md,
 * note 50). Built like PlasmidPop's `Logo.tsx` so the three apps match.
 *
 * Geometry follows the design's 64 px lockup: the mark's 64-unit box scaled
 * by 1.24 (79.36 px) and shifted 14.88 px left (the j's hook reaches the box
 * edge; its stem is near the right), its top 62 px above the wordmark
 * baseline (y = 0) and the text starting 55.08 px in. Ink parts use currentColor so the logo
 * follows the top bar's text colour; the accent is the brand red.
 */

const ACCENT = '#ec3013';
const MARK_SCALE = 1.24;
const MARK_LEFT = -14.88;
const MARK_TOP = -62;
const TEXT_X = 55.08;
const VIEW_LEFT = -1;
const VIEW_TOP = MARK_TOP;
const VIEW_HEIGHT = 80;
const VIEW_WIDTH = TEXT_X + WORDMARK_WIDTH - VIEW_LEFT;

/** The mark alone, in 64-unit coordinates; ink via currentColor. */
export function LogoMark() {
  return (
    <g fill="none">
      <path d="M48.5 17.5V40A17 17 0 0 1 16.78 48.5" stroke="currentColor" strokeWidth="11" />
      <rect x="32" y="3" width="8" height="8" fill="currentColor" />
      <rect x="46" y="3" width="8" height="8" fill={ACCENT} />
    </g>
  );
}

interface Props {
  /** Rendered height in CSS pixels. */
  readonly height?: number;
}

export function Logo({ height = 26 }: Props) {
  return (
    <svg
      className="logo"
      role="img"
      viewBox={`${VIEW_LEFT} ${VIEW_TOP} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      height={height}
      width={(height * VIEW_WIDTH) / VIEW_HEIGHT}
    >
      <title>{BRAND.name}</title>
      <g transform={`translate(${MARK_LEFT} ${MARK_TOP}) scale(${MARK_SCALE})`}>
        <LogoMark />
      </g>
      <g transform={`translate(${TEXT_X} 0)`}>
        <path d={WORDMARK_INK} fill="currentColor" />
        <path d={WORDMARK_ACCENT} fill={ACCENT} />
      </g>
    </svg>
  );
}
