/** Copies of objects with fresh ids (paste, duplicate), optionally offset. */
import { translateObj } from '../geometry/transform';
import { remapBindings } from './binding';
import { type Id, newId } from './ids';
import type { Obj } from './types';

function reIdInto(o: Obj, ids: Map<Id, Id>): Obj {
  const id = newId('o');
  ids.set(o.id, id);
  if (o.type === 'group' || o.type === 'panel')
    return { ...o, id, children: o.children.map((c) => reIdInto(c, ids)) };
  return { ...o, id };
}

/** A split set (note 45) follows the copies made together; a copy of a lone member leaves it. */
function remapSet(o: Obj, ids: Map<Id, Id>): Obj {
  if (o.type === 'group' || o.type === 'panel')
    return { ...o, children: o.children.map((c) => remapSet(c, ids)) };
  if (o.type !== 'image' || !o.splitSet) return o;
  const { splitSet, ...rest } = o;
  const kept = splitSet.flatMap((id) => ids.get(id) ?? []);
  return kept.length > 1 ? { ...rest, splitSet: kept } : rest;
}

/** Fresh ids throughout; an arrow binding or inset link follows its targets' copies, or is dropped (notes 06, 44). */
export function cloneObjects(objs: readonly Obj[], dx = 0, dy = 0): Obj[] {
  const ids = new Map<Id, Id>();
  const copies = objs.map((o) => reIdInto(o, ids));
  return remapBindings(copies, ids).map((o) => translateObj(remapSet(o, ids), dx, dy));
}
