/**
 * The canvas (note 01): the page on a pasteboard, pan and zoom, the tools'
 * pointer gestures, and the editor-only overlays (selection, handles,
 * smart guides, marquee, drawing preview) drawn in screen space over the
 * page and never exported.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  addObjects,
  moveObjects,
  objectsInBox,
  resizeObjects,
  rotateObjects,
} from '@/core/edits/edits';
import {
  arrowEndAt,
  attachArrowEnd,
  neighbourOf,
  pagePoints,
  pointDragTarget,
  snap45,
  usesPointHandles,
} from '@/core/edits/arrowEnds';
import {
  type NodeRef,
  editableNodes,
  insertNode,
  moveNodePart,
  nearestOnPath,
  toLocalPoint,
} from '@/core/edits/nodes';
import type { PlotSizing } from '@/core/edits/plotSize';
import { type Box, center, frameBounds, unionBoxes } from '@/core/geometry/matrix';
import { boundsOf, objBounds } from '@/core/geometry/transform';
import {
  createArrow,
  createEllipse,
  createPanel,
  createPath,
  createRect,
  createText,
  defaultRun,
  frame,
} from '@/core/model/factory';
import { asId, type Id } from '@/core/model/ids';
import { bindable, nearestSite, sitePoint, sitesOf } from '@/core/model/binding';
import { noteAnchor } from '@/core/model/notes';
import { findObj, pageObjects } from '@/core/model/tree';
import type {
  ArrowBinding,
  BindSite,
  Figure,
  Obj,
  Page,
  PathNode,
  Swatch,
  Vec2,
} from '@/core/model/types';
import { type Guide, snapBox, snapPoint } from '@/core/snapping/snap';
import { fitText } from '@/core/text/layout';
import { drawnBounds, drawnBoundsIn } from '@/procedural/bounds';
import { pathData } from '@/render/path';

import { getLibrary, importToCanvas, placeIcon, placeProcedural } from '../state/session';
import { type View, currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { PagesBar } from '../panels/PagesBar';
import { ICON_DRAG_TYPE, KIND_DRAG_TYPE, fitPage, parseKindDrag, zoomAt } from './view';
import { resolveBindings } from '../keyBindings';
import { NodeOverlay, NodeStatus } from './NodeOverlay';
import { DEFICIENCIES, cvdFilterValues } from '@/export/colourVision';
import { NoteMarkers } from './NoteMarkers';
import { PageView } from './PageView';
import { Ruler } from './Rulers';
import { TextEditor } from './TextEditor';
import { OVERLAY } from './overlayPaint';

/** Snap distance, screen pixels. */
const SNAP_PX = 6;
const HANDLE = 8;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** A resize step slower than this (ms, edit to screen) twice in a row stops redrawing plots until release. */
const LIVE_PLOT_MS = 24;

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | {
      kind: 'move';
      start: Vec2;
      fig: Figure;
      ids: Id[];
      box: Box;
      key: string;
      moved: boolean;
      /** The object inside the selected group under the pointer: a click (no drag) selects it. */
      drill: Id | null;
    }
  | {
      kind: 'resize';
      handle: Handle;
      fig: Figure;
      ids: Id[];
      box: Box;
      key: string;
      aspect: boolean;
      plots: PlotSizing;
      /** Plots are redrawn at every step; false once that got too slow (redrawn on release). */
      live: boolean;
      slow: number;
      to?: Box;
    }
  | { kind: 'rotate'; c: Vec2; a0: number; fig: Figure; ids: Id[]; key: string }
  | { kind: 'marquee'; start: Vec2; add: boolean }
  | { kind: 'create'; start: Vec2; bindStart?: ArrowBinding }
  | {
      kind: 'node';
      id: Id;
      ref: NodeRef;
      start: Vec2;
      fig: Figure;
      key: string;
      moved: boolean;
      /** Set when a point handle of a selected line or arrow is dragged (issue 97, note 28). */
      pt?: { origin: Vec2; neighbour: Vec2 | undefined; end: 'start' | 'end' | undefined };
    };

interface Overlay {
  readonly marquee?: Box;
  readonly preview?: { readonly d: string } | { readonly box: Box; readonly ellipse: boolean };
  readonly guides?: readonly Guide[];
  /** The object an arrow end would attach to (note 06). */
  readonly bindBox?: Box;
  /** Its connection sites; `hot` is the one the end snaps to. */
  readonly sites?: readonly { readonly at: Vec2; readonly hot: boolean }[];
}

let gestureSeq = 0;

