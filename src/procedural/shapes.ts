/**
 * Primitives → plain document objects: text labels as Text objects (also
 * how they are drawn), and "Convert to shapes" (note 04), which expands a
 * procedural object into a Group of rects, ellipses, paths and text.
 */
import { boundsOf, flipObj, refit, rotateObj, translateObj } from '@/core/geometry/transform';
import { center } from '@/core/geometry/matrix';
import type { Id } from '@/core/model/ids';
import { newId } from '@/core/model/ids';
import { frame, localise } from '@/core/model/factory';
import type { Group, Image, Obj, Procedural, ShapeStyle, Swatch, Text } from '@/core/model/types';
import { layoutText } from '@/core/text/layout';

import type { PathPrim, Prim, TextPrim } from './prims';
import { getKind, proceduralPrims } from './registry';

/** A text primitive as a Text object, frame-local, laid out and rotated about its anchor. */
export function textPrimObj(t: TextPrim): Text {
  const base: Text = {
    id: '' as Id,
    type: 'text',
    frame: frame(0, 0, 0, 0),
    opacity: 1,
    runs: [
      [
        {
          text: t.text,
          font: 'arimo',
          size: t.size,
          ...(t.bold === true ? { bold: true } : {}),
          ...(t.italic === true ? { italic: true } : {}),
          color: { hex: t.color },
        },
      ],
    ],
    align: t.anchor === 'start' ? 'left' : t.anchor === 'end' ? 'right' : 'center',
    lineHeight: 1,
    autoWidth: true,
  };
  const l = layoutText(base);
  const first = l.lines[0];
  const x = t.x - l.width * (t.anchor === 'start' ? 0 : t.anchor === 'end' ? 1 : 0.5);
  const y =
    t.baseline === 'top'
      ? t.y
      : t.baseline === 'middle'
        ? t.y - l.height / 2
        : t.y - (first?.baseline ?? 0);
  const placed: Text = { ...base, frame: frame(x, y, l.width, l.height) };
  return t.rotation ? (rotateObj(placed, { x: t.x, y: t.y }, t.rotation) as Text) : placed;
}

function style(p: PathPrim): ShapeStyle {
  return {
    fill: p.fill === null ? null : { hex: p.fill },
    stroke: p.stroke === null || p.sw <= 0 ? null : { hex: p.stroke },
    strokeWidth: p.stroke === null ? 0 : p.sw,
    cap: p.cap ?? 'butt',
    join: p.join ?? 'miter',
  };
}

/** Primitives as plain objects, frame-local (ids left empty). */
export function primObjects(prims: readonly Prim[]): Obj[] {
  const out: Obj[] = [];
  const base = { id: '' as Id, opacity: 1 };
  for (const p of prims) {
    if (p.kind === 'text') {
      if (p.text.trim() !== '') out.push(textPrimObj(p));
      continue;
    }
    const st = style(p);
    for (const s of p.subs) {
      if (s.t === 'circle')
        out.push({
          ...base,
          type: 'ellipse',
          frame: frame(s.cx - s.r, s.cy - s.r, 2 * s.r, 2 * s.r),
          style: st,
        });
      else if (s.t === 'rect')
        out.push({ ...base, type: 'rect', frame: frame(s.x, s.y, s.w, s.h), rx: s.rx, style: st });
      else if (s.nodes.length > 1) {
        const { f, local } = localise(s.nodes);
        out.push({
          ...base,
          type: 'path',
          frame: f,
          nodes: local,
          closed: s.closed,
          style: s.closed ? st : { ...st, fill: null },
        });
      }
    }
  }
  return out;
}

const withIds = (o: Obj): Obj =>
  o.type === 'group' || o.type === 'panel'
    ? { ...o, id: newId('o'), children: o.children.map(withIds) }
    : { ...o, id: newId('o') };

/**
 * The object as plain shapes in page coordinates: a Group (or, for a kind
 * this version does not know, an Image of its snapshot). Null when there is
 * nothing to convert.
 */
export function convertToShapes(o: Procedural, palette: readonly Swatch[]): Group | Image | null {
  const prims = proceduralPrims(o, palette);
  if (!prims) {
    if (o.snapshot === undefined) return null;
    return {
      id: newId('o'),
      type: 'image',
      ...(o.name === undefined ? {} : { name: o.name }),
      frame: o.frame,
      opacity: o.opacity,
      asset: o.snapshot,
    };
  }
  const f = o.frame;
  const c = center(f);
  let objs = primObjects(prims).map((x) => translateObj(x, f.x, f.y));
  if (f.flipX === true) objs = objs.map((x) => flipObj(x, 'x', c));
  if (f.flipY === true) objs = objs.map((x) => flipObj(x, 'y', c));
  if (f.rotation !== 0) objs = objs.map((x) => rotateObj(x, c, f.rotation));
  if (objs.length === 0) return null;
  const b = boundsOf(objs);
  const title = getKind(o.kind)?.title ?? o.kind;
  return withIds(
    refit({
      id: '' as Id,
      type: 'group',
      name: o.name ?? title,
      frame: frame(b.x, b.y, b.w, b.h),
      opacity: o.opacity,
      children: objs,
    }),
  ) as Group;
}
