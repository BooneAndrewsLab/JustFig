/**
 * Resizing an imported plot without scaling its text, line widths and tick
 * lengths (note 17, issue 3). Works on a stored `svgImport` asset as
 * rendering parses it, with the roles of `plotParts` (note 16).
 *
 * The plot's **area** (the box of its axis lines, frames and panel
 * backgrounds) absorbs the whole change in size: its top-left stays and it
 * scales by (sx, sy), so the margins around it, where labels and ticks live,
 * keep their size. Elements inside the area that are not ticks or markers
 * have their coordinates scaled (stroke widths and dashes stay); everything
 * else moves rigidly, by how far a chosen **anchor** point moves:
 * - a tick and its label: the tick's base on its axis;
 * - a marker (a small closed shape inside the area): its centre;
 * - a legend (labels with keys, and its frame) as one block: the edge of the
 *   area it is nearest to, or its centre when it is centred;
 * - other labels (axis titles, titles, annotations) and drawn pieces outside
 *   the area (glyph outlines), clustered with what touches them: per axis,
 *   the area edge they lie beyond or are aligned with, else their centre.
 * An anchor at `a` moves by `(a − area.x0)(sx − 1)` across x, and likewise
 * across y, which is exactly where the area's scaling takes that point.
 *
 * A plot with several **panels** (subplots, facets; issue 32) scales each of
 * them instead, keeping the gaps between them: every action names its region
 * (a panel, or a **band** beside one: a colour bar or facet strip, which keeps
 * its thickness), and anchors are taken against the nearest region.
 */
import { type SvgNode, el } from '@/render/svgNode';

import {
  type Matrix,
  IDENTITY,
  angleOf,
  apply,
  fmt,
  invert,
  isAxisAligned,
  matrixString,
  multiply,
  parseTransform,
} from './matrix';
import { type Seg, parsePath, pathRect, pathString, transformPath } from './pathData';
import { type DrawnLeaf, type ViewBox, drawnLeaves, len, numList } from './plotCleanup';
import { type PlotParts, replaceAt } from './plotRoles';

type Box = readonly [number, number, number, number];

/**
 * What resizing does to one element, in region `in` (an index into
 * `PlotLayout.regions`): scale with it, or move as its map takes `at`.
 */
export type Action =
  | { readonly kind: 'scale'; readonly in: number }
  | { readonly kind: 'move'; readonly at: readonly [number, number]; readonly in: number };

/** A colour bar or facet strip: thin across `axis`, beside panel `of` on its `side`. */
export interface Band {
  readonly axis: 0 | 1;
  readonly side: 'lo' | 'hi';
  readonly of: number;
}

/** A panel (a subplot, a facet: what scales), or a band beside one. */
export interface Region {
  /** [x0, y0, x1, y1] in root user units. */
  readonly box: Box;
  readonly band?: Band;
}

/** An extent along one axis, [lo, hi]. */
export type Span = readonly [number, number];

export interface PlotLayout {
  /** The plot area, the union of its panels, [x0, y0, x1, y1] in root user units. */
  readonly area: Box;
  /** The panels, then the bands. */
  readonly regions: readonly Region[];
  /** Per axis, the panels' extents merged where they overlap: what scales; gaps stay. */
  readonly spans: readonly [readonly Span[], readonly Span[]];
  /** Per element (child indices joined by "."). */
  readonly actions: ReadonlyMap<string, Action>;
  /** The leaves, for applying the actions. */
  readonly leaves: readonly DrawnLeaf[];
}

/** Shapes at least this share of the viewBox in both directions are panels or frames. */
const LONG = 0.3;
/** A marker is at most this share of the area's smaller side. */
const MARKER = 0.04;
/** …or at most this many times its median text size. */
const MARKER_EM = 1.5;
/** Panels of a plot with several are at least this share of the viewBox both ways. */
const PANEL = 0.1;
/** A band is at most this thick for its length… */
const BAND = 0.25;
/** …and at most this share of its panel's size away from it. */
const BAND_GAP = 0.3;
/** The area may shrink to this share of its size; past that, text shrinks too. */
export const MIN_GROWTH = 0.05;

const key = (p: readonly number[]): string => p.join('.');
const w = (b: Box): number => b[2] - b[0];
const h = (b: Box): number => b[3] - b[1];
const union = (a: Box | null, b: Box): Box =>
  a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
/** The gap between two boxes (0 when they overlap). */
const gap = (a: Box, b: Box): number =>
  Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const inside = (b: Box, outer: Box, tol: number): boolean =>
  b[0] >= outer[0] - tol &&
  b[1] >= outer[1] - tol &&
  b[2] <= outer[2] + tol &&
  b[3] <= outer[3] + tol;

/** A leaf's box without its stroke: a stroke's width does not scale. */
const inner = (l: DrawnLeaf): Box => {
  const p = Math.min(l.pad, w(l.box) / 2, h(l.box) / 2);
  return [l.box[0] + p, l.box[1] + p, l.box[2] - p, l.box[3] - p];
};

