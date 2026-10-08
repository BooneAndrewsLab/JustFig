import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Run } from '../model/types';
import {
  type RunStyle,
  applyInput,
  build,
  flatten,
  patchRange,
  styleAt,
  toggleRange,
  toggleStyle,
} from './rich';

const base: RunStyle = { font: 'arimo', size: 10, color: { hex: '#000000' } };
const r = (text: string, over: Partial<Run> = {}): Run => ({ ...base, text, ...over });

const styleArb = fc
  .record({
    bold: fc.boolean(),
    script: fc.constantFrom(undefined, 'sub' as const, 'sup' as const),
    size: fc.constantFrom(8, 10),
  })
  .map(({ bold, script, size }): RunStyle => ({
    ...base,
    size,
    ...(bold ? { bold: true } : {}),
    ...(script ? { script } : {}),
  }));
const runsArb = fc.array(
  fc.array(
    fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => !s.includes('\n')),
        styleArb,
      )
      .map(([t, s]) => ({ ...s, text: t })),
    {
      minLength: 1,
      maxLength: 4,
    },
  ),
  { minLength: 1, maxLength: 3 },
);

describe('rich text', () => {
  it('round-trips runs through flatten/build (merging same-style neighbours)', () => {
    fc.assert(
      fc.property(runsArb, (runs) => {
        const rich = flatten(runs, base);
        expect(rich.styles.length).toBe(rich.text.length);
        const back = build(rich, base);
        expect(back.map((p) => p.map((x) => x.text).join(''))).toEqual(
          runs.map((p) => p.map((x) => x.text).join('')),
        );
        expect(flatten(back, base)).toEqual(rich);
      }),
    );
  });

  it('keeps one style per character through any edit', () => {
    fc.assert(
      fc.property(runsArb, fc.string({ maxLength: 20 }), fc.nat(), fc.nat(), (runs, ins, a, b) => {
        const rich = flatten(runs, base);
        const i = a % (rich.text.length + 1);
        const j = i + (b % (rich.text.length - i + 1));
        const next = rich.text.slice(0, i) + ins + rich.text.slice(j);
        const out = applyInput(rich, next, { ...base, bold: true });
        expect(out.text).toBe(next);
        expect(out.styles.length).toBe(next.length);
      }),
    );
  });

  it('types in the style at the caret and makes subscripts', () => {
    let rich = flatten([[r('H')]], base);
    rich = applyInput(rich, 'H2', toggleStyle(styleAt(rich, 1, base), 'sub'));
    rich = applyInput(rich, 'H2O', styleAt(rich, 1, base));
    expect(build(rich, base)).toEqual([[r('H'), r('2', { script: 'sub' }), r('O')]]);
  });

  it('toggles a range on, then off again', () => {
    const rich = flatten([[r('Ca2+')]], base);
    const sup = toggleRange(rich, 2, 4, 'sup');
    expect(build(sup, base)).toEqual([[r('Ca'), r('2+', { script: 'sup' })]]);
    expect(build(toggleRange(sup, 2, 4, 'sup'), base)).toEqual([[r('Ca2+')]]);
    expect(build(patchRange(rich, 0, 0, { size: 14 }), base)).toEqual([[r('Ca2+', { size: 14 })]]);
  });

  it('keeps empty paragraphs', () => {
    const rich = flatten([[r('a')], [r('')], [r('b')]], base);
    expect(rich.text).toBe('a\n\nb');
    expect(build(rich, base)).toEqual([[r('a')], [r('')], [r('b')]]);
  });
});
