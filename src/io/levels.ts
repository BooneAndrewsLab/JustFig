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
import { type Pixels, base64, decodePng, encodePng, fromBase64 } from './png';

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
  const px = applyLevels(pixels ?? (await picturePixels(src)), l);
  const asset: ImageAsset = {
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(await encodePng(px)),
    meta: { name: src.meta.name, width: px.width, height: px.height },
  };
  return { hash: hashAsset(asset), asset };
}
