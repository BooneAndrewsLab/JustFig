/**
 * The icon preview's logic (IconPreview.tsx, note 01): when it opens and
 * closes, where it goes, and its credit line. No DOM, so unit-testable.
 */
import type { IconEntry } from '@/icons/manifest';

export const PREVIEW_ID = 'icon-preview';
/** Hover this long before the preview opens, so it doesn't flicker across the grid. */
export const OPEN_DELAY_MS = 350;
/** Grace to cross the gap to the next tile or onto the preview itself. */
export const CLOSE_DELAY_MS = 150;
const GAP = 8;
const MARGIN = 8;

/** Which icon is previewed, and when that changes. Timers only; no DOM. */
export class PreviewTimer<T> {
  private shown: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onChange: (v: T | null) => void) {}

  get current(): T | null {
    return this.shown;
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(v: T | null): void {
    this.clear();
    if (v === this.shown) return;
    this.shown = v;
    this.onChange(v);
  }

  /** The pointer is over `v`: open after the delay, or at once if a preview is already up. */
  hover(v: T): void {
    if (this.shown !== null) {
      this.set(v);
      return;
    }
    this.clear();
    this.timer = setTimeout(() => {
      this.set(v);
    }, OPEN_DELAY_MS);
  }

  /** The pointer is over the preview: keep it. */
  keep(): void {
    this.clear();
  }

  /** The pointer left: close after a short grace. */
  leave(): void {
    this.clear();
    if (this.shown === null) return;
    this.timer = setTimeout(() => {
      this.set(null);
    }, CLOSE_DELAY_MS);
  }

  /** Keyboard focus: open at once. */
  focus(v: T): void {
    this.set(v);
  }

  /** Close now (blur, Escape, scroll, click, drag, unmount). */
  dismiss(): void {
    this.set(null);
  }
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the preview goes: right of the tile (the panel is on the left of the
 * screen), else left of it, vertically centred on it and kept on screen.
 */
export function previewPosition(
  anchor: Box,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): { left: number; top: number } {
  const right = anchor.left + anchor.width + GAP;
  const left =
    right + size.width <= viewport.width - MARGIN
      ? right
      : Math.max(MARGIN, anchor.left - GAP - size.width);
  const centred = anchor.top + anchor.height / 2 - size.height / 2;
  const top = Math.min(Math.max(MARGIN, centred), viewport.height - MARGIN - size.height);
  return { left, top: Math.max(MARGIN, top) };
}

/** The credit line shown under the name: source, author, licence. */
export function previewCredit(entry: IconEntry): string {
  const m = entry.meta;
  return `${m.source}${m.author ? `, ${m.author}` : ''} · ${m.license}`;
}
