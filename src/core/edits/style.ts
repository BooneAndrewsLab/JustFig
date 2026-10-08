/**
 * Fonts, text sizes and line widths across a selection, including the text
 * and strokes inside imported plots (note 16, issue 11). Two named edits:
 * `setStyles` (the Inspector's **Text and lines** fields) and `matchStyles`
 * (**Same text and lines**: the first selected object is the reference).
 *
 * A plot is restyled by rewriting its `svgImport` asset: the new SVG is a new
 * content-addressed asset and only the edited objects point at it, so a copy
 * of the plot that was not selected keeps its look (copy-on-write). The
 * replaced asset is dropped from the figure once nothing uses it.
 */
import { hashAsset } from '@/io/assets';
import {
  type PlotParts,
  type PlotStroke,
  type PlotText,
  type StrokeRole,
  type TextRole,
  restylePlot,
} from '@/io/svg/plotRoles';
import { viewBoxAroundText } from '@/io/svg/plotCleanup';
import { parsedSvg } from '@/render/assets';

import type { Id } from '../model/ids';
import { findObj, hasChildren } from '../model/tree';
import type { Asset, Assets, FontId, Frame, Obj, Run } from '../model/types';
import { type Edit, updateObjects } from './edits';
import { growFrame, partsOf, plotSvg, swapAssets } from './plotSize';

export type TextTarget = 'all' | TextRole;
export type LineTarget = 'all' | StrokeRole;

export interface StyleChange {
  readonly font?: FontId;
  /** Points. */
  readonly size?: number;
  /** Which text: all (text objects and plot text) or one role of plot text only. */
  readonly textTarget?: TextTarget;
  /** Points. */
  readonly lineWidth?: number;
  /** Which lines: all (shapes, arrows and plot strokes) or one role of plot strokes only. */
  readonly lineTarget?: LineTarget;
}

export interface TextSample {
  readonly font: FontId;
  /** Points. */
  readonly size: number;
}

/** The look of a reference object, in points on the page. */
export interface StyleSample {
  readonly text?: TextSample;
  readonly textByRole: Partial<Record<TextRole, TextSample>>;
  readonly line?: number;
  readonly lineByRole: Partial<Record<StrokeRole, number>>;
}

/** An imported plot: its asset, roles, and page points per SVG user unit. */
export interface Plot {
  readonly hash: string;
  readonly asset: Extract<Asset, { kind: 'svgImport' }>;
  readonly parts: PlotParts;
  readonly k: number;
}

/** The plot an object shows, if it is an imported SVG or PDF. */
export function plotOf(o: Obj, assets: Assets): Plot | null {
  if (o.type !== 'image') return null;
  const asset = assets[o.asset];
  if (asset?.kind !== 'svgImport') return null;
  const [, , vw, vh] = parsedSvg(asset.svg).viewBox;
  if (vw <= 0 || vh <= 0) return null;
  const k = Math.sqrt(Math.abs((o.frame.w / vw) * (o.frame.h / vh)));
  return { hash: o.asset, asset, parts: partsOf(asset.svg), k };
}

/** The selected objects and everything inside selected groups and panels, unlocked only. */
export function styleTargets(objs: readonly Obj[]): Obj[] {
  const out: Obj[] = [];
  const visit = (o: Obj): void => {
    if (o.locked === true) return;
    if (hasChildren(o)) o.children.forEach(visit);
    else out.push(o);
  };
  objs.forEach(visit);
  return out;
}

const textHit = (t: TextTarget, role: TextRole): boolean => t === 'all' || t === role;
const lineHit = (t: LineTarget, role: StrokeRole): boolean => t === 'all' || t === role;

