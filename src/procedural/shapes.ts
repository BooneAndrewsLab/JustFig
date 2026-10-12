/**
 * Primitives → plain document objects: text labels as Text objects (also
 * how they are drawn), and "Convert to shapes" (note 04), which expands a
 * procedural object into a Group of rects, ellipses, paths and text.
 */
import { boundsOf, flipObj, refit, rotateObj, translateObj } from '@/core/geometry/transform';
import { apply, center, frameMatrix } from '@/core/geometry/matrix';
import type { Id } from '@/core/model/ids';
import { newId } from '@/core/model/ids';
import { frame, localise } from '@/core/model/factory';
import type {
  Asset,
  Assets,
  Frame,
  Group,
  Image,
  Obj,
  Procedural,
  ShapeStyle,
  Swatch,
  Text,
} from '@/core/model/types';
import { layoutText } from '@/core/text/layout';
import { parsedSvg } from '@/render/assets';

import type { PathPrim, Prim, TextPrim } from './prims';
import { getKind, proceduralPrims } from './registry';

/** Layouts of label texts, which repeat a lot (plate labels, tick labels). */
const metrics = new Map<string, { base: Text; w: number; h: number; baseline: number }>();

export const textKey = (t: TextPrim): string =>
  `${t.text}|${String(t.size)}|${t.bold === true ? 'b' : ''}${t.italic === true ? 'i' : ''}${t.mono === true ? 'm' : ''}|${t.color}|${t.anchor}`;

function labelLayout(t: TextPrim) {
  const key = textKey(t);
  let m = metrics.get(key);
  if (!m) {
    const base: Text = {
      id: '' as Id,
      type: 'text',
      frame: frame(0, 0, 0, 0),
      opacity: 1,
      runs: [
        [
          {
            text: t.text,
            font: t.mono === true ? 'cousine' : 'arimo',
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
    m = { base, w: l.width, h: l.height, baseline: l.lines[0]?.baseline ?? 0 };
    if (metrics.size > 5000) metrics.clear();
    metrics.set(key, m);
  }
  return m;
}

/** A text primitive as a Text object, frame-local, laid out and rotated about its anchor. */
export function textPrimObj(t: TextPrim): Text {
  const m = labelLayout(t);
  const x = t.x - m.w * (t.anchor === 'start' ? 0 : t.anchor === 'end' ? 1 : 0.5);
  const y = t.baseline === 'top' ? t.y : t.baseline === 'middle' ? t.y - m.h / 2 : t.y - m.baseline;
  const placed: Text = { ...m.base, frame: frame(x, y, m.w, m.h) };
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
  for (const p of prims) {
    if (p.kind === 'text') {
      if (p.text.trim() !== '') out.push(textPrimObj(p));
      continue;
    }
    const st = style(p);
    // A translucent primitive (glow, sheen) becomes translucent objects.
    const base = { id: '' as Id, opacity: p.alpha ?? 1 };
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

/**
 * Primitives as plain objects, frame-local, with each run of one named part (`part` in
 * prims.ts) kept together: a group of that name, or the one shape named so. Unnamed
 * primitives stay loose. Runs, not parts, so the drawing order never changes.
 */
export function partObjects(prims: readonly Prim[]): Obj[] {
  const out: Obj[] = [];
  const run: { part: string | null; objs: Obj[] } = { part: null, objs: [] };
  const close = () => {
    const [one] = run.objs;
    if (run.part !== null && run.objs.length === 1 && one) out.push({ ...one, name: run.part });
    else if (run.part !== null && run.objs.length > 1) {
      const b = boundsOf(run.objs);
      out.push({
        id: '' as Id,
        type: 'group',
        name: run.part,
        frame: frame(b.x, b.y, b.w, b.h),
        opacity: 1,
        children: run.objs,
      });
    }
    run.part = null;
    run.objs = [];
  };
  for (const p of prims) {
    const objs = primObjects([p]);
    if (p.part === undefined) {
      close();
      out.push(...objs);
      continue;
    }
    if (run.part !== p.part) {
      close();
      run.part = p.part;
    }
    run.objs.push(...objs);
  }
  close();
  return out;
}

const withIds = (o: Obj): Obj =>
  o.type === 'group' || o.type === 'panel'
    ? { ...o, id: newId('o'), children: o.children.map(withIds) }
    : { ...o, id: newId('o') };

/**
 * The frame a picture of a snapshot needs to sit where the object drew it: the
 * snapshot's viewBox is frame-local and may reach past the frame (issue 44).
 */
function snapshotFrame(f: Frame, a: Extract<Asset, { kind: 'svgImport' }>): Frame {
  const { width, height } = a.meta;
  if (!(width > 0 && height > 0)) return f;
  const [vx, vy, vw, vh] = parsedSvg(a.svg).viewBox;
  const kx = f.w / width;
  const ky = f.h / height;
  const w = vw * kx;
  const h = vh * ky;
  const c = apply(frameMatrix(f), { x: (vx + vw / 2) * kx, y: (vy + vh / 2) * ky });
  return { ...f, x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/**
 * The object as plain shapes in page coordinates: a Group (or, for a kind
 * this version does not know, an Image of its snapshot), its named parts as
 * named shapes and groups inside it. Null when there is nothing to convert.
 */
export function convertToShapes(
  o: Procedural,
  palette: readonly Swatch[],
  assets: Assets = {},
): Group | Image | null {
  const prims = proceduralPrims(o, palette);
  if (!prims) {
    if (o.snapshot === undefined) return null;
    const a = assets[o.snapshot];
    return {
      id: newId('o'),
      type: 'image',
      ...(o.name === undefined ? {} : { name: o.name }),
      frame: a?.kind === 'svgImport' ? snapshotFrame(o.frame, a) : o.frame,
      opacity: o.opacity,
      asset: o.snapshot,
    };
  }
  const f = o.frame;
  const c = center(f);
  let objs = partObjects(prims).map((x) => translateObj(x, f.x, f.y));
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