function handlePoint(b: Box, h: Handle): Vec2 {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

/** The box after dragging a handle to `p`, optionally keeping the aspect ratio. */
function resizedBox(b: Box, h: Handle, p: Vec2, aspect: boolean): Box {
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (h.includes('w')) x0 = Math.min(p.x, x1 - 1);
  if (h.includes('e')) x1 = Math.max(p.x, x0 + 1);
  if (h.includes('n')) y0 = Math.min(p.y, y1 - 1);
  if (h.includes('s')) y1 = Math.max(p.y, y0 + 1);
  if (aspect && b.w > 0 && b.h > 0) {
    const k = Math.max((x1 - x0) / b.w, (y1 - y0) / b.h);
    const corner = h.length === 2;
    const kk = corner ? k : h === 'n' || h === 's' ? (y1 - y0) / b.h : (x1 - x0) / b.w;
    const w = b.w * kk;
    const hh = b.h * kk;
    if (h.includes('w')) x0 = x1 - w;
    else if (h.includes('e')) x1 = x0 + w;
    else {
      x0 = b.x + b.w / 2 - w / 2;
      x1 = x0 + w;
    }
    if (h.includes('n')) y0 = y1 - hh;
    else if (h.includes('s')) y1 = y0 + hh;
    else {
      y0 = b.y + b.h / 2 - hh / 2;
      y1 = y0 + hh;
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Bounds of everything a moving selection may snap to: other objects and the page. */
function snapTargets(page: Page, exclude: ReadonlySet<Id>, palette: readonly Swatch[] = []): Box[] {
  const out: Box[] = [{ x: 0, y: 0, w: page.size.w, h: page.size.h }];
  for (const l of page.layers) {
    if (!l.visible) continue;
    for (const o of l.children) {
      if (exclude.has(o.id) || o.hidden === true) continue;
      out.push(drawnBounds(o, palette));
      if (o.type === 'panel')
        for (const c of o.children) if (!exclude.has(c.id)) out.push(drawnBounds(c, palette));
    }
  }
  return out;
}

/**
 * The objects under an element, outermost first, leaving panels out (their children count
 * as top level) unless a panel is all there is.
 */
function pickChain(target: EventTarget | null, page: Page): Obj[] {
  let el = target instanceof Element ? target.closest('[data-id]') : null;
  const chain: Id[] = [];
  while (el) {
    const id = el.getAttribute('data-id');
    if (id) chain.push(asId(id));
    el = el.parentElement?.closest('[data-id]') ?? null;
  }
  const objs = chain.map((id) => findObj(page, id)).filter((o): o is Obj => o !== undefined);
  const nonPanel = objs.filter((o) => o.type !== 'panel');
  return (nonPanel.length > 0 ? nonPanel : objs.slice(-1)).reverse();
}

/** The object a click selects: the outermost non-panel object under it. */
function pickTarget(target: EventTarget | null, page: Page): Id | null {
  return pickChain(target, page)[0]?.id ?? null;
}

const holdsSelected = (o: Obj, sel: ReadonlySet<Id>): boolean =>
  (o.type === 'group' || o.type === 'panel') &&
  o.children.some((c) => sel.has(c.id) || holdsSelected(c, sel));

/**
 * What a click with the Select tool picks, given the selection: the outermost object under
 * it, except that a group with something selected inside it is open, so the click picks
 * inside it. `inner` is the object one level further in when the pick is itself selected:
 * a click there (not a drag) selects it, so a second click on a group reaches its parts.
 */
function pickIn(
  target: EventTarget | null,
  page: Page,
  selection: readonly Id[],
): { id: Id; inner: Id | null } | null {
  const chain = pickChain(target, page);
  const sel = new Set(selection);
  let i = 0;
  while (i < chain.length - 1) {
    const o = chain[i];
    if (!o || sel.has(o.id) || !holdsSelected(o, sel)) break;
    i += 1;
  }
  const o = chain[i];
  if (!o) return null;
  const next = chain[i + 1];
  return { id: o.id, inner: sel.has(o.id) && next ? next.id : null };
}

/**
 * Colour-vision preview filters (note 07), editor-only: Machado et al.
 * (2009) matrices at full severity, applied in linear RGB (the filter
 * default), and a greyscale for print.
 */

function VisionFilters() {
  return (
    <defs>
      {DEFICIENCIES.map((id) => (
        <filter key={id} id={`vision-${id}`}>
          <feColorMatrix type="matrix" values={cvdFilterValues(id)} />
        </filter>
      ))}
      <filter id="vision-greyscale">
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </defs>
  );
}

/** How near a connection site, screen pixels, an arrow end snaps to it (note 06). */
const SITE_SNAP_PX = 8;

/** What an arrow end would attach to: an object, and the site it snaps to (and that site's point). */
interface BindHit {
  readonly obj: Obj;
  readonly site?: BindSite;
  readonly at?: Vec2;
}

/**
 * What an arrow end at screen point (x, y), page point `p`, may attach to (note 06): the
 * object under the pointer, or one with a site within `radius` points (a site sits just
 * outside its outline), with the nearest site within `radius`.
 */
function bindHitAt(x: number, y: number, p: Vec2, page: Page, radius: number): BindHit | undefined {
  let obj: Obj | undefined;
  for (const el of document.elementsFromPoint(x, y)) {
    if (!el.closest('[data-id]')) continue;
    const id = pickTarget(el, page);
    const o = id ? findObj(page, id) : undefined;
    if (o && bindable(o)) {
      obj = o;
      break;
    }
  }
  if (!obj) {
    let best = radius;
    for (const o of pageObjects(page)) {
      if (!bindable(o) || o.locked === true) continue;
      const site = nearestSite(o, p, best);
      if (!site) continue;
      const at = sitePoint(o, site);
      best = Math.hypot(at.x - p.x, at.y - p.y);
      obj = o;
    }
  }
  if (!obj) return undefined;
  const site = nearestSite(obj, p, radius);
  return site ? { obj, site, at: sitePoint(obj, site) } : { obj };
}

/** The binding a hit makes. */
const bindingOf = (h: BindHit): ArrowBinding => ({
  id: h.obj.id,
  ...(h.site ? { site: h.site } : {}),
});

/** The overlay showing what an arrow end would attach to: its outline box and site dots. */
function bindOverlay(h: BindHit | undefined): Pick<Overlay, 'bindBox' | 'sites'> {
  if (!h) return {};
  return {
    bindBox: objBounds(h.obj),
    sites: sitesOf(h.obj).map((x) => ({ at: x.at, hot: x.site === h.site })),
  };
}

/**
 * The page each tab last fitted (note 25): a tab coming forward keeps its own
 * zoom and scroll instead of being fitted again, though the canvas is
 * remounted for it. Lasts for the page load, like the views it guards.
 */
const fittedPage = new Map<string, string>();

export function Canvas() {
  const s = useAppState();
  const fig = figure(s);
  const palette = fig.doc.palette;
  const page = currentPage(s);
  const v = s.view;
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** When the current resize step started, to time it once it is on screen. */
  const resizeStep = useRef<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pen, setPen] = useState<PathNode[]>([]);
  /** Line/Arrow click-to-place points (issue 96); `ids` is the object bound at each point. */
  const [poly, setPolyState] = useState<{ nodes: PathNode[]; ids: (ArrowBinding | undefined)[] }>({
    nodes: [],
    ids: [],
  });
  const polyRef = useRef(poly);
  const polyTool = useRef<'line' | 'arrow'>('line');
  const setPoly = (next: { nodes: PathNode[]; ids: (ArrowBinding | undefined)[] }) => {
    polyRef.current = next;
    setPolyState(next);
  };
  const [space, setSpace] = useState(false);

  // A resize step that kept plot text took this long to reach the screen: redrawing a large
  // plot at every step would stutter, so after two slow ones it is scaled until release.
  useLayoutEffect(() => {
    const t0 = resizeStep.current;
    const g = gesture.current;
    if (t0 === null) return;
    resizeStep.current = null;
    if (g?.kind !== 'resize' || g.plots !== 'keep' || !g.live) return;
    const slow = performance.now() - t0 > LIVE_PLOT_MS ? g.slow + 1 : 0;
    gesture.current = { ...g, slow, live: slow < 2 };
  });

  // Track the canvas size (rulers, fit to page).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => {
      ro.disconnect();
    };
  }, []);

  // Fit the page to the window when a page is first shown. `size` starts at 0 (not a guess) so the
  // fit waits for the measured canvas instead of fitting to a placeholder.
  useEffect(() => {
    if (fittedPage.get(s.front) === page.id || size.w < 50) return;
    fittedPage.set(s.front, page.id);
    fitPage(page, size);
  }, [page, size, s.front]);

  // Space held: pan with any tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Only over the canvas or nothing focused: Space on a focused button, checkbox or
      // the well grid must still press it (note 09).
      const t = e.target;
      const free = !(t instanceof Element) || t === document.body || t.closest('.canvas') !== null;
      if (e.code === 'Space' && free && !document.querySelector('.dialog')) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // A tool change abandons a half-drawn pen path.
  useEffect(
    () =>
      store.subscribe(() => {
        if (store.getState().tool !== 'pen') setPen((p) => (p.length > 0 ? [] : p));
      }),
    [],
  );

  const toPage = useCallback(
    (e: { clientX: number; clientY: number }): Vec2 => {
      const r = ref.current?.getBoundingClientRect();
      return {
        x: (e.clientX - (r?.left ?? 0) - v.x) / v.zoom,
        y: (e.clientY - (r?.top ?? 0) - v.y) / v.zoom,
      };
    },
    [v],
  );

  const threshold = SNAP_PX / v.zoom;
  const bindHere = (e: { clientX: number; clientY: number }, p: Vec2) =>
    bindHitAt(e.clientX, e.clientY, p, page, SITE_SNAP_PX / v.zoom);
  const snapP = (
    p: Vec2,
    exclude: ReadonlySet<Id> = new Set(),
  ): { p: Vec2; guides: readonly Guide[] } =>
    s.snap ? snapPoint(p, snapTargets(page, exclude, palette), threshold) : { p, guides: [] };

  const finishPen = (closed: boolean, nodes: readonly PathNode[] = pen) => {
    if (nodes.length >= 2) {
      const obj = createPath(nodes, closed);
      store.edit(addObjects(page.id, [obj]));
      store.setTool('select');
    }
    setPen([]);
    setOverlay({});
  };

  const finishPoly = (keep: boolean, count = polyRef.current.nodes.length) => {
    const { nodes, ids } = polyRef.current;
    const kept = nodes.slice(0, count);
    const tool = polyTool.current;
    setPoly({ nodes: [], ids: [] });
    setOverlay({});
    if (!keep || kept.length < 2) return;
    let obj: Obj = tool === 'line' ? createPath(kept, false) : createArrow(kept);
    const start = ids[0];
    const end = ids[kept.length - 1];
    if (obj.type === 'arrow' && (start ?? end) !== undefined)
      obj = {
        ...obj,
        bind: { ...(start ? { start } : {}), ...(end && end.id !== start?.id ? { end } : {}) },
      };
    if (store.edit(addObjects(page.id, [obj])) && store.getState().tool === tool)
      store.setTool('select');
  };
  // A tool change acts like Esc on a click-placed line or arrow.
  useEffect(() => {
    if (s.tool !== polyTool.current && poly.nodes.length > 0) finishPoly(poly.nodes.length >= 2);
  });

  /** The next click-placed point: snapped, and 45 degrees off the previous point with Shift. */
  const polyPoint = (e: { clientX: number; clientY: number; shiftKey: boolean }, p: Vec2) => {
    const q = snapP(p);
    const last = polyRef.current.nodes[polyRef.current.nodes.length - 1];
    const over = s.tool === 'arrow' ? bindHere(e, p) : undefined;
    const end = over?.at ?? (e.shiftKey && last ? snap45(last, q.p) : q.p);
    return { end, guides: q.guides, over };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const p = toPage(e);
    if (s.editingText !== null) store.editText(null);
    if (e.button === 1 || space || s.tool === 'hand') {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: v };
      return;
    }
    const target = e.target as Element;
    const handle = target.getAttribute('data-handle');
    if (s.tool === 'select' && s.nodeEdit !== null) {
      // Point editing (note 28): a point or handle drags; a segment gets a new point there.
      const ne = s.nodeEdit;
      const o = findObj(page, ne.id);
      const ed = o ? editableNodes(o) : null;
      const index = target.getAttribute('data-node-index');
      const part = target.getAttribute('data-node-part');
      const seg = target.getAttribute('data-node-seg');
      if (o && ed && index !== null && (part === 'node' || part === 'in' || part === 'out')) {
        const ref: NodeRef = { index: Number(index), part };
        store.editNodes({ id: o.id, ...ref });
        gesture.current = {
          kind: 'node',
          id: o.id,
          ref,
          start: p,
          fig,
          key: `g${String(++gestureSeq)}`,
          moved: false,
        };
        return;
      }
      if (o && ed && seg !== null) {
        const hit = nearestOnPath(ed.nodes, ed.closed, toLocalPoint(o, p));
        const at = hit.seg === Number(seg) ? hit : { ...hit, seg: Number(seg) };
        if (store.edit(insertNode(page.id, o.id, at.seg, at.t), { keepSelection: true })) {
          const ref: NodeRef = { index: at.seg + 1, part: 'node' };
          store.editNodes({ id: o.id, ...ref });
          gesture.current = {
            kind: 'node',
            id: o.id,
            ref,
            start: p,
            fig: figure(store.getState()),
            key: `g${String(++gestureSeq)}`,
            moved: false,
          };
        }
        return;
      }
      // Anywhere else ends point editing, and the click does what it always does.
      store.editNodes(null);
    }
    if (s.tool === 'select') {
      const sel = selectedObjects(s);
      const pi = target.getAttribute('data-point-handle');
      const only = sel.length === 1 ? sel[0] : undefined;
      if (pi !== null && only && usesPointHandles(only)) {
        // A point of a selected line or arrow drags directly, without point editing.
        const index = Number(pi);
        const pts = pagePoints(only);
        const origin = pts[index];
        if (origin) {
          gesture.current = {
            kind: 'node',
            id: only.id,
            ref: { index, part: 'node' },
            start: p,
            fig,
            key: `g${String(++gestureSeq)}`,
            moved: false,
            pt: { origin, neighbour: neighbourOf(pts, index), end: arrowEndAt(only, index) },
          };
          return;
        }
      }
      if (handle && sel.length > 0) {
        const box = boundsOf(sel);
        const key = `g${String(++gestureSeq)}`;
        const ids = sel.map((o) => o.id);
        if (handle === 'rotate') {
          const c = center(box);
          gesture.current = {
            kind: 'rotate',
            c,
            a0: Math.atan2(p.y - c.y, p.x - c.x),
            fig,
            ids,
            key,
          };
        } else {
          const aspect = sel.some((o) => o.type === 'icon' || o.type === 'image');
          gesture.current = {
            kind: 'resize',
            handle: handle as Handle,
            fig,
            ids,
            box,
            key,
            aspect,
            plots: s.plotSizing,
            live: true,
            slow: 0,
          };
        }
        return;
      }
      const pick = pickIn(e.target, page, s.selection);
      if (pick) {
        const hit = pick.id;
        let ids = s.selection.includes(hit) ? [...s.selection] : [hit];
        if (e.shiftKey)
          ids = s.selection.includes(hit)
            ? s.selection.filter((x) => x !== hit)
            : [...s.selection, hit];
        store.select(ids);
        const objs = ids
          .map((id) => findObj(page, id))
          .filter((o): o is Obj => o !== undefined && o.locked !== true);
        if (objs.length > 0)
          gesture.current = {
            kind: 'move',
            start: p,
            fig,
            ids: objs.map((o) => o.id),
            box: unionBoxes(objs.map(drawnBoundsIn(palette))),
            key: `g${String(++gestureSeq)}`,
            moved: false,
            drill: e.shiftKey ? null : pick.inner,
          };
        return;
      }
      if (!e.shiftKey) store.select([]);
      gesture.current = { kind: 'marquee', start: p, add: e.shiftKey };
      return;
    }
    if (s.tool === 'note') {
      // A review note (note 24): on the object clicked, else on the point.
      const hit = pickTarget(e.target, page);
      const o = hit ? findObj(page, hit) : undefined;
      store.setNoteDraft(
        o ? { page: page.id, at: noteAnchor(o), object: o.id } : { page: page.id, at: p },
      );
      if (!s.showNotes) store.setShowNotes(true);
      store.setTool('select');
      return;
    }
    if (s.tool === 'pen') {
      const q = snapP(p).p;
      const first = pen[0];
      if (first && pen.length > 2 && Math.hypot(q.x - first.x, q.y - first.y) < 8 / v.zoom) {
        finishPen(true);
        return;
      }
      setPen([...pen, { x: q.x, y: q.y }]);
      gesture.current = { kind: 'create', start: q };
      return;
    }
    if (s.tool === 'line' || s.tool === 'arrow') {
      polyTool.current = s.tool;
      if (poly.nodes.length > 0) {
        const { end, over } = polyPoint(e, p);
        setPoly({
          nodes: [...poly.nodes, { x: end.x, y: end.y }],
          ids: [...poly.ids, over ? bindingOf(over) : undefined],
        });
        return;
      }
    }
    const bindStart = s.tool === 'arrow' ? bindHere(e, p) : undefined;
    const start = bindStart?.at ?? snapP(p).p;
    gesture.current = {
      kind: 'create',
      start,
      ...(bindStart ? { bindStart: bindingOf(bindStart) } : {}),
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const p = toPage(e);
    if (!g) {
      if (s.tool === 'pen' && pen.length > 0) {
        const last = pen[pen.length - 1];
        if (last) setOverlay({ preview: { d: pathData([...pen, { x: p.x, y: p.y }], false) } });
      }
      if ((s.tool === 'line' || s.tool === 'arrow') && poly.nodes.length > 0) {
        const { end, guides, over } = polyPoint(e, p);
        setOverlay({
          preview: { d: pathData([...poly.nodes, { x: end.x, y: end.y }], false) },
          guides,
          ...bindOverlay(over),
        });
      }
      return;
    }
    switch (g.kind) {
      case 'pan':
        store.setView({
          ...g.view,
          x: g.view.x + e.clientX - g.sx,
          y: g.view.y + e.clientY - g.sy,
        });
        return;
      case 'move': {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * v.zoom < 3) return;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides: readonly Guide[] = [];
        if (s.snap) {
          const r = snapBox(
            { ...g.box, x: g.box.x + dx, y: g.box.y + dy },
            snapTargets(page, new Set(g.ids), palette),
            threshold,
          );
          dx += r.dx;
          dy += r.dy;
          guides = r.guides;
        }
        gesture.current = { ...g, moved: true };
        store.edit(moveObjects(page.id, g.ids, dx, dy), {
          coalesce: g.key,
          from: g.fig,
          keepSelection: true,
        });
        setOverlay({ guides });
        return;
      }
      case 'resize': {
        const q = s.snap ? snapP(p, new Set(g.ids)) : { p, guides: [] };
        const to = resizedBox(g.box, g.handle, q.p, g.aspect || e.shiftKey);
        const keep = g.plots === 'keep' && g.live;
        gesture.current = { ...g, to };
        // Event handler, not render: the compiler misreads it once the handlers use the palette.
        // eslint-disable-next-line react-hooks/purity
        resizeStep.current = keep ? performance.now() : null;
        store.edit(resizeObjects(page.id, g.ids, g.box, to, keep ? 'keep' : 'scale'), {
          coalesce: g.key,
          from: g.fig,
          keepSelection: true,
        });
        setOverlay({ guides: q.guides });
        return;
      }
      case 'rotate': {
        let deg = ((Math.atan2(p.y - g.c.y, p.x - g.c.x) - g.a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        store.edit(rotateObjects(page.id, g.ids, g.c, deg), {
          coalesce: g.key,
          from: g.fig,
          keepSelection: true,
        });
        return;
      }
      case 'marquee':
        setOverlay({ marquee: normBox(g.start, p) });
        return;
      case 'node': {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * v.zoom < 2) return;
        gesture.current = { ...g, moved: true };
        if (g.pt) {
          // An end over a connection site snaps to it (note 06).
          const over = g.pt.end ? bindHere(e, p) : undefined;
          const t =
            over?.at ??
            pointDragTarget(
              g.pt.origin,
              { x: dx, y: dy },
              g.pt.neighbour,
              e.shiftKey,
              s.snap ? (q) => snapP(q, new Set([g.id])).p : undefined,
            );
          store.edit(moveNodePart(page.id, g.id, g.ref, t.x - g.pt.origin.x, t.y - g.pt.origin.y), {
            coalesce: g.key,
            from: g.fig,
            keepSelection: true,
          });
          setOverlay(bindOverlay(over));
          return;
        }
        store.edit(moveNodePart(page.id, g.id, g.ref, dx, dy), {
          coalesce: g.key,
          from: g.fig,
          keepSelection: true,
        });
        return;
      }
      case 'create': {
        const q = snapP(p);
        if (s.tool === 'pen') {
          // Dragging while placing a pen node pulls out symmetric handles.
          const last = pen[pen.length - 1];
          if (!last) return;
          const out = { x: q.p.x, y: q.p.y };
          const inn = { x: 2 * last.x - q.p.x, y: 2 * last.y - q.p.y };
          const next = [...pen.slice(0, -1), { x: last.x, y: last.y, in: inn, out }];
          setPen(next);
          setOverlay({ preview: { d: pathData(next, false) } });
          return;
        }
        let end = q.p;
        if (e.shiftKey && (s.tool === 'line' || s.tool === 'arrow')) end = snap45(g.start, end);
        if (s.tool === 'line' || s.tool === 'arrow') {
          const over = s.tool === 'arrow' ? bindHere(e, p) : undefined;
          if (over?.at) end = over.at;
          setOverlay({
            preview: {
              d: `M${String(g.start.x)} ${String(g.start.y)}L${String(end.x)} ${String(end.y)}`,
            },
            guides: q.guides,
            ...bindOverlay(over),
          });
        } else {
          let box = normBox(g.start, end);
          if (e.shiftKey) box = square(g.start, end);
          setOverlay({ preview: { box, ellipse: s.tool === 'ellipse' }, guides: q.guides });
        }
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    ref.current?.releasePointerCapture(e.pointerId);
    const p = toPage(e);
    if (!g) return;
    if (g.kind === 'resize' && g.plots === 'keep' && !g.live && g.to)
      store.edit(resizeObjects(page.id, g.ids, g.box, g.to, 'keep'), {
        coalesce: g.key,
        from: g.fig,
        keepSelection: true,
      });
    if (g.kind === 'node' && g.pt?.end && g.moved) {
      // An arrow end released on an object attaches to it; in empty space it stays detached (note 06).
      const arrow = findObj(page, g.id);
      const t = bindHere(e, p);
      const otherEnd = g.pt.end === 'start' ? 'end' : 'start';
      if (arrow?.type === 'arrow' && t && t.obj.id !== arrow.bind?.[otherEnd]?.id)
        store.edit(attachArrowEnd(page.id, g.id, g.pt.end, t.obj.id, t.obj, t.site), {
          coalesce: g.key,
          from: g.fig,
          keepSelection: true,
        });
    }
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'node')
      store.seal();
    // A click on a selected group (no drag) selects the part of it under the pointer.
    if (g.kind === 'move' && !g.moved && g.drill !== null) store.select([g.drill]);
    if (g.kind === 'marquee') {
      const box = normBox(g.start, p);
      const hits = objectsInBox(page, box, drawnBoundsIn(palette)).map((o) => o.id);
      store.select(g.add ? [...new Set([...s.selection, ...hits])] : hits);
    }
    if (g.kind === 'create' && (s.tool === 'line' || s.tool === 'arrow')) {
      const end0 = snapP(p).p;
      const end = e.shiftKey ? snap45(g.start, end0) : end0;
      if (Math.hypot(end.x - g.start.x, end.y - g.start.y) * v.zoom <= 4) {
        // A click, not a drag: it places the first point; the next clicks add more.
        polyTool.current = s.tool;
        setPoly({ nodes: [{ x: g.start.x, y: g.start.y }], ids: [g.bindStart] });
        return;
      }
    }
    if (g.kind === 'create' && s.tool !== 'pen') {
      const bindEnd = s.tool === 'arrow' ? bindHere(e, p) : undefined;
      create(g.start, bindEnd?.at ?? snapP(p).p, e.shiftKey, {
        ...(g.bindStart ? { start: g.bindStart } : {}),
        ...(bindEnd && bindEnd.obj.id !== g.bindStart?.id ? { end: bindingOf(bindEnd) } : {}),
      });
    }
    if (s.tool !== 'pen') setOverlay({});
  };

  const create = (
    a: Vec2,
    b0: Vec2,
    shift: boolean,
    bind: { start?: ArrowBinding; end?: ArrowBinding } = {},
  ) => {
    const b = shift && (s.tool === 'line' || s.tool === 'arrow') ? snap45(a, b0) : b0;
    const dragged = Math.hypot(b.x - a.x, b.y - a.y) * v.zoom > 4;
    let box = shift ? square(a, b) : normBox(a, b);
    let obj: Obj | null = null;
    switch (s.tool) {
      case 'rect':
        if (!dragged) box = { x: a.x - 30, y: a.y - 20, w: 60, h: 40 };
        obj = createRect(frame(box.x, box.y, box.w, box.h));
        break;
      case 'ellipse':
        if (!dragged) box = { x: a.x - 25, y: a.y - 25, w: 50, h: 50 };
        obj = createEllipse(frame(box.x, box.y, box.w, box.h));
        break;
      case 'panel':
        if (!dragged) box = { x: a.x - 100, y: a.y - 75, w: 200, h: 150 };
        obj = createPanel(frame(box.x, box.y, box.w, box.h));
        break;
      case 'line':
      case 'arrow': {
        const end = dragged ? b : { x: a.x + 60, y: a.y };
        const nodes = [
          { x: a.x, y: a.y },
          { x: end.x, y: end.y },
        ];
        obj = s.tool === 'line' ? createPath(nodes, false) : createArrow(nodes);
        // Ends pressed or released on an object attach to it (note 06).
        if (obj.type === 'arrow' && (bind.start ?? bind.end) !== undefined) obj = { ...obj, bind };
        break;
      }
      case 'text': {
        const t = createText(a.x, a.y, [[defaultRun('')]]);
        obj = fitText(dragged ? { ...t, autoWidth: false, frame: { ...t.frame, w: box.w } } : t);
        break;
      }
      case 'select':
      case 'pen':
      case 'note':
      case 'hand':
        return;
    }
    if (store.edit(addObjects(page.id, [obj]))) {
      if (obj.type === 'text') {
        store.setTool('select');
        store.select([obj.id]);
        store.editText(obj.id);
      } else store.setTool('select');
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((s.tool === 'line' || s.tool === 'arrow') && polyRef.current.nodes.length > 0) {
      // The double click's two clicks each added a point; drop the duplicate.
      finishPoly(true, polyRef.current.nodes.length - 1);
      return;
    }
    if (s.tool === 'pen') {
      // The double click's two clicks each added a node; drop the duplicate.
      finishPen(false, pen.slice(0, -1));
      return;
    }
    // Pointer capture makes the canvas the click's target in some browsers: look under the pointer.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const id = pickIn(under?.closest('[data-id]') ? under : e.target, page, s.selection)?.id;
    const o = id ? findObj(page, id) : undefined;
    if (o?.type === 'text') {
      store.select([o.id]);
      store.editText(o.id);
      return;
    }
    // A path, line, arrow or path-following object shows its points, the nearest current (note 28).
    const ed = o ? editableNodes(o) : null;
    if (o && ed && s.tool === 'select') {
      const q = toLocalPoint(o, toPage(e));
      let index = 0;
      ed.nodes.forEach((n, i) => {
        const best = ed.nodes[index];
        if (best && Math.hypot(n.x - q.x, n.y - q.y) < Math.hypot(best.x - q.x, best.y - q.y))
          index = i;
      });
      store.editNodes({ id: o.id, index, part: 'node' });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = ref.current?.getBoundingClientRect();
      const sx = e.clientX - (r?.left ?? 0);
      const sy = e.clientY - (r?.top ?? 0);
      const k = Math.exp(-e.deltaY * 0.0015);
      zoomAt(v, sx, sy, v.zoom * k);
    } else {
      store.setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    }
  };

  // Wheel with ctrl must not zoom the browser page: a non-passive listener.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener('wheel', stop, { passive: false });
    return () => {
      el.removeEventListener('wheel', stop);
    };
  }, []);

  useEffect(() => {
    if (s.tool !== 'line' && s.tool !== 'arrow') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && polyRef.current.nodes.length > 0) finishPoly(true);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  });

  useEffect(() => {
    if (s.tool !== 'pen') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishPen(false);
      if (e.key === 'Escape') {
        setPen([]);
        setOverlay({});
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  });

  const onDragOver = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(ICON_DRAG_TYPE) ||
      e.dataTransfer.types.includes(KIND_DRAG_TYPE) ||
      e.dataTransfer.types.includes('Files')
    )
      e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const at = toPage(e);
    const kind = e.dataTransfer.getData(KIND_DRAG_TYPE);
    if (kind) {
      const d = parseKindDrag(kind);
      placeProcedural(d.kind, at, d.preset);
      return;
    }
    const iconId = e.dataTransfer.getData(ICON_DRAG_TYPE);
    if (iconId) {
      void getLibrary()
        .byId(iconId)
        .then((entry) => {
          if (entry) void placeIcon(entry, at);
        });
      return;
    }
    for (const file of Array.from(e.dataTransfer.files)) void importToCanvas(file, at);
  };

  const sel = selectedObjects(s);
  const selBox = sel.length > 0 ? boundsOf(sel) : null;
  // What the selection draws past its frames (gel lane labels, issue 44): a dashed outline.
  const drawn = selBox ? unionBoxes(sel.map(drawnBoundsIn(palette))) : null;
  const drawnBox =
    selBox &&
    drawn &&
    (drawn.x < selBox.x - 0.5 ||
      drawn.y < selBox.y - 0.5 ||
      drawn.x + drawn.w > selBox.x + selBox.w + 0.5 ||
      drawn.y + drawn.h > selBox.y + selBox.h + 0.5)
      ? drawn
      : null;
  const scr = (p: Vec2) => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });
  const editing = s.editingText !== null ? findObj(page, s.editingText) : undefined;
  const nodeObj = s.nodeEdit !== null ? findObj(page, s.nodeEdit.id) : undefined;
  const pointObj = sel.length === 1 && sel[0] && usesPointHandles(sel[0]) ? sel[0] : undefined;
  const panning = space;

  return (
    <main className="canvas-wrap" id="figure-canvas" aria-label="Canvas">
      <div className="ruler-corner" title="Ruler units">
        {s.units}
      </div>
      <Ruler axis="x" view={v} length={size.w} units={s.units} />
      <Ruler axis="y" view={v} length={size.h} units={s.units} />
      <div
        ref={ref}
        className={`canvas tool-${s.tool}${panning ? ' panning' : ''}`}
        data-testid="canvas"
        // Focusable from code only (Edit points), so point editing's keys reach the canvas.
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg role="img" aria-label="Figure canvas">
          <VisionFilters />
          <g transform={`translate(${String(v.x)} ${String(v.y)}) scale(${String(v.zoom)})`}>
            <rect
              x={2 / v.zoom}
              y={3 / v.zoom}
              width={page.size.w}
              height={page.size.h}
              style={{ fill: OVERLAY.pageShadow }}
            />
            {/* A transparent page shows the light pasteboard in either scheme (note 53). */}
            {page.background === null && (
              <rect width={page.size.w} height={page.size.h} style={{ fill: OVERLAY.pageUnder }} />
            )}
            <g
              data-testid="vision"
              filter={s.vision === 'normal' ? undefined : `url(#vision-${s.vision})`}
            >
              <PageView page={page} figure={fig} />
            </g>
            {/* The page edge stays visible over a page-sized object. */}
            <rect
              data-testid="page"
              width={page.size.w}
              height={page.size.h}
              fill="none"
              style={{ stroke: OVERLAY.pageEdge }}
              strokeWidth={0.5 / v.zoom}
              pointerEvents="none"
            />
          </g>
          <g pointerEvents="none">
            {sel.map((o) => {
              const b = frameBounds(o.frame);
              const a = scr(b);
              return (
                <rect
                  key={o.id}
                  x={a.x}
                  y={a.y}
                  width={b.w * v.zoom}
                  height={b.h * v.zoom}
                  fill="none"
                  style={{ stroke: OVERLAY.select }}
                  strokeOpacity={0.5}
                />
              );
            })}
            {overlay.guides?.map((gd, i) =>
              gd.axis === 'x' ? (
                <line
                  key={i}
                  data-snap-guide=""
                  x1={scr({ x: gd.at, y: 0 }).x}
                  x2={scr({ x: gd.at, y: 0 }).x}
                  y1={scr({ x: 0, y: gd.from }).y}
                  y2={scr({ x: 0, y: gd.to }).y}
                  style={{ stroke: OVERLAY.snapGuide }}
                  strokeDasharray="3 2"
                />
              ) : (
                <line
                  key={i}
                  data-snap-guide=""
                  y1={scr({ x: 0, y: gd.at }).y}
                  y2={scr({ x: 0, y: gd.at }).y}
                  x1={scr({ x: gd.from, y: 0 }).x}
                  x2={scr({ x: gd.to, y: 0 }).x}
                  style={{ stroke: OVERLAY.snapGuide }}
                  strokeDasharray="3 2"
                />
              ),
            )}
            {overlay.bindBox && (
              <rect
                data-testid="bind-target"
                x={scr(overlay.bindBox).x - 3}
                y={scr(overlay.bindBox).y - 3}
                width={overlay.bindBox.w * v.zoom + 6}
                height={overlay.bindBox.h * v.zoom + 6}
                rx={3}
                fill="none"
                style={{ stroke: OVERLAY.bindTarget }}
                strokeWidth={2}
              />
            )}
            {overlay.sites?.map((st, i) => (
              <circle
                key={`site-${String(i)}`}
                data-testid="bind-site"
                data-hot={st.hot ? 'true' : undefined}
                cx={scr(st.at).x}
                cy={scr(st.at).y}
                r={st.hot ? 5 : 3.5}
                style={{
                  stroke: OVERLAY.bindTarget,
                  fill: st.hot ? OVERLAY.bindTarget : OVERLAY.wellGround,
                }}
                strokeWidth={1.5}
              />
            ))}
            {overlay.marquee && (
              <rect
                x={scr(overlay.marquee).x}
                y={scr(overlay.marquee).y}
                width={overlay.marquee.w * v.zoom}
                height={overlay.marquee.h * v.zoom}
                style={{ fill: OVERLAY.selectWash, stroke: OVERLAY.select }}
                strokeDasharray="4 2"
              />
            )}
            {overlay.preview && 'd' in overlay.preview && (
              <path
                d={overlay.preview.d}
                transform={`translate(${String(v.x)} ${String(v.y)}) scale(${String(v.zoom)})`}
                fill="none"
                style={{ stroke: OVERLAY.select }}
                strokeWidth={1.5 / v.zoom}
              />
            )}
            {overlay.preview &&
              'box' in overlay.preview &&
              (overlay.preview.ellipse ? (
                <ellipse
                  cx={scr(center(overlay.preview.box)).x}
                  cy={scr(center(overlay.preview.box)).y}
                  rx={(overlay.preview.box.w * v.zoom) / 2}
                  ry={(overlay.preview.box.h * v.zoom) / 2}
                  fill="none"
                  style={{ stroke: OVERLAY.select }}
                />
              ) : (
                <rect
                  x={scr(overlay.preview.box).x}
                  y={scr(overlay.preview.box).y}
                  width={overlay.preview.box.w * v.zoom}
                  height={overlay.preview.box.h * v.zoom}
                  fill="none"
                  style={{ stroke: OVERLAY.select }}
                />
              ))}
            {[...pen, ...poly.nodes].map((n, i) => {
              const a = scr(n);
              return (
                <rect
                  key={i}
                  x={a.x - 3}
                  y={a.y - 3}
                  width={6}
                  height={6}
                  style={{ fill: OVERLAY.handle, stroke: OVERLAY.select }}
                />
              );
            })}
          </g>
          {s.showNotes && (
            <NoteMarkers
              doc={fig.doc}
              page={page}
              view={v}
              active={s.activeNote}
              draft={s.noteDraft}
            />
          )}
          {nodeObj && s.nodeEdit && <NodeOverlay obj={nodeObj} view={v} edit={s.nodeEdit} />}
          {pointObj && s.tool === 'select' && s.editingText === null && !nodeObj && (
            <g data-testid="point-handles">
              {pagePoints(pointObj).map((q, i) => {
                const a = scr(q);
                return (
                  <circle
                    key={i}
                    data-point-handle={i}
                    cx={a.x}
                    cy={a.y}
                    r={HANDLE / 2 + 1}
                    style={{ fill: OVERLAY.handle, stroke: OVERLAY.select, cursor: 'move' }}
                  >
                    <title>Drag to move this point</title>
                  </circle>
                );
              })}
            </g>
          )}
          {selBox && !pointObj && s.tool === 'select' && s.editingText === null && !nodeObj && (
            <g>
              {drawnBox && (
                <rect
                  data-drawn-outline=""
                  x={scr(drawnBox).x}
                  y={scr(drawnBox).y}
                  width={drawnBox.w * v.zoom}
                  height={drawnBox.h * v.zoom}
                  fill="none"
                  style={{ stroke: OVERLAY.select }}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              )}
              <rect
                x={scr(selBox).x}
                y={scr(selBox).y}
                width={selBox.w * v.zoom}
                height={selBox.h * v.zoom}
                fill="none"
                style={{ stroke: OVERLAY.select }}
                pointerEvents="none"
              />
              {HANDLES.map((h) => {
                const a = scr(handlePoint(selBox, h));
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    x={a.x - HANDLE / 2}
                    y={a.y - HANDLE / 2}
                    width={HANDLE}
                    height={HANDLE}
                    style={{ fill: OVERLAY.handle, stroke: OVERLAY.select, cursor: `${h}-resize` }}
                  />
                );
              })}
              {!sel.every((o) => o.type === 'panel') && (
                <>
                  <line
                    x1={scr(handlePoint(selBox, 'n')).x}
                    x2={scr(handlePoint(selBox, 'n')).x}
                    y1={scr(handlePoint(selBox, 'n')).y}
                    y2={scr(handlePoint(selBox, 'n')).y - 18}
                    style={{ stroke: OVERLAY.select }}
                    pointerEvents="none"
                  />
                  <circle
                    data-handle="rotate"
                    cx={scr(handlePoint(selBox, 'n')).x}
                    cy={scr(handlePoint(selBox, 'n')).y - 22}
                    r={5}
                    style={{ fill: OVERLAY.handle, stroke: OVERLAY.select, cursor: 'grab' }}
                  >
                    <title>Rotate (Shift: 15° steps)</title>
                  </circle>
                </>
              )}
            </g>
          )}
        </svg>
        {editing?.type === 'text' && (
          <TextEditor key={editing.id} text={editing} page={page} view={v} />
        )}
        {nodeObj && s.nodeEdit && (
          <NodeStatus
            obj={nodeObj}
            edit={s.nodeEdit}
            units={s.units}
            bindings={resolveBindings(s.keyBindings)}
          />
        )}
      </div>
      <PagesBar />
    </main>
  );
}

function normBox(a: Vec2, b: Vec2): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

function square(a: Vec2, b: Vec2): Box {
  const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return normBox(a, {
    x: a.x + Math.sign(b.x - a.x || 1) * d,
    y: a.y + Math.sign(b.y - a.y || 1) * d,
  });
}