/** A closed shape: something that reads as a marker when small (not a line). */
function closed(n: SvgNode): boolean {
  switch (n.tag) {
    case 'circle':
    case 'ellipse':
    case 'polygon':
      return true;
    case 'rect': {
      // Only square ones: a small bar must still scale with its neighbours.
      const rw = len(n.attrs['width']) ?? 0;
      const rh = len(n.attrs['height']) ?? 0;
      return Math.abs(rw - rh) <= 0.1 * Math.max(rw, rh);
    }
    case 'path': {
      const segs = parsePath(String(n.attrs['d'] ?? ''));
      if (!segs) return false;
      // A trailing moveto (cairo writes `Z M x y`) draws nothing.
      while (segs.length > 1 && segs[segs.length - 1]?.c === 'M') segs.pop();
      const first = segs[0];
      const last = segs[segs.length - 1];
      const shut =
        last?.c === 'Z' ||
        (first?.c === 'M' &&
          last !== undefined &&
          Math.hypot(
            (last.p[last.p.length - 2] ?? 0) - first.p[0],
            (last.p[last.p.length - 1] ?? 0) - first.p[1],
          ) < 1e-3);
      if (!shut) return false;
      const r = pathRect(segs);
      return !r || Math.abs(r.w - r.h) <= 0.1 * Math.max(r.w, r.h);
    }
    default:
      return false;
  }
}

class Sets {
  private readonly up: number[];
  constructor(n: number) {
    this.up = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.up[r] !== r) r = this.up[r] ?? r;
    this.up[i] = r;
    return r;
  }
  join(a: number, b: number): void {
    this.up[this.find(a)] = this.find(b);
  }
}

/**
 * Where an item spanning [lo, hi] along one axis is pinned, for an area
 * spanning [a, b]: beyond or aligned with an edge, that edge; else its centre,
 * or for a legend the nearer edge unless it is centred.
 */
function anchor(lo: number, hi: number, a: number, b: number, legend: boolean): number {
  const tol = 0.02 * (b - a);
  if (hi <= a + tol || Math.abs(lo - a) <= tol) return a;
  if (lo >= b - tol || Math.abs(hi - b) <= tol) return b;
  const c = (lo + hi) / 2;
  if (!legend) return c;
  const dl = lo - a;
  const dh = b - hi;
  if (Math.abs(dl - dh) <= 0.1 * (b - a)) return c;
  return dl < dh ? a : b;
}

const anchorOf = (box: Box, area: Box, legend: boolean): [number, number] => [
  anchor(box[0], box[2], area[0], area[2], legend),
  anchor(box[1], box[3], area[1], area[3], legend),
];

