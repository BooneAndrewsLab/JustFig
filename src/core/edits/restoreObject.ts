/**
 * Bringing one object back from another saved version (note 23, Compare):
 * replaces the object with the same id on its page, or adds it again when it
 * was deleted since. One undo step.
 */
import { refit } from '../geometry/transform';
import type { Id } from '../model/ids';
import { findObj, hasChildren, locate, mapPageObjs, objectAssets, walk } from '../model/tree';
import type { Assets, Figure, Obj } from '../model/types';

import { type Edit, EditError, withPage } from './edits';

/** The saved version's assets that `obj` (and its children) draw, to bring along. */
export function assetsFor(obj: Obj, from: Figure): Assets {
  const out: Record<string, Assets[string]> = {};
  for (const h of objectAssets(obj)) {
    const a = from.assets[h];
    if (a) out[h] = a;
  }
  return out;
}

/**
 * `obj` is the object as the other version had it. Ids are kept (not
 * `cloneObjects`): the object comes back as itself, so arrows bound to it
 * find it again, and `store.edit` reconciles bindings afterwards. A replaced
 * container takes its children from the other version too. A deleted object
 * returns to its old parent if that is still there, else to its old layer,
 * else to the page's first unlocked layer. Assets it draws come along from
 * the other version (content-addressed, so a shared hash is the same data).
 */
export function restoreObject(pageId: Id, obj: Obj, from: Figure, versionName: string): Edit {
  return {
    label: `Restore ${obj.type} from “${versionName}”`,
    select: [obj.id],
    apply: (f) => {
      // Descendants the version had that now sit elsewhere would be on the page twice.
      const kids = new Set<Id>();
      for (const o of walk([obj])) if (o.id !== obj.id) kids.add(o.id);
      const next = withPage(f, pageId, (page) => {
        const p = mapPageObjs(page, (o) =>
          kids.has(o.id) ? null : o.type === 'group' ? refit(o) : o,
        );
        if (findObj(p, obj.id)) return mapPageObjs(p, (o) => (o.id === obj.id ? obj : o));
        const fromPage = from.doc.pages.find((q) => q.id === pageId);
        const was = fromPage ? locate(fromPage, obj.id) : undefined;
        const parent = was?.parents[was.parents.length - 1];
        const parentNow = parent ? findObj(p, parent.id) : undefined;
        if (parentNow && hasChildren(parentNow))
          return mapPageObjs(p, (o) =>
            o.id === parentNow.id && hasChildren(o) ? { ...o, children: [...o.children, obj] } : o,
          );
        const layer =
          p.layers.find((l) => l.id === was?.layer.id) ?? p.layers.find((l) => !l.locked);
        if (!layer || layer.locked) throw new EditError('That layer is locked.');
        return {
          ...p,
          layers: p.layers.map((l) =>
            l.id === layer.id ? { ...l, children: [...l.children, obj] } : l,
          ),
        };
      });
      return { ...next, assets: { ...f.assets, ...assetsFor(obj, from) } };
    },
  };
}
