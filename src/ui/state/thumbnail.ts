/**
 * Recent-figures thumbnail (note 02): the first page through the normal
 * raster pipeline at a size that makes the canvas about 160 px wide, kept as a
 * JPEG data URL (a few kilobytes). Cost is bounded by the size, not the figure.
 */
import type { Figure } from '@/core/model/types';
import { renderCanvas } from '@/export/raster';

export const THUMB_WIDTH = 160;

export async function renderThumbnail(f: Figure): Promise<string | null> {
  const page = f.doc.pages[0];
  if (!page || page.size.w <= 0) return null;
  const canvas = await renderCanvas(f, page, {
    dpi: (72 * THUMB_WIDTH) / page.size.w,
    transparent: false,
    footer: false,
  });
  return canvas.toDataURL('image/jpeg', 0.75);
}