/** How each element of the plot behaves when it is resized; null when nothing can scale. */
export function plotLayout(root: SvgNode, vb: ViewBox, parts: PlotParts): PlotLayout | null {
  const leaves = drawnLeaves(root, vb);
  const texts = new Map(parts.texts.map((t) => [key(t.path), t]));
  const strokes = new Map(parts.strokes.map((s) => [key(s.path), s]));
  const k = (l: DrawnLeaf): string => key(l.path);
  const isText = (l: DrawnLeaf): boolean => l.node.tag === 'text';
  const tickBase = (l: DrawnLeaf) => (isText(l) ? texts.get(k(l))?.tick : strokes.get(k(l))?.base);
  const shapes = leaves.filter((l) => !isText(l) && strokes.get(k(l))?.role !== 'tick');
  const isAxis = (l: DrawnLeaf): boolean => strokes.get(k(l))?.role === 'axis';
  const big = (b: Box): boolean => w(b) >= LONG * vb[2] && h(b) >= LONG * vb[3];
  /** An axis-aligned rectangle (a panel holed for a picture inside it too: issue 24). */
  const rectLike = (l: DrawnLeaf): boolean => {
    if (l.node.tag === 'rect') return true;
    const segs = l.node.tag === 'path' ? segsOf(l.node) : null;
    if (segs === null) return false;
    if (pathRect(segs) !== null) return true;
    const second = segs.findIndex((g, i) => i > 0 && g.c === 'M');
    return (
      l.node.attrs['fill-rule'] === 'evenodd' &&
      second > 0 &&
      pathRect(segs.slice(0, second)) !== null
    );
  };
  /** A panel background or frame: a large axis-aligned rectangle. */
  const panel = (l: DrawnLeaf): boolean => big(l.box) && rectLike(l);

  // The legends first: their frames and keys must not count as the plot area.
  const em = (l: DrawnLeaf): number => texts.get(k(l))?.size ?? h(l.box) / 1.3;
  const labels = leaves.filter((l) => isText(l) && texts.get(k(l))?.role === 'label');
  const keyed: { label: DrawnLeaf; keys: DrawnLeaf[]; box: Box }[] = [];
  for (const lb of labels) {
    const e = em(lb);
    const keys = shapes.filter((s) => {
      const b = s.box;
      if (isAxis(s) || panel(s)) return false;
      if (Math.max(w(b), h(b)) > 3 * e) return false;
      const before = lb.box[0] - b[2];
      const cy = (b[1] + b[3]) / 2;
      return before >= -0.3 * e && before <= 2.5 * e && cy >= lb.box[1] && cy <= lb.box[3];
    });
    if (keys.length > 0)
      keyed.push({ label: lb, keys, box: keys.reduce<Box>((a, s) => union(a, s.box), lb.box) });
  }
  const sets = new Sets(keyed.length);
  keyed.forEach((a, i) => {
    keyed.forEach((b, j) => {
      if (j > i && gap(a.box, b.box) <= 1.5 * Math.max(em(a.label), em(b.label))) sets.join(i, j);
    });
  });
  const groups = new Map<number, typeof keyed>();
  keyed.forEach((x, i) => {
    const r = sets.find(i);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  });
  const inLegend = new Map<string, Box>();
  for (const g of groups.values()) {
    let box = g.reduce<Box | null>((a, x) => union(a, x.box), null);
    if (!box) continue;
    const e = Math.max(...g.map((x) => em(x.label)));
    const members = new Set<DrawnLeaf>(g.flatMap((x) => [x.label, ...x.keys]));
    // A title just above the entries.
    let titled = false;
    for (const lb of labels)
      if (
        !members.has(lb) &&
        gap(lb.box, box) <= 0.6 * Math.max(e, em(lb)) &&
        lb.box[3] <= box[1] + 0.3 * e &&
        Math.min(lb.box[2], box[2]) > Math.max(lb.box[0], box[0])
      ) {
        members.add(lb);
        box = union(box, lb.box);
        titled = true;
      }
    const c = box;
    // Its frame: the smallest shape around it that is not the whole plot.
    const frames = shapes.filter(
      (s) =>
        !members.has(s) &&
        s.box[0] <= c[0] + 0.5 * e &&
        s.box[1] <= c[1] + 0.5 * e &&
        s.box[2] >= c[2] - 1.5 * e &&
        s.box[3] >= c[3] - 0.5 * e &&
        w(s.box) <= w(c) + 6 * e &&
        h(s.box) <= h(c) + 6 * e,
    );
    const frame = frames.sort((a, b) => w(a.box) * h(a.box) - w(b.box) * h(b.box))[0];
    // One entry without a frame is a legend only with a title or a line key (matplotlib's
    // handle, two em long): a marker beside a label may be an annotated data point.
    const lineKey = (s: DrawnLeaf): boolean => {
      const b = inner(s);
      return h(b) <= 0.2 * e && w(b) >= 1.2 * e && w(b) <= 3 * e;
    };
    if (g.length < 2 && !frame && !titled && !g.some((x) => x.keys.some(lineKey))) continue;
    const outer = frame ? union(frame.box, c) : c;
    // A legend is drawn over the data: what comes before its frame is data behind it.
    const from = frame ? leaves.indexOf(frame) : 0;
    for (const m of members) if (leaves.indexOf(m) < from) members.delete(m);
    for (const l of leaves.slice(from)) {
      if (tickBase(l)) continue;
      const cx = (l.box[0] + l.box[2]) / 2;
      const cy = (l.box[1] + l.box[3]) / 2;
      const within = frame
        ? cx >= outer[0] && cx <= outer[2] && cy >= outer[1] && cy <= outer[3]
        : members.has(l) ||
          (!isText(l) && inside(l.box, c, 0.2 * e) && Math.max(w(l.box), h(l.box)) <= 3 * e);
      if (within) members.add(l);
    }
    for (const m of members) inLegend.set(k(m), outer);
  }

  // The area: axis lines, frames and panels; without any, everything else drawn.
  const free = shapes.filter((s) => !inLegend.has(k(s)));
  let area: Box | null = null;
  const areaPieces = free.filter((s) => isAxis(s) || panel(s));
  for (const s of areaPieces) area = union(area, inner(s));
  if (!area) for (const s of free) area = union(area, inner(s));
  if (!area || w(area) <= 0 || h(area) <= 0) return null;
  const single: Panels = { boxes: [area], pieces: new Map(areaPieces.map((s) => [k(s), 0])) };
  const split = splitPanels(free, vb, isAxis, rectLike);
  return (split && layoutIn(split, true)) ?? layoutIn(single, false);

  /** The actions with these panels; null when an element would have to stretch across two. */
  function layoutIn(pn: Panels, strict: boolean): PlotLayout | null {
    const panels = pn.boxes;
    const A = panels.reduce<Box | null>((a, b) => union(a, b), null) ?? panels[0];
    if (!A) return null;
    const tol = 0.01 * Math.min(vb[2], vb[3]);
    const overlaps = (b: Box, p: Box): boolean =>
      b[2] > p[0] && b[0] < p[2] && b[3] > p[1] && b[1] < p[3];
    const outsideAll = (b: Box): boolean => panels.every((p) => !overlaps(b, p));

    // Bands: colour bars and facet strips, thin rectangles beside a panel and as long as a good
    // part of it. Across they keep their size and stay beside it; along it they scale with it.
    const cands = free.filter(
      (s) => !pn.pieces.has(k(s)) && rectLike(s) && outsideAll(shrink(inner(s), tol)),
    );
    const bandSets = new Sets(cands.length);
    cands.forEach((a, i) => {
      cands.forEach((b, j) => {
        if (j > i && overlaps(inner(a), inner(b))) bandSets.join(i, j);
      });
    });
    const bandGroups = new Map<number, DrawnLeaf[]>();
    cands.forEach((c, i) => {
      const r = bandSets.find(i);
      bandGroups.set(r, [...(bandGroups.get(r) ?? []), c]);
    });
    const regions: Region[] = panels.map((box) => ({ box }));
    const bandPieces = new Map<string, number>();
    for (const g of bandGroups.values()) {
      const box = g.reduce<Box | null>((a, s) => union(a, inner(s)), null);
      if (!box) continue;
      const band = bandBeside(box, panels, tol);
      if (!band) continue;
      const i = regions.length;
      regions.push({ box, band });
      const thin = band.axis === 0 ? w(box) : h(box);
      // Its cells (a colour bar's colours) scale with it; a strip's label does not.
      for (const s of free)
        if (
          !pn.pieces.has(k(s)) &&
          inside(s.box, box, tol) &&
          (band.axis === 0 ? w(inner(s)) : h(inner(s))) >= 0.9 * thin
        )
          bandPieces.set(k(s), i);
    }

    const within = (p: readonly [number, number], b: Box): boolean =>
      p[0] >= b[0] - tol && p[0] <= b[2] + tol && p[1] >= b[1] - tol && p[1] <= b[3] + tol;
    /** The region a point belongs to: a band, else a panel, else the nearest panel. */
    const order = [...regions.keys()].sort(
      (a, b) => Number(!regions[a]?.band) - Number(!regions[b]?.band),
    );
    const regionAt = (p: readonly [number, number]): number => {
      const hit = order.find((i) => {
        const r = regions[i];
        return r !== undefined && within(p, r.box);
      });
      return hit ?? nearest([p[0], p[1], p[0], p[1]], false);
    };
    /** The region nearest a box (bands included or not). */
    const nearest = (b: Box, bands: boolean): number => {
      let best = 0;
      let bestD = Infinity;
      regions.forEach((r, i) => {
        if (r.band && !bands) return;
        const d = gap(b, r.box);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    const boxOf = (i: number): Box => regions[i]?.box ?? A;

    // Ticks the roles missed (a panel too small for its edges to count as long): short
    // straight strokes from a region's edge, at least two alike.
    const edgeTicks = new Map<string, { base: [number, number]; at: number }>();
    {
      const found: { id: string; base: [number, number]; at: number; v: boolean; len: number }[] =
        [];
      for (const s of shapes) {
        if (!isAxis(s) && !pn.pieces.has(k(s)) && !bandPieces.has(k(s))) {
          const b = inner(s);
          const v = w(b) <= 1e-6 * vb[2] && h(b) > 0;
          const hz = h(b) <= 1e-6 * vb[3] && w(b) > 0;
          const ln = v ? h(b) : w(b);
          if ((!v && !hz) || ln > 0.08 * Math.max(vb[2], vb[3])) continue;
          regions.forEach((r, i) => {
            const R = r.box;
            if (v && b[0] >= R[0] - tol && b[0] <= R[2] + tol) {
              for (const y of [R[1], R[3]])
                if (Math.abs(b[1] - y) <= tol || Math.abs(b[3] - y) <= tol)
                  found.push({ id: k(s), base: [b[0], y], at: i, v, len: ln });
            } else if (hz && b[1] >= R[1] - tol && b[1] <= R[3] + tol) {
              for (const x of [R[0], R[2]])
                if (Math.abs(b[0] - x) <= tol || Math.abs(b[2] - x) <= tol)
                  found.push({ id: k(s), base: [x, b[1]], at: i, v, len: ln });
            }
          });
        }
      }
      for (const f of found) {
        const twin = found.some(
          (o) =>
            o.id !== f.id &&
            o.at === f.at &&
            o.v === f.v &&
            Math.abs(o.len - f.len) <= 0.05 * f.len &&
            (f.v ? o.base[1] === f.base[1] : o.base[0] === f.base[0]),
        );
        if (twin && !edgeTicks.has(f.id)) edgeTicks.set(f.id, { base: f.base, at: f.at });
      }
    }

    const actions = new Map<string, Action>();
    // Markers are small next to the plot's text (its glyph outlines when it has no text).
    const median = (v: number[]): number | undefined =>
      v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const plotEm =
      median(parts.texts.map((t) => t.size)) ??
      median(shapes.filter((l) => outsideAll(l.box)).map((l) => Math.max(w(l.box), h(l.box))));
    const legendAnchors = new Map<Box, Action>();
    const loose: DrawnLeaf[] = [];
    for (const l of leaves) {
      const id = k(l);
      const lg = inLegend.get(id);
      const base = tickBase(l);
      const piece = pn.pieces.get(id) ?? bandPieces.get(id);
      const et = edgeTicks.get(id);
      if (lg) {
        let act = legendAnchors.get(lg);
        if (!act) {
          const c: [number, number] = [(lg[0] + lg[2]) / 2, (lg[1] + lg[3]) / 2];
          const home = panels.findIndex((p) => within(c, p));
          const at = home >= 0 ? home : nearest(lg, false);
          act = { kind: 'move', at: anchorOf(lg, boxOf(at), true), in: at };
          legendAnchors.set(lg, act);
        }
        actions.set(id, act);
      } else if (base && !isText(l))
        actions.set(id, { kind: 'move', at: base, in: regionAt(base) });
      else if (piece !== undefined) actions.set(id, { kind: 'scale', in: piece });
      else if (et) actions.set(id, { kind: 'move', at: et.base, in: et.at });
      else if (isText(l) || outsideAll(l.box)) loose.push(l);
      else {
        const homes = panels.flatMap((p, i) => (overlaps(l.box, p) ? [i] : []));
        if (strict && homes.length > 1) return null;
        const home = homes[0] ?? 0;
        const P = boxOf(home);
        const marker = Math.max(MARKER * Math.min(w(P), h(P)), MARKER_EM * (plotEm ?? 0));
        if (Math.max(w(l.box), h(l.box)) <= marker && closed(l.node))
          actions.set(id, {
            kind: 'move',
            at: [(l.box[0] + l.box[2]) / 2, (l.box[1] + l.box[3]) / 2],
            in: home,
          });
        else actions.set(id, { kind: 'scale', in: home });
      }
    }

    // Labels and pieces outside the panels move together with what touches them.
    const size = (l: DrawnLeaf): number => (isText(l) ? em(l) : Math.max(w(l.box), h(l.box)));
    const angle = (l: DrawnLeaf): number => angleOf(multiply(l.parent, own(l.node)));
    const origin = (l: DrawnLeaf): [number, number] =>
      apply(
        multiply(l.parent, own(l.node)),
        numList(l.node.attrs['x'])?.[0] ?? 0,
        numList(l.node.attrs['y'])?.[0] ?? 0,
      );
    const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
      (Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1e-9, Math.min(a1 - a0, b1 - b0));
    /** Side by side along one line (pieces of one label), not stacked lines. */
    const together = (a: DrawnLeaf, b: DrawnLeaf): boolean => {
      const d = gap(a.box, b.box) / Math.max(size(a), size(b));
      if (d > 0.6) return false;
      const ox = overlap(a.box[0], a.box[2], b.box[0], b.box[2]);
      const oy = overlap(a.box[1], a.box[3], b.box[1], b.box[3]);
      const t = isText(a) ? a : isText(b) ? b : null;
      // Glyph outlines: words on a row (spaces included), letters of a column only.
      if (!t) return oy >= 0.5 || (ox >= 0.5 && d <= 0.3);
      if (d > 0.3) return false;
      const ta = angle(t);
      return Math.abs(Math.sin((ta * Math.PI) / 180)) > 0.7 ? ox >= 0.5 : oy >= 0.5;
    };
    /** Two runs of one line of text: same angle and baseline, close along it. */
    const sameLine = (a: DrawnLeaf, b: DrawnLeaf): boolean => {
      const ta = angle(a);
      if (Math.abs(((angle(b) - ta + 540) % 360) - 180) > 1) return false;
      const e = Math.max(em(a), em(b));
      if (gap(a.box, b.box) > e) return false;
      const [ax, ay] = origin(a);
      const [bx, by] = origin(b);
      const th = (ta * Math.PI) / 180;
      // Distance across the baseline.
      return Math.abs((bx - ax) * Math.sin(th) - (by - ay) * Math.cos(th)) <= 0.2 * e;
    };
    const near = new Sets(loose.length);
    loose.forEach((a, i) => {
      loose.forEach((b, j) => {
        if (j > i && (isText(a) && isText(b) ? sameLine(a, b) : together(a, b))) near.join(i, j);
      });
    });
    const clusters = new Map<number, DrawnLeaf[]>();
    loose.forEach((l, i) => {
      const r = near.find(i);
      clusters.set(r, [...(clusters.get(r) ?? []), l]);
    });
    for (const c of clusters.values()) {
      const ticked = c.map(tickBase).find((b) => b !== undefined);
      const box = c.reduce<Box | null>((a, l) => union(a, l.box), null) ?? A;
      const home = nearest(box, true);
      const act: Action = ticked
        ? { kind: 'move', at: ticked, in: regionAt(ticked) }
        : { kind: 'move', at: anchorOf(box, boxOf(home), false), in: home };
      for (const l of c) {
        const tb = tickBase(l);
        actions.set(k(l), tb ? { kind: 'move', at: tb, in: regionAt(tb) } : act);
      }
    }
    return { area: A, regions, spans: spansOf(panels), actions, leaves };
  }
}

/** A box's start and end along one axis. */
const lo = (b: Box, axis: 0 | 1): number => (axis === 0 ? b[0] : b[1]);
const hi = (b: Box, axis: 0 | 1): number => (axis === 0 ? b[2] : b[3]);

/** A box `d` smaller on every side. */
const shrink = (b: Box, d: number): Box => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];

interface Panels {
  /** Each panel's box. */
  readonly boxes: readonly Box[];
  /** The shapes that make up each panel (frames, backgrounds, axis lines): they scale with it. */
  readonly pieces: ReadonlyMap<string, number>;
}

/**
 * The plot's separate panels (subplots, facets): touching axis lines and
 * rectangles of a good size grouped, each group a panel of a good size with a
 * frame edge or axis line along it. Null unless there are at least two and
 * every group qualifies (the plot is then one area, as before).
 */
function splitPanels(
  free: readonly DrawnLeaf[],
  vb: ViewBox,
  isAxis: (l: DrawnLeaf) => boolean,
  rectLike: (l: DrawnLeaf) => boolean,
): Panels | null {
  const pieces = free.filter((s) => {
    if (isAxis(s)) return true;
    const b = inner(s);
    // Not band-shaped: a facet strip on its panel is not part of it.
    return (
      rectLike(s) &&
      w(b) >= PANEL * vb[2] &&
      h(b) >= PANEL * vb[3] &&
      Math.min(w(b), h(b)) > BAND * Math.max(w(b), h(b))
    );
  });
  const eps = 1e-3 * Math.max(vb[2], vb[3]);
  const sets = new Sets(pieces.length);
  pieces.forEach((a, i) => {
    pieces.forEach((b, j) => {
      if (j > i && gap(inner(a), inner(b)) <= eps) sets.join(i, j);
    });
  });
  const groups = new Map<number, DrawnLeaf[]>();
  pieces.forEach((p, i) => {
    const r = sets.find(i);
    groups.set(r, [...(groups.get(r) ?? []), p]);
  });
  if (groups.size < 2) return null;
  const boxes: Box[] = [];
  const byPiece = new Map<string, number>();
  for (const g of groups.values()) {
    const box = g.reduce<Box | null>((a, s) => union(a, inner(s)), null);
    if (!box) continue;
    // An edge: an axis line, or a straight stroke along most of one side. Without one it is
    // a box of another kind (a legend's background), not a panel.
    const tol = 2 * eps;
    const axes = g.some(isAxis);
    const edged =
      axes ||
      free.some((s) => {
        const b = inner(s);
        if (w(b) <= eps && h(b) >= 0.8 * h(box))
          return Math.abs(b[0] - box[0]) <= tol || Math.abs(b[0] - box[2]) <= tol;
        if (h(b) <= eps && w(b) >= 0.8 * w(box))
          return Math.abs(b[1] - box[1]) <= tol || Math.abs(b[1] - box[3]) <= tol;
        return false;
      });
    if (!edged) continue;
    if (w(box) < PANEL * vb[2] || h(box) < PANEL * vb[3]) return null;
    for (const s of g) byPiece.set(key(s.path), boxes.length);
    boxes.push(box);
  }
  return boxes.length < 2 ? null : { boxes, pieces: byPiece };
}

/**
 * The band a thin rectangle makes beside one of the panels: thin across one
 * axis, along the other as long as 40 % of the panel and mostly beside it,
 * and close to it; null when it is none.
 */
function bandBeside(box: Box, panels: readonly Box[], tol: number): Band | null {
  const axis: 0 | 1 = w(box) <= h(box) ? 0 : 1;
  const along: 0 | 1 = axis === 0 ? 1 : 0;
  const thin = hi(box, axis) - lo(box, axis);
  const long = hi(box, along) - lo(box, along);
  if (thin > BAND * long) return null;
  let best: Band | null = null;
  let bestGap = Infinity;
  for (const [i, p] of panels.entries()) {
    const span = hi(p, along) - lo(p, along);
    const shared = Math.min(hi(box, along), hi(p, along)) - Math.max(lo(box, along), lo(p, along));
    if (long < 0.4 * span || shared < 0.5 * long) continue;
    const across = hi(p, axis) - lo(p, axis);
    const side: 'lo' | 'hi' | null =
      lo(box, axis) >= hi(p, axis) - tol ? 'hi' : hi(box, axis) <= lo(p, axis) + tol ? 'lo' : null;
    if (!side) continue;
    const d = side === 'hi' ? lo(box, axis) - hi(p, axis) : lo(p, axis) - hi(box, axis);
    if (d > BAND_GAP * across || d >= bestGap) continue;
    bestGap = d;
    best = { axis, side, of: i };
  }
  return best;
}

/** Per axis, the panels' extents merged where they overlap: the parts that scale. */
function spansOf(panels: readonly Box[]): readonly [readonly Span[], readonly Span[]] {
  const merged = (axis: 0 | 1): Span[] => {
    const v = panels
      .map((p): [number, number] => [lo(p, axis), hi(p, axis)])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [lo, hi] of v) {
      const last = out[out.length - 1];
      if (last && lo < last[1]) last[1] = Math.max(last[1], hi);
      else out.push([lo, hi]);
    }
    return out;
  };
  return [merged(0), merged(1)];
}

const total = (spans: readonly Span[]): number => spans.reduce((a, [lo, hi]) => a + hi - lo, 0);

/** Where the scaling of `spans` by `s` takes `v`: gaps keep their size. */
function along(spans: readonly Span[], s: number, v: number): number {
  let d = 0;
  for (const [lo, hi] of spans) {
    if (v >= hi) d += (hi - lo) * (s - 1);
    else if (v > lo) d += (v - lo) * (s - 1);
  }
  return v + d;
}

/**
 * The area's growth that gives the plot a viewBox of `vw × vh` (its margins
 * and the gaps between its panels fixed), never below `MIN_GROWTH`.
 */
export function growthFor(
  vb: ViewBox,
  layout: Pick<PlotLayout, 'spans'>,
  vw: number,
  vh: number,
): readonly [number, number] {
  const tw = total(layout.spans[0]);
  const th = total(layout.spans[1]);
  return [
    Math.max(MIN_GROWTH, (vw - (vb[2] - tw)) / tw),
    Math.max(MIN_GROWTH, (vh - (vb[3] - th)) / th),
  ];
}

/** Each region's map for growth (sx, sy): scale and translate only. */
function regionMaps(layout: PlotLayout, sx: number, sy: number): Matrix[] {
  const { regions, spans } = layout;
  const g = (axis: 0 | 1): number => (axis === 0 ? sx : sy);
  const to = (axis: 0 | 1, v: number): number => along(spans[axis], g(axis), v);
  const spanOf = (axis: 0 | 1, b: Box): Span | undefined =>
    spans[axis].find(([a, z]) => a <= lo(b, axis) + 1e-9 && z >= hi(b, axis) - 1e-9);
  /** Where a panel's edges go: where the spans take them, unless a band beside it inside its
   * span makes it give way (a colour bar's panel narrows so the bar keeps its width). */
  const edges = (i: number, axis: 0 | 1): readonly [number, number] => {
    const p = regions[i]?.box;
    if (!p) return [0, 0];
    const a = lo(p, axis);
    const z = hi(p, axis);
    const span = spanOf(axis, p);
    let na = to(axis, a);
    let nz = to(axis, z);
    for (const r of regions) {
      const b = r.band;
      if (b?.of !== i || b.axis !== axis || !span) continue;
      if (b.side === 'hi' && lo(r.box, axis) < span[1]) nz = z + to(axis, span[1]) - span[1];
      if (b.side === 'lo' && hi(r.box, axis) > span[0]) na = a + to(axis, span[0]) - span[0];
    }
    const min = MIN_GROWTH * (z - a);
    if (nz - na < min) {
      if (nz !== to(axis, z)) nz = na + min;
      else na = nz - min;
    }
    return [na, nz];
  };
  /** [scale, offset] of a region across one axis. */
  const fit = (r: Region, i: number, axis: 0 | 1): readonly [number, number] => {
    const a = lo(r.box, axis);
    const z = hi(r.box, axis);
    const b = r.band;
    if (!b) {
      const [na, nz] = edges(i, axis);
      const s = z > a ? (nz - na) / (z - a) : 1;
      return [s, na - s * a];
    }
    const c = (a + z) / 2;
    if (axis === b.axis) {
      // Across: beside its panel, moved as the edge it faces (or as where it is).
      const p = regions[b.of]?.box;
      const span = p && spanOf(axis, p);
      if (p && span && (b.side === 'hi' ? a < span[1] : z > span[0])) {
        const [na, nz] = edges(b.of, axis);
        return [1, b.side === 'hi' ? nz - hi(p, axis) : na - lo(p, axis)];
      }
      return [1, to(axis, c) - c];
    }
    // Along: with the span it lies in.
    const span = spans[axis].find(([s0, s1]) => c >= s0 && c <= s1);
    return span ? [g(axis), to(axis, span[0]) - g(axis) * span[0]] : [1, to(axis, c) - c];
  };
  return regions.map((r, i) => {
    const [ax, bx] = fit(r, i, 0);
    const [ay, by] = fit(r, i, 1);
    return [ax, 0, 0, ay, bx, by];
  });
}
/**
 * Where growth (sx, sy) takes a box drawn over the plot (a picture that was
 * inside it, issue 24): like the smallest shape around it (a panel's
 * background, a legend key), so it scales with its panel or moves with its
 * legend; with no shape around it, scaled with the panel or band its centre
 * is in, or outside every region moved as the nearest one's map takes its
 * centre.
 */
export function mapPlotBox(layout: PlotLayout, sx: number, sy: number, box: Box): Box {
  const maps = regionMaps(layout, sx, sy);
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const scaled = (R: Matrix): Box => {
    const [x0, y0] = apply(R, box[0], box[1]);
    const [x1, y1] = apply(R, box[2], box[3]);
    return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  };
  const moved = (R: Matrix, at: readonly [number, number]): Box => {
    const [nx, ny] = apply(R, at[0], at[1]);
    const dx = nx - at[0];
    const dy = ny - at[1];
    return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
  };
  const tol = 0.5;
  let around: { act: Action; area: number } | null = null;
  for (const l of layout.leaves) {
    const act = layout.actions.get(key(l.path));
    const b = inner(l);
    if (!act || l.node.tag === 'text' || !inside(box, b, tol)) continue;
    const area = w(b) * h(b);
    if (!around || area < around.area) around = { act, area };
  }
  if (around) {
    const R = maps[around.act.in];
    if (R) return around.act.kind === 'scale' ? scaled(R) : moved(R, around.act.at);
  }
  const holds = (r: Region): boolean =>
    cx >= r.box[0] && cx <= r.box[2] && cy >= r.box[1] && cy <= r.box[3];
  const dist = (r: Region): number =>
    Math.hypot(
      Math.max(r.box[0] - cx, 0, cx - r.box[2]),
      Math.max(r.box[1] - cy, 0, cy - r.box[3]),
    );
  let best = layout.regions.findIndex(holds);
  if (best < 0)
    best = layout.regions.reduce(
      (b, r, i) => (b < 0 || dist(r) < dist(layout.regions[b] ?? r) ? i : b),
      -1,
    );
  const R = maps[best];
  const region = layout.regions[best];
  if (!R || !region) return box;
  return holds(region) ? scaled(R) : moved(R, [cx, cy]);
}

const own = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (t === undefined ? null : parseTransform(String(t))) ?? IDENTITY;
};

