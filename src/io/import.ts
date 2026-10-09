/**
 * Importing SVG, PDF, PNG and JPEG files (note 02): each becomes an embedded
 * asset (the file stays self-contained) and an `image` object. SVGs go
 * through the same sanitiser as icons, so they stay vector in every
 * export, and are tidied up as plots (note 12); a PDF page is converted to
 * SVG first and then takes the same path (note 13); rasters keep their bytes.
 * A plot's embedded pictures come out as pictures of their own, placed
 * under it (issue 24).
 */
import type { Asset, Frame } from '@/core/model/types';
import { el, nodeToSvgString } from '@/render/svgNode';

import { hashAsset } from './assets';
import { base64, imageSize } from './png';
import { fmt } from './svg/matrix';
import { SvgImportError, sanitizeSvg } from './svg/sanitize';
import type { PlotImage } from './svg/plotImages';

/** A picture from inside an imported plot, placed with it (issue 24). */
export interface ImportedPicture {
  readonly hash: string;
  readonly asset: Extract<Asset, { kind: 'image' }>;
  /** Relative to the plot's top-left as placed, points. */
  readonly frame: Frame;
  readonly opacity: number;
  /**
   * What the plot drew under a see-through picture, inside its box (issue
   * 35): a small `svgImport` placed right under it, frame as `frame`'s box.
   */
  readonly backdrop?: {
    readonly hash: string;
    readonly asset: Extract<Asset, { kind: 'svgImport' }>;
    readonly frame: Frame;
  };
}

export interface Imported {
  readonly hash: string;
  readonly asset: Asset;
  /** Natural size to place it at, points. */
  readonly w: number;
  readonly h: number;
  readonly warnings: readonly string[];
  /** Pictures that were inside the plot, to be drawn under it in drawing order. */
  readonly pictures?: readonly ImportedPicture[];
}

/** Longest side a newly placed import gets, points (~106 mm). */
export const MAX_PLACE = 300;

export { imageSize };

const fit = (w: number, h: number): { w: number; h: number } => {
  const k = Math.min(1, MAX_PLACE / Math.max(w, h, 1));
  return { w: w * k, h: h * k };
};

/**
 * An SVG file as an `svgImport` asset. `plot` (the default) also cleans it
 * up as a plot from matplotlib, R and the like (note 12): background gone,
 * split labels merged, transforms baked, cropped to the drawing.
 */
export function importSvgText(text: string, name: string, { plot = true } = {}): Imported {
  const s = sanitizeSvg(text, { plot });
  const svg = nodeToSvgString(
    el('svg', { xmlns: 'http://www.w3.org/2000/svg', ...s.root.attrs }, s.root.children),
  );
  // SVG user units are CSS pixels: 0.75 pt each.
  const size = fit(s.viewBox[2] * 0.75, s.viewBox[3] * 0.75);
  const asset: Asset = { kind: 'svgImport', svg, meta: { name, width: size.w, height: size.h } };
  const k = size.w / s.viewBox[2];
  const warnings = new Set(s.warnings);
  const pictures = (s.images ?? []).map((p, i) => {
    const picture = placedPicture(p, k, s.viewBox, `${name} (picture ${String(i + 1)})`);
    if (picture.slanted) warnings.add('A slanted picture was placed without its slant.');
    return picture.picture;
  });
  return {
    hash: hashAsset(asset),
    asset,
    ...size,
    warnings: [...warnings],
    ...(pictures.length > 0 ? { pictures } : {}),
  };
}

/**
 * A picture taken out of a plot as an image asset and the frame that shows
 * it where it was, `k` points per plot unit from the viewBox's top-left: the
 * matrix's columns give its size, rotation and a flip (a mirror becomes
 * `flipY`); a slant cannot be shown by a frame and is dropped.
 */
