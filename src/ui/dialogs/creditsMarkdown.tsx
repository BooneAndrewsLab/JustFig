/**
 * CREDITS.md → React (plan §3: the library's credits are shown in the app).
 * The file is data from another repository, so it is rendered as plain
 * React text: headings, list items and paragraphs only, `**bold**`, and
 * bare https links; never as HTML.
 */
import type { ReactNode } from 'react';

const unescape = (s: string): string => s.replace(/\\([\\`*_[\]<>#|])/g, '$1');

/** Inline text: **bold** and https URLs become elements, the rest stays text. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*((?:\\.|[^*])+)\*\*|(https:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(unescape(text.slice(last, m.index)));
    n += 1;
    if (m[1] !== undefined) out.push(<strong key={`${key}-${String(n)}`}>{unescape(m[1])}</strong>);
    else if (m[2] !== undefined)
      out.push(
        <a key={`${key}-${String(n)}`} href={m[2]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

export function renderCredits(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length > 0) out.push(<ul key={`ul-${String(out.length)}`}>{list}</ul>);
    list = [];
  };
  md.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const k = String(i);
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (line.startsWith('- ')) {
      list.push(<li key={k}>{inline(line.slice(2), k)}</li>);
      return;
    }
    flush();
    if (h?.[1] && h[2] !== undefined) {
      const level = h[1].length;
      const body = inline(h[2], k);
      // The dialog has the h1; the file's levels shift down one.
      out.push(
        level === 1 ? (
          <h2 key={k}>{body}</h2>
        ) : level === 2 ? (
          <h3 key={k}>{body}</h3>
        ) : (
          <h4 key={k}>{body}</h4>
        ),
      );
    } else if (line.startsWith('|')) {
      out.push(
        <p key={k} className="mono">
          {inline(line, k)}
        </p>,
      );
    } else if (line !== '') out.push(<p key={k}>{inline(line, k)}</p>);
  });
  flush();
  return out;
}
