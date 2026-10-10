import { describe, expect, it } from 'vitest';

import { addObjects, deleteObjects, updateObjects } from '../edits/edits';
import { diffDocuments, jsonEqual } from './diff';
import { createDoc, createPanel, createRect, frame } from './factory';
import type { Figure } from './types';

const base = (): Figure => ({ doc: createDoc(), assets: {} });

function firstPage(f: Figure) {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p.id;
}

describe('diffDocuments', () => {
  it('finds added, removed and changed objects by id, per page', () => {
    const r1 = createRect(frame(0, 0, 10, 10));
    const r2 = createRect(frame(20, 0, 10, 10));
    const r3 = createRect(frame(40, 0, 10, 10));
    const f0 = base();
    const pid = firstPage(f0);
    const a = addObjects(pid, [r1, r2]).apply(f0);
    let b = deleteObjects(pid, [r2.id]).apply(a);
    b = addObjects(pid, [r3]).apply(b);
    b = updateObjects(pid, [r1.id], 'Move', (o) => ({ ...o, frame: frame(5, 0, 10, 10) })).apply(b);
    const [d] = diffDocuments(a.doc, b.doc);
    expect(d).toMatchObject({ pageId: pid, added: [r3.id], removed: [r2.id], changed: [r1.id] });
  });

  it('is empty for equal documents and reports a changed child, not its container', () => {
    const f0 = base();
    const pid = firstPage(f0);
    const inner = createRect(frame(1, 1, 5, 5));
    const panel = { ...createPanel(frame(0, 0, 50, 50)), children: [inner] };
    const a = addObjects(pid, [panel]).apply(f0);
    expect(diffDocuments(a.doc, a.doc)[0]).toMatchObject({ added: [], removed: [], changed: [] });
    const b = updateObjects(pid, [inner.id], 'Move', (o) => ({
      ...o,
      frame: frame(2, 2, 5, 5),
    })).apply(a);
    expect(diffDocuments(a.doc, b.doc)[0]?.changed).toEqual([inner.id]);
  });

  it('lists pages only one side has', () => {
    const d = diffDocuments(base().doc, base().doc);
    expect(d.map((x) => [x.inA, x.inB])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('jsonEqual treats undefined keys as missing', () => {
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(jsonEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
  });
});
