import { describe, expect, it } from 'vitest';

import { type NewickNode, parseNewick } from './newick';

const ok = (s: string): NewickNode => {
  const r = parseNewick(s);
  if (!r.ok) throw new Error(r.error);
  return r.root;
};
const err = (s: string): string => {
  const r = parseNewick(s);
  if (r.ok) throw new Error('parsed');
  return r.error;
};

describe('parseNewick', () => {
  it('parses lengths, internal labels and a trailing semicolon', () => {
    const t = ok('((A:0.1,B:0.2)95:0.05,C:0.3)root;');
    expect(t.name).toBe('root');
    expect(t.children).toHaveLength(2);
    const [ab, c] = t.children;
    expect(ab?.name).toBe('95');
    expect(ab?.length).toBe(0.05);
    expect(ab?.children.map((n) => n.name)).toEqual(['A', 'B']);
    expect(c?.length).toBe(0.3);
  });

  it('does not need the semicolon, lengths or names', () => {
    const t = ok('(,(,));');
    expect(t.children).toHaveLength(2);
    expect(t.children[1]?.children).toHaveLength(2);
    expect(ok('(A,B)').children[0]?.length).toBeNull();
  });

  it('reads quoted labels, underscores and scientific notation; skips comments', () => {
    const t = ok("('it''s (x)':1e-2,[&note]Homo_sapiens [c]:3E2);");
    expect(t.children[0]?.name).toBe("it's (x)");
    expect(t.children[0]?.length).toBeCloseTo(0.01);
    expect(t.children[1]?.name).toBe('Homo sapiens');
    expect(t.children[1]?.length).toBe(300);
  });

  it('takes a single leaf, and ignores a second tree', () => {
    expect(ok('A;').children).toHaveLength(0);
    expect(ok('(A,B);(C,D);').children).toHaveLength(2);
  });

  it('reports malformed strings instead of throwing', () => {
    expect(err('')).toMatch(/Paste a Newick/);
    expect(err('(A,B')).toMatch(/Missing '\)'/);
    expect(err('(A,B));')).toMatch(/Unmatched '\)'/);
    expect(err('(A:x,B);')).toMatch(/Bad branch length "x"/);
    expect(err('(A:,B);')).toMatch(/Bad branch length ""/);
    expect(err('(A:1e999,B);')).toMatch(/Bad branch length/);
    expect(err("('abc,B);")).toMatch(/Unclosed quote/);
    expect(err('(A,B)[oops;')).toMatch(/Unclosed '\['/);
    expect(err('(A B);')).toMatch(/Expected ',' or '\)'/);
  });

  it('refuses absurd nesting without overflowing the stack', () => {
    expect(err('('.repeat(5000))).toMatch(/Nested deeper/);
  });
});
