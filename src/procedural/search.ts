/**
 * Which procedural kinds an icon search finds (note 04). Runs locally on the kinds'
 * own metadata (title and `keywords`), never through the icon library's index, which
 * is data from another repo.
 */
import { allKinds } from './registry';
import type { KindPreset, ProceduralKind } from './types';

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');

/** A query word matches a term word it starts (so "micro" finds "microplate"), or a plural of it. */
function hits(q: string, term: readonly string[]): boolean {
  const stem = q.length > 3 && q.endsWith('s') ? q.slice(0, -1) : q;
  return term.some((w) => w.startsWith(q) || w === stem);
}

/**
 * The kinds every word of `query` matches (in the title or a keyword), best first:
 * more words in the title rank higher, then the Objects-panel order. Empty for a blank query.
 */
export function matchKinds(
  query: string,
  kinds: readonly ProceduralKind[] = allKinds(),
): ProceduralKind[] {
  const qs = words(query);
  if (qs.length === 0) return [];
  const scored: { k: ProceduralKind; score: number; i: number }[] = [];
  kinds.forEach((k, i) => {
    const title = words(k.title);
    const keys = k.keywords.flatMap(words);
    let score = 0;
    for (const q of qs) {
      if (hits(q, title)) score += 2;
      else if (hits(q, keys)) score += 1;
      else return;
    }
    scored.push({ k, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.k);
}

export interface PresetMatch {
  readonly kind: ProceduralKind;
  readonly preset: KindPreset;
}

/**
 * The kind presets (note 58) a query finds: every word matches the preset's label, its group,
 * the kind's title or a keyword, and at least one word the label itself, so "YPD" or "tetrad"
 * finds the preset while "plate" alone stays with the kinds. Best first: more words in the
 * label, then kind and preset order.
 */
export function matchPresets(
  query: string,
  kinds: readonly ProceduralKind[] = allKinds(),
): PresetMatch[] {
  const qs = words(query);
  if (qs.length === 0) return [];
  const scored: { m: PresetMatch; score: number; i: number }[] = [];
  let i = 0;
  for (const k of kinds) {
    const rest = [...words(k.title), ...k.keywords.flatMap(words)];
    for (const preset of k.presets ?? []) {
      i += 1;
      const label = words(preset.label);
      const group = words(preset.group ?? '');
      let score = 0;
      let ok = true;
      for (const q of qs) {
        if (hits(q, label)) score += 2;
        else if (!hits(q, group) && !hits(q, rest)) ok = false;
      }
      if (ok && score > 0) scored.push({ m: { kind: k, preset }, score, i });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.m);
}
