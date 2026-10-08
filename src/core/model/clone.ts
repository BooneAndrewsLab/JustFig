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

/** Fresh ids throughout; an arrow binding follows its target's copy, or is dropped (note 06). */
export function cloneObjects(objs: readonly Obj[], dx = 0, dy = 0): Obj[] {
  const ids = new Map<Id, Id>();
  const copies = objs.map((o) => reIdInto(o, ids));
  return remapBindings(copies, ids).map((o) => translateObj(o, dx, dy));
}
