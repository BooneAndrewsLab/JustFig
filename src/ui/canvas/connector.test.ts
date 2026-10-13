import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { makeFromPath } from '@/procedural/edits';
import { allKinds } from '@/procedural/registry';
import { outline, reconcileBindings } from '@/core/model/binding';
import {
  createArrow,
  createDoc,
  createLine,
  createRect,
  frame,
  isLine,
} from '@/core/model/factory';
import { findObj } from '@/core/model/tree';
import type { Figure, Obj, Page } from '@/core/model/types';
import { objectToNode, renderCtx } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';
import { objName, typeName } from '../panels/objName';

import {
  CENTRE_SNAP_PX,
  SITE_CHOICES,
  SITE_SNAP_PX,
  bindHit,
  bindOverlay,
  bindingOf,
  siteName,
} from './connector';

/** A page holding `objs`. */
function pageWith(...objs: Obj[]): { fig: Figure; page: Page } {
  const f0: Figure = { doc: createDoc(), assets: {} };
  const id = f0.doc.pages[0]?.id;
  if (!id) throw new Error('no page');
  const fig = addObjects(id, objs).apply(f0);
  const page = fig.doc.pages[0];
  if (!page) throw new Error('no page');
  return { fig, page };
}

// Rect 100,100 80×40: centre (140, 120), top site (140, 98), right site (182, 120).
const r = createRect(frame(100, 100, 80, 40));

