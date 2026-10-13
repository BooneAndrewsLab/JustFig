/**
 * SVG export (note 03), and the export root every format starts from: the
 * page, plus the credit-line footer when asked (on by default), as one
 * SvgNode in the export subset.
 */
import { BRAND } from '@/brand';
import { creditLine, licenceLinks, pageCreditItems } from '@/core/attribution/attribution';
import { createText, defaultRun } from '@/core/model/factory';
import type { Figure, FontId, Page } from '@/core/model/types';
import { FAMILY_FALLBACK, FAMILY_NAME } from '@/core/text/fonts';
import { layoutText } from '@/core/text/layout';
import type { Box } from '@/core/geometry/matrix';
import { ptToMm } from '@/core/units';
import { type ImageHref, type TextMode, pageToNode, textNodes } from '@/render/objectToNode';
import { type SvgNode, el, nodeToSvgString, num } from '@/render/svgNode';

export interface ExportOptions {
  readonly textMode: TextMode;
  /** Append the credit line under the page (note 03; default on). */
  readonly footer: boolean;
  /** Draw the page background; off = transparent (PNG/TIFF). */
  readonly background: boolean;
  /**
   * Export only this rectangle of the page (a panel's bounds, note 03): the
   * root takes its size and origin, objects straddling its edge are cut by the
   * viewport, and there is no footer (the credit goes in the metadata).
   */
  readonly crop?: Box;
  /** Pictures' stand-ins: a raster's copies at output size (note 30). Never for SVG or PDF pixels. */
  readonly imageHref?: ImageHref | undefined;
}

export const FOOTER_SIZE = 6;
export const FOOTER_MARGIN = 4;

export interface ExportRoot {
  /** Page content and footer, in points. */
  readonly node: SvgNode;
  readonly width: number;
  readonly height: number;
  /** The credit line used (empty when none). */
  readonly credit: string;
  /** Top-left of the visible area in the node's coordinates (the crop's, else 0 0). */
  readonly x: number;
  readonly y: number;
}

export function pageCredit(figure: Figure, page: Page): string {
  return creditLine(pageCreditItems(page, figure.assets), BRAND.name);
}

/** The page's credit line plus its licence links, for metadata and credits.txt. */
export function pageCreditWithLinks(figure: Figure, page: Page): string {
  const items = pageCreditItems(page, figure.assets);
  const credit = creditLine(items, BRAND.name);
  return credit === '' ? '' : [credit, licenceLinks(items)].filter((s) => s !== '').join(' ');
}

function footerNode(
  credit: string,
  width: number,
  top: number,
  mode: TextMode,
): { node: SvgNode; height: number } {
  const t = {
    ...createText(0, 0, [[defaultRun(credit, { size: FOOTER_SIZE, color: { hex: '#52606d' } })]]),
    autoWidth: false,
  };
  const layout = layoutText({ ...t, frame: { ...t.frame, w: width - 2 * FOOTER_MARGIN } });
  const height = layout.height + 2 * FOOTER_MARGIN;
  return {
    node: el(
      'g',
      { transform: `translate(${num(FOOTER_MARGIN)} ${num(top + FOOTER_MARGIN)})` },
      textNodes(layout, mode, { palette: [] }),
    ),
    height,
  };
}

export function exportRoot(figure: Figure, page: Page, opts: ExportOptions): ExportRoot {
  const body = pageToNode(page, figure.doc, figure.assets, {
    textMode: opts.textMode,
    screen: false,
    background: opts.background,
    imageHref: opts.imageHref,
  });
  const credit = pageCredit(figure, page);
  if (opts.crop) {
    const c = opts.crop;
    return { node: body, width: c.w, height: c.h, credit, x: c.x, y: c.y };
  }
  const { w, h } = page.size;
  if (!opts.footer || credit === '') return { node: body, width: w, height: h, credit, x: 0, y: 0 };
  const footer = footerNode(credit, w, h, opts.textMode);
  const bg = opts.background
    ? [el('rect', { x: 0, y: h, width: w, height: footer.height, fill: '#ffffff' })]
    : [];
  return {
    node: el('g', {}, [body, ...bg, footer.node]),
    width: w,
    height: h + footer.height,
    credit,
    x: 0,
    y: 0,
  };
}

/** Font-family lists with metric-compatible fallbacks, for editors without our fonts (note 03). */
function withFallbacks(n: SvgNode): SvgNode {
  const fam = n.attrs['font-family'];
  const byName = Object.entries(FAMILY_NAME).find(([, v]) => v === fam);
  const attrs = byName
    ? { ...n.attrs, 'font-family': FAMILY_FALLBACK[byName[0] as FontId] }
    : n.attrs;
  return el(
    n.tag,
    attrs,
    n.children.map((c) => (typeof c === 'string' ? c : withFallbacks(c))),
  );
}

/** The standalone SVG document text. */
export function exportSvg(
  figure: Figure,
  page: Page,
  opts: ExportOptions,
  version: string,
): string {
  const root = exportRoot(figure, page, opts);
  const credit = root.credit ? pageCreditWithLinks(figure, page) : '';
  const meta = `${BRAND.name} ${version}${credit ? `. ${credit}` : ''}`;
  const svg = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      version: '1.1',
      width: `${num(ptToMm(root.width))}mm`,
      height: `${num(ptToMm(root.height))}mm`,
      viewBox: `${num(root.x)} ${num(root.y)} ${num(root.width)} ${num(root.height)}`,
    },
    [el('metadata', {}, [meta]), opts.textMode === 'text' ? withFallbacks(root.node) : root.node],
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${nodeToSvgString(svg, { stripData: true })}\n`;
}
