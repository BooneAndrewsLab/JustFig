/**
 * Re-bakes magnified insets' pixels (note 44). Dragging an inset's box re-crops
 * it inside `reconcileBindings`, which is pure and synchronous, so the inset is
 * marked `stale` there and keeps its old pixels until this hands in the new
 * ones (`bakeInset` through `store.amend`: no undo step, it completes the edit
 * that re-cropped). A bake is applied only if the inset still shows what was
 * baked, so an undo or a further drag in the meantime is never overwritten.
 */
import { bakeInset } from '@/core/edits/inset';
import type { View } from '@/core/geometry/view';
import { pageObjects } from '@/core/model/tree';
import { bakeView } from '@/io/cropImage';

import { type AppStore, store as appStore } from './state/store';

/** Quiet time after the last change before baking, ms: a drag bakes once, at its end. */
const SETTLE_MS = 150;

export function startInsetBaker(store: AppStore = appStore): () => void {
  const busy = new Set<string>();
  const failed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scan = () => {
    for (const tab of store.getState().tabs) {
      const f = tab.history.present;
      for (const page of f.doc.pages)
        for (const o of pageObjects(page)) {
          if (o.type !== 'image' || o.inset?.stale !== true || !o.crop) continue;
          const a = f.assets[o.asset];
          if (a?.kind !== 'image') continue;
          const view: View = { turn: o.turn ?? 0, crop: o.crop };
          const key = JSON.stringify([tab.key, page.id, o.id, o.asset, view]);
          if (busy.has(key) || failed.has(key)) continue;
          busy.add(key);
          const asset = o.asset;
          bakeView(a, view)
            .then((picture) => {
              store.amend(bakeInset(page.id, o.id, { asset, view, picture }), tab.key);
            })
            .catch(() => {
              failed.add(key);
            })
            .finally(() => {
              busy.delete(key);
            });
        }
    }
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(scan, SETTLE_MS);
  };
  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}