describe('bindHit (issue 100)', () => {
  const { page } = pageWith(r);

  it('snaps an end over an object to an edge site within the radius', () => {
    const h = bindHit(page, r, { x: 143, y: 99 }, 1);
    expect(h?.site).toBe('top');
    expect(h?.at?.x).toBeCloseTo(140);
    expect(h?.at?.y).toBeCloseTo(98);
    expect(h && bindingOf(h)).toEqual({ id: r.id, site: 'top' });
  });

  it('gives the centre a smaller radius than the edges', () => {
    expect(CENTRE_SNAP_PX).toBeLessThan(SITE_SNAP_PX);
    // 6 px from the centre: an edge site would snap, the centre does not: the end slides.
    const off = bindHit(page, r, { x: 146, y: 120 }, 1);
    expect(off?.obj.id).toBe(r.id);
    expect(off?.site).toBeUndefined();
    expect(off && bindingOf(off)).toEqual({ id: r.id });
    expect(bindHit(page, r, { x: 142, y: 120 }, 1)?.site).toBe('center');
    // The radii are screen pixels: zoomed in 4×, 6 pt is 24 px, too far even for an edge.
    expect(bindHit(page, r, { x: 140, y: 104 }, 4)?.site).toBeUndefined();
  });

  it('slides on the outline with Alt, however near a site', () => {
    const h = bindHit(page, r, { x: 140, y: 98 }, 1, { alt: true });
    expect(h?.obj.id).toBe(r.id);
    expect(h?.site).toBeUndefined();
  });

  it('finds an object by a site just outside its outline, not under the pointer', () => {
    const h = bindHit(page, undefined, { x: 185, y: 121 }, 1);
    expect(h?.obj.id).toBe(r.id);
    expect(h?.site).toBe('right');
    expect(bindHit(page, undefined, { x: 300, y: 300 }, 1)).toBeUndefined();
    // The centre is never found from outside: it is inside the object.
    expect(bindHit(page, undefined, { x: 140, y: 120 }, 1)?.site).not.toBe('right');
  });

  it('never offers the excluded object (the other end of the dragged arrow)', () => {
    expect(bindHit(page, r, { x: 143, y: 99 }, 1, { exclude: r.id })).toBeUndefined();
    expect(bindHit(page, undefined, { x: 185, y: 121 }, 1, { exclude: r.id })).toBeUndefined();
  });

  it('ignores arrows, locked objects (by site) and hidden ones', () => {
    const a = createArrow([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    const locked = createRect(frame(300, 100, 40, 40));
    const { page: p2 } = pageWith({ ...locked, locked: true }, a);
    expect(bindHit(p2, a, { x: 10, y: 0 }, 1)).toBeUndefined();
    expect(bindHit(p2, undefined, { x: 320, y: 97 }, 1)).toBeUndefined();
  });
});

describe('the live label and overlay', () => {
  it('names every site, and no site is Outline', () => {
    expect(SITE_CHOICES.map(siteName)).toEqual([
      'Outline',
      'Top',
      'Right',
      'Bottom',
      'Left',
      'Centre',
    ]);
  });

  it('draws the outline ring only when the end would slide, and fills the snapped dot', () => {
    const at = { x: 1, y: 2 };
    const slide = bindOverlay({ obj: r }, at);
    expect(slide.ring).toEqual(outline(r));
    expect(slide.sites?.filter((x) => x.hot)).toHaveLength(0);
    expect(slide.label).toEqual({ at, text: 'Outline' });
    const fixed = bindOverlay({ obj: r, site: 'left', at: { x: 98, y: 120 } }, at);
    expect(fixed.ring).toBeUndefined();
    expect(fixed.sites).toHaveLength(5);
    expect(fixed.sites?.filter((x) => x.hot)).toHaveLength(1);
    expect(fixed.label?.text).toBe('Left');
    expect(bindOverlay(undefined, at)).toEqual({});
  });
});

describe('lines are connectors (issue 100)', () => {
  const nodes = [
    { x: 10, y: 10 },
    { x: 90, y: 40 },
  ];

  it('the Line tool makes an arrow with no heads, named a line', () => {
    const l = createLine(nodes);
    expect(l.type).toBe('arrow');
    expect(l.start.kind).toBe('none');
    expect(l.end.kind).toBe('none');
    expect(isLine(l)).toBe(true);
    expect(typeName(l)).toBe('Line');
    expect(objName(l)).toBe('Line');
    const a = createArrow(nodes);
    expect(isLine(a)).toBe(false);
    expect(typeName(a)).toBe('Arrow');
    expect(typeName({ ...l, end: { kind: 'triangle', size: 4 } })).toBe('Arrow');
  });

  it('exports as one plain stroked path: no head geometry', () => {
    const l = createLine(nodes);
    const { fig, page } = pageWith(l);
    const node = objectToNode(
      l,
      renderCtx(page, fig.doc, fig.assets, { textMode: 'outline', screen: false }),
    );
    const svg = node ? nodeToSvgString(node) : '';
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/marker|filter|mask/);
  });

  it('binds and follows its target as an arrow does', () => {
    const line = { ...createLine(nodes), bind: { end: { id: r.id, site: 'left' as const } } };
    const { fig } = pageWith(r, line);
    const solved = reconcileBindings({ doc: createDoc(), assets: {} }, fig);
    const got = solved.doc.pages[0] ? findObj(solved.doc.pages[0], line.id) : undefined;
    if (got?.type !== 'arrow') throw new Error('no line');
    const last = got.nodes[got.nodes.length - 1];
    if (!last) throw new Error('no end');
    // The left site, 2 pt outside the edge, in page coordinates.
    expect(got.frame.x + last.x).toBeCloseTo(98);
    expect(got.frame.y + last.y).toBeCloseTo(120);
  });

  it('can still follow-this-path into a path kind', () => {
    const kind = allKinds().find((k) => k.usesPath);
    if (!kind) throw new Error('no path kind');
    const l = createLine(nodes);
    const { fig, page } = pageWith(l);
    const made = makeFromPath(page.id, l, kind.kind).apply(fig);
    const p = made.doc.pages[0];
    const o = p ? findObj(p, l.id) : undefined;
    expect(o).toBeUndefined();
    expect(p?.layers[0]?.children[0]?.type).toBe('procedural');
  });
});
