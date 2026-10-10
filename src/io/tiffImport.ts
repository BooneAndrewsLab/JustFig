/**
 * A TIFF file as pictures (note 43, issue 65): decoded in the worker, then each
 * picture stored as PNG assets, the form every renderer and export already
 * draws. An 8-bit picture is one grey or RGB PNG. A 16-bit grey picture keeps
 * its full range as a 16-bit grey PNG (`meta.peak` marks it, it is the
 * `levels.base`) and is shown through an 8-bit grey PNG baked from it with the
 * Levels (`io/levels.ts`); 16-bit colour is scaled to 8-bit. The pixel size the
 * file states goes in `meta.pixelSize`.
 */
import type { ImageAsset } from '@/core/edits/crop';
import { decodeTiffInWorker } from '@/export/pngEncoder';

import { hashAsset } from './assets';
import { NO_LEVELS, bakeLevels } from './levels';
import { base64, encodeGreyPng, encodePng } from './png';
import type { TiffImage } from './tiffDecode';

/** A picture ready to place: the asset shown, and the 16-bit source behind it if there is one. */
export interface TiffPicture {
  readonly hash: string;
  readonly asset: ImageAsset;
  readonly base?: { readonly hash: string; readonly asset: ImageAsset };
  /** Pixels. */
  readonly width: number;
  readonly height: number;
}

export interface TiffPictures {
  /** One picture, or the channels of a stack (each grey). */
  readonly pictures: readonly TiffPicture[];
  readonly channels: boolean;
  readonly warnings: readonly string[];
}

async function pictureOf(
  img: TiffImage,
  name: string,
  pixelSize: number | undefined,
  warnings: Set<string>,
): Promise<TiffPicture> {
  const { width, height } = img;
  const meta = { name, width, height, ...(pixelSize === undefined ? {} : { pixelSize }) };
  const store = async (png: Promise<Uint8Array>, m: ImageAsset['meta']): Promise<ImageAsset> => ({
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(await png),
    meta: m,
  });
  if (img.channels === 1 && img.bits === 16) {
    const values = img.data as Uint16Array;
    let peak = 1;
    for (const v of values) if (v > peak) peak = v;
    const source = await store(encodeGreyPng(width, height, values, 16), { ...meta, peak });
    const shown = await bakeLevels(source, NO_LEVELS);
    return {
      hash: shown.hash,
      asset: shown.asset,
      base: { hash: hashAsset(source), asset: source },
      width,
      height,
    };
  }
  let asset: ImageAsset;
  if (img.channels === 1) {
    asset = await store(encodeGreyPng(width, height, img.data, 8), meta);
  } else {
    let rgb = img.data as Uint8Array;
    if (img.bits === 16) {
      warnings.add('A 16-bit colour picture was scaled to 8-bit.');
      const src = img.data as Uint16Array;
      rgb = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) rgb[i] = Math.round(((src[i] ?? 0) * 255) / 65535);
    }
    asset = await store(encodePng({ width, height, channels: 3, data: rgb }), meta);
  }
  return { hash: hashAsset(asset), asset, width, height };
}

/** Reads a TIFF into pictures. Throws an `Error` with a plain message for what cannot be imported. */
export async function tiffPictures(bytes: Uint8Array, name: string): Promise<TiffPictures> {
  const decoded = await decodeTiffInWorker(bytes);
  const warnings = new Set(decoded.warnings);
  const pictures: TiffPicture[] = [];
  for (const [i, img] of decoded.images.entries()) {
    const label = decoded.channels ? `${name} (channel ${String(i + 1)})` : name;
    pictures.push(await pictureOf(img, label, decoded.pixelSize, warnings));
  }
  return { pictures, channels: decoded.channels, warnings: [...warnings] };
}
