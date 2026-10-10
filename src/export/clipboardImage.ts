/**
 * Copy as image (note 36): the selection, or the page when nothing is
 * selected, as a PNG at 300 dpi on the clipboard, with the SVG beside it as
 * text where the browser takes several types. Rendering is the export's
 * (`exportPng`, `exportSvg`); this file decides what is drawn and talks to
 * the clipboard, which is injectable so tests never touch a real one.
 */
import { type Box, unionBoxes } from '@/core/geometry/matrix';
import { objBounds } from '@/core/geometry/transform';
import type { Id } from '@/core/model/ids';
import type { Figure, Obj, Page } from '@/core/model/types';

import { type RasterOptions, exportPng, maxDpiFor, rasterSize } from './raster';
import { exportSvg } from './svg';

export const COPY_DPI = 300;
/** Breathing room round a selection, in points, so strokes at its edge are not cut. */
export const SELECTION_PAD = 3;

export interface CopyScope {
  /** The page to render: the whole page, or only the selected objects. */
  readonly page: Page;
  readonly kind: 'page' | 'selection';
  /** The part of the page drawn (the selection's bounds, padded); absent for the page. */
  readonly crop?: Box;
  /** The credit line is part of a page copy only (note 03: a crop has none). */
  readonly footer: boolean;
}

/** Keeps the selected objects, whole, and the containers on the way to nested ones. */
function keepSelected(objs: readonly Obj[], ids: ReadonlySet<Id>): Obj[] {
  const out: Obj[] = [];
  for (const o of objs) {
    if (ids.has(o.id)) out.push(o);
    else if (o.type === 'group' || o.type === 'panel') {
      const inner = keepSelected(o.children, ids);
      if (inner.length > 0) out.push({ ...o, children: inner });
    }
  }
  return out;
}

/** What a copy draws for this selection (nothing selected, or only stale ids: the page). */
export function copyScope(page: Page, selection: readonly Id[]): CopyScope {
  const ids = new Set(selection);
  const layers = page.layers.map((l) => ({ ...l, children: keepSelected(l.children, ids) }));
  const kept = layers.flatMap((l) => (l.visible ? l.children : []));
  if (ids.size === 0 || kept.length === 0) return { page, kind: 'page', footer: true };
  const b = unionBoxes(kept.map(objBounds));
  const crop: Box = {
    x: b.x - SELECTION_PAD,
    y: b.y - SELECTION_PAD,
    w: b.w + 2 * SELECTION_PAD,
    h: b.h + 2 * SELECTION_PAD,
  };
  return { page: { ...page, layers }, kind: 'selection', crop, footer: false };
}

function rasterOptions(scope: CopyScope, dpi: number): RasterOptions {
  return {
    dpi,
    transparent: false,
    footer: scope.footer,
    ...(scope.crop ? { crop: scope.crop } : {}),
  };
}

/** 300 dpi, lowered when the picture would be more than an export can hold. */
export function copyDpi(figure: Figure, scope: CopyScope): number {
  const limit = maxDpiFor(figure, scope.page, rasterOptions(scope, 72));
  return Math.max(1, Math.min(COPY_DPI, limit));
}

/** Pixel size of the copy. */
export function copyPixelSize(figure: Figure, scope: CopyScope): { w: number; h: number } {
  return rasterSize(figure, scope.page, rasterOptions(scope, copyDpi(figure, scope)));
}

export function copySvgText(figure: Figure, scope: CopyScope, version: string): string {
  return exportSvg(
    figure,
    scope.page,
    {
      textMode: 'text',
      footer: scope.footer,
      background: true,
      ...(scope.crop ? { crop: scope.crop } : {}),
    },
    version,
  );
}

export function copyPngBytes(
  figure: Figure,
  scope: CopyScope,
  version: string,
): Promise<Uint8Array> {
  return exportPng(figure, scope.page, rasterOptions(scope, copyDpi(figure, scope)), version);
}

/** The slice of the clipboard API used, so a test can stand in. */
export interface ClipboardLike {
  write(items: unknown[]): Promise<void>;
}
export type ClipboardItemCtor = new (items: Record<string, Promise<Blob>>) => unknown;

export type ClipboardResult = 'png+svg' | 'png' | 'unavailable';

/**
 * Writes the PNG (and the SVG as text) in one clipboard item. The blobs go in
 * as promises so Safari still counts the click as the user's gesture while the
 * picture is drawn. A browser that refuses the second type gets the PNG alone;
 * one without the async clipboard API gets `unavailable`.
 */
export async function writeToClipboard(
  png: Promise<Blob>,
  svg: () => Blob,
  clipboard: ClipboardLike | undefined = (globalThis.navigator as Navigator | undefined)?.clipboard,
  Item: ClipboardItemCtor | undefined = (globalThis as { ClipboardItem?: ClipboardItemCtor })
    .ClipboardItem,
): Promise<ClipboardResult> {
  if (typeof clipboard?.write !== 'function' || Item === undefined) return 'unavailable';
  const drawn = png.then((b) => b);
  drawn.catch(() => undefined); // reported once, by the awaits below
  const text = drawn.then(() => svg());
  text.catch(() => undefined);
  try {
    await clipboard.write([new Item({ 'image/png': drawn, 'text/plain': text })]);
    return 'png+svg';
  } catch {
    // A failed drawing fails the PNG alone too: it is thrown here, not retried.
    await drawn;
  }
  await clipboard.write([new Item({ 'image/png': drawn })]);
  return 'png';
}
