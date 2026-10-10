import { describe, expect, it } from 'vitest';

import {
  CONFUSED_DE,
  CVD_MATRIX,
  DEFICIENCIES,
  confusions,
  cvdFilterValues,
  deltaE,
  greyConfusions,
  hasRedAndGreen,
  isGreen,
  isRed,
  labOf,
  simulateLab,
} from './colourVision';

describe('colour-vision simulation (note 46)', () => {
  it('has the 4 x 5 feColorMatrix the canvas filter uses, alpha untouched', () => {
    const v = cvdFilterValues('deuteranopia').split(' ').map(Number);
    expect(v).toHaveLength(20);
    expect(v.slice(0, 3)).toEqual([...CVD_MATRIX.deuteranopia[0]]);
    expect(v.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it('computes CIE Lab against known values', () => {
    expect(labOf('#ffffff').l).toBeCloseTo(100, 1);
    expect(labOf('#000000').l).toBeCloseTo(0, 5);
    const red = labOf('#ff0000');
    expect([red.l, red.a, red.b].map(Math.round)).toEqual([53, 80, 67]);
  });

  it('leaves greys and white alone for every deficiency', () => {
    for (const d of DEFICIENCIES)
      for (const h of ['#ffffff', '#808080', '#000000'])
        expect(deltaE(labOf(h), simulateLab(h, d))).toBeLessThan(1.5);
  });

  it('confuses red and green for deuteranopia or protanopia', () => {
    const found = confusions(['#ff7f0e', '#2ca02c']);
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      expect(c.after).toBeLessThan(CONFUSED_DE);
      expect(c.before).toBeGreaterThanOrEqual(25);
    }
  });

  it('passes a colourblind-safe pair and pairs that are alike anyway', () => {
    expect(confusions(['#0072b2', '#e69f00'])).toEqual([]);
    expect(confusions(['#336699', '#346a9a'])).toEqual([]);
    expect(confusions(['#000000', '#ffffff'])).toEqual([]);
  });

  it('finds pairs of equal lightness lost in greyscale', () => {
    const found = greyConfusions(['#ff0000', '#008a00', '#000000']);
    expect(found.map((f) => [f.a, f.b])).toEqual([[0, 1]]);
    expect(greyConfusions(['#000000', '#ffffff'])).toEqual([]);
  });

  it('tests hue for red and green', () => {
    expect(isRed('#ff0000')).toBe(true);
    expect(isRed('#e41a1c')).toBe(true);
    expect(isRed('#ff00ff')).toBe(false);
    expect(isRed('#400000')).toBe(false);
    expect(isGreen('#00ff00')).toBe(true);
    expect(isGreen('#2ca02c')).toBe(true);
    expect(isGreen('#00ffff')).toBe(false);
    expect(hasRedAndGreen(['#ff0000', '#00ff00'])).toBe(true);
    expect(hasRedAndGreen(['#ff00ff', '#00ff00'])).toBe(false);
    expect(hasRedAndGreen(['#ff0000', '#0000ff'])).toBe(false);
  });
});
