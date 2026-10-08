/**
 * Rich text for the textarea overlay editor (note 03, plan risk "rich-text
 * editing"): the runs flattened to plain text plus one style per
 * character, so the textarea can edit plain text and every edit maps back
 * onto runs. Paragraphs are joined by '\n'. Pure and heavily tested.
 */
import type { Run } from '../model/types';

export type RunStyle = Omit<Run, 'text'>;

export interface Rich {
  readonly text: string;
  /** One per character of `text` ('\n' carries the style of the line it ends). */
  readonly styles: readonly RunStyle[];
}

export function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.font === b.font &&
    a.size === b.size &&
    (a.bold === true) === (b.bold === true) &&
    (a.italic === true) === (b.italic === true) &&
    a.script === b.script &&
    JSON.stringify(a.color) === JSON.stringify(b.color)
  );
}

const styleOf = (r: Run): RunStyle => {
  const { text: _t, ...s } = r;
  return s;
};

export function flatten(runs: readonly (readonly Run[])[], fallback: RunStyle): Rich {
  let text = '';
  const styles: RunStyle[] = [];
  let last = fallback;
  runs.forEach((para, i) => {
    if (i > 0) {
      text += '\n';
      styles.push(last);
    }
    for (const r of para) {
      const s = styleOf(r);
      // One style per UTF-16 unit (an astral character gets two), matching textarea offsets.
      text += r.text;
      styles.push(...Array<RunStyle>(r.text.length).fill(s));
      last = s;
    }
  });
  return { text, styles };
}

/** Back to paragraphs of runs; neighbouring characters of one style share a run. An empty paragraph keeps one empty run for its style. */
export function build(rich: Rich, fallback: RunStyle): Run[][] {
  const paras: Run[][] = [[]];
  let lastStyle = fallback;
  for (let i = 0; i < rich.text.length; i += 1) {
    const ch = rich.text[i] ?? '';
    const s = rich.styles[i] ?? lastStyle;
    const para = paras[paras.length - 1] ?? [];
    if (ch === '\n') {
      if (para.length === 0) para.push({ ...s, text: '' });
      paras.push([]);
      lastStyle = s;
      continue;
    }
    const prev = para[para.length - 1];
    if (prev && sameStyle(styleOf(prev), s))
      para[para.length - 1] = { ...prev, text: prev.text + ch };
    else para.push({ ...s, text: ch });
    lastStyle = s;
  }
  const lastPara = paras[paras.length - 1];
  if (lastPara?.length === 0) lastPara.push({ ...lastStyle, text: '' });
  // Drop empty runs next to real ones (left by deleting all of a run's text).
  return paras.map((p) => (p.length > 1 ? p.filter((r) => r.text !== '') : p));
}

/**
 * The textarea's text changed from `rich.text` to `next`. The changed
 * middle (common prefix and suffix kept) takes `typing`, the style in
 * effect at the caret.
 */
export function applyInput(rich: Rich, next: string, typing: RunStyle): Rich {
  const old = rich.text;
  let pre = 0;
  while (pre < old.length && pre < next.length && old[pre] === next[pre]) pre += 1;
  let suf = 0;
  while (
    suf < old.length - pre &&
    suf < next.length - pre &&
    old[old.length - 1 - suf] === next[next.length - 1 - suf]
  )
    suf += 1;
  const inserted = next.length - pre - suf;
  const styles = [
    ...rich.styles.slice(0, pre),
    ...Array.from({ length: inserted }, () => typing),
    ...rich.styles.slice(old.length - suf),
  ];
  return { text: next, styles };
}

/** The style typing continues with at a caret: the character before it, else after it. */
export function styleAt(rich: Rich, caret: number, fallback: RunStyle): RunStyle {
  return rich.styles[caret - 1] ?? rich.styles[caret] ?? fallback;
}

export type Toggle = 'bold' | 'italic' | 'sub' | 'sup';

function toggled(s: RunStyle, key: Toggle, on: boolean): RunStyle {
  if (key === 'bold' || key === 'italic') {
    const { [key]: _drop, ...rest } = s;
    return on ? { ...rest, [key]: true } : rest;
  }
  const { script: _drop, ...rest } = s;
  return on ? { ...rest, script: key } : rest;
}

export const isOn = (s: RunStyle, key: Toggle): boolean =>
  key === 'bold' || key === 'italic' ? s[key] === true : s.script === key;

/** Toggles a style over [start, end): on unless every character already has it. */
export function toggleRange(rich: Rich, start: number, end: number, key: Toggle): Rich {
  const range = rich.styles.slice(start, end).filter((_, i) => rich.text[start + i] !== '\n');
  const on = !range.every((s) => isOn(s, key));
  return {
    text: rich.text,
    styles: rich.styles.map((s, i) =>
      i >= start && i < end && rich.text[i] !== '\n' ? toggled(s, key, on) : s,
    ),
  };
}

/** Typing style with a toggle flipped (no selection: affects what is typed next). */
export function toggleStyle(s: RunStyle, key: Toggle): RunStyle {
  return toggled(s, key, !isOn(s, key));
}

/** Sets font, size or colour over [start, end), or everywhere when the range is empty. */
export function patchRange(
  rich: Rich,
  start: number,
  end: number,
  patch: Partial<Pick<RunStyle, 'font' | 'size' | 'color'>>,
): Rich {
  const all = start === end;
  return {
    text: rich.text,
    styles: rich.styles.map((s, i) => (all || (i >= start && i < end) ? { ...s, ...patch } : s)),
  };
}

/** Greek letters and symbols biologists type (the picker). */
export const SYMBOLS: readonly string[] = (
  'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω ' +
  'Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω ' +
  'µ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ → ← ↑ ↓ ↔ ⇌ ⊥ ∆ ∑ √ ∫ ‰ · • ′ ″ Å ℃'
).split(' ');
