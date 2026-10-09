/**
 * Named edits (note 01): every change to a figure is one of these, pure
 * `Figure → Figure` with a label for the undo menu (as BarelySig's
 * model/edits.ts). The store records each as one undo step, or merges a
 * continuous gesture into one via a coalesce key.
 */
import { type Box, boxContains, center, unionBoxes } from '../geometry/matrix';
import {
  boundsOf,
  flipObj,
  objBounds,
  refit,
  rotateObj,
  scaleObj,
  translateObj,
} from '../geometry/transform';
import { createLayer, createPage } from '../model/factory';
import { type Id, newId } from '../model/ids';
import { hasChildren, mapObjs, mapPageObjs, pageObjects } from '../model/tree';
import type {
  Asset,
  Assets,
  Doc,
  Figure,
  Group,
  Layer,
  Obj,
  Page,
  Paint,
  PanelLabelStyle,
} from '../model/types';
import { fitText } from '../text/layout';
import { type PlotSizing, keepPlotText } from './plotSize';

export interface Edit {
  readonly label: string;
  readonly apply: (f: Figure) => Figure;
  /** Ids to select once applied (e.g. new objects). */
  readonly select?: readonly Id[];
}

export class EditError extends Error {
  override readonly name = 'EditError';
}

const pageOf = (doc: Doc, pageId: Id): Page => {
  const p = doc.pages.find((x) => x.id === pageId);
  if (!p) throw new EditError('That page no longer exists.');
  return p;
};

export function withPage(f: Figure, pageId: Id, fn: (p: Page) => Page): Figure {
  const p = pageOf(f.doc, pageId);
  const next = fn(p);
  if (next === p) return f;
  return { ...f, doc: { ...f.doc, pages: f.doc.pages.map((x) => (x.id === pageId ? next : x)) } };
}

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** The layer new objects go to: the given one, else the topmost unlocked visible one. */
function targetLayer(p: Page, layerId?: Id): Layer {
  const l =
    (layerId && p.layers.find((x) => x.id === layerId)) ??
    [...p.layers].reverse().find((x) => !x.locked && x.visible) ??
    p.layers[p.layers.length - 1];
  if (!l) throw new EditError('This page has no layer to draw on.');
  return l;
}

/** The top-level panel whose box contains the object's centre, if any. */
function panelAt(layer: Layer, o: Obj): Obj | undefined {
  const c = center(objBounds(o));
  return [...layer.children]
    .reverse()
    .find(
      (p) =>
        p.type === 'panel' &&
        p.id !== o.id &&
        c.x >= p.frame.x &&
        c.x <= p.frame.x + p.frame.w &&
        c.y >= p.frame.y &&
        c.y <= p.frame.y + p.frame.h,
    );
}

/**
 * Puts objects into the panel under their centre, or takes them out of a
 * panel they no longer sit in (panels hold what is drawn on them). Only
 * top-level objects and direct panel children move, panels never nest,
 * and an object whose panel does not change keeps its place in the stack.
 */
export function reparent(p: Page, ids: ReadonlySet<Id>): Page {
  return {
    ...p,
    layers: p.layers.map((layer) => {
      const moves: { o: Obj; to: Id | null }[] = [];
      const hostOf = (o: Obj): Id | null => panelAt(layer, o)?.id ?? null;
      for (const o of layer.children) {
        if (o.type === 'panel') {
          for (const c of o.children)
            if (ids.has(c.id) && hostOf(c) !== o.id) moves.push({ o: c, to: hostOf(c) });
        } else if (ids.has(o.id) && hostOf(o) !== null) moves.push({ o, to: hostOf(o) });
      }
      if (moves.length === 0) return layer;
      const moving = new Set(moves.map((m) => m.o.id));
      let children: Obj[] = layer.children
        .filter((o) => !moving.has(o.id))
        .map((o) =>
          o.type === 'panel' ? { ...o, children: o.children.filter((c) => !moving.has(c.id)) } : o,
        );
      for (const { o, to } of moves) {
        children =
          to === null
            ? [...children, o]
            : children.map((x) =>
                x.id === to && x.type === 'panel' ? { ...x, children: [...x.children, o] } : x,
              );
      }
      return { ...layer, children };
    }),
  };
}

