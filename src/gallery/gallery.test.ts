import { beforeAll, describe, expect, it } from 'vitest';

import { endPoint, outline, targetCentre, BIND_GAP } from '@/core/model/binding';
import { findObj, pageObjects } from '@/core/model/tree';
import type { Obj, Vec2 } from '@/core/model/types';
import { exportRoot } from '@/export/svg';
import { readJfig, writeJfig } from '@/io/jfig';
import { resolveProcedural } from '@/procedural/registry';
import { walkNodes } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { GALLERY } from './gallery';

beforeAll(loadTestFonts);

function onOutline(p: Vec2 | undefined, t: Obj): boolean {
  if (!p) return false;
  const c = targetCentre(t);
  const l = Math.hypot(p.x - c.x, p.y - c.y);
  const k = (l - BIND_GAP) / l;
  const q = { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  const poly = outline(t);
  return poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (!b) return false;
    const cross = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    const along = (q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y);
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return Math.abs(cross) / Math.sqrt(l2) < 0.01 && along >= -1e-6 && along <= l2 + 1e-6;
  });
}

describe('the gallery (note 08)', () => {
  it('has unique kebab-case ids, both templates and examples', () => {
    const ids = GALLERY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(GALLERY.some((e) => e.kind === 'template')).toBe(true);
    expect(GALLERY.some((e) => e.kind === 'example')).toBe(true);
  });

  for (const entry of GALLERY) {
    describe(entry.id, () => {
      it('builds a valid figure that saves and opens unchanged', () => {
        const fig = entry.build();
        const text = writeJfig(fig, { name: 'test', version: '0' });
        const back = readJfig(text);
        expect(
          writeJfig({ doc: back.doc, assets: back.assets }, { name: 'test', version: '0' }),
        ).toBe(text);
      });

      it('gets fresh ids each time', () => {
        const a = entry.build();
        const b = entry.build();
        expect(a.doc.id).not.toBe(b.doc.id);
      });

      it('fits on its page, uses only known kinds, and exports within the subset', () => {
        const fig = entry.build();
        const page = fig.doc.pages[0];
        if (!page) throw new Error('no page');
        for (const o of pageObjects(page)) {
          const f = o.frame;
          expect(f.x, o.id).toBeGreaterThanOrEqual(-1);
          expect(f.y, o.id).toBeGreaterThanOrEqual(-1);
          expect(f.x + f.w, o.id).toBeLessThanOrEqual(page.size.w + 1);
          expect(f.y + f.h, o.id).toBeLessThanOrEqual(page.size.h + 1);
          if (o.type === 'procedural') expect(resolveProcedural(o), o.kind).not.toBeNull();
        }
        const root = exportRoot(fig, page, { textMode: 'text', footer: true, background: true });
        let tags = 0;
        for (const n of walkNodes(root.node)) {
          tags += 1;
          expect(['marker', 'filter', 'mask', 'foreignObject', 'style']).not.toContain(n.tag);
        }
        expect(tags).toBeGreaterThan(1);
      });

      it('has its arrows attached and on their targets’ outlines', () => {
        const fig = entry.build();
        const page = fig.doc.pages[0];
        if (!page) throw new Error('no page');
        for (const o of pageObjects(page)) {
          if (o.type !== 'arrow') continue;
          for (const end of ['start', 'end'] as const) {
            const id = o.bind?.[end];
            expect(id, `${o.id} ${end}`).toBeDefined();
            const t = id ? findObj(page, id) : undefined;
            if (!t) throw new Error('missing target');
            expect(onOutline(endPoint(o, end), t), `${o.id} ${end}`).toBe(true);
          }
        }
      });
    });
  }
});
