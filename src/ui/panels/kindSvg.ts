/**
 * A procedural object drawn on its own as an SVG string, through the one renderer: the shelf's
 * tiles and a wizard's preview.
 */
import type { Procedural } from '@/core/model/types';
import { proceduralNodes } from '@/render/procedural';
import { nodeToSvgString } from '@/render/svgNode';

/** `o` (framed at the origin) with a little room round it. */
export function procSvg(o: Procedural): string {
  const { w, h } = o.frame;
  const nodes = proceduralNodes(o, 'outline', false, []) ?? [];
  const pad = Math.max(w, h) * 0.06;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(o.frame.x - pad)} ${String(o.frame.y - pad)} ${String(w + 2 * pad)} ${String(h + 2 * pad)}">` +
    nodes.map((n) => nodeToSvgString(n)).join('') +
    '</svg>'
  );
}