type Attrs = Record<string, string | number | undefined>;

/** Parsed path data per element: a drag redraws the same stored plot at every step. */
const parsedPaths = new WeakMap<SvgNode, Seg[] | null>();
function segsOf(n: SvgNode): Seg[] | null {
  let segs = parsedPaths.get(n);
  if (segs === undefined) {
    segs = parsePath(String(n.attrs['d'] ?? ''));
    parsedPaths.set(n, segs);
  }
  return segs;
}

/**
 * The element with an axis-aligned map `m` (scale and translate only) baked
 * into its coordinates; its stroke width and dashes are not touched. Null
 * when it has coordinates that cannot be mapped (percentages, bad data).
 */
function mapLocal(n: SvgNode, m: Matrix): SvgNode | null {
  const [a, , , d, e, f] = m;
  const X = (v: number): string => fmt(a * v + e);
  const Y = (v: number): string => fmt(d * v + f);
  const g = (name: string): number | null => (n.attrs[name] === undefined ? 0 : len(n.attrs[name]));
  const set = (attrs: Attrs): SvgNode => el(n.tag, { ...n.attrs, ...attrs }, n.children);
  const lists = (node: SvgNode): SvgNode => {
    const attrs: Attrs = { ...node.attrs };
    const xs = node.attrs['x'] === undefined ? null : numList(node.attrs['x']);
    const ys = node.attrs['y'] === undefined ? null : numList(node.attrs['y']);
    if (xs?.length) attrs['x'] = xs.map(X).join(' ');
    if (ys?.length) attrs['y'] = ys.map(Y).join(' ');
    const dys = node.attrs['dy'] === undefined ? null : numList(node.attrs['dy']);
    if (dys?.length) attrs['dy'] = dys.map((v) => fmt(d * v)).join(' ');
    return el(
      node.tag,
      attrs,
      node.children.map((c) => (typeof c === 'string' ? c : lists(c))),
    );
  };
  switch (n.tag) {
    case 'text':
      return lists(n);
    case 'path': {
      const segs = segsOf(n);
      return segs ? set({ d: pathString(transformPath(segs, m)) }) : null;
    }
    case 'rect': {
      const [x, y, rw, rh, rx, ry] = ['x', 'y', 'width', 'height', 'rx', 'ry'].map(g);
      if ([x, y, rw, rh, rx, ry].some((v) => v === null)) return null;
      return set({
        x: X(x ?? 0),
        y: Y(y ?? 0),
        width: fmt((rw ?? 0) * a),
        height: fmt((rh ?? 0) * d),
        ...(n.attrs['rx'] !== undefined ? { rx: fmt((rx ?? 0) * a) } : {}),
        ...(n.attrs['ry'] !== undefined ? { ry: fmt((ry ?? 0) * d) } : {}),
      });
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [g('cx'), g('cy')];
      const rx = n.tag === 'circle' ? g('r') : g('rx');
      const ry = n.tag === 'circle' ? g('r') : g('ry');
      if (cx === null || cy === null || rx === null || ry === null) return null;
      if (n.tag === 'circle' && Math.abs(a - d) <= 1e-9 * Math.max(1, a))
        return set({ cx: X(cx), cy: Y(cy), r: fmt(rx * a) });
      const { r: _r, ...rest } = n.attrs;
      return el(
        'ellipse',
        { ...rest, cx: X(cx), cy: Y(cy), rx: fmt(rx * a), ry: fmt(ry * d) },
        n.children,
      );
    }
    case 'line': {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(g);
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return set({ x1: X(x1 ?? 0), y1: Y(y1 ?? 0), x2: X(x2 ?? 0), y2: Y(y2 ?? 0) });
    }
    case 'polyline':
    case 'polygon': {
      const v = numList(n.attrs['points']);
      if (!v) return null;
      return set({ points: v.map((c, i) => (i % 2 === 0 ? X(c) : Y(c))).join(' ') });
    }
    default:
      return null;
  }
}

