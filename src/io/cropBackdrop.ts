/**
 * A see-through picture's backdrop (issue 35, note 12) cut to its picture's
 * crop (issue 48, note 20). The backdrop is vector (`svgImport`), so it is
 * not resampled: the whole backdrop is placed in the cut's units (scaled to
 * its `meta` size, turned by `turn` about the centres as a turned picture's
 * pixels are, moved by the crop) and every shape is cut to the crop's box
 * with the clip cutter plot import uses (`clipShape`), so nothing outside it
 * is left in the file and the export stays plain SVG (no clip).
 */
import { toTurned } from '@/core/geometry/turn';
import type { Asset, Rect4 } from '@/core/model/types';
import { type SvgNode, el, nodeToSvgString } from '@/render/svgNode';

import { hashAsset } from './assets';
import {
  IDENTITY,
  type Matrix,
  apply,
  fmt,
  invert,
  matrixString,
  multiply,
  parseTransform,
} from './svg/matrix';
import { sanitizeSvg } from './svg/sanitize';
import { CLIP_ATTR, type PictureClip, clipShape } from './svg/svgClip';

type SvgAsset = Extract<Asset, { kind: 'svgImport' }>;

/** Root attributes that are about the root's own box, not inherited by what it holds. */
const ROOT_ONLY = new Set([
  'viewBox',
  'xmlns',
  'xmlns:xlink',
  'width',
  'height',
  'x',
  'y',
  'version',
]);

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

const own = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (typeof t === 'string' ? parseTransform(t) : null) ?? IDENTITY;
};

const paintOn = (v: string | number | undefined, inherited: boolean): boolean =>
  v === undefined ? inherited : String(v).trim() !== 'none';

/** Shapes cut to `[0, 0, w, h]` of the root's units (`m`: a node's parent space to them). */
function cutNodes(
  nodes: readonly (SvgNode | string)[],
  m: Matrix,
  w: number,
  h: number,
  fill: boolean,
  stroke: boolean,
): (SvgNode | string)[] {
  const out: (SvgNode | string)[] = [];
  for (const n of nodes) {
    if (typeof n === 'string') {
      out.push(n);
      continue;
    }
    const mm = multiply(m, own(n));
    const f = paintOn(n.attrs['fill'], fill);
    const s = paintOn(n.attrs['stroke'], stroke);
    if (n.tag === 'g') {
      const kids = cutNodes(n.children, mm, w, h, f, s);
      if (kids.some((k) => typeof k !== 'string')) out.push(el('g', n.attrs, kids));
    } else if (SHAPES.has(n.tag)) {
      // The box in the shape's own user space, as a clip the plot cutter reads.
      const inv = invert(mm);
      const ring = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ].map(([x = 0, y = 0]) => apply(inv, x, y));
      const [p0, p1, p2, p3] = ring;
      const clip: PictureClip = {
        segs: [
          { c: 'M', p: p0 ?? [0, 0] },
          { c: 'L', p: p1 ?? [0, 0] },
          { c: 'L', p: p2 ?? [0, 0] },
          { c: 'L', p: p3 ?? [0, 0] },
          { c: 'Z' },
        ],
        evenOdd: false,
      };
      const clipped = el(n.tag, { ...n.attrs, [CLIP_ATTR]: JSON.stringify([clip]) }, n.children);
      // A line has no inside to fill.
      out.push(
        ...clipShape(clipped, { fill: f && n.tag !== 'line', stroke: s }, mm, () => undefined),
      );
    } else if (n.tag === 'text') {
      // Text is kept whole when its anchor is inside, else left out.
      const [x, y] = apply(mm, Number(n.attrs['x'] ?? 0) || 0, Number(n.attrs['y'] ?? 0) || 0);
      if (x >= -1e-6 && y >= -1e-6 && x <= w + 1e-6 && y <= h + 1e-6) out.push(n);
    } else out.push(n);
  }
  return out;
}

/**
 * The part `crop` (in `meta` units of the backdrop turned by `turn`
 * degrees) of a backdrop, as its own `svgImport` asset of `crop`'s size.
 */
export function cutBackdrop(
  src: SvgAsset,
  turn: number,
  crop: Rect4,
): { hash: string; asset: SvgAsset } {
  const s = sanitizeSvg(src.svg);
  const [vx, vy, vw, vh] = s.viewBox;
  const { width: W, height: H } = src.meta;
  // viewBox units → meta units → turned → the crop's units.
  const toMeta: Matrix = [W / vw, 0, 0, H / vh, (-vx * W) / vw, (-vy * H) / vh];
  const o = toTurned(W, H, turn, { x: 0, y: 0 });
  const ex = toTurned(W, H, turn, { x: 1, y: 0 });
  const ey = toTurned(W, H, turn, { x: 0, y: 1 });
  const turning: Matrix = [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y];
  const m = multiply([1, 0, 0, 1, -crop.x, -crop.y], multiply(turning, toMeta));
  const rootAttrs = Object.fromEntries(
    Object.entries(s.root.attrs).filter(([k]) => !ROOT_ONLY.has(k)),
  );
  const kids = cutNodes(
    s.root.children,
    m,
    crop.w,
    crop.h,
    paintOn(rootAttrs['fill'], true),
    paintOn(rootAttrs['stroke'], false),
  );
  const svg = nodeToSvgString(
    el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: [0, 0, crop.w, crop.h].map(fmt).join(' '),
      },
      [el('g', { ...rootAttrs, transform: matrixString(m) }, kids)],
    ),
  );
  const asset: SvgAsset = {
    kind: 'svgImport',
    svg,
    meta: { name: src.meta.name, width: crop.w, height: crop.h },
  };
  return { hash: hashAsset(asset), asset };
}
