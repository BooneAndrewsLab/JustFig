/**
 * The common subset of matplotlib mathtext (note 12), read from a label's
 * TeX-like source: which characters it draws, in order, and at which
 * script level. `glyphText.ts` checks the result glyph by glyph against the
 * outlines matplotlib wrote, so anything this cannot read (fractions,
 * radicals, accents, unknown commands, nested scripts) returns null and the
 * label keeps its outlines.
 */

export type Level = 'base' | 'sup' | 'sub';

export interface MathChar {
  readonly ch: string;
  readonly level: Level;
  /** False for a space that stands for mathtext spacing: no glyph is drawn for it. */
  readonly glyph: boolean;
}

/** Commands that draw one character (matplotlib's `tex2uni` for the common ones). */
const SYMBOLS: Readonly<Record<string, string>> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  times: '×',
  cdot: '·',
  pm: '±',
  mp: '∓',
  div: '÷',
  minus: '−',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  sim: '∼',
  equiv: '≡',
  propto: '∝',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  infty: '∞',
  circ: '∘',
  degree: '°',
  ell: 'ℓ',
  partial: '∂',
  AA: 'Å',
};

/** Font switches whose argument is drawn as usual (the glyphs say which font). */
const FONT_COMMANDS = new Set([
  'mathdefault',
  'mathregular',
  'mathrm',
  'mathit',
  'mathbf',
  'mathsf',
  'mathnormal',
]);

/** Spacing commands, read as one space. `\!` (negative) draws nothing. */
const SPACES = new Set([',', ':', ';', ' ', 'quad', 'qquad', 'enspace', 'thinspace']);

/** Characters a backslash makes literal. */
const ESCAPED = new Set(['%', '{', '}', '_', '#', '&']);

/** In math, matplotlib draws these characters as other code points. */
const MATH_CHARS: Readonly<Record<string, string>> = { '-': '−', '*': '∗' };

const RELATIONS = new Set(['=', '<', '>', ':', '≤', '≥', '≠', '≈', '∼', '≡', '∝', '→', '←']);
const BINARY = new Set(['+', '−', '×', '·', '±', '∓', '÷', '∗']);
const LEFT_DELIMS = new Set(['(', '[']);

/** Characters of one math segment (between `$`s), or null if it is outside the subset. */
function parseMath(src: string): MathChar[] | null {
  let i = 0;
  const out: MathChar[] = [];
  const space = (): void => {
    out.push({ ch: ' ', level: 'base', glyph: false });
  };
  /** Previous drawn base character in this segment ('' at its start or a group's). */
  let prev = '';
  const emit = (ch: string, level: Level): void => {
    // Relations and binary operators get space around them, as matplotlib spaces them, except
    // in scripts and for a sign (an operator at the start, after `{`, a delimiter or an operator).
    const spaced =
      level === 'base' &&
      (RELATIONS.has(ch) ||
        (BINARY.has(ch) &&
          prev !== '' &&
          !LEFT_DELIMS.has(prev) &&
          !RELATIONS.has(prev) &&
          !BINARY.has(prev)));
    if (spaced) space();
    out.push({ ch, level, glyph: true });
    if (spaced) space();
    if (level === 'base') prev = ch;
  };
  const skipSpace = (): void => {
    while (src[i] === ' ' || src[i] === '\t' || src[i] === '\n') i++;
  };
  /** One atom (a character, a command or a `{group}`) at `level`. */
  const atom = (level: Level): boolean => {
    skipSpace();
    const c = src[i];
    if (c === undefined || c === '}' || c === '^' || c === '_') return false;
    if (c === '{') {
      i++;
      prev = '';
      return seq(level, true);
    }
    if (c === '\\') {
      i++;
      const name = /^[A-Za-z]+/.exec(src.slice(i))?.[0] ?? src[i] ?? '';
      if (name === '') return false;
      i += name.length;
      if (FONT_COMMANDS.has(name)) return atom(level);
      if (SPACES.has(name)) {
        if (level === 'base') space();
        return true;
      }
      if (name === '!') return true;
      const sym = SYMBOLS[name] ?? (ESCAPED.has(name) ? name : undefined);
      if (sym === undefined) return false;
      emit(sym, level);
      return true;
    }
    if (c === '$' || c === "'") return false;
    i++;
    emit(MATH_CHARS[c] ?? c, level);
    return true;
  };
  /** Atoms and scripts up to the end (or the closing `}` of a group). */
  const seq = (level: Level, group: boolean): boolean => {
    for (;;) {
      skipSpace();
      const c = src[i];
      if (c === undefined) return !group;
      if (c === '}') {
        if (!group) return false;
        i++;
        return true;
      }
      if (c === '^' || c === '_') {
        // One level of scripts: nested ones are drawn smaller still.
        if (level !== 'base') return false;
        i++;
        if (!atom(c === '^' ? 'sup' : 'sub')) return false;
        continue;
      }
      if (!atom(level)) return false;
    }
  };
  return seq('base', false) ? out : null;
}

/**
 * The characters a mathtext label draws, or null when it is not mathtext
 * or uses anything outside the subset. Text outside `$…$` draws every
 * character (spaces included); spacing inside math becomes a glyph-less space.
 */
export function parseMathLabel(label: string): MathChar[] | null {
  if (label.includes('\\$')) return null;
  const parts = label.split('$');
  if (parts.length < 3 || parts.length % 2 === 0) return null;
  const out: MathChar[] = [];
  for (const [k, part] of parts.entries()) {
    if (k % 2 === 0) {
      for (const ch of part) out.push({ ch, level: 'base', glyph: true });
      continue;
    }
    const m = parseMath(part);
    if (!m) return null;
    out.push(...m);
  }
  return out;
}
