/**
 * Big pictures for PNG/TIFF and thumbnails (notes 30, 32). The rasteriser
 * draws the export SVG through an <img>, and Firefox parses a long data URI
 * in it slowly (superlinear: about 2 min for a 20 Mpx, 21 M character
 * picture, half a second for 1.4 M). So a big picture goes in:
 *
 * - at the pixels it covers when the raster shrinks it (a raster cannot hold
 *   more of a picture than that), its own size otherwise; and
 * - cut into strips of a few hundred thousand characters each, which Firefox
 *   parses in linear time, placed edge to edge in the picture's box by the
 *   one renderer (`PictureStrips`). Each strip overlaps the next by a few
 *   output pixels so antialiased edges never show a seam; that is exact only
 *   for opaque pixels, so a see-through picture goes in whole (slow in
 *   Firefox, as before).
 *
 * Pictures that are small go in as they are. SVG and PDF are not raster and
 * always carry every pixel.
 */
import { type Box, apply, boxOfPoints, frameMatrix } from '@/core/geometry/matrix';
import type { AssetHash, Figure, Frame, Page } from '@/core/model/types';
import { walk } from '@/core/model/tree';
import { canvasOf, canvasPng, dataUri, downscalePicture, withPictureAt } from '@/io/downscale';
import { fromBase64, hasClearPixels } from '@/io/png';
import type { ImageHref, PictureStrips } from '@/render/objectToNode';

/** Data (base64 characters) from which a picture is worth redrawing: about 750 KB. */
export const RESAMPLE_MIN_CHARS = 1_000_000;

/**
 * Characters a strip aims at. Firefox rasterised 20 Mpx in 2.3 - 2.4 s as
 * strips of 190 k or 370 k characters, 4.0 s at 750 k, 12 s at 3 M (note 32).
 */
export const STRIP_CHARS = 250_000;

/** Output pixels each strip reaches under the next one. */
const OVERLAP_PX = 2;
/** At most this many rows of overlap (a tiny copy of a huge picture). */
const MAX_OVERLAP = 64;

export interface RasterJob {
  readonly hash: AssetHash;
  /** Pixel size it goes in at: the largest use on the page, at most its own. */
  readonly w: number;
  readonly h: number;
  /** Whether that is smaller than the picture. */
  readonly resample: boolean;
  /** Rows each strip reaches under the next: `OVERLAP_PX` output pixels at the smallest use. */
  readonly overlap: number;
}

/** The big pictures on a page drawn at `k` pixels per point, and the size each goes in at. */
export function rasterPlan(figure: Figure, page: Page, k: number): RasterJob[] {
  const need = new Map<AssetHash, { w: number; h: number; minH: number }>();
  for (const layer of page.layers) {
    if (!layer.visible) continue;
    for (const o of walk(layer.children)) {
      if (o.type !== 'image' || o.hidden === true) continue;
      const cut = o.crop && o.cropped !== undefined ? o.cropped : undefined;
      const hash = cut !== undefined && figure.assets[cut]?.kind === 'image' ? cut : o.asset;
      const w = Math.max(1, Math.ceil(o.frame.w * k));
      const h = Math.max(1, Math.ceil(o.frame.h * k));
      const was = need.get(hash);
      need.set(hash, {
        w: Math.max(w, was?.w ?? 0),
        h: Math.max(h, was?.h ?? 0),
        minH: Math.min(o.frame.h * k, was?.minH ?? Infinity),
      });
    }
  }
  const jobs: RasterJob[] = [];
  for (const [hash, n] of need) {
    const a = figure.assets[hash];
    if (a?.kind !== 'image' || a.dataBase64.length < RESAMPLE_MIN_CHARS) continue;
    const { width, height } = a.meta;
    const w = Math.min(n.w, width);
    const h = Math.min(n.h, height);
    const rowPx = n.minH / h; // output pixels per row at the smallest use
    const overlap = Math.min(MAX_OVERLAP, Math.max(1, Math.ceil(OVERLAP_PX / rowPx)));
    jobs.push({ hash, w, h, resample: w < width || h < height, overlap });
  }
  return jobs;
}

/** Rows a strip `w` pixels wide holds at `charsPerPixel` (never fewer than `overlap`, at least 1). */
export function stripRows(w: number, charsPerPixel: number, overlap: number): number {
  return Math.max(1, overlap, Math.floor(STRIP_CHARS / (Math.max(charsPerPixel, 1e-3) * w)));
}

