/** Kind presets (note 58): well-formed data, placing and applying one, and finding one by name. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc } from '@/core/model/factory';
import { docObjects } from '@/core/model/tree';
import type { Figure, Procedural } from '@/core/model/types';

import { createProcedural } from './edits';
import { decodeParams } from './params';
import { applyPreset, createFromPreset, findPreset, groupedPresets, presetsOf } from './presets';
import { allKinds, getKind, resolveProcedural } from './registry';
import { matchPresets } from './search';
import type { ProceduralKind } from './types';

const withPresets = allKinds().filter((k) => presetsOf(k).length > 0);

function kind(id: string): ProceduralKind {
  const k = getKind(id);
  if (!k) throw new Error(id);
  return k;
}

function placed(o: Procedural): Figure {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return addObjects(page.id, [o]).apply({ doc, assets: {} });
}

const only = (fig: Figure): Procedural => [...docObjects(fig.doc)][0] as Procedural;

describe('kind presets', () => {
  it('are seeded on the cell, bacterium, petri dish, gel, plasmid map, well plate, timeline and study design', () => {
    expect(withPresets.map((k) => k.kind).sort()).toEqual([
      'bacterium',
      'cell',
      'gel',
      'petriDish',
      'plasmidMap',
      'studyDesign',
      'timeline',
      'wellPlate',
    ]);
  });

  describe.each(withPresets.map((k) => [k.kind, k] as const))('%s', (_name, k) => {
    it('has unique kebab-case ids and labels', () => {
      const ps = presetsOf(k);
      expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
      expect(new Set(ps.map((p) => p.label)).size).toBe(ps.length);
      for (const p of ps) expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('names only fields and slots, with values that decode to themselves', () => {
      const fields = new Set(k.fields.map((f) => f.key));
      const slots = new Set(k.slots.map((s) => s.id));
      for (const p of presetsOf(k)) {
        expect(p.params !== undefined || p.slots !== undefined, p.id).toBe(true);
        for (const [key, v] of Object.entries(p.params ?? {})) {
          expect(fields.has(key), `${p.id}.${key}`).toBe(true);
          // A preset never relies on the decoder clamping or repairing it.
          expect(decodeParams(k.fields, { [key]: v })[key], `${p.id}.${key}`).toEqual(v);
        }
        for (const [id, hex] of Object.entries(p.slots ?? {})) {
          expect(slots.has(id), `${p.id} slot ${id}`).toBe(true);
          expect(hex, `${p.id} slot ${id}`).toMatch(/^#[0-9a-f]{6}$/);
        }
        if (p.size) expect(p.size.w > 0 && p.size.h > 0).toBe(true);
      }
    });
  });

  it('places an object with the preset over the defaults and its colours as plain hex', () => {
    const k = kind('petriDish');
    const ypd = findPreset(k, 'ypd');
    const streak = findPreset(k, 'streak');
    if (!ypd || !streak) throw new Error('missing presets');
    const a = createFromPreset(k, ypd, { x: 100, y: 100 });
    expect(a.params).toMatchObject({ pattern: 'random' });
    expect(a.slots['agar']).toEqual({ hex: ypd.slots?.['agar'] });
    expect(a.frame).toMatchObject({ x: 25, y: 25, w: 150, h: 150 });
    const b = createFromPreset(k, streak, { x: 0, y: 0 });
    expect(b.params).toMatchObject({ pattern: 'streak', count: 40, size: 3.5 });
    expect(b.slots).toEqual({});
  });

  it('applies as one named edit that sets only the keys the preset names', () => {
    const k = kind('petriDish');
    const o = createProcedural(k, { x: 100, y: 100 }, { size: 6, seed: 3 });
    const fig = placed(o);
    const page = fig.doc.pages[0];
    const streak = findPreset(k, 'streak');
    const ypd = findPreset(k, 'ypd');
    if (!page || !streak || !ypd) throw new Error('setup');
    const e = applyPreset(page.id, o.id, k, streak);
    expect(e.label).toBe('Apply preset Single-colony streak');
    const once = only(e.apply(fig));
    expect(once.params).toMatchObject({ pattern: 'streak', count: 40, size: 6, seed: 3 });
    // Media keeps the pattern; the pattern kept the media.
    const twice = only(applyPreset(page.id, o.id, k, ypd).apply(e.apply(fig)));
    expect(twice.params).toMatchObject({ pattern: 'streak' });
    expect(twice.slots['agar']).toEqual({ hex: ypd.slots?.['agar'] });
    expect(resolveProcedural(twice)?.params['pattern']).toBe('streak');
  });

  it('resizes to its size only while the object keeps the default size', () => {
    const k = kind('petriDish');
    const p = { id: 'wide', label: 'Wide', size: { w: 200, h: 100 } };
    const o = createProcedural(k, { x: 100, y: 100 });
    const fig = placed(o);
    const page = fig.doc.pages[0];
    if (!page) throw new Error('setup');
    expect(only(applyPreset(page.id, o.id, k, p).apply(fig)).frame).toMatchObject({
      x: 0,
      y: 50,
      w: 200,
      h: 100,
    });
    const resized = placed({ ...o, frame: { ...o.frame, w: 80 } });
    const page2 = resized.doc.pages[0];
    if (!page2) throw new Error('setup');
    expect(only(applyPreset(page2.id, o.id, k, p).apply(resized)).frame.w).toBe(80);
  });

  it('groups presets in order', () => {
    expect(groupedPresets(kind('petriDish')).map((g) => g.group)).toEqual([
      'Patterns',
      'Plates',
      'Media',
    ]);
    expect(groupedPresets(kind('gel')).map((g) => g.group)).toEqual(['']);
  });
});

describe('matchPresets', () => {
  const ids = (q: string) => matchPresets(q).map((m) => `${m.kind.kind}/${m.preset.id}`);

  it('finds a preset by its label, with the kind words narrowing it', () => {
    expect(ids('YPD')).toEqual(['petriDish/ypd']);
    expect(ids('blood')).toEqual(['petriDish/blood-agar']);
    expect(ids('colony pcr')).toEqual(['gel/colony-pcr']);
    expect(ids('checkerboard')).toEqual(['wellPlate/checkerboard']);
    expect(ids('agar dilution')).toEqual([
      'petriDish/spot-dilutions',
      'petriDish/strain-dilutions',
    ]);
  });

  it('needs a word of the label: kind words alone find the kind, not its presets', () => {
    expect(ids('')).toEqual([]);
    expect(ids('petri')).toEqual([]);
    expect(ids('ypd gel')).toEqual([]);
  });
});
