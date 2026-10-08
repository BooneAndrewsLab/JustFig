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
import { type Box, center, frameBounds } from '@/core/geometry/matrix';
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
import { findObj } from '@/core/model/tree';
import type { Figure, Obj, Page, PathNode, Vec2 } from '@/core/model/types';
import { type Guide, snapBox, snapPoint } from '@/core/snapping/snap';
import { fitText } from '@/core/text/layout';
import { pathData } from '@/render/path';

import { getLibrary, importToCanvas, placeIcon } from '../state/session';
import { type View, currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { PagesBar } from '../panels/PagesBar';
import { ICON_DRAG_TYPE, fitPage, zoomAt } from './view';
import { PageView } from './PageView';
import { Ruler } from './Rulers';
import { TextEditor } from './TextEditor';

/** Snap distance, screen pixels. */
const SNAP_PX = 6;
const HANDLE = 8;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | { kind: 'move'; start: Vec2; fig: Figure; ids: Id[]; box: Box; key: string; moved: boolean }
  | {
      kind: 'resize';
      handle: Handle;
      fig: Figure;
      ids: Id[];
      box: Box;
      key: string;
      aspect: boolean;
    }
  | { kind: 'rotate'; c: Vec2; a0: number; fig: Figure; ids: Id[]; key: string }
  | { kind: 'marquee'; start: Vec2; add: boolean }
  | { kind: 'create'; start: Vec2 };

interface Overlay {
  readonly marquee?: Box;
  readonly preview?: { readonly d: string } | { readonly box: Box; readonly ellipse: boolean };
  readonly guides?: readonly Guide[];
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
function snapTargets(page: Page, exclude: ReadonlySet<Id>): Box[] {
  const out: Box[] = [{ x: 0, y: 0, w: page.size.w, h: page.size.h }];
  for (const l of page.layers) {
    if (!l.visible) continue;
    for (const o of l.children) {
      if (exclude.has(o.id) || o.hidden === true) continue;
      out.push(objBounds(o));
      if (o.type === 'panel')
        for (const c of o.children) if (!exclude.has(c.id)) out.push(objBounds(c));
    }
  }
  return out;
}

/** The object a click selects: the outermost non-panel object under it (panel children count as top level). */
function pickTarget(target: EventTarget | null, page: Page): Id | null {
  let el = target instanceof Element ? target.closest('[data-id]') : null;
  const chain: Id[] = [];
  while (el) {
    const id = el.getAttribute('data-id');
    if (id) chain.push(asId(id));
    el = el.parentElement?.closest('[data-id]') ?? null;
  }
  const objs = chain.map((id) => findObj(page, id)).filter((o): o is Obj => o !== undefined);
  const nonPanel = objs.filter((o) => o.type !== 'panel');
  const pick = nonPanel.length > 0 ? nonPanel[nonPanel.length - 1] : objs[objs.length - 1];
  return pick?.id ?? null;
}

export function Canvas() {
  const s = useAppState();
  const fig = figure(s);
  const page = currentPage(s);
  const v = s.view;
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [pen, setPen] = useState<PathNode[]>([]);
  const [space, setSpace] = useState(false);
  const fitted = useRef<string | null>(null);

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

  // Fit the page to the window when a page is first shown.
  useEffect(() => {
    if (fitted.current === page.id || size.w < 50) return;
    fitted.current = page.id;
    fitPage(page, size);
  }, [page, size]);

  // Space held: pan with any tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
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
  const snapP = (
    p: Vec2,
    exclude: ReadonlySet<Id> = new Set(),
  ): { p: Vec2; guides: readonly Guide[] } =>
    s.snap ? snapPoint(p, snapTargets(page, exclude), threshold) : { p, guides: [] };

  const finishPen = (closed: boolean, nodes: readonly PathNode[] = pen) => {
    if (nodes.length >= 2) {
      const obj = createPath(nodes, closed);
      store.edit(addObjects(page.id, [obj]));
      store.setTool('select');
    }
    setPen([]);
    setOverlay({});
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
    if (s.tool === 'select') {
      const sel = selectedObjects(s);
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
          };
        }
        return;
      }
      const hit = pickTarget(e.target, page);
      if (hit) {
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
            box: boundsOf(objs),
            key: `g${String(++gestureSeq)}`,
            moved: false,
          };
        return;
      }
      if (!e.shiftKey) store.select([]);
      gesture.current = { kind: 'marquee', start: p, add: e.shiftKey };
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
    const start = snapP(p).p;
    gesture.current = { kind: 'create', start };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const p = toPage(e);
    if (!g) {
      if (s.tool === 'pen' && pen.length > 0) {
        const last = pen[pen.length - 1];
        if (last) setOverlay({ preview: { d: pathData([...pen, { x: p.x, y: p.y }], false) } });
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
            snapTargets(page, new Set(g.ids)),
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
        store.edit(resizeObjects(page.id, g.ids, g.box, to), {
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
          setOverlay({
            preview: {
              d: `M${String(g.start.x)} ${String(g.start.y)}L${String(end.x)} ${String(end.y)}`,
            },
            guides: q.guides,
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
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate') store.seal();
    if (g.kind === 'marquee') {
      const box = normBox(g.start, p);
      const hits = objectsInBox(page, box).map((o) => o.id);
      store.select(g.add ? [...new Set([...s.selection, ...hits])] : hits);
    }
    if (g.kind === 'create' && s.tool !== 'pen') create(g.start, snapP(p).p, e.shiftKey);
    if (s.tool !== 'pen') setOverlay({});
  };

  const create = (a: Vec2, b0: Vec2, shift: boolean) => {
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
        break;
      }
      case 'text': {
        const t = createText(a.x, a.y, [[defaultRun('')]]);
        obj = fitText(dragged ? { ...t, autoWidth: false, frame: { ...t.frame, w: box.w } } : t);
        break;
      }
      case 'select':
      case 'pen':
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
    if (s.tool === 'pen') {
      // The double click's two clicks each added a node; drop the duplicate.
      finishPen(false, pen.slice(0, -1));
      return;
    }
    const id = pickTarget(e.target, page);
    const o = id ? findObj(page, id) : undefined;
    if (o?.type === 'text') {
      store.select([o.id]);
      store.editText(o.id);
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
    if (e.dataTransfer.types.includes(ICON_DRAG_TYPE) || e.dataTransfer.types.includes('Files'))
      e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const at = toPage(e);
    const iconId = e.dataTransfer.getData(ICON_DRAG_TYPE);
    if (iconId) {
      void getLibrary()
        .search('')
        .then((all) => {
          const entry = all.find((x) => x.id === iconId);
          if (entry) void placeIcon(entry, at);
        });
      return;
    }
    for (const file of Array.from(e.dataTransfer.files)) void importToCanvas(file, at);
  };

  const sel = selectedObjects(s);
  const selBox = sel.length > 0 ? boundsOf(sel) : null;
  const scr = (p: Vec2) => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });
  const editing = s.editingText !== null ? findObj(page, s.editingText) : undefined;
  const panning = space;

  return (
    <div className="canvas-wrap">
      <div className="ruler-corner" title="Ruler units">
        {s.units}
      </div>
      <Ruler axis="x" view={v} length={size.w} units={s.units} />
      <Ruler axis="y" view={v} length={size.h} units={s.units} />
      <div
        ref={ref}
        className={`canvas tool-${s.tool}${panning ? ' panning' : ''}`}
        data-testid="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg role="img" aria-label="Figure canvas">
          <g transform={`translate(${String(v.x)} ${String(v.y)}) scale(${String(v.zoom)})`}>
            <rect
              x={2 / v.zoom}
              y={3 / v.zoom}
              width={page.size.w}
              height={page.size.h}
              fill="rgb(0 0 0 / 12%)"
            />
            <PageView page={page} figure={fig} />
            {/* The page edge stays visible over a page-sized object. */}
            <rect
              width={page.size.w}
              height={page.size.h}
              fill="none"
              stroke="#9aa5b1"
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
                  stroke="#0072b2"
                  strokeOpacity={0.5}
                />
              );
            })}
            {overlay.guides?.map((gd, i) =>
              gd.axis === 'x' ? (
                <line
                  key={i}
                  x1={scr({ x: gd.at, y: 0 }).x}
                  x2={scr({ x: gd.at, y: 0 }).x}
                  y1={scr({ x: 0, y: gd.from }).y}
                  y2={scr({ x: 0, y: gd.to }).y}
                  stroke="#d55e00"
                  strokeDasharray="3 2"
                />
              ) : (
                <line
                  key={i}
                  y1={scr({ x: 0, y: gd.at }).y}
                  y2={scr({ x: 0, y: gd.at }).y}
                  x1={scr({ x: gd.from, y: 0 }).x}
                  x2={scr({ x: gd.to, y: 0 }).x}
                  stroke="#d55e00"
                  strokeDasharray="3 2"
                />
              ),
            )}
            {overlay.marquee && (
              <rect
                x={scr(overlay.marquee).x}
                y={scr(overlay.marquee).y}
                width={overlay.marquee.w * v.zoom}
                height={overlay.marquee.h * v.zoom}
                fill="rgb(0 114 178 / 8%)"
                stroke="#0072b2"
                strokeDasharray="4 2"
              />
            )}
            {overlay.preview && 'd' in overlay.preview && (
              <path
                d={overlay.preview.d}
                transform={`translate(${String(v.x)} ${String(v.y)}) scale(${String(v.zoom)})`}
                fill="none"
                stroke="#0072b2"
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
                  stroke="#0072b2"
                />
              ) : (
                <rect
                  x={scr(overlay.preview.box).x}
                  y={scr(overlay.preview.box).y}
                  width={overlay.preview.box.w * v.zoom}
                  height={overlay.preview.box.h * v.zoom}
                  fill="none"
                  stroke="#0072b2"
                />
              ))}
            {pen.map((n, i) => {
              const a = scr(n);
              return (
                <rect
                  key={i}
                  x={a.x - 3}
                  y={a.y - 3}
                  width={6}
                  height={6}
                  fill="#fff"
                  stroke="#0072b2"
                />
              );
            })}
          </g>
          {selBox && s.tool === 'select' && s.editingText === null && (
            <g>
              <rect
                x={scr(selBox).x}
                y={scr(selBox).y}
                width={selBox.w * v.zoom}
                height={selBox.h * v.zoom}
                fill="none"
                stroke="#0072b2"
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
                    fill="#fff"
                    stroke="#0072b2"
                    style={{ cursor: `${h}-resize` }}
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
                    stroke="#0072b2"
                    pointerEvents="none"
                  />
                  <circle
                    data-handle="rotate"
                    cx={scr(handlePoint(selBox, 'n')).x}
                    cy={scr(handlePoint(selBox, 'n')).y - 22}
                    r={5}
                    fill="#fff"
                    stroke="#0072b2"
                    style={{ cursor: 'grab' }}
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
      </div>
      <PagesBar />
    </div>
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

function snap45(a: Vec2, b: Vec2): Vec2 {
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
