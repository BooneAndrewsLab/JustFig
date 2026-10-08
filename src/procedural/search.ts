/**
 * Which procedural kinds an icon search finds (note 04). Runs locally on the kinds'
 * own metadata (title and `keywords`), never through the icon library's index, which
 * is data from another repo.
 */
import { allKinds } from './registry';
import type { ProceduralKind } from './types';

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
