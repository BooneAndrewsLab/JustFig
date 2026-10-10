/**
 * A picture redrawn smaller by the browser's canvas (note 30): the screen's
 * working copy of a big picture and a raster export's copy at its output
 * size. Halved step by step before the last draw, so a large reduction
 * averages every source pixel instead of skipping most of them. Always a
 * PNG: lossless, alpha kept.
 */
import type { ImageAsset } from '@/core/edits/crop';

import { fromBase64 } from './png';

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [canvas, ctx];
}

/** The picture at `w` x `h` pixels (each at most its own size), as a PNG blob. */
export async function downscalePicture(src: ImageAsset, w: number, h: number): Promise<Blob> {
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(fromBase64(src.dataBase64))], { type: src.mime }),
  );
  try {
    let from: CanvasImageSource = bitmap;
    let fw = bitmap.width;
    let fh = bitmap.height;
    while (fw >= w * 2 && fh >= h * 2) {
      const [c, ctx] = canvasOf(Math.ceil(fw / 2), Math.ceil(fh / 2));
      ctx.drawImage(from, 0, 0, c.width, c.height);
      if (from instanceof HTMLCanvasElement) from.width = 0;
      from = c;
      fw = c.width;
      fh = c.height;
    }
    const [canvas, ctx] = canvasOf(w, h);
    ctx.drawImage(from, 0, 0, w, h);
    if (from instanceof HTMLCanvasElement) from.width = 0;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    canvas.width = 0;
    if (!blob) throw new Error('This browser cannot redraw pictures.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** A blob as a data URI (the browser's encoder: fast for large blobs). */
export function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read the picture.'));
    };
    reader.readAsDataURL(blob);
  });
}
