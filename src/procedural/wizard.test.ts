/**
 * Kind wizards (note 58): well-formed questions, a PURE `build` whose params decode to
 * themselves for any answers, and the well plate's plate map laid out as the answers say.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects } from '@/core/model/tree';
import type { Figure, Procedural } from '@/core/model/types';
import { paramsArb } from '@/test/procArbitraries';

import { createProcedural } from './edits';
import {
  CONDITION_COLOURS,
  PLATE_FORMATS,
  PLATE_MAP_COLOURS,
  conditionColour,
  plateMap,
  plateMapAnswers,
} from './kinds/wellPlate';
import { decodeParams } from './params';
import { allKinds, getKind } from './registry';
import type { Params, ProceduralKind } from './types';
import {
  applyWizard,
  createFromWizard,
  wizardAnswers,
  wizardFields,
  wizardParams,
  wizardProblems,
} from './wizard';

const withWizard = allKinds().filter((k) => k.wizard !== undefined);

function kind(id: string): ProceduralKind {
  const k = getKind(id);
  if (!k) throw new Error(id);
  return k;
}

const { negative: NEG, positive: POS, blank: BLANK } = PLATE_MAP_COLOURS;

describe('kind wizards', () => {
  it('are on the well plate and the agar plate', () => {
    expect(withWizard.map((k) => k.kind).sort()).toEqual(['petriDish', 'wellPlate']);
  });

  describe.each(withWizard.map((k) => [k.kind, k] as const))('%s', (_name, k) => {
    const w = k.wizard;
    if (!w) throw new Error('no wizard');

    it('asks at least one question per step, each answer key once', () => {
      expect(w.steps.length).toBeGreaterThan(0);
      for (const s of w.steps) {
        expect(s.question).toMatch(/\?$/);
        expect(s.fields.length).toBeGreaterThan(0);
      }
      const keys = wizardFields(w).map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('builds params that are fields of the kind and decode to themselves, for any answers', () => {
      const fields = new Set(k.fields.map((f) => f.key));
      fc.assert(
        fc.property(paramsArb(wizardFields(w)), (raw) => {
          const built = wizardParams(w, raw);
          for (const [key, v] of Object.entries(built)) {
            expect(fields.has(key), key).toBe(true);
            expect(decodeParams(k.fields, { [key]: v })[key], key).toEqual(v);
          }
          // PURE: the same answers, the same params.
          expect(wizardParams(w, raw)).toEqual(built);
          for (const m of wizardProblems(w, raw)) expect(typeof m).toBe('string');
        }),
        { numRuns: 200 },
      );
    });

    it('builds from the defaults when given nothing, and from decoded answers only', () => {
      expect(wizardParams(w, {})).toEqual(w.build(wizardAnswers(w)));
      expect(wizardParams(w, 'junk')).toEqual(wizardParams(w, {}));
    });
  });
});

describe('the plate map wizard', () => {
  const k = kind('wellPlate');
  const map = (a: Params) => plateMap(a);
  const ids = (wells: Readonly<Record<string, string>>, hex: string) =>
    Object.keys(wells)
      .filter((id) => wells[id] === hex)
      .sort();

  it('defaults to 8 conditions in triplicate across rows, controls in columns 1 and 12', () => {
    const m = map(wizardAnswers(k.wizard ?? never()));
    expect(m.format).toBe('96');
    expect(m.placed).toBe(8);
    expect(m.capacity).toBe(24);
    expect(ids(m.wells, NEG)).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'].sort());
    expect(ids(m.wells, POS)).toEqual(
      ['A12', 'B12', 'C12', 'D12', 'E12', 'F12', 'G12', 'H12'].sort(),
    );
    // Condition 1 in A2-A4, condition 2 in A5-A7, condition 4 starts row B.
    expect(ids(m.wells, conditionColour(0))).toEqual(['A2', 'A3', 'A4']);
    expect(ids(m.wells, conditionColour(1))).toEqual(['A5', 'A6', 'A7']);
    expect(ids(m.wells, conditionColour(3))).toEqual(['B2', 'B3', 'B4']);
    // 8 + 8 controls + 24 sample wells; the rest stay empty.
    expect(Object.keys(m.wells)).toHaveLength(40);
  });

  it('stacks replicates down columns, inside blank edges, with controls in rows', () => {
    const m = map({
      format: '96',
      conditions: 2,
      replicates: 2,
      direction: 'down',
      controls: 'both',
      controlPlace: 'rows',
      blankEdges: true,
    });
    expect(ids(m.wells, BLANK)).toHaveLength(36);
    expect(ids(m.wells, NEG)).toEqual([
      'B10',
      'B11',
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
      'B7',
      'B8',
      'B9',
    ]);
    expect(ids(m.wells, POS)).toHaveLength(10);
    expect(ids(m.wells, POS)).toContain('G2');
    expect(ids(m.wells, conditionColour(0))).toEqual(['C2', 'D2']);
    expect(ids(m.wells, conditionColour(1))).toEqual(['E2', 'F2']);
  });

  it('puts only negative controls in the first column, and none when asked', () => {
    const neg = map({ conditions: 1, replicates: 1, controls: 'negative' });
    expect(ids(neg.wells, NEG)).toHaveLength(8);
    expect(ids(neg.wells, POS)).toHaveLength(0);
    expect(neg.wells['A2']).toBe(conditionColour(0));
    const none = map({ conditions: 1, replicates: 1, controls: 'none' });
    expect(none.wells).toEqual({ A1: conditionColour(0) });
  });

  it('wraps a group longer than a row along the plate, and reports what does not fit', () => {
    const m = map({ format: '6', conditions: 3, replicates: 4, controls: 'none' });
    expect(m.capacity).toBe(1);
    expect(m.placed).toBe(1);
    expect(ids(m.wells, conditionColour(0))).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect(
      wizardProblems(k.wizard ?? never(), {
        format: '6',
        conditions: 3,
        replicates: 4,
        controls: 'none',
      }),
    ).toEqual(['Only 1 of 3 conditions fit in 4 replicates on a 6-well plate.']);
  });

  it('says when no wells are left, and when colours repeat', () => {
    const w = k.wizard ?? never();
    expect(wizardProblems(w, { format: '6', blankEdges: true })).toEqual([
      'No wells are left for samples: choose a bigger plate.',
    ]);
    expect(map({ format: '6', blankEdges: true }).wells).toEqual(
      Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((id) => [id, BLANK])),
    );
    expect(
      wizardProblems(w, { format: '384', conditions: 100, replicates: 2, controls: 'none' }),
    ).toEqual([`Colours repeat after ${String(CONDITION_COLOURS)} conditions.`]);
  });

  it('gives distinct colours to the first conditions, none of them a control colour', () => {
    const cs = Array.from({ length: CONDITION_COLOURS }, (_, i) => conditionColour(i));
    expect(new Set(cs).size).toBe(CONDITION_COLOURS);
    for (const c of cs) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect([NEG, POS, BLANK]).not.toContain(c);
    }
  });

  it('for any answers: every condition placed gets exactly its replicates, all in the grid', () => {
    const fields = wizardFields(k.wizard ?? never());
    fc.assert(
      fc.property(paramsArb(fields), (raw) => {
        const a = plateMapAnswers(decodeParams(fields, raw));
        const m = plateMap(decodeParams(fields, raw));
        const { rows, cols } = PLATE_FORMATS[a.format];
        expect(m.placed).toBe(Math.min(a.conditions, m.capacity));
        for (const id of Object.keys(m.wells)) {
          const match = /^([A-Z]+)(\d+)$/.exec(id);
          expect(match, id).not.toBeNull();
          expect(Number(match?.[2])).toBeLessThanOrEqual(cols);
        }
        expect(Object.keys(m.wells).length).toBeLessThanOrEqual(rows * cols);
        if (m.placed <= CONDITION_COLOURS)
          for (let i = 0; i < m.placed; i += 1)
            expect(ids(m.wells, conditionColour(i)), String(i)).toHaveLength(a.replicates);
        if (a.blankEdges) expect(m.wells['A1']).toBe(BLANK);
      }),
      { numRuns: 300 },
    );
  });

  it('places a new plate from the answers, and applies them as one named edit', () => {
    const answers = { format: '384', conditions: 4, replicates: 2, controls: 'none' };
    const placed = createFromWizard(k, answers, { x: 100, y: 100 });
    expect((placed.params as Params)['format']).toBe('384');
    expect((placed.params as Params)['wells']).toEqual(plateMap(answers).wells);

    const o = createProcedural(k, { x: 100, y: 100 }, { shape: 'square', showLabels: false });
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const fig: Figure = addObjects(page.id, [o]).apply({ doc, assets: {} });
    const e = applyWizard(page.id, o.id, k, answers);
    expect(e.label).toBe('Plate map wizard');
    const after = [...docObjects(e.apply(fig).doc)][0] as Procedural;
    // Only the keys the wizard builds change.
    expect(after.params).toMatchObject({ format: '384', shape: 'square', showLabels: false });
    expect((after.params as Params)['wells']).toEqual(plateMap(answers).wells);
  });
});

describe('the tetrad plate wizard', () => {
  const k = kind('petriDish');
  const w = k.wizard ?? never();

  it('asks about tetrads, segregation and failing spores, and builds the tetrad pattern', () => {
    expect(w.steps.map((s) => s.question)).toEqual([
      'How many tetrads?',
      'How do the spores segregate?',
      'Which spores fail?',
    ]);
    expect(wizardParams(w, {})).toEqual({
      pattern: 'tetrads',
      tetrads: 8,
      tetradLabels: true,
      segregation: '2:2',
      dead: 0,
      missing: 0,
    });
    expect(
      wizardParams(w, {
        tetrads: 99,
        segregation: '3:1',
        dead: 20,
        missing: 5,
        tetradLabels: false,
      }),
    ).toEqual({
      pattern: 'tetrads',
      tetrads: 24,
      tetradLabels: false,
      segregation: '3:1',
      dead: 20,
      missing: 5,
    });
  });

  it('warns when most spores fail', () => {
    expect(wizardProblems(w, {})).toEqual([]);
    expect(wizardProblems(w, { dead: 30, missing: 30 })).toEqual([
      'More than half of the spores will be dead or missing.',
    ]);
    expect(wizardProblems(w, { dead: 50, missing: 50 })).toEqual([
      'No spore will grow into a colony.',
    ]);
  });

  it('places a new plate from the answers and applies them as one named edit', () => {
    const answers = { tetrads: 12, segregation: '4:0', dead: 10 };
    const placed = createFromWizard(k, answers, { x: 100, y: 100 });
    expect(placed.params).toMatchObject({ pattern: 'tetrads', tetrads: 12, segregation: '4:0' });

    const o = createProcedural(k, { x: 100, y: 100 }, { lid: true, seed: 7 });
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const fig: Figure = addObjects(page.id, [o]).apply({ doc, assets: {} });
    const e = applyWizard(page.id, o.id, k, answers);
    expect(e.label).toBe('Tetrad plate wizard');
    const after = [...docObjects(e.apply(fig).doc)][0] as Procedural;
    expect(after.params).toMatchObject({ lid: true, seed: 7, pattern: 'tetrads', tetrads: 12 });
  });
});

function never(): never {
  throw new Error('no wizard');
}