export function addObjects(
  pageId: Id,
  objs: readonly Obj[],
  assets: Assets = {},
  layerId?: Id,
): Edit {
  return {
    label:
      objs.length === 1 && objs[0] ? `Add ${objs[0].type}` : `Add ${String(objs.length)} objects`,
    select: objs.map((o) => o.id),
    apply: (f) => {
      const withAssets = Object.keys(assets).length > 0 ? { ...f.assets, ...assets } : f.assets;
      const next = withPage(f, pageId, (p) => {
        const l = targetLayer(p, layerId);
        if (l.locked) throw new EditError('That layer is locked.');
        const added = {
          ...p,
          layers: p.layers.map((x) =>
            x.id === l.id ? { ...x, children: [...x.children, ...objs] } : x,
          ),
        };
        return reparent(added, new Set(objs.filter((o) => o.type !== 'panel').map((o) => o.id)));
      });
      return { ...next, assets: withAssets };
    },
  };
}

export function deleteObjects(pageId: Id, ids: readonly Id[]): Edit {
  const set = new Set(ids);
  return {
    label: `Delete ${plural(ids.length, 'object')}`,
    select: [],
    apply: (f) =>
      withPage(f, pageId, (p) =>
        mapPageObjs(p, (o) => (set.has(o.id) ? null : o.type === 'group' ? refit(o) : o)),
      ),
  };
}

/** Any per-object change (style, name, opacity, text…) under a label. */
export function updateObjects(
  pageId: Id,
  ids: readonly Id[],
  label: string,
  fn: (o: Obj) => Obj,
): Edit {
  const set = new Set(ids);
  return {
    label,
    apply: (f) =>
      withPage(f, pageId, (p) =>
        mapPageObjs(p, (o) => {
          if (!set.has(o.id)) return o.type === 'group' ? refitIfChanged(o) : o;
          const n = fn(o);
          return n.type === 'text' ? fitText(n) : n;
        }),
      ),
  };
}

/** A group whose children changed gets its frame recomputed. */
function refitIfChanged(g: Group): Obj {
  const r = refit(g);
  const a = r.frame;
  const b = g.frame;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h ? g : r;
}

/** Moves the selected objects; a drag passes the whole offset from its start each time. */
export function moveObjects(pageId: Id, ids: readonly Id[], dx: number, dy: number): Edit {
  const t = transformEach(pageId, ids, 'Move', (o) => translateObj(o, dx, dy));
  return {
    label: t.label,
    apply: (f) => withPage(t.apply(f), pageId, (p) => reparent(p, new Set(ids))),
  };
}

function transformEach(pageId: Id, ids: readonly Id[], label: string, fn: (o: Obj) => Obj): Edit {
  const set = new Set(ids);
  return {
    label: `${label} ${plural(ids.length, 'object')}`,
    apply: (f) =>
      withPage(f, pageId, (p) =>
        mapPageObjs(p, (o) => (set.has(o.id) ? fn(o) : o.type === 'group' ? refitIfChanged(o) : o)),
      ),
  };
}

/** Scales one object's bounds `from` onto `to`: the per-object step of every resize. */
export function resizeOne(o: Obj, from: Box, to: Box): Obj {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const moved = scaleObj(o, { x: from.x, y: from.y }, sx, sy);
  const t = translateObj(moved, to.x - from.x, to.y - from.y);
  // Text resized by its box: wraps at the new width; its height follows the layout.
  return t.type === 'text'
    ? fitText({ ...t, autoWidth: false, frame: { ...t.frame, w: Math.max(t.frame.w, 4) } })
    : t;
}

/** A resize that keeps imported plots' text and line sizes (`keep`, note 17) or scales them. */
function sizingPlots(e: Edit, pageId: Id, plots: PlotSizing): Edit {
  return plots === 'keep' ? { ...e, apply: (f) => keepPlotText(f, e.apply(f), pageId) } : e;
}

/**
 * Scales the selection's bounds `from` onto `to` (resize handles, W and H).
 * With `plots: 'keep'` imported plots keep their text and line sizes.
 */
export function resizeObjects(
  pageId: Id,
  ids: readonly Id[],
  from: Box,
  to: Box,
  plots: PlotSizing = 'scale',
): Edit {
  return sizingPlots(
    transformEach(pageId, ids, 'Resize', (o) => resizeOne(o, from, to)),
    pageId,
    plots,
  );
}

/**
 * Gives each object its own size `size` (the width and/or height of its bounds, in points),
 * keeping its top-left corner. With one dimension the other follows the object's proportions;
 * with both each object is stretched to exactly that size. Locked objects and objects with
 * nothing to scale (zero width or height) are left alone.
 */
