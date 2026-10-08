/** Copies of objects with fresh ids (paste, duplicate), optionally offset. */
import { translateObj } from '../geometry/transform';
import { newId } from './ids';
import type { Obj } from './types';

export function reId(o: Obj): Obj {
  const id = newId('o');
  if (o.type === 'group' || o.type === 'panel') return { ...o, id, children: o.children.map(reId) };
  return { ...o, id };
}

export const cloneObjects = (objs: readonly Obj[], dx = 0, dy = 0): Obj[] =>
  objs.map((o) => translateObj(reId(o), dx, dy));
