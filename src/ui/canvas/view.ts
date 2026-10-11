/** View helpers shared by the canvas and the toolbar: zoom about a point, fit the page. */
import type { Page } from '@/core/model/types';

import { type View, store } from '../state/store';

/** The drag-and-drop type an icon tile carries (its library id). */
export const ICON_DRAG_TYPE = 'application/x-figure-icon';
/** A procedural kind dragged from the Objects shelf. */
export const KIND_DRAG_TYPE = 'application/x-figure-kind';

/** What a dragged object tile carries: the kind, and `/preset-id` for a kind preset (note 58). */
export const kindDragData = (kind: string, preset?: string): string =>
  preset === undefined ? kind : `${kind}/${preset}`;

export function parseKindDrag(data: string): { kind: string; preset?: string } {
  const i = data.indexOf('/');
  return i === -1 ? { kind: data } : { kind: data.slice(0, i), preset: data.slice(i + 1) };
}

export function zoomAt(v: View, sx: number, sy: number, zoom: number): void {
  const z = Math.min(16, Math.max(0.1, zoom));
  store.setView({ zoom: z, x: sx - ((sx - v.x) * z) / v.zoom, y: sy - ((sy - v.y) * z) / v.zoom });
}

export function fitPage(page: Page, size: { w: number; h: number }): void {
  const pad = 40;
  const z = Math.min((size.w - 2 * pad) / page.size.w, (size.h - 2 * pad) / page.size.h);
  const zoom = Math.max(0.1, Math.min(8, z));
  store.setView({
    zoom,
    x: (size.w - page.size.w * zoom) / 2,
    y: (size.h - page.size.h * zoom) / 2,
  });
}

/** The canvas size, for zoom buttons outside it. */
export function canvasSize(): { w: number; h: number } {
  const el = document.querySelector('.canvas');
  return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
}
