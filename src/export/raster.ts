/**
 * PNG and TIFF export (note 03): the outline-mode export SVG (no fonts to
 * load, images already data URIs, nothing external, so Safari does not
 * taint the canvas) drawn through an <img> onto a canvas at the chosen
 * DPI. Main thread: only a document can decode SVG into an image. Big
 * pictures go in redrawn at the pixels they cover (note 30), cut into
 * strips; a band leaves out the strips outside it (note 32).
 */
import { BRAND } from '@/brand';
import type { Box } from '@/core/geometry/matrix';
import type { Figure, Page } from '@/core/model/types';
import { nodeToSvgString } from '@/render/svgNode';

import { pHYs, tEXt, withChunks } from './png';
import { pngEncoder, tiffEncoder } from './pngEncoder';
import { type RasterPictures, rasterPictures } from './resample';
import { exportRoot } from './svg';
import {
  MAX_PIXELS,
  MAX_SIDE,
  MAX_TOTAL_PIXELS,
  maxDpiForSize,
  planBands,
  rasterLimit,
} from './tiles';

export { MAX_PIXELS, MAX_TOTAL_PIXELS, rasterLimit };

export interface RasterOptions {
  readonly dpi: number;
  readonly transparent: boolean;
  readonly footer: boolean;
  /** Only this rectangle of the page (a panel), see `ExportOptions.crop`. */
  readonly crop?: Box;
}

export class RasterTooLargeError extends Error {
  override readonly name = 'RasterTooLargeError';
}

/** Pixel size of a page export at a DPI, footer included. */
export function rasterSize(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
): { w: number; h: number } {
  const root = exportRoot(figure, page, {
    textMode: 'outline',
    footer: opts.footer,
    background: !opts.transparent,
    ...(opts.crop ? { crop: opts.crop } : {}),
  });
  const k = opts.dpi / 72;
  return {
    w: Math.max(1, Math.round(root.width * k)),
    h: Math.max(1, Math.round(root.height * k)),
  };
}

export function maxDpiFor(figure: Figure, page: Page, opts: RasterOptions): number {
  const { w, h } = rasterSize(figure, page, { ...opts, dpi: 72 });
  return maxDpiForSize(w, h);
}

/** The refusal for a page too large even for tiles, with advice, or null. */
export function rasterLimitMessage(figure: Figure, page: Page, opts: RasterOptions): string | null {
  const { w, h } = rasterSize(figure, page, opts);
  if (!rasterLimit(w, h)) return null;
  return (
    `At ${String(opts.dpi)} dpi this page is ${String(w)} × ${String(h)} pixels, more than can be exported. ` +
    `Use at most ${String(maxDpiFor(figure, page, opts))} dpi, or export PDF or SVG.`
  );
}

type Root = ReturnType<typeof exportRoot>;