export function matchSize(
  pageId: Id,
  objs: readonly Obj[],
  size: { readonly w?: number; readonly h?: number },
  plots: PlotSizing = 'scale',
): Edit {
  const boxes = new Map<Id, Box>();
  for (const o of objs) {
    const b = objBounds(o);
    if (o.locked === true || b.w <= 0 || b.h <= 0) continue;
    const w = size.w ?? (size.h !== undefined ? (b.w * size.h) / b.h : b.w);
    const h = size.h ?? (size.w !== undefined ? (b.h * size.w) / b.w : b.h);
    boxes.set(o.id, { x: b.x, y: b.y, w, h });
  }
  const label =
    size.w !== undefined && size.h !== undefined
      ? 'Match size'
      : size.w !== undefined
        ? 'Match width'
        : 'Match height';
  return sizingPlots(
    transformEach(pageId, [...boxes.keys()], label, (o) => {
      const to = boxes.get(o.id);
      return to ? resizeOne(o, objBounds(o), to) : o;
    }),
    pageId,
    plots,
  );
}

export function rotateObjects(
  pageId: Id,
  ids: readonly Id[],
  about: { x: number; y: number },
  deg: number,
): Edit {
  return transformEach(pageId, ids, 'Rotate', (o) => rotateObj(o, about, deg));
}

export function flipObjects(
  pageId: Id,
  ids: readonly Id[],
  axis: 'x' | 'y',
  objs: readonly Obj[],
): Edit {
  const c = center(boundsOf(objs));
  return {
    ...transformEach(pageId, ids, axis === 'x' ? 'Flip horizontally' : 'Flip vertically', (o) =>
      flipObj(o, axis, c),
    ),
    label: axis === 'x' ? 'Flip horizontally' : 'Flip vertically',
  };
}

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/**
 * Measures an object for alignment, distribution and grid layout: `objBounds`
 * (the frame), or what it draws (`drawnBounds`, issue 44), which the app passes.
 */
export type BoxOf = (o: Obj) => Box;

/** Aligns to the selection's bounds, or to the page when one object is selected. */
export function alignObjects(
  pageId: Id,
  objs: readonly Obj[],
  edge: AlignEdge,
  page: Box,
  boxOf: BoxOf = objBounds,
): Edit {
  const ref = objs.length === 1 ? page : unionBoxes(objs.map(boxOf));
  const shifts = new Map<Id, { dx: number; dy: number }>();
  for (const o of objs) {
    const b = boxOf(o);
    const dx =
      edge === 'left'
        ? ref.x - b.x
        : edge === 'right'
          ? ref.x + ref.w - b.x - b.w
          : edge === 'hcenter'
            ? ref.x + ref.w / 2 - b.x - b.w / 2
            : 0;
    const dy =
      edge === 'top'
        ? ref.y - b.y
        : edge === 'bottom'
          ? ref.y + ref.h - b.y - b.h
          : edge === 'vcenter'
            ? ref.y + ref.h / 2 - b.y - b.h / 2
            : 0;
    shifts.set(o.id, { dx, dy });
  }
  return {
    ...transformEach(pageId, [...shifts.keys()], 'Align', (o) => {
      const s = shifts.get(o.id);
      return s ? translateObj(o, s.dx, s.dy) : o;
    }),
    label: `Align ${edge === 'hcenter' ? 'centres' : edge === 'vcenter' ? 'middles' : `${edge} edges`}`,
  };
}

/** Equal gaps between the objects along an axis, the outermost staying put. */
export function distributeObjects(
  pageId: Id,
  objs: readonly Obj[],
  axis: 'x' | 'y',
  boxOf: BoxOf = objBounds,
): Edit {
  const sorted = [...objs].sort((a, b) =>
    axis === 'x' ? boxOf(a).x - boxOf(b).x : boxOf(a).y - boxOf(b).y,
  );
  const boxes = sorted.map(boxOf);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const start = (b: Box) => (axis === 'x' ? b.x : b.y);
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  const shifts = new Map<Id, number>();
  if (first && last && boxes.length > 2) {
    const total = start(last) + size(last) - start(first);
    const gap = (total - boxes.reduce((s, b) => s + size(b), 0)) / (boxes.length - 1);
    let at = start(first);
    sorted.forEach((o, i) => {
      const b = boxes[i];
      if (!b) return;
      shifts.set(o.id, at - start(b));
      at += size(b) + gap;
    });
  }
  return {
    ...transformEach(pageId, [...shifts.keys()], 'Distribute', (o) => {
      const d = shifts.get(o.id) ?? 0;
      return axis === 'x' ? translateObj(o, d, 0) : translateObj(o, 0, d);
    }),
    label: axis === 'x' ? 'Distribute horizontally' : 'Distribute vertically',
  };
}

