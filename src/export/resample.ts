/**
 * Big pictures at their output size for PNG/TIFF and thumbnails (note 30).
 * The rasteriser draws the export SVG through an <img>, and Firefox parses a
 * long data URI in it slowly (superlinear: about 2 min for a 20 Mpx, 21 M
 * character picture, half a second for 1.4 M). A raster cannot hold more of a
 * picture's pixels than it covers, so a big picture goes in redrawn at exactly
 * the pixels it covers on the page at the export's DPI. Pictures that are
 * small, or that the raster enlarges, go in as they are. SVG and PDF are not
 * raster and always carry every pixel.
 */
import type { AssetHash, Figure, Page } from '@/core/model/types';
import { walk } from '@/core/model/tree';
import { dataUri, downscalePicture } from '@/io/downscale';
import type { ImageHref } from '@/render/objectToNode';

/** Data (base64 characters) from which a picture is worth redrawing: about 750 KB. */
export const RESAMPLE_MIN_CHARS = 1_000_000;

export interface ResampleJob {
  readonly hash: AssetHash;
  readonly w: number;
  readonly h: number;
}

/**
 * The big pictures on a page drawn at `k` pixels per point that the raster
 * makes smaller, each at the largest size it is drawn at.
 */
export function resamplePlan(figure: Figure, page: Page, k: number): ResampleJob[] {
  const need = new Map<AssetHash, { w: number; h: number }>();
  for (const layer of page.layers) {
    if (!layer.visible) continue;
    for (const o of walk(layer.children)) {
      if (o.type !== 'image' || o.hidden === true) continue;
      const cut = o.crop && o.cropped !== undefined ? o.cropped : undefined;
      const hash = cut !== undefined && figure.assets[cut]?.kind === 'image' ? cut : o.asset;
      const w = Math.max(1, Math.ceil(o.frame.w * k));
      const h = Math.max(1, Math.ceil(o.frame.h * k));
      const was = need.get(hash);
      need.set(hash, { w: Math.max(w, was?.w ?? 0), h: Math.max(h, was?.h ?? 0) });
    }
  }
  const jobs: ResampleJob[] = [];
  for (const [hash, n] of need) {
    const a = figure.assets[hash];
    if (a?.kind !== 'image' || a.dataBase64.length < RESAMPLE_MIN_CHARS) continue;
    const { width, height } = a.meta;
    if (n.w >= width && n.h >= height) continue;
    jobs.push({ hash, w: Math.min(n.w, width), h: Math.min(n.h, height) });
  }
  return jobs;
}

/** The plan's pictures redrawn, as an `ImageHref` for `exportRoot`, or undefined when there are none. */
export async function resampledPictures(
  figure: Figure,
  page: Page,
  k: number,
): Promise<ImageHref | undefined> {
  const jobs = resamplePlan(figure, page, k);
  if (jobs.length === 0) return undefined;
  const hrefs = new Map<AssetHash, string>();
  for (const j of jobs) {
    const a = figure.assets[j.hash];
    if (a?.kind !== 'image') continue;
    try {
      hrefs.set(j.hash, await dataUri(await downscalePicture(a, j.w, j.h)));
    } catch {
      // The rasteriser draws the whole picture instead: slower, same result.
    }
  }
  return (hash) => hrefs.get(hash);
}
