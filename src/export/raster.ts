/**
 * PNG and TIFF export (note 03): the outline-mode export SVG (no fonts to
 * load, images already data URIs, nothing external, so Safari does not
 * taint the canvas) drawn through an <img> onto a canvas at the chosen
 * DPI. Main thread: only a document can decode SVG into an image.
 */
import { BRAND } from '@/brand';
import type { Figure, Page } from '@/core/model/types';
import { nodeToSvgString } from '@/render/svgNode';

import { pHYs, tEXt, withChunks } from './png';
import { exportRoot } from './svg';
import { encodeTiff } from './tiff';

/** Safari's practical canvas cap (~16.7 Mpx); larger exports are refused with advice. */
export const MAX_PIXELS = 16_777_216;

export interface RasterOptions {
  readonly dpi: number;
  readonly transparent: boolean;
  readonly footer: boolean;
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
  });
  const k = opts.dpi / 72;
  return {
    w: Math.max(1, Math.round(root.width * k)),
    h: Math.max(1, Math.round(root.height * k)),
  };
}

export function maxDpiFor(figure: Figure, page: Page, opts: RasterOptions): number {
  const { w, h } = rasterSize(figure, page, { ...opts, dpi: 72 });
  return Math.floor(72 * Math.sqrt(MAX_PIXELS / (w * h)));
}

/** The page drawn on a canvas at the DPI. */
export async function renderCanvas(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
): Promise<HTMLCanvasElement> {
  const root = exportRoot(figure, page, {
    textMode: 'outline',
    footer: opts.footer,
    background: !opts.transparent,
  });
  const k = opts.dpi / 72;
  const w = Math.max(1, Math.round(root.width * k));
  const h = Math.max(1, Math.round(root.height * k));
  if (w * h > MAX_PIXELS) {
    throw new RasterTooLargeError(
      `At ${String(opts.dpi)} dpi this page is ${String(w)} × ${String(h)} pixels, more than browsers can draw. ` +
        `Use at most ${String(maxDpiFor(figure, page, opts))} dpi, or export PDF or SVG.`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
    `width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(root.width)} ${String(root.height)}" preserveAspectRatio="none">` +
    `${nodeToSvgString(root.node, { stripData: true })}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
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
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas in this browser.');
    if (!opts.transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  version: string,
): Promise<Uint8Array> {
  const canvas = await renderCanvas(figure, page, opts);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('PNG encoding failed.'));
    }, 'image/png');
  });
  const png = new Uint8Array(await blob.arrayBuffer());
  return withChunks(png, [pHYs(opts.dpi), tEXt('Software', `${BRAND.name} ${version}`)]);
}

export async function exportTiff(
  figure: Figure,
  page: Page,
  opts: RasterOptions,
  version: string,
): Promise<Uint8Array> {
  const canvas = await renderCanvas(figure, page, opts);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas in this browser.');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return encodeTiff(data, {
    width: canvas.width,
    height: canvas.height,
    dpi: opts.dpi,
    alpha: opts.transparent,
    software: `${BRAND.name} ${version}`,
  });
}
