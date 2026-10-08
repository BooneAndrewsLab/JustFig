import { describe, expect, it } from 'vitest';

import { type MathChar, parseMathLabel } from './mathtext';

/** Characters as text, scripts marked `^{…}`/`_{…}`, glyph-less spaces as `·`. */
function show(chars: readonly MathChar[] | null): string | null {
  if (!chars) return null;
  let out = '';
  let level = 'base';
  for (const c of chars) {
    if (c.level !== level) {
      if (level !== 'base') out += '}';
      if (c.level !== 'base') out += c.level === 'sup' ? '^{' : '_{';
      level = c.level;
    }
    out += c.glyph ? c.ch : '·';
  }
  return level === 'base' ? out : `${out}}`;
}

describe('parseMathLabel', () => {
  it.each([
    ['$\\mathdefault{10^{3}}$', '10^{3}'],
    ['$\\mathdefault{10^{-2}}$', '10^{−2}'],
    ['$\\mathdefault{2\\times10^{4}}$', '2·×·10^{4}'],
    ['Signal $\\times 10^{3}$', 'Signal ×10^{3}'],
    ['Dose ($\\mu$M)', 'Dose (μM)'],
    ['$\\alpha_{1}$ response, $\\Delta = -2$', 'α_{1} response, Δ·=·−2'],
    ['$x_i^2$', 'x_{i}^{2}'],
    ['$a+b-c$', 'a·+·b·−·c'],
    ['$(-1)$', '(−1)'],
    ['$5\\,\\mathrm{\\mu m}$', '5·μm'],
    ['$\\mathregular{CO_2}$ (\\%)', 'CO_{2} (\\%)'],
    ['$100\\%$', '100%'],
    ['$\\Omega\\omega\\phi\\varphi$', 'Ωωϕφ'],
  ])('%s → %s', (src, expected) => {
    expect(show(parseMathLabel(src))).toBe(expected);
  });

  it.each([
    ['plain text', 'Time (h)'],
    ['an unbalanced dollar', 'costs $5'],
    ['an escaped dollar', '$x$ in \\$'],
    ['a fraction', '$\\frac{1}{2}$'],
    ['a radical', '$\\sqrt{2}$'],
    ['an unknown command', '$\\hat{x}$'],
    ['a nested script', '$10^{x^{2}}$'],
    ['an unclosed group', '$10^{3$'],
    ['a dangling script', '$x^$'],
    ['a prime', "$f'$"],
  ])('returns null for %s', (_what, src) => {
    expect(parseMathLabel(src)).toBeNull();
  });
});
