import { describe, expect, it } from 'vitest';

import { type TimelineParams, tickText, tickTimes, timeline } from './kinds/timeline';
import { decodeParams, defaultParams } from './params';
import type { Params } from './types';

const params = (over: Partial<Params> = {}): TimelineParams => {
  const p = decodeParams(timeline.fields, { ...defaultParams(timeline.fields), ...over });
  return (timeline.fix ? timeline.fix(p) : p) as unknown as TimelineParams;
};

describe('timeline ticks', () => {
  it('writes "Day 7", "Week 2" and "24 h", or bare numbers', () => {
    expect(tickText({ unit: 'days', tickLabels: 'prefix' }, 7)).toBe('Day 7');
    expect(tickText({ unit: 'weeks', tickLabels: 'prefix' }, 2)).toBe('Week 2');
    expect(tickText({ unit: 'hours', tickLabels: 'prefix' }, 24)).toBe('24 h');
    expect(tickText({ unit: 'days', tickLabels: 'unit' }, 0.5)).toBe('0.5');
    expect(tickText({ unit: 'days', tickLabels: 'none' }, 3)).toBe('');
  });

  it('prefers weeks of days and whole days of hours', () => {
    expect(tickTimes(params(), 330)).toEqual([0, 7, 14]);
    expect(tickTimes(params({ unit: 'hours', end: 72 }), 330)).toEqual([0, 24, 48, 72]);
    expect(tickTimes(params({ end: 10 }), 330)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('keeps a typed step unless it would give hundreds of ticks', () => {
    expect(tickTimes(params({ start: -2, end: 9, step: 3 }), 330)).toEqual([0, 3, 6, 9]);
    expect(tickTimes(params({ end: 10_000, step: 1 }), 330).length).toBeLessThanOrEqual(11);
  });

  it('never lets the axis end at or before its start', () => {
    expect(params({ start: 5, end: 5 })).toMatchObject({ start: 5, end: 6 });
    expect(params({ start: 100_000, end: 3 })).toMatchObject({ start: 99_999, end: 100_000 });
  });
});

describe('timeline render', () => {
  const slots = { axis: '#000000', marker: '#ff0000', text: '#000000' };
  it('is one path per colour, and stacks colliding labels in rows', () => {
    const p = params({
      events: [
        { label: 'A long first label', time: 1, marker: 'triangle', end: 1, color: '' },
        { label: 'A long second label', time: 2, marker: 'tick', end: 2, color: '' },
      ],
    });
    const prims = timeline.render(p as never, { w: 360, h: 90, slots });
    const fills = prims.flatMap((q) => (q.kind === 'path' ? [q.fill] : []));
    expect(new Set(fills).size).toBe(fills.length);
    const ys = prims.flatMap((q) =>
      q.kind === 'text' && q.text.startsWith('A long') ? [q.y] : [],
    );
    expect(ys).toHaveLength(2);
    expect(ys[0]).not.toBeCloseTo(ys[1] ?? 0);
  });

  it('leaves out events and periods outside the axis', () => {
    const p = params({
      events: [{ label: 'Later', time: 30, marker: 'triangle', end: 30, color: '' }],
      ranges: [{ label: 'Before', start: -9, end: -2, color: '#00ff00' }],
    });
    const prims = timeline.render(p as never, { w: 360, h: 90, slots });
    const texts = prims.flatMap((q) => (q.kind === 'text' ? [q.text] : []));
    expect(texts).not.toContain('Later');
    expect(texts).not.toContain('Before');
  });
});