/** Wraps sibling objects in a group, at the topmost one's place. */
export function groupObjects(pageId: Id, ids: readonly Id[], groupId: Id = newId('o')): Edit {
  const set = new Set(ids);
  return {
    label: 'Group',
    select: [groupId],
    apply: (f) =>
      withPage(f, pageId, (p) => {
        const state = { done: false };
        const inList = (objs: readonly Obj[]): readonly Obj[] | null => {
          const picked = objs.filter((o) => set.has(o.id));
          if (picked.length < 2 || picked.length !== set.size) return null;
          const lastIndex = objs.reduce((i, o, k) => (set.has(o.id) ? k : i), -1);
          const g = refit({
            id: groupId,
            type: 'group',
            frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
            opacity: 1,
            children: picked,
          });
          state.done = true;
          return objs.flatMap((o, k) => (k === lastIndex ? [g] : set.has(o.id) ? [] : [o]));
        };
        const walkList = (objs: readonly Obj[]): readonly Obj[] => {
          const here = inList(objs);
          if (here) return here;
          return objs.map((o) =>
            hasChildren(o) && !state.done ? { ...o, children: walkList(o.children) } : o,
          );
        };
        const layers = p.layers.map((l) =>
          state.done ? l : { ...l, children: walkList(l.children) },
        );
        if (!state.done)
          throw new EditError(
            'Select two or more objects side by side (in the same layer or panel) to group.',
          );
        return { ...p, layers };
      }),
  };
}

export function ungroupObjects(pageId: Id, ids: readonly Id[]): Edit {
  const set = new Set(ids);
  const freed: Id[] = [];
  return {
    label: 'Ungroup',
    get select() {
      return freed;
    },
    apply: (f) =>
      withPage(f, pageId, (p) =>
        mapPageObjs(p, (o) => {
          if (!set.has(o.id) || o.type !== 'group') return o;
          // The group's opacity carries over to its children.
          const kids = o.children.map((c) =>
            o.opacity < 1 ? { ...c, opacity: c.opacity * o.opacity } : c,
          );
          freed.push(...kids.map((c) => c.id));
          return kids;
        }),
      ),
  };
}

export type ZMove = 'front' | 'back' | 'forward' | 'backward';

export function reorderObjects(pageId: Id, ids: readonly Id[], move: ZMove): Edit {
  const set = new Set(ids);
  const label = {
    front: 'Bring to front',
    back: 'Send to back',
    forward: 'Bring forward',
    backward: 'Send backward',
  }[move];
  const reorder = (objs: readonly Obj[]): readonly Obj[] => {
    if (!objs.some((o) => set.has(o.id)))
      return objs.map((o) => (hasChildren(o) ? { ...o, children: reorder(o.children) } : o));
    const arr = [...objs];
    if (move === 'front')
      return [...arr.filter((o) => !set.has(o.id)), ...arr.filter((o) => set.has(o.id))];
    if (move === 'back')
      return [...arr.filter((o) => set.has(o.id)), ...arr.filter((o) => !set.has(o.id))];
    const step = move === 'forward' ? 1 : -1;
    const order = move === 'forward' ? [...arr.keys()].reverse() : [...arr.keys()];
    for (const i of order) {
      const o = arr[i];
      const j = i + step;
      const other = arr[j];
      if (o && other && set.has(o.id) && !set.has(other.id)) {
        arr[i] = other;
        arr[j] = o;
      }
    }
    return arr;
  };
  return {
    label,
    apply: (f) =>
      withPage(f, pageId, (p) => ({
        ...p,
        layers: p.layers.map((l) => ({ ...l, children: reorder(l.children) })),
      })),
  };
}

