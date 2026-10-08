/**
 * The fonts every text layout and export uses (note 03): Arimo, Tinos and
 * Cousine TTFs from `public/fonts/`, parsed with opentype.js. Loaded once
 * at start (browser: fetched; tests: read from disk) and then read
 * synchronously, so layout stays a pure function of the model.
 */
import { type Font, parse } from 'opentype.js';

import type { FontId } from '../model/types';

export interface FontStyle {
  readonly bold: boolean;
  readonly italic: boolean;
}

const FAMILY_FILES: Readonly<Record<FontId, string>> = {
  arimo: 'Arimo',
  tinos: 'Tinos',
  cousine: 'Cousine',
};

/** The CSS / SVG / PDF family name each font id is written as. */
export const FAMILY_NAME: Readonly<Record<FontId, string>> = {
  arimo: 'Arimo',
  tinos: 'Tinos',
  cousine: 'Cousine',
};

/** Metric-compatible fallbacks for editors without the font (note 03). */
export const FAMILY_FALLBACK: Readonly<Record<FontId, string>> = {
  arimo: 'Arimo, Arial, Helvetica, sans-serif',
  tinos: "Tinos, 'Times New Roman', Times, serif",
  cousine: "Cousine, 'Courier New', Courier, monospace",
};

export function styleSuffix(s: FontStyle): string {
  if (s.bold && s.italic) return 'BoldItalic';
  if (s.bold) return 'Bold';
  return s.italic ? 'Italic' : 'Regular';
}

/** `Arimo-BoldItalic.ttf` */
export const fontFile = (id: FontId, s: FontStyle): string =>
  `${FAMILY_FILES[id]}-${styleSuffix(s)}.ttf`;

export const ALL_STYLES: readonly FontStyle[] = [
  { bold: false, italic: false },
  { bold: true, italic: false },
  { bold: false, italic: true },
  { bold: true, italic: true },
];

export const ALL_FONT_FILES: readonly { id: FontId; style: FontStyle; file: string }[] = (
  ['arimo', 'tinos', 'cousine'] as const
).flatMap((id) => ALL_STYLES.map((style) => ({ id, style, file: fontFile(id, style) })));

const fonts = new Map<string, Font>();
const raw = new Map<string, ArrayBuffer>();

export function registerFont(file: string, data: ArrayBuffer): void {
  raw.set(file, data);
  fonts.set(file, parse(data));
}

export const fontsLoaded = (): boolean => fonts.size === ALL_FONT_FILES.length;

/** The parsed font; throws when fonts were not loaded (a startup bug). */
export function getFont(id: FontId, s: FontStyle): Font {
  const f = fonts.get(fontFile(id, s)) ?? fonts.get(fontFile(id, { bold: false, italic: false }));
  if (!f) throw new Error(`Font ${fontFile(id, s)} is not loaded`);
  return f;
}

/** The TTF bytes, for embedding in PDF exports. */
export function getFontData(file: string): ArrayBuffer | undefined {
  return raw.get(file);
}

/** Loads every font with `fetchFile` (the browser passes a fetch under BASE_URL). */
export async function loadFonts(fetchFile: (file: string) => Promise<ArrayBuffer>): Promise<void> {
  await Promise.all(
    ALL_FONT_FILES.filter(({ file }) => !fonts.has(file)).map(async ({ file }) => {
      registerFont(file, await fetchFile(file));
    }),
  );
}
