/**
 * Walking and rewriting the object tree. Objects are immutable: every
 * rewrite returns new containers along the changed path and shares the
 * rest, so memoised renders of untouched objects stay valid.
 */
import type { Id } from './ids';
import type { AssetHash, Doc, Layer, Obj, Page } from './types';

export const hasChildren = (o: Obj): o is Extract<Obj, { children: readonly Obj[] }> =>
  o.type === 'group' || o.type === 'panel';

/** Every object, depth first, parents before children. */
export function* walk(objs: readonly Obj[]): Generator<Obj> {
  for (const o of objs) {
    yield o;
    if (hasChildren(o)) yield* walk(o.children);
  }
}

export function* pageObjects(page: Page): Generator<Obj> {
  for (const l of page.layers) yield* walk(l.children);
}

export function* docObjects(doc: Doc): Generator<Obj> {
  for (const p of doc.pages) yield* pageObjects(p);
}

/** Asset hashes an object (and its children) refer to. */
export function objectAssets(o: Obj): AssetHash[] {
  switch (o.type) {
    case 'icon':
      return [o.asset];
    case 'image':
      return [
        o.asset,
        ...(o.cropped === undefined ? [] : [o.cropped]),
        ...(o.channels ?? []).map((c) => c.asset),
        ...(o.levels === undefined ? [] : [o.levels.base]),
      ];
    case 'embedded':
      return [o.snapshot];
    case 'procedural':
      return o.snapshot === undefined ? [] : [o.snapshot];
    case 'group':
    case 'panel':
      return o.children.flatMap(objectAssets);
    case 'rect':
    case 'ellipse':
    case 'path':
    case 'arrow':
    case 'text':
      return [];
  }
}

export function usedAssets(doc: Doc): Set<AssetHash> {
  const out = new Set<AssetHash>();
  for (const p of doc.pages)
    for (const l of p.layers)
      for (const o of l.children) objectAssets(o).forEach((h) => out.add(h));
  return out;
}

export function findObj(page: Page, id: Id): Obj | undefined {
  for (const o of pageObjects(page)) if (o.id === id) return o;
  return undefined;
}

/** Where a top-level-or-nested object sits: its layer and the chain of containers above it. */
export interface Location {
  readonly layer: Layer;
  readonly parents: readonly Obj[];
  readonly obj: Obj;
}

export function locate(page: Page, id: Id): Location | undefined {
  const search = (layer: Layer, objs: readonly Obj[], parents: Obj[]): Location | undefined => {
    for (const o of objs) {
      if (o.id === id) return { layer, parents, obj: o };
      if (hasChildren(o)) {
        const r = search(layer, o.children, [...parents, o]);
        if (r) return r;
      }
    }
    return undefined;
  };
  for (const l of page.layers) {
    const r = search(l, l.children, []);
    if (r) return r;
  }
  return undefined;
}

/**
 * Rewrites a list of objects: `fn` gets each object (after its children
 * were rewritten) and returns its replacement, or null to remove it, or an
 * array to replace it by several. Unchanged subtrees keep their identity.
 */
export function mapObjs(
  objs: readonly Obj[],
  fn: (o: Obj) => Obj | readonly Obj[] | null,
): readonly Obj[] {
  let changed = false;
  const out: Obj[] = [];
  for (const o of objs) {
    let cur = o;
    if (hasChildren(o)) {
      const kids = mapObjs(o.children, fn);
      if (kids !== o.children) cur = { ...o, children: kids };
    }
    const r = fn(cur);
    if (r !== o) changed = true;
    if (r === null) continue;
    if (Array.isArray(r)) out.push(...(r as readonly Obj[]));
    else out.push(r as Obj);
  }
  return changed ? out : objs;
}

export function mapPageObjs(page: Page, fn: (o: Obj) => Obj | readonly Obj[] | null): Page {
  const layers = page.layers.map((l) => {
    const children = mapObjs(l.children, fn);
    return children === l.children ? l : { ...l, children };
  });
  return layers.some((l, i) => l !== page.layers[i]) ? { ...page, layers } : page;
}

export function replacePage(doc: Doc, page: Page): Doc {
  return { ...doc, pages: doc.pages.map((p) => (p.id === page.id ? page : p)) };
}