/** The most common value (to 0.01), the first seen on ties. */
function mode<T>(items: readonly T[], keyOf: (t: T) => string): T | undefined {
  const counts = new Map<string, { n: number; item: T }>();
  for (const it of items) {
    const key = keyOf(it);
    const c = counts.get(key);
    if (c) c.n++;
    else counts.set(key, { n: 1, item: it });
  }
  let best: { n: number; item: T } | undefined;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.item;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function textMode(texts: readonly PlotText[], k: number): TextSample | undefined {
  const t = mode(texts, (x) => `${x.font}|${String(r2(x.size * k))}`);
  return t ? { font: t.font, size: r2(t.size * k) } : undefined;
}

function lineMode(strokes: readonly PlotStroke[], k: number): number | undefined {
  const s = mode(strokes, (x) => String(r2(x.width * k)));
  return s ? r2(s.width * k) : undefined;
}

/** The fonts, text sizes and line widths an object shows (a container: its first that has each). */
export function styleSample(o: Obj, assets: Assets): StyleSample {
  if (hasChildren(o)) {
    let out: StyleSample = { textByRole: {}, lineByRole: {} };
    for (const c of o.children) {
      const s = styleSample(c, assets);
      const text = out.text ?? s.text;
      const line = out.line ?? s.line;
      out = {
        ...(text ? { text } : {}),
        textByRole: Object.keys(out.textByRole).length > 0 ? out.textByRole : s.textByRole,
        ...(line !== undefined ? { line } : {}),
        lineByRole: Object.keys(out.lineByRole).length > 0 ? out.lineByRole : s.lineByRole,
      };
    }
    return out;
  }
  if (o.type === 'text') {
    const r = o.runs[0]?.[0];
    return {
      ...(r ? { text: { font: r.font, size: r.size } } : {}),
      textByRole: {},
      lineByRole: {},
    };
  }
  if ('style' in o)
    return {
      ...(o.style.stroke ? { line: o.style.strokeWidth } : {}),
      textByRole: {},
      lineByRole: {},
    };
  const plot = plotOf(o, assets);
  if (!plot) return { textByRole: {}, lineByRole: {} };
  const { texts, strokes } = plot.parts;
  const textByRole: Partial<Record<TextRole, TextSample>> = {};
  for (const role of ['tick', 'label'] as const) {
    const m = textMode(
      texts.filter((t) => t.role === role),
      plot.k,
    );
    if (m) textByRole[role] = m;
  }
  const lineByRole: Partial<Record<StrokeRole, number>> = {};
  for (const role of ['tick', 'axis', 'data'] as const) {
    const m = lineMode(
      strokes.filter((s) => s.role === role),
      plot.k,
    );
    if (m !== undefined) lineByRole[role] = m;
  }
  const text = textMode(texts, plot.k);
  const line = lineMode(strokes, plot.k);
  return {
    ...(text ? { text } : {}),
    textByRole,
    ...(line !== undefined ? { line } : {}),
    lineByRole,
  };
}

/** What a field shows for the selection: the first target's value, in points. */
export function currentStyle(
  objs: readonly Obj[],
  assets: Assets,
  textTarget: TextTarget,
  lineTarget: LineTarget,
): { text?: TextSample; line?: number } {
  let text: TextSample | undefined;
  let line: number | undefined;
  for (const o of styleTargets(objs)) {
    const plot = plotOf(o, assets);
    if (plot) {
      const t = plot.parts.texts.find((x) => textHit(textTarget, x.role));
      if (t && !text) text = { font: t.font, size: r2(t.size * plot.k) };
      const s = plot.parts.strokes.find((x) => lineHit(lineTarget, x.role));
      if (s && line === undefined) line = r2(s.width * plot.k);
    } else if (o.type === 'text' && textTarget === 'all' && !text) {
      const r = o.runs[0]?.[0];
      if (r) text = { font: r.font, size: r.size };
    } else if ('style' in o && lineTarget === 'all' && line === undefined && o.style.stroke)
      line = o.style.strokeWidth;
    if (text && line !== undefined) break;
  }
  return { ...(text ? { text } : {}), ...(line !== undefined ? { line } : {}) };
}

/** Per-object change: how to restyle a text object's runs, a shape's stroke, a plot's parts. */
interface ObjChange {
  readonly run?: (r: Run) => Run;
  readonly strokeWidth?: number;
  readonly plotText?: (t: PlotText) => { font?: FontId; size?: number } | null;
  readonly plotStroke?: (s: PlotStroke) => number | null;
}

/** One edit applying `changeFor` to each target; plots get a new asset each. */
function styleEdit(
  pageId: Id,
  targets: readonly Obj[],
  label: string,
  changeFor: (o: Obj, f: { assets: Assets }) => ObjChange | null,
): Edit {
  const ids = targets.map((o) => o.id);
  return {
    label,
    apply: (f) => {
      const added: Record<string, Asset> = {};
      const replaced = new Set<string>();
      const nextHash = new Map<Id, string>();
      const nextFrame = new Map<Id, Frame>();
      const changes = new Map<Id, ObjChange>();
      const page = f.doc.pages.find((p) => p.id === pageId);
      for (const t of targets) {
        // The object as it is now: a coalesced field edit applies on top of its last step.
        const o = (page ? findObj(page, t.id) : undefined) ?? t;
        const c = changeFor(o, f);
        if (!c) continue;
        changes.set(o.id, c);
        const plot = plotOf(o, f.assets);
        if (!plot || (!c.plotText && !c.plotStroke)) continue;
        const s = parsedSvg(plot.asset.svg);
        const root = restylePlot(s.root, plot.parts, {
          ...(c.plotText ? { text: (t: PlotText) => c.plotText?.(t) ?? null } : {}),
          ...(c.plotStroke ? { stroke: (st: PlotStroke) => c.plotStroke?.(st) ?? null } : {}),
        });
        if (root === s.root) continue;
        // Labels made larger than the margins keep the object's bounds around them (issue 30).
        const vb = viewBoxAroundText(root, s.viewBox);
        if (vb !== s.viewBox) nextFrame.set(o.id, growFrame(o.frame, s.viewBox, vb));
        const asset: Asset = { ...plot.asset, svg: plotSvg(root, vb) };
        const hash = hashAsset(asset);
        added[hash] = asset;
        replaced.add(plot.hash);
        nextHash.set(o.id, hash);
      }
      const next = updateObjects(pageId, ids, label, (o) => {
        const c = changes.get(o.id);
        if (!c) return o;
        if (o.type === 'text' && c.run)
          return { ...o, runs: o.runs.map((p) => p.map(c.run ?? ((r) => r))) };
        if ('style' in o && c.strokeWidth !== undefined)
          return { ...o, style: { ...o.style, strokeWidth: c.strokeWidth } };
        const h = nextHash.get(o.id);
        if (o.type === 'image' && h !== undefined)
          return { ...o, asset: h, frame: nextFrame.get(o.id) ?? o.frame };
        return o;
      }).apply(f);
      return nextHash.size === 0 ? next : swapAssets(next, added, replaced);
    },
  };
}

/**
 * Sets the font and/or size of the selection's text and/or the width of its
 * lines (points on the page). Text objects and shapes change only for the
 * `all` targets; a role target reaches plot text or strokes of that role only.
 */
export function setStyles(
  pageId: Id,
  objs: readonly Obj[],
  change: StyleChange,
  label: string,
): Edit {
  const tt = change.textTarget ?? 'all';
  const lt = change.lineTarget ?? 'all';
  const { font, size, lineWidth } = change;
  const hasText = font !== undefined || size !== undefined;
  const textPatch = {
    ...(font !== undefined ? { font } : {}),
    ...(size !== undefined ? { size } : {}),
  };
  return styleEdit(pageId, styleTargets(objs), label, (o, f) => {
    const plot = plotOf(o, f.assets);
    if (plot)
      return {
        ...(hasText
          ? {
              plotText: (t: PlotText) =>
                textHit(tt, t.role)
                  ? {
                      ...(font !== undefined ? { font } : {}),
                      ...(size !== undefined ? { size: size / plot.k } : {}),
                    }
                  : null,
            }
          : {}),
        ...(lineWidth !== undefined
          ? { plotStroke: (s: PlotStroke) => (lineHit(lt, s.role) ? lineWidth / plot.k : null) }
          : {}),
      };
    if (o.type === 'text' && hasText && tt === 'all')
      return { run: (r) => ({ ...r, ...textPatch }) };
    if ('style' in o && lineWidth !== undefined && lt === 'all') return { strokeWidth: lineWidth };
    return null;
  });
}

const OTHER_LINE: Readonly<Record<StrokeRole, StrokeRole | null>> = {
  tick: 'axis',
  axis: 'tick',
  data: null,
};

/**
 * Gives every selected object but the first the first one's fonts, text sizes
 * and line widths. Between plots, each role takes the reference's value for
 * that role (tick labels from tick labels, axes from axes, data from data),
 * else its most common one; text objects and shapes take the most common.
 */
export function matchStyles(pageId: Id, objs: readonly Obj[]): Edit {
  const [ref, ...rest] = objs;
  return styleEdit(pageId, styleTargets(rest), 'Match text and lines', (o, f) => {
    if (!ref) return null;
    const s = styleSample(ref, f.assets);
    const plot = plotOf(o, f.assets);
    if (plot)
      return {
        ...(s.text || Object.keys(s.textByRole).length > 0
          ? {
              plotText: (t: PlotText) => {
                const v = s.textByRole[t.role] ?? s.text;
                return v ? { font: v.font, size: v.size / plot.k } : null;
              },
            }
          : {}),
        ...(s.line !== undefined
          ? {
              plotStroke: (st: PlotStroke) => {
                const other = OTHER_LINE[st.role];
                const v =
                  s.lineByRole[st.role] ?? (other ? s.lineByRole[other] : undefined) ?? s.line;
                return v === undefined ? null : v / plot.k;
              },
            }
          : {}),
      };
    const text = s.text;
    if (o.type === 'text' && text)
      return { run: (r) => ({ ...r, font: text.font, size: text.size }) };
    if ('style' in o && s.line !== undefined) return { strokeWidth: s.line };
    return null;
  });
}
