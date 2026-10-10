import { describe, expect, it } from 'vitest';

import { studyDesign } from './kinds/studyDesign';
import { decodeParams, defaultParams } from './params';
import type { PathPrim, TextPrim } from './prims';

const slots = {
  axis: '#000000',
  text: '#000000',
  inject: '#ff0000',
  dose: '#00ff00',
  sample: '#0000ff',
  endpoint: '#ffff00',
};
const draw = (over = {}) => {
  const p = decodeParams(studyDesign.fields, { ...defaultParams(studyDesign.fields), ...over });
  return studyDesign.render(p, { w: 380, h: 150, slots });
};
const labels = (o = {}) =>
  draw(o)
    .filter((q): q is TextPrim => q.kind === 'text')
    .map((q) => q.text);

describe('study design render', () => {
  it('writes the group name and n, and leaves n out when 0', () => {
    expect(labels()).toContain('Vehicle (n = 8)');
    const one = { arms: [{ name: 'Mock', n: 0, color: '#9aa5b1' }], marks: [], bars: [] };
    expect(labels(one)).toContain('Mock');
  });

  it('is one path per colour, and skips unknown arms and times outside the axis', () => {
    const colours = draw()
      .filter((q): q is PathPrim => q.kind === 'path')
      .map((q) => q.fill);
    expect(new Set(colours).size).toBe(colours.length);
    const some = draw({
      marks: [
        { arm: 2, time: 5, kind: 'dose' },
        { arm: 1, time: 99, kind: 'dose' },
        { arm: 1, time: 5, kind: 'dose' },
      ],
      arms: [{ name: 'A', n: 1, color: '#9aa5b1' }],
      bars: [],
      legend: false,
    });
    const dose = some.filter((q): q is PathPrim => q.kind === 'path' && q.fill === '#00ff00');
    expect(dose).toHaveLength(1);
    expect(dose[0]?.subs).toHaveLength(1);
  });
});