/** Rows y0 .. y0 + rows of the w × h page drawn on a canvas of their own. */
async function drawBand(
  root: Root,
  w: number,
  h: number,
  y0: number,
  rows: number,
  transparent: boolean,
): Promise<HTMLCanvasElement> {
  const ky = h / root.height;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
    `width="${String(w)}" height="${String(rows)}" viewBox="${String(root.x)} ${String(root.y + y0 / ky)} ${String(root.width)} ${String(rows / ky)}" preserveAspectRatio="none">` +
    `${nodeToSvgString(root.node, { stripData: true })}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = w;
    img.height = rows;
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => {
        resolve();
      };
      img.onerror = () => {
        reject(new Error('The browser could not draw the figure.'));
      };
    });
    img.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas in this browser.');
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, rows);
    }
    ctx.drawImage(img, 0, 0, w, rows);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The page's export root, big pictures as `imageHref` gives them (notes 30, 32). */
function pageRoot(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  imageHref: RasterPictures['href'],
): Root {
  return exportRoot(figure, page, {
    textMode: 'outline',
    footer: opts.footer,
    background: !opts.transparent,
    ...(opts.crop ? { crop: opts.crop } : {}),
    imageHref,
  });
}

/** Rows y0 .. y0 + rows of the raster in page coordinates, a few pixels wider each way. */
export function bandBox(
  root: Pick<Root, 'x' | 'y' | 'width'>,
  ky: number,
  y0: number,
  rows: number,
): Box {
  const pad = 4 / ky;
  return {
    x: root.x - pad,
    y: root.y + y0 / ky - pad,
    w: root.width + 2 * pad,
    h: rows / ky + 2 * pad,
  };
}

/** The page drawn on one canvas at the DPI (thumbnails; exports use bands). */
export async function renderCanvas(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
): Promise<HTMLCanvasElement> {
  const pictures = await rasterPictures(figure, page, opts.dpi / 72);
  const root = pageRoot(figure, page, opts, pictures.href);
  const k = opts.dpi / 72;
  const w = Math.max(1, Math.round(root.width * k));
  const h = Math.max(1, Math.round(root.height * k));
  if (w * h > MAX_PIXELS || w > MAX_SIDE || h > MAX_SIDE) {
    throw new RasterTooLargeError(
      `At ${String(opts.dpi)} dpi this page is ${String(w)} × ${String(h)} pixels, more than one canvas can hold.`,
    );
  }
  return drawBand(root, w, h, 0, h, opts.transparent);
}

/**
 * Draws the page in bands under the canvas cap and hands each band's RGBA rows,
 * top to bottom, to `onBand`. Only one band is alive at a time.
 */
export async function renderBands(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  onBand: (rgba: Uint8ClampedArray) => void | Promise<void>,
  maxPixels: number = MAX_PIXELS,
): Promise<{ w: number; h: number }> {
  const limit = rasterLimitMessage(figure, page, opts);
  if (limit) throw new RasterTooLargeError(limit);
  const pictures = await rasterPictures(figure, page, opts.dpi / 72);
  const root = pageRoot(figure, page, opts, pictures.href);
  const k = opts.dpi / 72;
  const w = Math.max(1, Math.round(root.width * k));
  const h = Math.max(1, Math.round(root.height * k));
  const bands = planBands(w, h, maxPixels);
  const ky = h / root.height;
  for (const band of bands) {
    // Each band's SVG is parsed on its own: leave out the strips it does not reach.
    const own =
      pictures.striped && bands.length > 1
        ? pageRoot(figure, page, opts, pictures.within(bandBox(root, ky, band.y0, band.rows)))
        : root;
    const canvas = await drawBand(own, w, h, band.y0, band.rows, opts.transparent);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas in this browser.');
    await onBand(ctx.getImageData(0, 0, w, band.rows).data);
    canvas.width = 0; // let the browser free the band's memory
  }
  return { w, h };
}

export async function exportPng(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  version: string,
): Promise<Uint8Array> {
  const software = `${BRAND.name} ${version}`;
  const { w, h } = rasterSize(figure, page, opts);
  if (w * h <= MAX_PIXELS && w <= MAX_SIDE && h <= MAX_SIDE) {
    // One canvas holds it: the browser's own PNG encoder is the fastest.
    const canvas = await renderCanvas(figure, page, opts);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('PNG encoding failed.'));
      }, 'image/png');
    });
    const png = new Uint8Array(await blob.arrayBuffer());
    return withChunks(png, [pHYs(opts.dpi), tEXt('Software', software)]);
  }
  const encoder = pngEncoder({
    width: w,
    height: h,
    dpi: opts.dpi,
    alpha: opts.transparent,
    software,
  });
  try {
    await renderBands(figure, page, opts, (rgba) => encoder.push(rgba));
  } catch (e) {
    encoder.abort?.();
    throw e;
  }
  return encoder.finish();
}

export async function exportTiff(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  version: string,
): Promise<Uint8Array> {
  const { w, h } = rasterSize(figure, page, opts);
  const encoder = tiffEncoder({
    width: w,
    height: h,
    dpi: opts.dpi,
    alpha: opts.transparent,
    software: `${BRAND.name} ${version}`,
  });
  try {
    await renderBands(figure, page, opts, (rgba) => encoder.push(rgba));
  } catch (e) {
    encoder.abort?.();
    throw e;
  }
  return encoder.finish();
}
