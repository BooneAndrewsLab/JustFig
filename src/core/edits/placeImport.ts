/**
 * Placing an imported file (note 02): one `image` object for its asset, or,
 * for a plot with pictures inside (issue 24), a group of the pictures, in
 * the plot's drawing order, under the plot (so what the plot draws over
 * them stays on top), each where it was in the plot. A see-through picture's
 * backdrop (issue 35) goes right under it.
 */
import type { Imported } from '@/io/import';

import { refit } from '../geometry/transform';
import { cloneObjects } from '../model/clone';
import type { Id } from '../model/ids';
import type { Obj } from '../model/types';
import { type Edit, addObjects } from './edits';

/** The objects an import becomes, centred on `at` (fresh ids). */
export function importedObjects(imp: Imported, at: { x: number; y: number }): Obj[] {
  const x = at.x - imp.w / 2;
  const y = at.y - imp.h / 2;
  const plot: Obj = {
    id: '' as Id,
    type: 'image',
    frame: { x, y, w: imp.w, h: imp.h, rotation: 0 },
    opacity: 1,
    asset: imp.hash,
  };
  const pictures = imp.pictures ?? [];
  if (pictures.length === 0) return cloneObjects([plot]);
  const children: Obj[] = [
    ...pictures.flatMap((p, i): Obj[] => [
      ...(p.backdrop
        ? [
            {
              id: '' as Id,
              type: 'image' as const,
              name: `Picture ${String(i + 1)} backdrop`,
              frame: { ...p.backdrop.frame, x: p.backdrop.frame.x + x, y: p.backdrop.frame.y + y },
              opacity: 1,
              asset: p.backdrop.hash,
            },
          ]
        : []),
      {
        id: '' as Id,
        type: 'image',
        name: `Picture ${String(i + 1)}`,
        frame: { ...p.frame, x: p.frame.x + x, y: p.frame.y + y },
        opacity: p.opacity,
        asset: p.hash,
      },
    ]),
    { ...plot, name: 'Plot' },
  ];
  return cloneObjects([
    refit({
      id: '' as Id,
      type: 'group',
      ...(imp.asset.kind === 'icon' ? {} : { name: imp.asset.meta.name }),
      frame: { x, y, w: imp.w, h: imp.h, rotation: 0 },
      opacity: 1,
      children,
    }),
  ]);
}

/** Adds an import to the page at `at`: its asset and those of its pictures. */
export function placeImport(pageId: Id, imp: Imported, at: { x: number; y: number }): Edit {
  const assets: Record<string, Imported['asset']> = { [imp.hash]: imp.asset };
  for (const p of imp.pictures ?? []) {
    assets[p.hash] = p.asset;
    if (p.backdrop) assets[p.backdrop.hash] = p.backdrop.asset;
  }
  const pictures = imp.pictures?.length ?? 0;
  const add = addObjects(pageId, importedObjects(imp, at), assets);
  return pictures === 0
    ? add
    : { ...add, label: `Import plot with ${String(pictures)} picture${pictures > 1 ? 's' : ''}` };
}
