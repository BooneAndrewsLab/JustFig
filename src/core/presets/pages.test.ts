import { describe, expect, it } from 'vitest';
import { PAGE_PRESETS, JOURNALS, presetSize } from './pages';

describe('graphical abstract presets', () => {
  const ga = PAGE_PRESETS.filter((p) => p.group === 'Graphical abstract');

  it('has the verified publishers, landscape, outside the journal checks', () => {
    expect(ga.map((p) => p.id)).toEqual(['ga-elsevier', 'ga-acs', 'ga-rsc', 'ga-mdpi']);
    for (const p of ga) {
      expect(p.wMm, p.id).toBeGreaterThan(p.hMm);
      expect(p.journal, p.id).toBeUndefined();
      expect(p.maxHMm, p.id).toBeUndefined();
    }
    expect(JOURNALS).not.toContain('Elsevier');
  });

  it('converts pixel and mm sizes to points', () => {
    const px = (id: string, dpi: number) => {
      const s = presetSize(id)!;
      return { w: Math.round((s.w / 72) * dpi), h: Math.round((s.h / 72) * dpi) };
    };
    expect(px('ga-elsevier', 300)).toEqual({ w: 1328, h: 531 });
    expect(px('ga-mdpi', 300)).toEqual({ w: 1100, h: 560 });
    expect(presetSize('ga-acs')!.w).toBeCloseTo((8.25 / 2.54) * 72, 1);
    expect(presetSize('ga-rsc')!.h).toBeCloseTo((4 / 2.54) * 72, 1);
  });

  it('has unique ids', () => {
    expect(new Set(PAGE_PRESETS.map((p) => p.id)).size).toBe(PAGE_PRESETS.length);
  });
});
