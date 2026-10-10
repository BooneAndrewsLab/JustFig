/**
 * Merged channels (note 21, issue 45): single-channel pictures of one field,
 * each shown in a colour over its display range and added together, baked to
 * a PNG asset (the export subset has no blend modes or filters). The blend is
 * pure on pixel arrays so it is tested exactly; decoding and encoding are the
 * browser's (a PNG that `decodePng` reads is decoded here, exactly).
 */
import type { CroppedPicture, ImageAsset } from '@/core/edits/crop';
import type { Channel } from '@/core/model/types';

import { hashAsset } from './assets';
import { type Pixels, base64, decodeGrey16Png, decodePng, encodePng, fromBase64 } from './png';

/** One channel's intensities (0–255), rows top first. */
export interface Intensities {
  readonly width: number;
  readonly height: number;
  readonly values: Uint8Array;
}

/** A channel to blend: intensities, colour and display range. */
export interface BlendLayer {
  readonly values: Uint8Array;
  readonly color: string;
  readonly min: number;
  readonly max: number;
}

/** A pixel's intensity is its brightest of R, G, B, so a channel saved pre-coloured reads right. */
export function intensities(px: Pixels): Intensities {
  const n = px.width * px.height;
  const ch = px.channels;
  const values = new Uint8Array(n);
  const d = px.data;
  for (let i = 0, j = 0; i < n; i++, j += ch)
    values[i] = Math.max(d[j] ?? 0, d[j + 1] ?? 0, d[j + 2] ?? 0);
  return { width: px.width, height: px.height, values };
}

/** Intensity → brightness (0–255): black at or below `min`, full at or above `max`, linear between. */
export function levelTable(min: number, max: number): Uint8Array {
  const t = new Uint8Array(256);
  for (let v = 0; v < 256; v++)
    t[v] =
      max <= min
        ? v > min
          ? 255
          : 0
        : v <= min
          ? 0
          : v >= max
            ? 255
            : Math.round(((v - min) * 255) / (max - min));
  return t;
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};

/**
 * The additive pseudocolour merge, 8-bit RGB: each output component is
 * `min(255, round(Σ brightness × colour / 255))` over the layers. No layers:
 * black.
 */
export function blendChannels(
  width: number,
  height: number,
  layers: readonly BlendLayer[],
): Pixels {
  const n = width * height;
  const sum = new Uint32Array(n * 3);
  for (const l of layers) {
    const t = levelTable(l.min, l.max);
    const [r, g, b] = rgb(l.color);
    for (let i = 0; i < n; i++) {
      const v = t[l.values[i] ?? 0] ?? 0;
      if (v === 0) continue;
      const k = i * 3;
      sum[k] = (sum[k] ?? 0) + v * r;
      sum[k + 1] = (sum[k + 1] ?? 0) + v * g;
      sum[k + 2] = (sum[k + 2] ?? 0) + v * b;
    }
  }
  const data = new Uint8Array(n * 3);
  // 255 is odd, so a sum / 255 is never a tie: Math.round is exact.
  for (let k = 0; k < n * 3; k++) data[k] = Math.min(255, Math.round((sum[k] ?? 0) / 255));
  return { width, height, channels: 3, data };
}

/** Every `step`-th pixel each way (nearest), for a quick preview of a large picture. */
export function downsample(src: Intensities, maxSide: number): Intensities {
  const step = Math.max(1, Math.ceil(Math.max(src.width, src.height) / maxSide));
  if (step === 1) return src;
  const width = Math.ceil(src.width / step);
  const height = Math.ceil(src.height / step);
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      values[y * width + x] = src.values[y * step * src.width + x * step] ?? 0;
  return { width, height, values };
}

export async function canvasPixels(a: ImageAsset): Promise<Pixels> {
  const bytes = fromBase64(a.dataBase64);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: a.mime }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot merge channels.');
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: img.width,
      height: img.height,
      channels: 4,
      data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    };
  } finally {
    bitmap.close();
  }
}

/** A PNG or JPEG channel's intensities: exactly for a PNG `decodePng` reads, else by canvas. */
export async function channelIntensities(a: ImageAsset): Promise<Intensities> {
  const peak = a.meta.peak;
  if (peak !== undefined) {
    // A 16-bit source (note 43): the whole range, brightest sample = 255.
    const g = decodeGrey16Png(fromBase64(a.dataBase64));
    if (!g) throw new Error('A 16-bit channel could not be read.');
    const values = new Uint8Array(g.values.length);
    for (let i = 0; i < values.length; i++)
      values[i] = Math.round((Math.min(g.values[i] ?? 0, peak) * 255) / peak);
    return { width: g.width, height: g.height, values };
  }
  const px = a.mime === 'image/png' ? decodePng(fromBase64(a.dataBase64)) : null;
  if (px?.width === a.meta.width && px.height === a.meta.height) return intensities(px);
  return intensities(await canvasPixels(a));
}

/** The layers a merge adds: the channels turned on. */
export const layersOf = (
  channels: readonly Channel[],
  pixels: (asset: string) => Intensities | undefined,
): BlendLayer[] =>
  channels.flatMap((c) => {
    const p = c.on ? pixels(c.asset) : undefined;
    return p ? [{ values: p.values, color: c.color, min: c.min, max: c.max }] : [];
  });

/**
 * The merged picture as a PNG asset. `pixels` holds every channel's
 * intensities at the merge's size; `meta` names it (and keeps a credit typed
 * on an earlier merge).
 */
export async function bakeMerge(
  channels: readonly Channel[],
  pixels: (asset: string) => Intensities | undefined,
  meta: { name: string; credit?: string; width: number; height: number; pixelSize?: number },
): Promise<CroppedPicture> {
  const px = blendChannels(meta.width, meta.height, layersOf(channels, pixels));
  const asset: ImageAsset = {
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(await encodePng(px)),
    meta,
  };
  return { hash: hashAsset(asset), asset };
}
