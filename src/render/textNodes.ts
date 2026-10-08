/** Laid-out text as SvgNodes: glyph outlines, or `<text>` with explicit x/y per segment (note 03). */
import { resolvePaint } from '@/core/color/color';
import type { Swatch } from '@/core/model/types';
import { FAMILY_NAME, getFont } from '@/core/text/fonts';
import type { TextLayout } from '@/core/text/layout';

import { type SvgNode, el } from './svgNode';

export type TextMode = 'outline' | 'text';

/** Text segments as SvgNodes, in frame-local coordinates. */
export function textNodes(
  layout: TextLayout,
  mode: TextMode,
  ctx: { readonly palette: readonly Swatch[] },
): SvgNode[] {
  const out: SvgNode[] = [];
  if (mode === 'outline') {
    for (const line of layout.lines)
      for (const s of line.segments) {
        if (s.text.trim() === '') continue;
        const font = getFont(s.run.font, {
          bold: s.run.bold === true,
          italic: s.run.italic === true,
        });
        const d = font
          .getPath(s.text, s.x, s.y, s.size, { kerning: false, features: {} })
          .toPathData(2);
        if (d !== '') out.push(el('path', { d, fill: resolvePaint(s.run.color, ctx.palette) }));
      }
    return out;
  }
  const spans: SvgNode[] = [];
  for (const line of layout.lines)
    for (const s of line.segments) {
      if (s.text.trim() === '') continue;
      spans.push(
        el(
          'tspan',
          {
            x: s.x,
            y: s.y,
            'font-family': FAMILY_NAME[s.run.font],
            'font-size': s.size,
            'font-weight': s.run.bold === true ? 'bold' : undefined,
            'font-style': s.run.italic === true ? 'italic' : undefined,
            fill: resolvePaint(s.run.color, ctx.palette),
          },
          [s.text],
        ),
      );
    }
  if (spans.length > 0) out.push(el('text', { 'xml:space': 'preserve' }, spans));
  return out;
}
