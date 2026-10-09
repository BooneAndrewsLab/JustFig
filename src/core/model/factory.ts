/**
 * Default documents and objects (note 02). Every factory returns a valid
 * object; the edit that adds it to the document is separate.
 */
import { DEFAULT_PRESET, presetSize } from '../presets/pages';
import { type Id, newId } from './ids';
import type {
  Arrow,
  Doc,
  Ellipse,
  Frame,
  Head,
  Layer,
  Page,
  Paint,
  Panel,
  PathNode,
  PathObj,
  Rect,
  Run,
  ShapeStyle,
  Text,
} from './types';

export const INK = '#1f2933';

export const hex = (h: string): Paint => ({ hex: h });

export const frame = (x: number, y: number, w: number, h: number, rotation = 0): Frame => ({
  x,
  y,
  w,
  h,
  rotation,
});

export const DEFAULT_SHAPE: ShapeStyle = {
  fill: hex('#56b4e9'),
  stroke: hex(INK),
  strokeWidth: 1,
  cap: 'round',
  join: 'round',
};

export const DEFAULT_LINE: ShapeStyle = {
  fill: null,
  stroke: hex(INK),
  strokeWidth: 1.5,
  cap: 'round',
  join: 'round',
};

export const DEFAULT_HEAD: Head = { kind: 'triangle', size: 4 };
export const NO_HEAD: Head = { kind: 'none', size: 4 };

export function createLayer(name = 'Layer 1'): Layer {
  return { id: newId('ly'), name, visible: true, locked: false, children: [] };
}

export function createPage(name = 'Page 1', preset = DEFAULT_PRESET): Page {
  const size = presetSize(preset) ?? { w: 518.74, h: 396.85 };
  return { id: newId('pg'), name, size, background: hex('#ffffff'), layers: [createLayer()] };
}

export function createDoc(title = 'Untitled figure'): Doc {
  return {
    id: newId('d'),
    title,
    palette: [],
    textStyles: [],
    panelLabelStyle: {
      format: 'A',
      font: 'arimo',
      size: 12,
      bold: true,
      offset: { x: 4, y: 4 },
    },
    pages: [createPage()],
    creditFooter: true,
    notes: [],
  };
}

const base = (f: Frame): { id: Id; frame: Frame; opacity: number } => ({
  id: newId('o'),
  frame: f,
  opacity: 1,
});

export function createRect(f: Frame, style: ShapeStyle = DEFAULT_SHAPE, rx = 0): Rect {
  return { ...base(f), type: 'rect', rx, style };
}

export function createEllipse(f: Frame, style: ShapeStyle = DEFAULT_SHAPE): Ellipse {
  return { ...base(f), type: 'ellipse', style };
}

/** A path from page-space nodes: the frame is their bounds, the nodes made frame-local. */
export function createPath(
  nodes: readonly PathNode[],
  closed: boolean,
  style: ShapeStyle = closed ? DEFAULT_SHAPE : DEFAULT_LINE,
): PathObj {
  const { f, local } = localise(nodes);
  return { ...base(f), type: 'path', nodes: local, closed, style };
}

export function createArrow(
  nodes: readonly PathNode[],
  end: Head = DEFAULT_HEAD,
  start: Head = NO_HEAD,
  style: ShapeStyle = DEFAULT_LINE,
): Arrow {
  const { f, local } = localise(nodes);
  return { ...base(f), type: 'arrow', nodes: local, start, end, style };
}

export const defaultRun = (text: string, over: Partial<Run> = {}): Run => ({
  text,
  font: 'arimo',
  size: 10,
  color: hex(INK),
  ...over,
});

/** A text object; its w/h are placeholders until `layoutTextObject` sizes it. */
export function createText(x: number, y: number, runs: readonly (readonly Run[])[]): Text {
  return {
    ...base(frame(x, y, 10, 10)),
    type: 'text',
    runs,
    align: 'left',
    lineHeight: 1.2,
    autoWidth: true,
  };
}

export function createPanel(f: Frame): Panel {
  return {
    ...base(f),
    type: 'panel',
    label: 'A',
    autoLabel: true,
    showLabel: true,
    showBorder: false,
    children: [],
  };
}

/** Bounds of nodes including handles (a safe, slightly loose box), and the nodes relative to it. */
export function localise(nodes: readonly PathNode[]): { f: Frame; local: PathNode[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of nodes) {
    xs.push(n.x);
    ys.push(n.y);
    if (n.in) {
      xs.push(n.in.x);
      ys.push(n.in.y);
    }
    if (n.out) {
      xs.push(n.out.x);
      ys.push(n.out.y);
    }
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const shift = (p: { x: number; y: number }) => ({ x: p.x - x0, y: p.y - y0 });
  const local = nodes.map((n) => ({
    ...shift(n),
    ...(n.in ? { in: shift(n.in) } : {}),
    ...(n.out ? { out: shift(n.out) } : {}),
  }));
  return { f: frame(x0, y0, w, h), local };
}