function placedPicture(
  p: PlotImage,
  k: number,
  vb: readonly [number, number, number, number],
  name: string,
): { picture: ImportedPicture; slanted: boolean } {
  const m = p.matrix;
  const w = Math.hypot(m[0], m[1]) * k;
  const h = Math.hypot(m[2], m[3]) * k;
  const det = m[0] * m[3] - m[1] * m[2];
  const cx = (m[4] + (m[0] + m[2]) / 2 - vb[0]) * k;
  const cy = (m[5] + (m[1] + m[3]) / 2 - vb[1]) * k;
  const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const rotation = Math.abs(rot) < 1e-9 ? 0 : rot;
  const slanted =
    Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-3 * Math.hypot(m[0], m[1]) * Math.hypot(m[2], m[3]);
  const asset: ImportedPicture['asset'] = {
    kind: 'image',
    mime: p.mime,
    dataBase64: p.dataBase64,
    meta: { name, width: p.width, height: p.height },
  };
  const frame: Frame = {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    rotation,
    ...(det < 0 ? { flipY: true } : {}),
  };
  const picture: ImportedPicture = { hash: hashAsset(asset), asset, frame, opacity: p.opacity };
  if (!p.backdrop) return { picture, slanted };
  const [x0, y0, x1, y1] = p.backdrop.box;
  // Sanitised, so the stored SVG is exactly what rendering will parse it into.
  const tidy = sanitizeSvg(
    nodeToSvgString(
      el('svg', { viewBox: [x0, y0, x1 - x0, y1 - y0].map(fmt).join(' ') }, p.backdrop.nodes),
    ),
  ).root;
  const svg = nodeToSvgString(
    el('svg', { xmlns: 'http://www.w3.org/2000/svg', ...tidy.attrs }, tidy.children),
  );
  const back: Extract<Asset, { kind: 'svgImport' }> = {
    kind: 'svgImport',
    svg,
    meta: { name: `${name} backdrop`, width: (x1 - x0) * k, height: (y1 - y0) * k },
  };
  const backFrame: Frame = {
    x: (x0 - vb[0]) * k,
    y: (y0 - vb[1]) * k,
    w: (x1 - x0) * k,
    h: (y1 - y0) * k,
    rotation: 0,
  };
  return {
    picture: { ...picture, backdrop: { hash: hashAsset(back), asset: back, frame: backFrame } },
    slanted,
  };
}

export function importRaster(bytes: Uint8Array, name: string): Imported {
  const info = imageSize(bytes);
  if (!info) throw new SvgImportError('Only SVG, PDF, PNG and JPEG files can be imported.');
  const asset: Asset = {
    kind: 'image',
    mime: info.mime,
    dataBase64: base64(bytes),
    meta: { name, width: info.width, height: info.height },
  };
  return {
    hash: hashAsset(asset),
    asset,
    ...fit(info.width * 0.75, info.height * 0.75),
    warnings: [],
  };
}

export interface PdfPageChoice {
  readonly number: number;
  /** Points. */
  readonly width: number;
  readonly height: number;
}

/** Asks which page of a multi-page PDF to import; null cancels. */
export type ChoosePdfPage = (
  pages: readonly PdfPageChoice[],
  preview: (number: number) => Promise<Imported>,
) => Promise<number | null>;

export const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length > 4 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46;

/**
 * A PDF page as an `svgImport` asset, cleaned up as a plot like an SVG
 * file (note 13). pdf.js is loaded here, on first use, not with the app.
 * A file with several pages asks `choosePage` which one; without it, or
 * for one page, the first is taken. Null when the choice is cancelled.
 */
export async function importPdf(
  bytes: Uint8Array,
  name: string,
  choosePage?: ChoosePdfPage,
): Promise<Imported | null> {
  const { openPdf } = await import('./pdf/loadPdf');
  const pdf = await openPdf(bytes);
  try {
    const convert = async (n: number): Promise<Imported> => {
      const page = await pdf.pageSvg(n);
      const label = pdf.pages.length > 1 ? `${name} (page ${String(n)})` : name;
      const imp = importSvgText(page.svg, label);
      return { ...imp, warnings: [...page.warnings, ...imp.warnings] };
    };
    if (pdf.pages.length === 0) throw new SvgImportError('This PDF has no pages.');
    const n = pdf.pages.length > 1 && choosePage ? await choosePage(pdf.pages, convert) : 1;
    return n === null ? null : await convert(n);
  } finally {
    await pdf.close();
  }
}

export async function importFile(
  file: File,
  opts: { choosePdfPage?: ChoosePdfPage } = {},
): Promise<Imported | null> {
  const lower = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || lower.endsWith('.svg'))
    return importSvgText(await file.text(), file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'application/pdf' || lower.endsWith('.pdf') || isPdf(bytes))
    return importPdf(bytes, file.name, opts.choosePdfPage);
  return importRaster(bytes, file.name);
}
