/**
 * A picture's crop as its own image asset (note 20, issue 46). The export
 * subset has no clipping, so a cropped picture draws these pixels instead of
 * clipping the whole one. A PNG that `decodePng` reads is cut exactly here and
 * stays a PNG; anything else (JPEG, 16-bit or interlaced PNG) is cut by the
 * browser's canvas, a JPEG staying a JPEG (photos would grow several times as
 * PNG) and a PNG staying a PNG.
 */
import type { CroppedPicture, ImageAsset } from '@/core/edits/crop';
import type { Rect4 } from '@/core/model/types';

import { hashAsset } from './assets';
import { cropPixels } from './pictureClip';
import { base64, decodePng, encodePng, fromBase64 } from './png';

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
