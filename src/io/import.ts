/**
 * Importing SVG, PNG and JPEG files (note 02): each becomes an embedded
 * asset (the file stays self-contained) and an `image` object. SVGs go
 * through the same sanitiser as icons, so they stay vector in every
 * export; rasters keep their bytes.
 */
import type { Asset } from '@/core/model/types';
import { el, nodeToSvgString } from '@/render/svgNode';

import { hashAsset } from './assets';
import { SvgImportError, sanitizeSvg } from './svg/sanitize';

export interface Imported {
  readonly hash: string;
  readonly asset: Asset;
  /** Natural size to place it at, points. */
  readonly w: number;
  readonly h: number;
  readonly warnings: readonly string[];
}

/** Longest side a newly placed import gets, points (~106 mm). */
export const MAX_PLACE = 300;

const fit = (w: number, h: number): { w: number; h: number } => {
  const k = Math.min(1, MAX_PLACE / Math.max(w, h, 1));
  return { w: w * k, h: h * k };
};

export function imageSize(
  bytes: Uint8Array,
): { mime: 'image/png' | 'image/jpeg'; width: number; height: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { mime: 'image/png', width: v.getUint32(16), height: v.getUint32(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1] ?? 0;
      const len = v.getUint16(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { mime: 'image/jpeg', height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function importSvgText(text: string, name: string): Imported {
  const s = sanitizeSvg(text);
  const svg = nodeToSvgString(
    el('svg', { xmlns: 'http://www.w3.org/2000/svg', ...s.root.attrs }, s.root.children),
  );
  // SVG user units are CSS pixels: 0.75 pt each.
  const size = fit(s.viewBox[2] * 0.75, s.viewBox[3] * 0.75);
  const asset: Asset = { kind: 'svgImport', svg, meta: { name, width: size.w, height: size.h } };
  return { hash: hashAsset(asset), asset, ...size, warnings: s.warnings };
}

export function importRaster(bytes: Uint8Array, name: string): Imported {
  const info = imageSize(bytes);
  if (!info) throw new SvgImportError('Only PNG and JPEG images can be imported.');
  const asset: Asset = {
    kind: 'image',
    mime: info.mime,
    dataBase64: base64(bytes),
    meta: { name, width: info.width, height: info.height },
  };
  return {
    hash: hashAsset(asset),
    asset,
    ...fit(info.width * 0.75, info.height * 0.75),
    warnings: [],
  };
}

export async function importFile(file: File): Promise<Imported> {
  const lower = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || lower.endsWith('.svg'))
    return importSvgText(await file.text(), file.name);
  return importRaster(new Uint8Array(await file.arrayBuffer()), file.name);
}
