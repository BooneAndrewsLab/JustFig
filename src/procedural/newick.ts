/**
 * A small recursive-descent Newick parser (note 47). It never throws: a bad string comes back
 * as `{ ok: false, error }` with a message naming the character, so the Inspector can show it.
 *
 * Grammar: `subtree := ('(' subtree (',' subtree)* ')')? label? (':' length)?`, then an
 * optional `;`. Labels are quoted (`'a b'`, `''` for a quote) or bare (underscores read as
 * spaces); `[comments]` are skipped anywhere; text after the first `;` (another tree) is ignored.
 */
export interface NewickNode {
  /** The label: a leaf's name, or an internal node's support value or clade name. */
  readonly name: string;
  /** The branch length above the node, or null when absent. */
  readonly length: number | null;
  readonly children: readonly NewickNode[];
}

export type NewickResult =
  { readonly ok: true; readonly root: NewickNode } | { readonly ok: false; readonly error: string };

/** Deepest nesting accepted (the renderer recurses). */
export const MAX_DEPTH = 200;

const BARE_STOP = "()[]':;, \t\n\r";

class NewickError extends Error {}

export function parseNewick(src: string): NewickResult {
  let i = 0;
  const fail = (msg: string): never => {
    throw new NewickError(`${msg} at character ${String(i + 1)}`);
  };

  const skip = (): void => {
    for (;;) {
      const c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i += 1;
      else if (c === '[') {
        const end = src.indexOf(']', i);
        if (end < 0) fail("Unclosed '['");
        i = end + 1;
      } else return;
    }
  };

  const label = (): string => {
    skip();
    if (src.charAt(i) === "'") {
      const start = i;
      let out = '';
      i += 1;
      for (;;) {
        if (i >= src.length) {
          i = start;
          return fail('Unclosed quote');
        }
        const c = src.charAt(i);
        if (c === "'") {
          if (src.charAt(i + 1) === "'") {
            out += "'";
            i += 2;
          } else {
            i += 1;
            return out;
          }
        } else {
          out += c;
          i += 1;
        }
      }
    }
    let out = '';
    while (i < src.length && !BARE_STOP.includes(src.charAt(i))) {
      out += src.charAt(i);
      i += 1;
    }
    return out.replace(/_/g, ' ');
  };

  const length = (): number | null => {
    skip();
    if (src.charAt(i) !== ':') return null;
    i += 1;
    skip();
    const start = i;
    while (i < src.length && !BARE_STOP.includes(src.charAt(i))) i += 1;
    const text = src.slice(start, i);
    const n = text === '' ? NaN : Number(text);
    if (!Number.isFinite(n)) {
      i = start;
      return fail(`Bad branch length "${text}"`);
    }
    return n;
  };

  const subtree = (depth: number): NewickNode => {
    if (depth > MAX_DEPTH) fail(`Nested deeper than ${String(MAX_DEPTH)} levels`);
    skip();
    const children: NewickNode[] = [];
    if (src.charAt(i) === '(') {
      const open = i;
      i += 1;
      for (;;) {
        children.push(subtree(depth + 1));
        skip();
        const c = src.charAt(i);
        if (c === ',') i += 1;
        else if (c === ')') {
          i += 1;
          break;
        } else if (c === '') {
          i = open;
          fail("Missing ')' for the '('");
        } else fail(`Expected ',' or ')' but found "${c}"`);
      }
    }
    const name = label();
    const len = length();
    return { name, length: len, children };
  };

  try {
    skip();
    if (i >= src.length) return { ok: false, error: 'Paste a Newick string, e.g. (A:1,B:1);' };
    const root = subtree(0);
    skip();
    const c = src.charAt(i);
    if (c !== '' && c !== ';') fail(c === ')' ? "Unmatched ')'" : `Unexpected "${c}"`);
    return { ok: true, root };
  } catch (e) {
    if (e instanceof NewickError) return { ok: false, error: e.message };
    return { ok: false, error: 'Not a valid Newick string' };
  }
}