/** The strips of `p`, drawn in `frame`, that reach into `box` (page coordinates). */
export function stripsWithin(p: PictureStrips, frame: Frame, box: Box): PictureStrips {
  const m = frameMatrix(frame);
  const k = frame.h / p.height;
  const strips = p.strips.filter((s) => {
    const y0 = s.y * k;
    const y1 = (s.y + s.rows) * k;
    const b = boxOfPoints([
      apply(m, { x: 0, y: y0 }),
      apply(m, { x: frame.w, y: y0 }),
      apply(m, { x: 0, y: y1 }),
      apply(m, { x: frame.w, y: y1 }),
    ]);
    return b.x <= box.x + box.w && b.x + b.w >= box.x && b.y <= box.y + box.h && b.y + b.h >= box.y;
  });
  return { height: p.height, strips };
}

/** First guess of a re-encoded strip's characters per pixel (RGBA PNG); later strips use the last one's. */
const FIRST_GUESS = 4;

/** The picture at the job's size cut into strips (browser only). */
async function cutStrips(
  a: Extract<Figure['assets'][string], { kind: 'image' }>,
  job: RasterJob,
): Promise<PictureStrips> {
  return withPictureAt(a, job.w, job.h, async (image) => {
    const strips: { y: number; rows: number; href: string }[] = [];
    let rows = stripRows(job.w, FIRST_GUESS, job.overlap);
    for (let y = 0; y < job.h;) {
      const own = Math.min(rows, job.h - y);
      const take = Math.min(own + job.overlap, job.h - y);
      const [canvas, ctx] = canvasOf(job.w, take);
      try {
        ctx.drawImage(image, 0, y, job.w, take, 0, 0, job.w, take);
        const href = await dataUri(await canvasPng(canvas));
        strips.push({ y, rows: take, href });
        rows = stripRows(job.w, href.length / (job.w * take), job.overlap);
      } finally {
        canvas.width = 0;
      }
      y += own;
    }
    return { height: job.h, strips };
  });
}

/** Pixels up to which a picture's copy goes in whole: a strip's worth at 2 characters a pixel. */
const SMALL_PIXELS = STRIP_CHARS / 2;

const opaqueCache = new WeakMap<object, boolean>();

/** Whether no pixel of the picture is see-through (decodes an RGBA PNG once per asset). */
function opaque(a: Extract<Figure['assets'][string], { kind: 'image' }>): boolean {
  let v = opaqueCache.get(a);
  if (v === undefined) {
    v = !hasClearPixels(fromBase64(a.dataBase64));
    opaqueCache.set(a, v);
  }
  return v;
}

export interface RasterPictures {
  /** Every big picture's stand-in, or undefined when there are none. */
  readonly href: ImageHref | undefined;
  /** Whether a picture went in as strips (so a band may leave some out). */
  readonly striped: boolean;
  /** As `href`, with only the strips that reach into `box` (page coordinates). */
  readonly within: (box: Box) => ImageHref | undefined;
}

/** The page's big pictures as they go into a raster at `k` pixels per point. */
export async function rasterPictures(
  figure: Figure,
  page: Page,
  k: number,
): Promise<RasterPictures> {
  const hrefs = new Map<AssetHash, string | PictureStrips>();
  for (const j of rasterPlan(figure, page, k)) {
    const a = figure.assets[j.hash];
    if (a?.kind !== 'image') continue;
    try {
      // A small copy (a thumbnail's) is one short data URI anyway.
      const small = j.w * j.h <= SMALL_PIXELS;
      if (!small && opaque(a)) hrefs.set(j.hash, await cutStrips(a, j));
      else if (j.resample) hrefs.set(j.hash, await dataUri(await downscalePicture(a, j.w, j.h)));
    } catch {
      // The rasteriser draws the whole picture instead: slower, same result.
    }
  }
  if (hrefs.size === 0) return { href: undefined, striped: false, within: () => undefined };
  const href: ImageHref = (hash) => hrefs.get(hash);
  return {
    href,
    striped: [...hrefs.values()].some((v) => typeof v === 'object'),
    within: (box) => (hash, _a, frame) => {
      const v = hrefs.get(hash);
      return typeof v === 'object' ? stripsWithin(v, frame, box) : v;
    },
  };
}
