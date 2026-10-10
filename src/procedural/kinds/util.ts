/** Small helpers the kinds share. */
import { parseHex, toHex } from '@/core/color/color';

import type { TextPrim } from '../prims';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A seeded PRNG (mulberry32): the same seed always draws the same colonies. */
export function rng(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `a` blended toward `b` by `t` (0 = a, 1 = b), in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  const k = clamp(t, 0, 1);
  return toHex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

/** A 1-2-5 step giving about `target` intervals over `span`. */
export function niceStep(span: number, target: number): number {
  if (!(span > 0) || !(target > 0)) return 1;
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Row letters of a plate: A … Z, AA … AF. */
export const rowLabel = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`;

export function text(
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  more: Partial<Omit<TextPrim, 'kind' | 'text' | 'x' | 'y' | 'size' | 'color'>> = {},
): TextPrim {
  return {
    kind: 'text',
    text: s,
    x,
    y,
    size,
    color,
    anchor: more.anchor ?? 'middle',
    baseline: more.baseline ?? 'middle',
    ...(more.bold === true ? { bold: true } : {}),
    ...(more.italic === true ? { italic: true } : {}),
    ...(more.mono === true ? { mono: true } : {}),
    ...(more.rotation ? { rotation: more.rotation } : {}),
  };
}

/** Groups items by a colour key, keeping first-seen order (one `<path>` per colour). */
export function byColour<T>(items: Iterable<T>, colour: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const c = colour(it);
    const list = out.get(c);
    if (list) list.push(it);
    else out.set(c, [it]);
  }
  return out;
}

/** Thousands separators for bp and aa counts. */
export const fmtInt = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
