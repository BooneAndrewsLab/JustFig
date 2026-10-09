/** What the Layers and Notes panels call an object: its name, a text's first words, else its type. */
import type { Obj } from '@/core/model/types';
import { plainText } from '@/core/text/layout';

export function objName(o: Obj): string {
  if (o.name) return o.name;
  if (o.type === 'text') return `“${plainText(o).slice(0, 24)}”`;
  return o.type.charAt(0).toUpperCase() + o.type.slice(1);
}
