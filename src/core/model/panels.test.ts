import { describe, expect, it } from 'vitest';

import { createPage, createPanel, frame } from './factory';
import { formatLabel, letter, panelLabels } from './panels';
import type { Page } from './types';

describe('panel labels', () => {
  it('letters A..Z then AA', () => {
    expect([0, 1, 25, 26, 27].map(letter)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
    expect(formatLabel(1, '(a)')).toBe('(b)');
    expect(formatLabel(2, 'a)')).toBe('c)');
  });

  it('assigns auto labels in reading order with a row tolerance', () => {
    const tr = createPanel(frame(200, 5, 100, 100));
    const tl = createPanel(frame(0, 0, 100, 100));
    const bl = createPanel(frame(0, 120, 100, 100));
    const br = { ...createPanel(frame(200, 128, 100, 100)), autoLabel: false, label: 'x' };
    const page0 = createPage();
    const layer = page0.layers[0];
    if (!layer) throw new Error('no layer');
    const page: Page = { ...page0, layers: [{ ...layer, children: [br, bl, tr, tl] }] };
    const labels = panelLabels(page, 'A');
    expect([tl, tr, bl, br].map((p) => labels.get(p.id))).toEqual(['A', 'B', 'C', 'x']);
  });
});
