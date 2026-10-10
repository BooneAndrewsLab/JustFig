/**
 * Levels and invert for one picture (note 27, issue 51): the pixels of the
 * whole picture with `min`..`max` stretched to black..full on every colour
 * component (`levelTable`, as the channel display range, note 21), then
 * optionally inverted. Pure on pixel arrays so it is tested exactly; baked to a
 * PNG asset (the export subset has no filters). Alpha is untouched.
 */
import type { CroppedPicture, ImageAsset } from '@/core/edits/crop';

import { hashAsset } from './assets';
import { canvasPixels, levelTable } from './channels';
import {
  type Pixels,
  base64,
  decodeGrey16Png,
  decodePng,
  encodeGreyPng,
  encodePng,
  fromBase64,
} from './png';

export interface LevelsSetting {
  readonly min: number;
  readonly max: number;
  readonly invert: boolean;
}

/** The setting that changes nothing. */
export const NO_LEVELS: LevelsSetting = { min: 0, max: 255, invert: false };

export const isNoLevels = (l: LevelsSetting): boolean => l.min <= 0 && l.max >= 255 && !l.invert;

/** value → value after levels, then invert. */
export function levelsTable(l: LevelsSetting): Uint8Array {
  const t = levelTable(l.min, l.max);
  if (l.invert) for (let v = 0; v < 256; v++) t[v] = 255 - (t[v] ?? 0);
  return t;
}

/** Every R, G, B through the table; alpha kept. A new array; identity returns a copy. */
export function applyLevels(px: Pixels, l: LevelsSetting): Pixels {
  const t = levelsTable(l);
  const data = new Uint8Array(px.data);
  const ch = px.channels;
  for (let i = 0; i < data.length; i += ch) {
    data[i] = t[data[i] ?? 0] ?? 0;
    data[i + 1] = t[data[i + 1] ?? 0] ?? 0;
    data[i + 2] = t[data[i + 2] ?? 0] ?? 0;
  }
  return { ...px, data };
}

/** Whether a picture is a 16-bit greyscale source (TIFF import, note 43): its `meta.peak` says so. */
export const is16 = (a: ImageAsset): boolean => a.meta.peak !== undefined;

/** Whether baking is needed to show `l` on `src`: a 16-bit source always is (its PNG is not shown). */
export const needsBake = (src: ImageAsset, l: LevelsSetting): boolean =>
  is16(src) || !isNoLevels(l);

/**
 * value (0..peak) → 0..255 for a 16-bit source: the sliders span 0..peak, so
 * the black and white points are `min`/255 and `max`/255 of the brightest value
 * in the picture; linear between, then optionally inverted.
 */
export function levelsTable16(l: LevelsSetting, peak: number): Uint8Array {
  const t = new Uint8Array(peak + 1);
  const lo = (l.min * peak) / 255;
  const hi = (l.max * peak) / 255;
  for (let v = 0; v <= peak; v++) {
    const o = v <= lo ? 0 : v >= hi ? 255 : Math.round(((v - lo) * 255) / (hi - lo));
    t[v] = l.invert ? 255 - o : o;
  }
  return t;
}

/** 16-bit samples to 8-bit grey through the levels (never above `peak`: clamped). */
export function levels16To8(values: Uint16Array, peak: number, l: LevelsSetting): Uint8Array {
  const t = levelsTable16(l, peak);
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = t[Math.min(values[i] ?? 0, peak)] ?? 0;
  return out;
}

/** A picture's pixels: exactly for a PNG `decodePng` reads, else through a canvas. */
export async function picturePixels(a: ImageAsset): Promise<Pixels> {
  const px = a.mime === 'image/png' ? decodePng(fromBase64(a.dataBase64)) : null;
  if (px?.width === a.meta.width && px.height === a.meta.height) return px;
  return canvasPixels(a);
}

/**
 * `src` with `l` applied, as a PNG asset the size of `src` (lossless, even
 * from a JPEG). No credit: `src`, kept in the figure, carries it.
 */
export async function bakeLevels(
  src: ImageAsset,
  l: LevelsSetting,
  pixels?: Pixels,
): Promise<CroppedPicture> {
  if (is16(src) && src.meta.peak !== undefined) {
    const g = decodeGrey16Png(fromBase64(src.dataBase64));
    if (!g) throw new Error('This 16-bit picture could not be read.');
    const grey = levels16To8(g.values, src.meta.peak, l);
    const asset: ImageAsset = {
      kind: 'image',
      mime: 'image/png',
      dataBase64: base64(await encodeGreyPng(g.width, g.height, grey, 8)),
      meta: calibrated(src, { name: src.meta.name, width: g.width, height: g.height }),
    };
    return { hash: hashAsset(asset), asset };
  }
  const px = applyLevels(pixels ?? (await picturePixels(src)), l);
  const asset: ImageAsset = {
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(await encodePng(px)),
    meta: calibrated(src, { name: src.meta.name, width: px.width, height: px.height }),
  };
  return { hash: hashAsset(asset), asset };
}

/** `meta` with the picture's pixel size carried over (a bake keeps the calibration). */
export const calibrated = (from: ImageAsset, meta: ImageAsset['meta']): ImageAsset['meta'] =>
  from.meta.pixelSize === undefined ? meta : { ...meta, pixelSize: from.meta.pixelSize };