/**
 * The plot with its area grown by (sx, sy) about its top-left and every
 * other element moved by its anchor (see the module comment), and its new
 * viewBox. The viewBox keeps its origin; the margins keep their size.
 */
export function resizePlot(
  root: SvgNode,
  vb: ViewBox,
  layout: PlotLayout,
  sx: number,
  sy: number,
): { root: SvgNode; viewBox: ViewBox } {
  const maps = regionMaps(layout, sx, sy);
  const edits = new Map<string, (n: SvgNode) => SvgNode>();
  for (const l of layout.leaves) {
    const act = layout.actions.get(key(l.path));
    if (!act) continue;
    const R = maps[act.in];
    if (!R) continue;
    let map: Matrix;
    if (act.kind === 'scale') map = R;
    else {
      const [nx, ny] = apply(R, act.at[0], act.at[1]);
      const dx = nx - act.at[0];
      const dy = ny - act.at[1];
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
      map = [1, 0, 0, 1, dx, dy];
    }
    edits.set(key(l.path), (n) => {
      const m = multiply(l.parent, own(n));
      // The same map in the element's own coordinates.
      const local = multiply(invert(m), multiply(map, m));
      const baked = isAxisAligned(local) ? mapLocal(n, local) : null;
      if (baked) return baked;
      // Rotated or skewed geometry: the map goes on its transform (its stroke scales with it).
      const t = multiply(invert(l.parent), multiply(map, m));
      return el(n.tag, { ...n.attrs, transform: matrixString(t) }, n.children);
    });
  }
  const out = edits.size === 0 ? root : replaceAt(root, edits);
  const viewBox: ViewBox = [
    vb[0],
    vb[1],
    Number(fmt(vb[2] + total(layout.spans[0]) * (sx - 1))),
    Number(fmt(vb[3] + total(layout.spans[1]) * (sy - 1))),
  ];
  return {
    root: el(out.tag, { ...out.attrs, viewBox: viewBox.map(fmt).join(' ') }, out.children),
    viewBox,
  };
}
