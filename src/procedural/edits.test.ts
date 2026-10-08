/** Ticking and unticking Closed on a path kind swaps between its default shapes (#31). */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects, mapPageObjs } from '@/core/model/tree';
import type { Figure, PathNode, Procedural } from '@/core/model/types';

import { createProcedural, setParams } from './edits';
import { getKind } from './registry';

function placed(kind: string): { fig: Figure; o: Procedural } {
  const k = getKind(kind);
  if (!k) throw new Error(kind);
  const o = createProcedural(k, { x: 200, y: 200 });
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return { fig: addObjects(page.id, [o]).apply({ doc, assets: {} }), o };
}

function toggle(fig: Figure, o: Procedural, closed: boolean): Figure {
  const page = fig.doc.pages[0];
  if (!page) throw new Error('no page');
  return setParams(page.id, o.id, 'Closed', (p) => ({ ...p, closed })).apply(fig);
}

const pathOf = (fig: Figure): readonly PathNode[] | undefined =>
  ([...docObjects(fig.doc)][0] as Procedural).path;

const scaled = (path: readonly PathNode[], sx: number, sy: number): PathNode[] => {
  const s = (p: { x: number; y: number }) => ({ x: p.x * sx, y: p.y * sy });
  return path.map((n) => ({
    ...s(n),
    ...(n.in ? { in: s(n.in) } : {}),
    ...(n.out ? { out: s(n.out) } : {}),
  }));
};

/** The figure with its one object's path replaced (as resizing or a later path editor would). */
const withPath = (fig: Figure, path: PathNode[]): Figure => ({
  ...fig,
  doc: {
    ...fig.doc,
    pages: fig.doc.pages.map((p) => mapPageObjs(p, (x) => ({ ...x, path }) as Procedural)),
  },
});

describe.each(['bilayer', 'receptors'])('Closed on a %s', (kind) => {
  it('swaps the default line for an oval and back', () => {
    const { fig, o } = placed(kind);
    const open = pathOf(fig);
    const closed = toggle(fig, o, true);
    expect(pathOf(closed)).toHaveLength(4);
    expect(pathOf(toggle(closed, o, false))).toEqual(open);
  });

  it('opens a resized oval too', () => {
    const { fig, o } = placed(kind);
    const closed = toggle(fig, o, true);
    const oval = pathOf(closed) ?? [];
    const resized = withPath(closed, scaled(oval, 1.7, 0.6));
    expect(pathOf(toggle(resized, o, false))).toHaveLength(2);
  });

  it('keeps a path that is not a plain oval', () => {
    const { fig, o } = placed(kind);
    const closed = toggle(fig, o, true);
    const bent = (pathOf(closed) ?? []).map((n, i) => (i === 1 ? { ...n, y: n.y + 9 } : n));
    const custom = withPath(closed, bent);
    expect(pathOf(toggle(custom, o, false))).toEqual(bent);
  });
});
