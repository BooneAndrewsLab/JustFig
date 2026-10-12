/** HSV ↔ sRGB for the colour picker's square and hue slider; h in [0, 360), s and v in [0, 1]. */
import { type Rgb, parseHex, toHex } from './color';

export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

export const hexToHsv = (hex: string): Hsv | null => {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsv(rgb) : null;
};

export const hsvToHex = (c: Hsv): string => toHex(hsvToRgb(c));

/** What a person typed as a hex colour: "#0af", "00AAFF" or " #00aaff " → "#00aaff"; else null. */
export function normalizeHex(text: string): string | null {
  const rgb = parseHex(text);
  return rgb ? toHex(rgb) : null;
}
