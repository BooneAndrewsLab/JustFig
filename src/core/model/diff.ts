/**
 * What differs between two versions of a figure (note 23, Compare): objects
 * paired by id on pages paired by id. Pure and deterministic.
 */
import type { Id } from './ids';
import { pageObjects } from './tree';
import type { Doc, Obj, Page } from './types';

export interface PageDiff {
  readonly pageId: Id;
  /** The page's name in `b` (or in `a` when only `a` has it). */
  readonly name: string;
  readonly inA: boolean;
  readonly inB: boolean;
  /** Ids in `b` only. */
  readonly added: readonly Id[];
  /** Ids in `a` only. */
  readonly removed: readonly Id[];
  /** Ids in both whose own content differs. */
  readonly changed: readonly Id[];
}

/** Structural equality of JSON-like values; a key holding `undefined` equals a missing key. */
export function jsonEqual(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    return x.every((v, i) => jsonEqual(v, y[i]));
  }
  const a = x as Record<string, unknown>;
  const b = y as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!jsonEqual(a[k], b[k])) return false;
  return true;
}

/**
 * A container is compared by its own fields and the ids of its children in
 * order; each child is compared (and reported) as an object of its own, so a
 * changed child does not also flag every group above it.
 */
function own(o: Obj): unknown {
  return o.type === 'group' || o.type === 'panel'
    ? { ...o, children: o.children.map((c) => c.id) }
    : o;
}

export function objectsById(page: Page): Map<Id, Obj> {
  const m = new Map<Id, Obj>();
  for (const o of pageObjects(page)) m.set(o.id, o);
  return m;
}

export function diffPage(a: Page | undefined, b: Page | undefined): PageDiff {
  const am = a ? objectsById(a) : new Map<Id, Obj>();
  const bm = b ? objectsById(b) : new Map<Id, Obj>();
  const added: Id[] = [];
  const removed: Id[] = [];
  const changed: Id[] = [];
  for (const [id, o] of bm) {
    const before = am.get(id);
    if (!before) added.push(id);
    else if (!jsonEqual(own(before), own(o))) changed.push(id);
  }
  for (const id of am.keys()) if (!bm.has(id)) removed.push(id);
  const p = b ?? a;
  if (!p) throw new Error('diffPage needs a page');
  return {
    pageId: p.id,
    name: p.name,
    inA: a !== undefined,
    inB: b !== undefined,
    added,
    removed,
    changed,
  };
}

/**
 * `a` is the older document, `b` the newer. One entry per page of either, `a`'s
 * pages first (in order), then pages only `b` has. Ids are in document order.
 */
export function diffDocuments(a: Doc, b: Doc): PageDiff[] {
  const bById = new Map(b.pages.map((p) => [p.id, p]));
  const out = a.pages.map((p) => diffPage(p, bById.get(p.id)));
  const aIds = new Set(a.pages.map((p) => p.id));
  for (const p of b.pages) if (!aIds.has(p.id)) out.push(diffPage(undefined, p));
  return out;
}

export const diffCount = (d: PageDiff): number =>
  d.added.length + d.removed.length + d.changed.length;
