/**
 * Working copies of big pictures (note 30): the canvas shows a picture over
 * `WORKING_COPY_FROM` pixels redrawn at about `WORKING_COPY_PIXELS`, as a blob
 * URL, so the page's markup stays small and Firefox does not paint 20 Mpx on
 * every frame. Screen only: it reaches the one renderer as an `ImageHref`
 * (exports never get it) and is keyed by the content hash, so it is made once
 * per picture. Until it is ready the picture is a grey box; if it cannot be
 * made, the picture itself is shown.
 */
import type { ImageAsset } from '@/core/edits/crop';
import type { AssetHash } from '@/core/model/types';
import { downscalePicture } from '@/io/downscale';
import type { ImageHref } from '@/render/objectToNode';

export const WORKING_COPY_FROM = 6_000_000;
export const WORKING_COPY_PIXELS = 4_000_000;
/** Copies kept (each a blob of a few MB); the oldest is let go first. */
const KEEP = 64;

type Entry = 'pending' | 'failed' | { readonly url: string };
const copies = new Map<AssetHash, Entry>();
const listeners = new Set<() => void>();

/** The working copy's size for a w x h picture, or null when it is shown as it is. */
export function workingSize(w: number, h: number): { w: number; h: number } | null {
  if (w * h <= WORKING_COPY_FROM) return null;
  const k = Math.sqrt(WORKING_COPY_PIXELS / (w * h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function settle(hash: AssetHash, entry: Entry): void {
  copies.delete(hash);
  copies.set(hash, entry);
  for (const [oldest, e] of copies) {
    if (copies.size <= KEEP || e === 'pending') break;
    copies.delete(oldest);
    if (e !== 'failed') URL.revokeObjectURL(e.url);
  }
  resolver = makeResolver();
  for (const l of listeners) l();
}

function start(hash: AssetHash, a: ImageAsset, size: { w: number; h: number }): void {
  copies.set(hash, 'pending');
  downscalePicture(a, size.w, size.h).then(
    (blob) => {
      settle(hash, { url: URL.createObjectURL(blob) });
    },
    () => {
      settle(hash, 'failed');
    },
  );
}

function makeResolver(): ImageHref {
  return (hash, a) => {
    const e = copies.get(hash);
    if (e === undefined) {
      const size = workingSize(a.meta.width, a.meta.height);
      if (!size) return undefined;
      start(hash, a, size);
      return null;
    }
    if (e === 'failed') return undefined;
    return e === 'pending' ? null : e.url;
  };
}

let resolver = makeResolver();

/**
 * `useSyncExternalStore` pair: the working copies as an `ImageHref` for the
 * screen's render context, a new function each time a copy is ready (so the
 * renderer's memo draws the picture again).
 */
export function subscribeWorkingCopies(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const workingCopies = (): ImageHref => resolver;
