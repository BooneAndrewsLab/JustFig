/**
 * Performance (plan Phase 3): a full 1536-well plate and a 2,000-lipid
 * bilayer. Moving one reuses its drawing (only the transform changes);
 * resizing regenerates it. Bounds are generous so the test is not flaky;
 * the measured times are printed (PERF=1) for the design note.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { scaleObj, translateObj } from '@/core/geometry/transform';
import type { Obj, Procedural } from '@/core/model/types';
import { objectToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';
import type { RenderCtx } from '@/render/objectToNode';
import { loadTestFonts } from '@/test/fonts';

import { createProcedural } from './edits';
import { wellId } from './kinds/wellPlate';
import { getKind } from './registry';
import { proceduralNodes } from '@/render/procedural';

beforeAll(loadTestFonts);

const ctx: RenderCtx = {
  palette: [],
  assets: {},
  textMode: 'outline',
  screen: true,
  labelStyle: { format: 'A', font: 'arimo', size: 12, bold: true, offset: { x: 0, y: 0 } },
  labels: new Map(),
};

/** What PageView does per object per frame: build the node, serialise its content (cached by array). */
const inner = new WeakMap<object, string>();
function frameCost(o: Obj): number {
  const t = performance.now();
  const n = objectToNode(o, ctx);
  if (n && !inner.has(n.children))
    inner.set(n.children, n.children.map((c) => nodeToSvgString(c)).join(''));
  return performance.now() - t;
}

function measure(o: Procedural, label: string) {
  const first = frameCost(o);
  let cur: Obj = o;
  const moves: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    cur = translateObj(cur, 1, 0.5);
    moves.push(frameCost(cur));
  }
  const resizes: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    cur = scaleObj(cur, { x: cur.frame.x, y: cur.frame.y }, 1.01, 1.01);
    resizes.push(frameCost(cur));
  }
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const r = { first, move: avg(moves), moveMax: Math.max(...moves), resize: avg(resizes) };
  if (process.env['PERF'] === '1')
    console.warn(
      `${label}: first ${r.first.toFixed(1)} ms, move ${r.move.toFixed(3)} ms (max ${r.moveMax.toFixed(2)}), resize ${r.resize.toFixed(1)} ms`,
    );
  return r;
}

describe('procedural performance', () => {
  it('a full 1536-well plate moves without regenerating', () => {
    const k = getKind('wellPlate');
    if (!k) throw new Error('no kind');
    const colours = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'];
    const wells: Record<string, string> = {};
    for (let r = 0; r < 32; r += 1)
      for (let c = 0; c < 48; c += 1) wells[wellId(r, c)] = colours[(r * 7 + c) % 7] ?? '#000000';
    const o = createProcedural(k, { x: 300, y: 200 }, { format: '1536', wells });
    const nodes = proceduralNodes(o, 'outline', true, []) ?? [];
    // Plate body, one path per colour, the outlines and the hit area: not one node per well.
    expect(nodes.filter((n) => n.tag === 'path').length).toBeLessThan(12);
    const r = measure(o, '1536-well plate');
    expect(r.move).toBeLessThan(4);
    expect(r.resize).toBeLessThan(250);
  });

  it('a 2,000-lipid bilayer moves without regenerating', () => {
    const k = getKind('bilayer');
    if (!k) throw new Error('no kind');
    // 1,000 positions × two leaflets = 2,000 lipids, along a 6,000 pt path.
    const o = createProcedural(k, { x: 0, y: 0 });
    const long: Procedural = {
      ...o,
      frame: { ...o.frame, w: 6030, h: 40 },
      path: [
        { x: 15, y: 20 },
        { x: 6015, y: 20 },
      ],
    };
    const nodes = proceduralNodes(long, 'outline', true, []) ?? [];
    expect(nodes.length).toBeLessThanOrEqual(3);
    const r = measure(long, '2,000-lipid bilayer');
    expect(r.move).toBeLessThan(4);
    expect(r.resize).toBeLessThan(250);
  });
});
