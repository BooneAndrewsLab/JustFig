import { describe, expect, it } from 'vitest';

import { allKinds } from './registry';
import { matchKinds } from './search';

const ids = (q: string): string[] => matchKinds(q).map((k) => k.kind);

describe('matchKinds', () => {
  it('finds nothing for a blank query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('  - ')).toEqual([]);
  });

  it('finds a kind by its title, case-insensitively', () => {
    expect(ids('Cell')).toContain('cell');
    expect(ids('petri')).toEqual(['petriDish']);
    expect(ids('gel')).toEqual(['gel', 'gelLabels']);
  });

  it('ranks a title match above a keyword match', () => {
    // "plate" is in the Well plate's title and only a keyword of the Petri dish.
    expect(ids('plate')).toEqual(['wellPlate', 'petriDish']);
    expect(ids('dna')[0]).toBe('helix');
  });

  it('finds a kind by a keyword, a word prefix or a plural', () => {
    expect(ids('microplate')).toEqual(['wellPlate']);
    expect(ids('96')).toEqual(['wellPlate']);
    expect(ids('electro')).toEqual(['gel']);
    expect(ids('agarose')).toEqual(['gel']);
    expect(ids('plates')).toEqual(['wellPlate', 'petriDish']);
    expect(ids('membrane')).toEqual(['receptors', 'bilayer']);
    expect(ids('umap')).toEqual(['placeholderPlot']);
    expect(ids('pca plot')).toEqual(['placeholderPlot']);
  });

  it('needs every word of the query to match', () => {
    expect(ids('96 well plate')).toEqual(['wellPlate']);
    expect(ids('agar plate')).toEqual(['petriDish']);
    expect(ids('cell zebrafish')).toEqual([]);
    expect(ids('zebrafish')).toEqual([]);
  });

  it('gives every kind keywords and finds every kind by its own title', () => {
    for (const k of allKinds()) {
      expect(k.keywords.length, k.kind).toBeGreaterThan(0);
      expect(ids(k.title), k.kind).toContain(k.kind);
    }
  });
});
