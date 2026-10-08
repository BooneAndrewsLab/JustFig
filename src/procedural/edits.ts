/**
 * Named edits for procedural objects (note 04): placing one, changing its
 * params, making one from a drawn path, and "Convert to shapes".
 */
import { type Edit, EditError, updateObjects } from '@/core/edits/edits';
import { frame } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { mapPageObjs } from '@/core/model/tree';
import type { Obj, PathNode, PathObj, Procedural, Swatch, Vec2 } from '@/core/model/types';

import { defaultParams } from './params';
import { ellipseNodes } from './prims';
import { getKind, resolveProcedural } from './registry';
import { convertToShapes } from './shapes';
import type { Params, ProceduralKind } from './types';

const fixed = (k: ProceduralKind, p: Params): Params => (k.fix ? k.fix(p) : p);

/** A two-node path, or an axis-aligned oval as `ellipseNodes` builds it (resizing keeps one). */
function isDefaultShape(path: readonly PathNode[]): boolean {
  if (path.length <= 2) return true;
  if (path.length !== 4) return false;
  const xs = path.map((n) => n.x);
  const ys = path.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const oval = ellipseNodes((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
  const near = (a: Vec2 | undefined, b: Vec2 | undefined) =>
    a !== undefined && b !== undefined && Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
  return path.every((n, i) => {
    const m = oval[i];
    return m !== undefined && near(n, m) && near(n.in, m.in) && near(n.out, m.out);
  });
}

/** A new object of a kind, centred on `at`, with default params. */
export function createProcedural(
  k: ProceduralKind,
  at: Vec2,
  over: Partial<Params> = {},
): Procedural {
  const { w, h } = k.defaultSize;
  const params = fixed(k, { ...defaultParams(k.fields), ...over } as Params);
  const path =
    k.usesPath && k.defaultPath ? k.defaultPath(w, h, params['closed'] === true) : undefined;
  return {
    id: newId('o'),
    type: 'procedural',
    name: k.title,
    frame: frame(at.x - w / 2, at.y - h / 2, w, h),
    opacity: 1,
    kind: k.kind,
    kindVersion: k.version,
    params,
    ...(path ? { path } : {}),
    slots: {},
  };
}

/** A drawn path turned into a path-following kind: the frame grows by the kind's reach. */
export function procFromPath(k: ProceduralKind, src: PathObj): Procedural {
  const params = fixed(k, { ...defaultParams(k.fields), closed: src.closed });
  const pad = k.overhang ? k.overhang(params) : 0;
  const shift = (p: Vec2): Vec2 => ({ x: p.x + pad, y: p.y + pad });
  const path: PathNode[] = src.nodes.map((n) => ({
    ...shift(n),
    ...(n.in ? { in: shift(n.in) } : {}),
    ...(n.out ? { out: shift(n.out) } : {}),
  }));
  const f = src.frame;
  return {
    id: newId('o'),
    type: 'procedural',
    name: k.title,
    frame: { ...f, x: f.x - pad, y: f.y - pad, w: f.w + 2 * pad, h: f.h + 2 * pad },
    opacity: src.opacity,
    kind: k.kind,
    kindVersion: k.version,
    params,
    path,
    slots: {},
  };
}

/** Changes one object's params: `fn` gets the decoded params, the result is validated again. */
export function setParams(pageId: Id, id: Id, label: string, fn: (p: Params) => Params): Edit {
  return updateObjects(pageId, [id], label, (o) => {
    if (o.type !== 'procedural') return o;
    const r = resolveProcedural(o);
    if (!r)
      throw new EditError('This object was made by a newer version and cannot be edited here.');
    const next = fixed(r.kind, { ...fn(r.params) });
    // Closing or opening a simple two-node path or a plain oval swaps it for the kind's default shape.
    const toggled = next['closed'] !== r.params['closed'];
    const reshape =
      toggled && r.kind.defaultPath && (o.path === undefined || isDefaultShape(o.path))
        ? { path: r.kind.defaultPath(o.frame.w, o.frame.h, next['closed'] === true) }
        : {};
    return { ...o, kindVersion: r.kind.version, params: next, ...reshape };
  });
}

export function makeFromPath(pageId: Id, src: PathObj, kind: string): Edit {
  const k = getKind(kind);
  if (!k?.usesPath) throw new EditError('That kind does not follow a path.');
  const made = procFromPath(k, src);
  return {
    label: `Make ${k.title.toLowerCase()}`,
    select: [made.id],
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const next = mapPageObjs(page, (o) => (o.id === src.id ? made : o));
      return { ...f, doc: { ...f.doc, pages: f.doc.pages.map((p) => (p === page ? next : p)) } };
    },
  };
}

/**
 * "Convert to shapes": each procedural object becomes a Group of plain
 * shapes (one-way, one undo step). Objects of an unknown kind become an
 * image of their snapshot.
 */
export function convertObjects(pageId: Id, objs: readonly Obj[], palette: readonly Swatch[]): Edit {
  const repl = new Map<Id, Obj>();
  for (const o of objs) {
    if (o.type !== 'procedural') continue;
    const c = convertToShapes(o, palette);
    if (c) repl.set(o.id, c);
  }
  if (repl.size === 0) throw new EditError('Nothing to convert.');
  return {
    label: 'Convert to shapes',
    select: [...repl.values()].map((o) => o.id),
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const next = mapPageObjs(page, (o) => repl.get(o.id) ?? o);
      return { ...f, doc: { ...f.doc, pages: f.doc.pages.map((p) => (p === page ? next : p)) } };
    },
  };
}
