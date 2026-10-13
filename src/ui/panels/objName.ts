/** What the Layers and Notes panels call an object: its name, a text's first words, else its type. */
import { isLine } from '@/core/model/factory';
import type { Obj } from '@/core/model/types';
import { plainText } from '@/core/text/layout';

/** An object's type as the UI names it: an arrow with no heads is a "Line" (issue 100). */
export function typeName(o: Obj): string {
  if (o.type === 'arrow' && isLine(o)) return 'Line';
  return o.type.charAt(0).toUpperCase() + o.type.slice(1);
}

export function objName(o: Obj): string {
  if (o.name) return o.name;
  if (o.type === 'text') return `“${plainText(o).slice(0, 24)}”`;
  return typeName(o);
}
