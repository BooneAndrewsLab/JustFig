/**
 * A picture's crop as its own image asset (note 20, issue 46). The export
 * subset has no clipping, so a cropped picture draws these pixels instead of
 * clipping the whole one. A PNG that `decodePng` reads is cut exactly here and
 * stays a PNG; anything else (JPEG, 16-bit or interlaced PNG) is cut by the
 * browser's canvas, a JPEG staying a JPEG (photos would grow several times as
 * PNG) and a PNG staying a PNG.
 *
 * A level crop of a turned picture (issue 48) resamples: `turnPixels` takes
 * the crop of the picture turned by the angle, bilinear, premultiplied, clear
 * where it falls outside the picture (exact at quarter turns). That is a PNG
 * unless a JPEG's crop lies wholly on the picture.
 */
import type { CroppedPicture, ImageAsset, View } from '@/core/edits/crop';
import { cosSin, fromTurned, turnedSize } from '@/core/geometry/turn';
import type { Rect4 } from '@/core/model/types';

import { hashAsset } from './assets';
import { cropPixels } from './pictureClip';
import { type Pixels, base64, decodePng, encodePng, fromBase64 } from './png';

/** JPEG quality for a re-encoded crop of a JPEG: high, it is a second generation. */
const JPEG_QUALITY = 0.95;

const asCropped = (
  src: ImageAsset,
  crop: Rect4,
  mime: string,
  bytes: Uint8Array,
): CroppedPicture => {
  const asset: ImageAsset = {
    kind: 'image',
    mime,
    dataBase64: base64(bytes),
    // No credit: the whole picture, still in the figure, carries it (attribution is derived).
    meta: { name: src.meta.name, width: crop.w, height: crop.h },
  };
  return { hash: hashAsset(asset), asset };
};

async function canvasCrop(src: ImageAsset, crop: Rect4): Promise<CroppedPicture> {
  const bytes = fromBase64(src.dataBase64);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: src.mime }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot crop pictures.');
    ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const jpeg = src.mime === 'image/jpeg';
    const mime = jpeg ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, jpeg ? JPEG_QUALITY : undefined);
    });
    if (!blob) throw new Error('This browser cannot crop pictures.');
    return asCropped(src, crop, mime, new Uint8Array(await blob.arrayBuffer()));
  } finally {
    bitmap.close();
  }
}

/** The pixels `crop` (whole pixels, inside the picture) of a PNG or JPEG asset. */
export async function cropPicture(src: ImageAsset, crop: Rect4): Promise<CroppedPicture> {
  const px = src.mime === 'image/png' ? decodePng(fromBase64(src.dataBase64)) : null;
  if (px?.width === src.meta.width && px.height === src.meta.height) {
    const cut = cropPixels(px, crop.x, crop.y, crop.x + crop.w, crop.y + crop.h);
    return asCropped(src, crop, 'image/png', await encodePng(cut));
  }
  return canvasCrop(src, crop);
}

/**
 * The pixels `crop` of a picture turned by `deg` degrees (`turnedSize`,
 * `toTurned`): each sampled bilinearly at its centre, premultiplied, clear
 * outside the picture. Opaque throughout, a picture without alpha stays so.
 */
