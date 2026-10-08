/**
 * The page on screen (note 01): each top-level object's memoised SvgNode,
 * serialised once per node and set as its group's content, so React only
 * touches objects that changed and the screen draws exactly what exports
 * draw.
 */
import { memo } from 'react';

import type { Figure, Page } from '@/core/model/types';
import { objectToNode, renderCtx } from '@/render/objectToNode';
import { type SvgNode, nodeToSvgString } from '@/render/svgNode';

// Keyed on the children array: a moved procedural object keeps its content
// array (only the transform changes), so it is not serialised again.
const inner = new WeakMap<SvgNode['children'], string>();

function innerHtml(n: SvgNode): string {
  let s = inner.get(n.children);
  if (s === undefined) {
    s = n.children.map((c) => nodeToSvgString(c)).join('');
    inner.set(n.children, s);
  }
  return s;
}

/** SvgNode attributes as React props (kebab-case → camelCase, data-* kept). */
function props(attrs: SvgNode['attrs']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    const key = k.startsWith('data-')
      ? k
      : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = String(v);
  }
  return out;
}

const ObjView = memo(function ObjView({ node }: { node: SvgNode }) {
  return <g {...props(node.attrs)} dangerouslySetInnerHTML={{ __html: innerHtml(node) }} />;
});

export const PageView = memo(function PageView({ page, figure }: { page: Page; figure: Figure }) {
  const ctx = renderCtx(page, figure.doc, figure.assets, { textMode: 'outline', screen: true });
  return (
    <g>
      {page.background !== null && (
        <rect
          width={page.size.w}
          height={page.size.h}
          fill={'hex' in page.background ? page.background.hex : '#ffffff'}
        />
      )}
      {page.layers.map((l) =>
        l.visible ? (
          <g key={l.id} data-layer={l.id} pointerEvents={l.locked ? 'none' : undefined}>
            {l.children.map((o) => {
              const n = objectToNode(o, ctx);
              return n ? <ObjView key={o.id} node={n} /> : null;
            })}
          </g>
        ) : null,
      )}
    </g>
  );
});
