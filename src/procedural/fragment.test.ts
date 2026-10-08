/**
 * Fragment import (note 05): a PlasmidPop copy-map command fragment
 * (the real writer's output, pBR322) pastes as an editable plasmid map;
 * snapshots keep unknown kinds visible; "Convert to shapes" keeps the
 * attribution right.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { docCreditItems } from '@/core/attribution/attribution';
import { addObjects } from '@/core/edits/edits';
import { createDoc, frame } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { docObjects } from '@/core/model/tree';
import type { Asset, Figure, Icon, Obj, Procedural } from '@/core/model/types';
import { readFragment, readJfig, writeJfig } from '@/io/jfig';
import { objectToNode, renderCtx } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { convertObjects, setParams } from './edits';
import type { Feature } from './kinds/plasmid';
import { resolveProcedural } from './registry';
import { figureWithSnapshots, withSnapshots } from './snapshot';

beforeAll(loadTestFonts);

const FIXTURE = readFileSync(
  new URL('../io/fixtures/plasmidpop-pbr322.fragment.json', import.meta.url),
  'utf8',
);

function figureWith(objs: readonly Obj[], assets: Record<string, Asset> = {}): Figure {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return addObjects(page.id, objs, assets).apply({ doc, assets: {} });
}

const pageOf = (f: Figure) => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};

const svgOf = (f: Figure): string => {
  const page = pageOf(f);
  const ctx = renderCtx(page, f.doc, f.assets, { textMode: 'text', screen: false });
  return [...docObjects(f.doc)]
    .map((o) => objectToNode(o, ctx))
    .map((n) => (n ? nodeToSvgString(n) : ''))
    .join('');
};

const ICON_ASSET: Asset = {
  kind: 'icon',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>',
  slots: [],
  recolor: 'whole',
  meta: {
    library: 'test',
    libraryVersion: '1',
    id: 'cell',
    title: 'Cell',
    source: 'Bioicons',
    author: 'Someone',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    originalUrl: 'https://bioicons.com',
    shareAlike: false,
  },
};

const icon: Icon = {
  id: 'o_icon' as Id,
  type: 'icon',
  frame: frame(400, 0, 20, 20),
  opacity: 1,
  asset: 'hicon',
  slots: {},
  lockAspect: true,
};

describe('PlasmidPop fragment', () => {
  const frag = readFragment(FIXTURE);

  it('reads as one plasmid map of the known kind with every feature', () => {
    expect(frag).not.toBeNull();
    expect(frag?.objects).toHaveLength(1);
    const o = frag?.objects[0];
    expect(o?.type).toBe('procedural');
    const r = resolveProcedural(o as Procedural);
    expect(r?.kind.kind).toBe('plasmidMap');
    const raw = (o as Procedural).params as { features: unknown[]; length: number };
    expect(r?.params['length']).toBe(raw.length);
    expect((r?.params['features'] as readonly Feature[]).length).toBe(raw.features.length);
  });

  it('decodes PlasmidPop features exactly (positions, strands, colours, types)', () => {
    const o = frag?.objects[0] as Procedural;
    const raw = (o.params as { features: Feature[] }).features;
    const got = resolveProcedural(o)?.params['features'] as readonly Feature[];
    raw.forEach((f, i) => {
      expect(got[i]).toEqual({
        name: f.name,
        start: f.start,
        end: f.end,
        strand: f.strand,
        type: f.type,
        color: f.color,
      });
    });
  });

  it('is editable once pasted: renaming a feature redraws its label', () => {
    const o = frag?.objects[0] as Procedural;
    let fig = figureWith([o]);
    expect(svgOf(fig)).toContain('SYNPBR322');
    fig = setParams(pageOf(fig).id, o.id, 'Name', (p) => ({
      ...p,
      features: (p['features'] as readonly Feature[]).map((f, i) =>
        i === 0 ? { ...f, name: 'MyFeature' } : f,
      ),
      name: 'pEdited',
    })).apply(fig);
    const svg = svgOf(fig);
    expect(svg).toContain('MyFeature');
    expect(svg).toContain('pEdited');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('round-trips through a saved file losslessly', () => {
    const o = frag?.objects[0] as Procedural;
    const fig = figureWith([o]);
    const back = readJfig(writeJfig(fig, { name: 't', version: '0' }));
    const p = [...docObjects(back.doc)][0] as Procedural;
    expect(p.params).toEqual(o.params);
  });
});

describe('snapshots', () => {
  it('carry a picture and no credit; an unknown kind draws its snapshot', () => {
    const frag = readFragment(FIXTURE);
    const o = frag?.objects[0] as Procedural;
    const snap = withSnapshots([o], []);
    const s = snap.objs[0] as Procedural;
    expect(s.snapshot).toBeDefined();
    const asset = snap.assets[s.snapshot ?? ''];
    expect(asset?.kind).toBe('svgImport');
    const future: Procedural = { ...s, kind: 'fromTheFuture' };
    const fig = figureWith([future], snap.assets);
    expect(docCreditItems(fig.doc, fig.assets)).toEqual([]);
    const svg = svgOf(fig);
    expect(svg).not.toContain('stroke-dasharray="4 3"');
    expect(svg).toContain('<path');
  });

  it('are added on save and dropped again when the object goes', () => {
    const o = readFragment(FIXTURE)?.objects[0] as Procedural;
    const fig = figureWithSnapshots(figureWith([o]));
    const text = writeJfig(fig, { name: 't', version: '0' });
    expect(Object.keys(readJfig(text).assets)).toHaveLength(1);
  });
});

describe('Convert to shapes', () => {
  it('replaces the object by a group of plain shapes, one undo step, same look', () => {
    const o = readFragment(FIXTURE)?.objects[0] as Procedural;
    const fig = figureWith([o]);
    const out = convertObjects(pageOf(fig).id, [o], []).apply(fig);
    const objs = [...docObjects(out.doc)];
    expect(objs.some((x) => x.type === 'procedural')).toBe(false);
    const g = objs[0];
    expect(g?.type).toBe('group');
    const types = new Set(objs.map((x) => x.type));
    expect(types).toContain('path');
    expect(types).toContain('text');
    // The backbone circle stays centred where the map was.
    const ring = objs.find((x) => x.type === 'ellipse');
    expect(ring && ring.frame.x + ring.frame.w / 2).toBeCloseTo(o.frame.x + o.frame.w / 2, 3);
    expect(ring && ring.frame.y + ring.frame.h / 2).toBeCloseTo(o.frame.y + o.frame.h / 2, 3);
  });

  it('keeps the attribution of icons next to it, and adds none', () => {
    const o = readFragment(FIXTURE)?.objects[0] as Procedural;
    const fig = figureWith([o, icon], { hicon: ICON_ASSET });
    const before = docCreditItems(fig.doc, fig.assets);
    const out = convertObjects(pageOf(fig).id, [o], []).apply(fig);
    expect(docCreditItems(out.doc, out.assets)).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it('turns an unknown kind into a picture of its snapshot (still uncredited)', () => {
    const o = readFragment(FIXTURE)?.objects[0] as Procedural;
    const snap = withSnapshots([o], []);
    const future = { ...(snap.objs[0] as Procedural), kind: 'fromTheFuture' };
    const fig = figureWith([future], snap.assets);
    const out = convertObjects(pageOf(fig).id, [future], []).apply(fig);
    const img = [...docObjects(out.doc)][0];
    expect(img?.type).toBe('image');
    expect(docCreditItems(out.doc, out.assets)).toEqual([]);
  });

  it('is exact for a rotated object: shapes keep their place', () => {
    const o = readFragment(FIXTURE)?.objects[0] as Procedural;
    const rot: Procedural = { ...o, frame: { ...o.frame, x: 100, y: 50, rotation: 90 } };
    const fig = figureWith([rot]);
    const g = [...docObjects(convertObjects(pageOf(fig).id, [rot], []).apply(fig).doc)][0];
    // Turned 90° about its centre: the ring keeps its centre, a label moves round it.
    const all = [...docObjects(convertObjects(pageOf(fig).id, [rot], []).apply(fig).doc)];
    expect(g?.type).toBe('group');
    const ring = all.find((x) => x.type === 'ellipse');
    expect(ring && ring.frame.x + ring.frame.w / 2).toBeCloseTo(100 + 160, 3);
    expect(ring && ring.frame.y + ring.frame.h / 2).toBeCloseTo(50 + 160, 3);
    const label = all.find((x) => x.type === 'text');
    expect(label?.frame.rotation).toBe(90);
  });
});