export function turnPixels(px: Pixels, deg: number, crop: Rect4): Pixels {
  const { width: W, height: H, channels: ch, data } = px;
  const out = new Uint8Array(crop.w * crop.h * 4);
  const t = turnedSize(W, H, deg);
  const [c, s] = cosSin(deg);
  let opaque = true;
  const acc = [0, 0, 0, 0];
  for (let j = 0; j < crop.h; j++)
    for (let i = 0; i < crop.w; i++) {
      // Inline `fromTurned` for the pixel's centre, then to sample coordinates.
      const dx = crop.x + i + 0.5 - t.w / 2;
      const dy = crop.y + j + 0.5 - t.h / 2;
      const u = W / 2 + c * dx + s * dy - 0.5;
      const v = H / 2 - s * dx + c * dy - 0.5;
      const x0 = Math.floor(u + 1e-9);
      const y0 = Math.floor(v + 1e-9);
      const fx = Math.max(0, u - x0);
      const fy = Math.max(0, v - y0);
      acc.fill(0);
      for (let k = 0; k < 4; k++) {
        const x = x0 + (k & 1);
        const y = y0 + (k >> 1);
        const w = ((k & 1) === 1 ? fx : 1 - fx) * (k >> 1 === 1 ? fy : 1 - fy);
        if (w <= 1e-9 || x < 0 || y < 0 || x >= W || y >= H) continue;
        const o = (y * W + x) * ch;
        const a = ch === 4 ? (data[o + 3] ?? 0) / 255 : 1;
        const wa = w * a;
        acc[0] = (acc[0] ?? 0) + wa * (data[o] ?? 0);
        acc[1] = (acc[1] ?? 0) + wa * (data[o + 1] ?? 0);
        acc[2] = (acc[2] ?? 0) + wa * (data[o + 2] ?? 0);
        acc[3] = (acc[3] ?? 0) + wa;
      }
      const alpha = acc[3] ?? 0;
      const q = (j * crop.w + i) * 4;
      if (alpha > 0) {
        out[q] = Math.round((acc[0] ?? 0) / alpha);
        out[q + 1] = Math.round((acc[1] ?? 0) / alpha);
        out[q + 2] = Math.round((acc[2] ?? 0) / alpha);
      }
      const a8 = Math.round(alpha * 255);
      out[q + 3] = a8;
      if (a8 < 255) opaque = false;
    }
  if (!(opaque && ch === 3)) return { width: crop.w, height: crop.h, channels: 4, data: out };
  const rgb = new Uint8Array(crop.w * crop.h * 3);
  for (let p = 0, q = 0; p < out.length; p += 4, q += 3) rgb.set(out.subarray(p, p + 3), q);
  return { width: crop.w, height: crop.h, channels: 3, data: rgb };
}

/** Whether `crop` of a `w` × `h` picture turned by `deg` lies wholly on the picture. */
export function onPicture(w: number, h: number, deg: number, crop: Rect4): boolean {
  return [
    [crop.x, crop.y],
    [crop.x + crop.w, crop.y],
    [crop.x, crop.y + crop.h],
    [crop.x + crop.w, crop.y + crop.h],
  ].every(([x = 0, y = 0]) => {
    const p = fromTurned(w, h, deg, { x, y });
    return p.x >= -1e-6 && p.y >= -1e-6 && p.x <= w + 1e-6 && p.y <= h + 1e-6;
  });
}

async function canvasTurn(src: ImageAsset, deg: number, crop: Rect4): Promise<CroppedPicture> {
  const bytes = fromBase64(src.dataBase64);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: src.mime }));
  try {
    const { width: W, height: H } = src.meta;
    const t = turnedSize(W, H, deg);
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot crop pictures.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(t.w / 2 - crop.x, t.h / 2 - crop.y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(bitmap, -W / 2, -H / 2, W, H);
    const jpeg = src.mime === 'image/jpeg' && onPicture(W, H, deg, crop);
    const mime = jpeg ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, jpeg ? JPEG_QUALITY : undefined);
    });
    if (!blob) throw new Error('This browser cannot crop pictures.');
    return asCropped(src, crop, mime, new Uint8Array(await blob.arrayBuffer()));
  } finally {
    bitmap.close();
  }
}

/**
 * What a picture shows (`View`: its pixels turned by `turn`, then `crop` of
 * those) as its own asset: a plain crop when not turned, else resampled.
 */
export async function bakeView(src: ImageAsset, view: View): Promise<CroppedPicture> {
  if (view.turn === 0) return cropPicture(src, view.crop);
  const px = src.mime === 'image/png' ? decodePng(fromBase64(src.dataBase64)) : null;
  if (px?.width === src.meta.width && px.height === src.meta.height)
    return asCropped(
      src,
      view.crop,
      'image/png',
      await encodePng(turnPixels(px, view.turn, view.crop)),
    );
  return canvasTurn(src, view.turn, view.crop);
}
