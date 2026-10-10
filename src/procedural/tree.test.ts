import { beforeAll, describe, expect, it } from 'vitest';

import { loadTestFonts } from '@/test/fonts';

import { tree } from './kinds/tree';
import { decodeParams, defaultParams } from './params';
import type { PathPrim, TextPrim } from './prims';
import type { Params } from './types';

beforeAll(loadTestFonts);

const slots = { branch: '#000000', text: '#111111', support: '#222222', clade: '#333333' };
const params = (over: Params = {}) =>
  decodeParams(tree.fields, { ...defaultParams(tree.fields), ...over });
const draw = (over: Params = {}) => tree.render(params(over), { w: 300, h: 200, slots });
const labels = (over: Params = {}) =>
  draw(over)
    .filter((q): q is TextPrim => q.kind === 'text')
    .map((q) => q.text);
const problems = (over: Params = {}) => tree.problems?.(params(over)) ?? [];

describe('tree render', () => {
  it('writes leaf labels, and support values only when asked', () => {
    const t = { newick: '((A:1,B:1)90:1,C:2);' };
    expect(labels(t)).toEqual(expect.arrayContaining(['A', 'B', 'C', '90']));
    expect(labels({ ...t, support: false })).not.toContain('90');
    expect(labels({ ...t, labels: false, scaleBar: false })).toEqual(['90']);
  });

  it('draws one stroked path for branches and one fill for collapsed clades', () => {
    const t = { newick: '((A,B)X,(C,D)Y);', collapse: [{ name: 'X' }, { name: 'C,D' }] };
    const paths = draw(t).filter((q): q is PathPrim => q.kind === 'path');
    expect(paths.filter((q) => q.fill !== null)).toHaveLength(1);
    expect(paths.find((q) => q.fill !== null)?.subs).toHaveLength(2);
    expect(paths.filter((q) => q.stroke !== null)).toHaveLength(1);
    expect(labels(t)).toContain('X (2)');
  });

  it('collapses the parent clade of a named leaf, and reports entries that match nothing', () => {
    expect(labels({ newick: '((A,B),C);', collapse: [{ name: 'A' }] })).toContain('A (2)');
    expect(problems({ newick: '((A,B),C);', collapse: [{ name: 'Z' }] })).toEqual([
      'Collapsed clade "Z" matches no clade or leaf.',
    ]);
  });

  it('shows a parse error as a message in the frame and in problems, never throwing', () => {
    const bad = { newick: '((A:1,B:x),C' };
    expect(labels(bad)).toEqual(['Newick: cannot read the tree']);
    expect(problems(bad)[0]).toMatch(/Bad branch length "x"/);
    expect(problems()).toEqual([]);
  });

  it('draws a single leaf, and a circular tree with turned labels, finitely', () => {
    expect(labels({ newick: 'A;' })).toEqual(['A']);
    const texts = draw({ newick: '((A,B),(C,D));', layout: 'circular' }).filter(
      (q): q is TextPrim => q.kind === 'text',
    );
    expect(texts.some((q) => q.anchor === 'end')).toBe(true);
    expect(texts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.rotation ?? 0))).toBe(true);
  });
});
