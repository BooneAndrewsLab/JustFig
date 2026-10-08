/**
 * The guide's Markdown → React. A small, fixed subset (headings,
 * paragraphs, bullet and numbered lists, tables, `>` notes, **bold**,
 * *italic*, `code`, links), rendered as React elements, never as HTML.
 * Links to another guide page (`05-arranging.md`) call `onPage`; https
 * links open in a new tab.
 */
import type { ReactNode } from 'react';

type Go = (id: string) => void;

function inline(text: string, key: string, go: Go): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    n += 1;
    const k = `${key}-${String(n)}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k, go)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k, go)}</em>);
    else if (m[3] !== undefined) out.push(<code key={k}>{m[3]}</code>);
    else if (m[4] !== undefined && m[5] !== undefined) {
      const href = m[5];
      if (href.startsWith('https://'))
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {m[4]}
          </a>,
        );
      else {
        const id = href.replace(/\.md(#.*)?$/, '');
        out.push(
          <a
            key={k}
            href={`#guide-${id}`}
            onClick={(e) => {
              e.preventDefault();
              go(id);
            }}
          >
            {m[4]}
          </a>,
        );
      }
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function renderGuide(md: string, go: Go): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split('\n');
  let i = 0;
  const key = () => String(out.length);
  while (i < lines.length) {
    const line = (lines[i] ?? '').trimEnd();
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (line === '') {
      i += 1;
    } else if (h?.[1] && h[2] !== undefined) {
      // The dialog has the h1 already; the page's levels shift down one.
      const body = inline(h[2], key(), go);
      const level = h[1].length;
      out.push(
        level === 1 ? (
          <h2 key={key()}>{body}</h2>
        ) : level === 2 ? (
          <h3 key={key()}>{body}</h3>
        ) : (
          <h4 key={key()}>{body}</h4>
        ),
      );
      i += 1;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i] ?? '')) {
        let item = (lines[i] ?? '').replace(/^(- |\d+\. )/, '');
        i += 1;
        // A wrapped item continues on indented lines.
        while (i < lines.length && /^ {2,}\S/.test(lines[i] ?? '')) {
          item += ` ${(lines[i] ?? '').trim()}`;
          i += 1;
        }
        items.push(
          <li key={String(items.length)}>
            {inline(item, `${key()}-${String(items.length)}`, go)}
          </li>,
        );
      }
      out.push(ordered ? <ol key={key()}>{items}</ol> : <ul key={key()}>{items}</ul>);
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        const r = cells(lines[i] ?? '');
        if (!r.every((c) => /^:?-+:?$/.test(c))) rows.push(r);
        i += 1;
      }
      const [head, ...body] = rows;
      const k = key();
      out.push(
        <table key={k} className="guide-table">
          {head && (
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `${k}-h${String(j)}`, go)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c, `${k}-${String(ri)}-${String(j)}`, go)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (line.startsWith('> ')) {
      let text = '';
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        text += ` ${(lines[i] ?? '').replace(/^>\s?/, '')}`;
        i += 1;
      }
      out.push(
        <p key={key()} className="guide-note">
          {inline(text.trim(), key(), go)}
        </p>,
      );
    } else {
      let text = line;
      i += 1;
      while (i < lines.length) {
        const next = (lines[i] ?? '').trimEnd();
        if (next === '' || /^(#{1,3} |- |\d+\. |\||> )/.test(next)) break;
        text += ` ${next}`;
        i += 1;
      }
      out.push(<p key={key()}>{inline(text, key(), go)}</p>);
    }
  }
  return out;
}