/** Moves objects to another layer (on top). */
export function moveToLayer(pageId: Id, ids: readonly Id[], layerId: Id): Edit {
  const set = new Set(ids);
  return {
    label: 'Move to layer',
    apply: (f) =>
      withPage(f, pageId, (p) => {
        const taken: Obj[] = [];
        const without = mapPageObjs(p, (o) => {
          if (!set.has(o.id)) return o;
          taken.push(o);
          return null;
        });
        return {
          ...without,
          layers: without.layers.map((l) =>
            l.id === layerId ? { ...l, children: [...l.children, ...taken] } : l,
          ),
        };
      }),
  };
}

// --- pages, layers, document ------------------------------------------------------

export function addPage(page: Page = createPage()): Edit {
  return {
    label: 'Add page',
    apply: (f) => ({ ...f, doc: { ...f.doc, pages: [...f.doc.pages, page] } }),
  };
}

export function deletePage(pageId: Id): Edit {
  return {
    label: 'Delete page',
    apply: (f) => {
      if (f.doc.pages.length <= 1) throw new EditError('A figure needs at least one page.');
      return { ...f, doc: { ...f.doc, pages: f.doc.pages.filter((p) => p.id !== pageId) } };
    },
  };
}

export const updatePage = (pageId: Id, label: string, fn: (p: Page) => Page): Edit => ({
  label,
  apply: (f) => withPage(f, pageId, fn),
});

export function addLayer(pageId: Id, layer: Layer = createLayer()): Edit {
  return updatePage(pageId, 'Add layer', (p) => ({
    ...p,
    layers: [...p.layers, { ...layer, name: `Layer ${String(p.layers.length + 1)}` }],
  }));
}

export function updateLayer(pageId: Id, layerId: Id, label: string, fn: (l: Layer) => Layer): Edit {
  return updatePage(pageId, label, (p) => ({
    ...p,
    layers: p.layers.map((l) => (l.id === layerId ? fn(l) : l)),
  }));
}

export function deleteLayer(pageId: Id, layerId: Id): Edit {
  return updatePage(pageId, 'Delete layer', (p) => {
    if (p.layers.length <= 1) throw new EditError('A page needs at least one layer.');
    return { ...p, layers: p.layers.filter((l) => l.id !== layerId) };
  });
}

export function moveLayer(pageId: Id, layerId: Id, by: -1 | 1): Edit {
  return updatePage(pageId, by > 0 ? 'Raise layer' : 'Lower layer', (p) => {
    const i = p.layers.findIndex((l) => l.id === layerId);
    const j = i + by;
    const a = p.layers[i];
    const b = p.layers[j];
    if (!a || !b) return p;
    const layers = [...p.layers];
    layers[i] = b;
    layers[j] = a;
    return { ...p, layers };
  });
}

export const updateDoc = (label: string, fn: (d: Doc) => Doc): Edit => ({
  label,
  apply: (f) => ({ ...f, doc: fn(f.doc) }),
});

export const setLabelStyle = (s: PanelLabelStyle): Edit =>
  updateDoc('Panel label style', (d) => ({ ...d, panelLabelStyle: s }));

export const setCreditFooter = (on: boolean): Edit =>
  updateDoc(on ? 'Include credit line in exports' : 'Leave credit line out of exports', (d) => ({
    ...d,
    creditFooter: on,
  }));

export const setBackground = (pageId: Id, bg: Paint | null): Edit =>
  updatePage(pageId, 'Page background', (p) => ({ ...p, background: bg }));

/** Adds assets (e.g. before placing an icon) without a document change. */
export const withAssets = (f: Figure, assets: Readonly<Record<string, Asset>>): Figure => ({
  ...f,
  assets: { ...f.assets, ...assets },
});

/** Objects fully inside a box (marquee selection), top-level and panel children. */
export function objectsInBox(p: Page, box: Box): Obj[] {
  const out: Obj[] = [];
  for (const l of p.layers) {
    if (!l.visible || l.locked) continue;
    for (const o of l.children) {
      if (o.type === 'panel') {
        if (boxContains(box, objBounds(o))) out.push(o);
        else for (const c of o.children) if (boxContains(box, objBounds(c))) out.push(c);
      } else if (boxContains(box, objBounds(o))) out.push(o);
    }
  }
  return out.filter((o) => o.locked !== true && o.hidden !== true);
}

/** Every object id on the page (for select all). */
export const allIds = (p: Page): Id[] =>
  p.layers
    .filter((l) => l.visible && !l.locked)
    .flatMap((l) => l.children.filter((o) => o.locked !== true).map((o) => o.id));

export { mapObjs, pageObjects };
